"""
Interview Preparation API.
Simulates technical placement interviews for DSA, OS, DBMS, System Design.
Evaluates student answers and gives structured feedback.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uuid

from core.security import get_current_user
from core.database import get_supabase_admin
from core.config import settings
from services.rag_pipeline import rag
from groq import Groq

router = APIRouter()
groq_client = Groq(api_key=settings.GROQ_API_KEY)

INTERVIEW_TOPICS = {
    "dsa": "Data Structures & Algorithms (arrays, trees, graphs, sorting, DP)",
    "os": "Operating Systems (processes, threads, memory, deadlocks, scheduling)",
    "dbms": "Database Management Systems (SQL, normalization, transactions, indexing)",
    "system_design": "System Design (scalability, caching, load balancing, microservices)",
    "networks": "Computer Networks (TCP/IP, HTTP, DNS, REST APIs)",
    "oops": "Object-Oriented Programming (SOLID, design patterns, inheritance)",
}


class StartInterviewRequest(BaseModel):
    topic: str  # dsa | os | dbms | system_design | networks | oops
    difficulty: str = "medium"  # easy | medium | hard
    company: Optional[str] = None  # Google | Amazon | etc.


class InterviewSession(BaseModel):
    session_id: str
    topic: str
    question: str
    question_number: int
    total_questions: int
    hints: List[str]


class AnswerRequest(BaseModel):
    session_id: str
    question: str
    answer: str
    topic: str


class AnswerFeedback(BaseModel):
    score: int  # 0-10
    feedback: str
    model_answer: str
    follow_up: Optional[str]
    improvement_tips: List[str]


class InterviewSummary(BaseModel):
    session_id: str
    topic: str
    total_score: float
    questions_answered: int
    strengths: List[str]
    weaknesses: List[str]
    recommendation: str


@router.post("/start", response_model=InterviewSession)
async def start_interview(
    req: StartInterviewRequest,
    user: dict = Depends(get_current_user),
):
    """Start a new mock interview session."""
    user_id = user["user_id"]
    db = get_supabase_admin()

    topic_desc = INTERVIEW_TOPICS.get(req.topic, req.topic)
    company_ctx = f" in the style of {req.company}" if req.company else ""
    difficulty_ctx = {
        "easy": "beginner-friendly, conceptual",
        "medium": "intermediate, mix of conceptual and applied",
        "hard": "advanced, expect coding and deep design questions",
    }.get(req.difficulty, "medium")

    # Generate opening question
    resp = groq_client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    f"You are a senior technical interviewer{company_ctx}. "
                    f"Ask ONE {difficulty_ctx} interview question about: {topic_desc}. "
                    "After the question, provide 2 hints in format:\n"
                    "QUESTION: <question>\nHINT1: <hint>\nHINT2: <hint>"
                ),
            },
            {"role": "user", "content": "Start the interview."},
        ],
        temperature=0.7,
        max_tokens=400,
    )

    raw = resp.choices[0].message.content
    lines = raw.strip().split("\n")

    question = raw
    hints = []
    for line in lines:
        if line.startswith("QUESTION:"):
            question = line.replace("QUESTION:", "").strip()
        elif line.startswith("HINT1:") or line.startswith("HINT2:"):
            hints.append(line.split(":", 1)[1].strip())

    # Create session
    session_id = str(uuid.uuid4())
    db.table("interview_sessions").insert({
        "id": session_id,
        "user_id": user_id,
        "topic": req.topic,
        "messages": [{"role": "interviewer", "content": question}],
        "score": 0,
    }).execute()

    return InterviewSession(
        session_id=session_id,
        topic=req.topic,
        question=question,
        question_number=1,
        total_questions=5,
        hints=hints,
    )


@router.post("/answer", response_model=AnswerFeedback)
async def evaluate_answer(
    req: AnswerRequest,
    user: dict = Depends(get_current_user),
):
    """Evaluate student's answer and provide detailed feedback."""
    db = get_supabase_admin()

    # Also check if student's notes have relevant context
    rag_result = await rag.query(
        question=req.question,
        user_id=user["user_id"],
        system_role="interview",
    )
    notes_context = "\n".join(rag_result.context_used[:2])

    resp = groq_client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a senior technical interviewer evaluating a candidate's answer. "
                    "Provide structured feedback in this exact format:\n"
                    "SCORE: <0-10>\n"
                    "FEEDBACK: <2-3 sentences on what was good/bad>\n"
                    "MODEL_ANSWER: <ideal answer>\n"
                    "FOLLOW_UP: <one follow-up question if answer was decent, else empty>\n"
                    "TIPS: <tip1> | <tip2> | <tip3>"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"QUESTION: {req.question}\n"
                    f"CANDIDATE ANSWER: {req.answer}\n"
                    f"RELEVANT NOTES CONTEXT: {notes_context}"
                ),
            },
        ],
        temperature=0.3,
        max_tokens=600,
    )

    raw = resp.choices[0].message.content
    # Parse structured response
    score = 5
    feedback = raw
    model_answer = ""
    follow_up = None
    tips = []

    for line in raw.split("\n"):
        if line.startswith("SCORE:"):
            try:
                score = int(line.replace("SCORE:", "").strip())
            except:
                pass
        elif line.startswith("FEEDBACK:"):
            feedback = line.replace("FEEDBACK:", "").strip()
        elif line.startswith("MODEL_ANSWER:"):
            model_answer = line.replace("MODEL_ANSWER:", "").strip()
        elif line.startswith("FOLLOW_UP:"):
            fu = line.replace("FOLLOW_UP:", "").strip()
            follow_up = fu if fu else None
        elif line.startswith("TIPS:"):
            tips = [t.strip() for t in line.replace("TIPS:", "").split("|")]

    # Update session
    session = db.table("interview_sessions").select("messages, score").eq("id", req.session_id).execute()
    if session.data:
        msgs = session.data[0]["messages"]
        msgs.extend([
            {"role": "candidate", "content": req.answer},
            {"role": "interviewer", "content": feedback},
        ])
        db.table("interview_sessions").update({
            "messages": msgs,
            "score": (session.data[0]["score"] + score) / 2,
        }).eq("id", req.session_id).execute()

    return AnswerFeedback(
        score=score,
        feedback=feedback,
        model_answer=model_answer,
        follow_up=follow_up,
        improvement_tips=tips[:3],
    )


@router.get("/topics")
async def get_topics():
    """Get available interview topics."""
    return {
        "topics": [
            {"id": k, "name": v.split("(")[0].strip(), "description": v}
            for k, v in INTERVIEW_TOPICS.items()
        ]
    }


@router.get("/history")
async def interview_history(user: dict = Depends(get_current_user)):
    db = get_supabase_admin()
    resp = (
        db.table("interview_sessions")
        .select("id, topic, score, created_at")
        .eq("user_id", user["user_id"])
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )
    return resp.data or []
