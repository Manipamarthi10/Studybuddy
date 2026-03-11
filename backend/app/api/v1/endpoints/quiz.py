"""
Quiz API — Grounded quiz generation and result submission.
"""
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from supabase import create_client

from app.core.config import get_settings
from app.core.security import get_current_user_id
from app.models.schemas import (
    QuizGenerateRequest,
    QuizGenerateResponse,
    QuizSubmitRequest,
    QuizResultResponse,
)
from app.rag.retriever import retrieve_chunks, get_source_filenames
from app.agents.quiz_agent import generate_quiz
from app.agents.orchestrator import get_groq_client

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix="/quiz", tags=["quiz"])


@router.post("/generate", response_model=QuizGenerateResponse)
def generate_quiz_endpoint(
    request: QuizGenerateRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Generate a grounded MCQ quiz from uploaded notes."""
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    groq_client = get_groq_client()

    chunks = retrieve_chunks(
        supabase=supabase,
        query=request.topic,
        user_id=user_id,
        subject=request.subject,
        top_k=10,  # More chunks for quiz diversity
    )

    source_filenames = get_source_filenames(supabase, chunks) if chunks else []

    try:
        result = generate_quiz(
            groq_client=groq_client,
            chunks=chunks,
            topic=request.topic,
            difficulty=request.difficulty.value,
            num_questions=request.num_questions,
            source_filenames=source_filenames,
        )
    except Exception as error:
        logger.error(f"Quiz generation error: {error}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Quiz generation failed. Please try again.",
        )

    return result


@router.post("/submit", response_model=QuizResultResponse)
def submit_quiz_results(
    request: QuizSubmitRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Save quiz results and calculate score + weak areas."""
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)

    per_question = []
    correct_count = 0
    weak_areas = set()

    for idx, question_data in enumerate(request.questions):
        user_answer = request.user_answers.get(str(idx), "")
        correct_answer = question_data.get("correct_option", "")
        is_correct = user_answer.upper() == correct_answer.upper()

        if is_correct:
            correct_count += 1
        else:
            # Tag as weak area
            weak_areas.add(request.topic)

        per_question.append({
            "index": idx,
            "question": question_data.get("question", ""),
            "user_answer": user_answer,
            "correct_answer": correct_answer,
            "is_correct": is_correct,
            "explanation": question_data.get("explanation", ""),
        })

    total = len(request.questions)
    score_percent = (correct_count / total * 100) if total > 0 else 0.0

    result_id = str(uuid.uuid4())
    supabase.table("quiz_results").insert({
        "id": result_id,
        "user_id": user_id,
        "topic": request.topic,
        "subject": request.subject,
        "difficulty": request.difficulty.value,
        "total_questions": total,
        "correct_answers": correct_count,
        "score_percent": round(score_percent, 2),
        "questions": per_question,
        "weak_areas": list(weak_areas),
    }).execute()

    return QuizResultResponse(
        result_id=result_id,
        score_percent=round(score_percent, 2),
        correct_answers=correct_count,
        total_questions=total,
        weak_areas=list(weak_areas),
        per_question=per_question,
    )
