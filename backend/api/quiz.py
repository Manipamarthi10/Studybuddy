"""
Quiz Generator API.
Generates MCQs from user's uploaded documents via RAG + QuizAgent.
Tracks results to detect weak areas.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import json, uuid

from core.security import get_current_user
from core.database import get_supabase_admin
from services.rag_pipeline import rag
from agents.orchestrator import quiz_agent, AgentState

router = APIRouter()


class QuizRequest(BaseModel):
    topic: str
    subject: Optional[str] = None
    num_questions: int = 5
    difficulty: str = "medium"  # easy | medium | hard


class QuizOption(BaseModel):
    label: str
    text: str


class QuizQuestion(BaseModel):
    id: str
    question: str
    options: List[str]
    answer: str
    explanation: str


class QuizResponse(BaseModel):
    quiz_id: str
    topic: str
    questions: List[QuizQuestion]
    sources: List[str]


class QuizSubmission(BaseModel):
    quiz_id: str
    topic: str
    subject: Optional[str] = None
    answers: dict  # {question_id: selected_answer}
    correct_answers: dict  # {question_id: correct_answer}


class QuizResult(BaseModel):
    score: float
    correct: int
    total: int
    weak_topics: List[str]
    recommendation: str


@router.post("/generate", response_model=QuizResponse)
async def generate_quiz(
    req: QuizRequest,
    user: dict = Depends(get_current_user),
):
    """Generate MCQ quiz from uploaded study materials."""
    user_id = user["user_id"]

    # Retrieve context via RAG
    rag_result = await rag.query(
        question=f"Key concepts about {req.topic}",
        user_id=user_id,
        subject=req.subject,
        system_role="quiz",
    )

    context = "\n\n".join(rag_result.context_used)
    if not context:
        context = f"Generate general knowledge questions about {req.topic} at {req.difficulty} level."

    # Run quiz agent
    state: AgentState = {
        "user_id": user_id,
        "message": f"Generate {req.num_questions} {req.difficulty} MCQ questions about: {req.topic}",
        "context": context,
        "agent": "quiz",
        "response": "",
        "metadata": {},
    }
    result = quiz_agent(state)
    raw_json = result["response"]

    # Parse JSON response
    try:
        # Strip markdown code fences if present
        clean = raw_json.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        questions_data = json.loads(clean.strip())
    except (json.JSONDecodeError, IndexError):
        raise HTTPException(status_code=500, detail="Failed to parse quiz questions. Try again.")

    questions = []
    for i, q in enumerate(questions_data[:req.num_questions]):
        questions.append(QuizQuestion(
            id=str(i),
            question=q.get("q", ""),
            options=q.get("options", []),
            answer=q.get("answer", "A"),
            explanation=q.get("explanation", ""),
        ))

    quiz_id = str(uuid.uuid4())
    return QuizResponse(
        quiz_id=quiz_id,
        topic=req.topic,
        questions=questions,
        sources=rag_result.sources,
    )


@router.post("/submit", response_model=QuizResult)
async def submit_quiz(
    submission: QuizSubmission,
    user: dict = Depends(get_current_user),
):
    """Submit quiz answers, calculate score, detect weak areas."""
    user_id = user["user_id"]
    db = get_supabase_admin()

    correct = sum(
        1 for qid, ans in submission.answers.items()
        if submission.correct_answers.get(qid, "").upper() == ans.upper()
    )
    total = len(submission.correct_answers)
    score = (correct / total * 100) if total > 0 else 0

    # Simple weak topic detection
    wrong_ids = [
        qid for qid, ans in submission.answers.items()
        if submission.correct_answers.get(qid, "").upper() != ans.upper()
    ]
    weak_topics = [submission.topic] if len(wrong_ids) > total * 0.4 else []

    # Generate recommendation via LLM
    rec = "Great job! Keep practicing to maintain your score."
    if score < 60:
        rec = f"Weak area detected in '{submission.topic}'. Recommended: 2-hour focused revision session + retry quiz."
    elif score < 80:
        rec = f"Good progress! Review the explanations for missed questions in '{submission.topic}'."

    # Persist result
    db.table("quiz_results").insert({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "subject": submission.subject or "General",
        "score": score,
        "weak_topics": weak_topics,
    }).execute()

    return QuizResult(
        score=round(score, 1),
        correct=correct,
        total=total,
        weak_topics=weak_topics,
        recommendation=rec,
    )


@router.get("/history")
async def quiz_history(user: dict = Depends(get_current_user)):
    """Get quiz history and performance trends."""
    db = get_supabase_admin()
    resp = (
        db.table("quiz_results")
        .select("*")
        .eq("user_id", user["user_id"])
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    return resp.data or []


@router.get("/weaknesses")
async def get_weaknesses(user: dict = Depends(get_current_user)):
    """Aggregate weak topics from quiz history."""
    db = get_supabase_admin()
    resp = (
        db.table("quiz_results")
        .select("weak_topics, subject, score")
        .eq("user_id", user["user_id"])
        .execute()
    )

    weakness_map = {}
    for row in (resp.data or []):
        for topic in (row.get("weak_topics") or []):
            weakness_map[topic] = weakness_map.get(topic, 0) + 1

    weaknesses = [
        {"topic": k, "frequency": v}
        for k, v in sorted(weakness_map.items(), key=lambda x: -x[1])
    ]
    return {"weaknesses": weaknesses}
