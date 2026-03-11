"""
Interview API — Grounded mock interview start, answer evaluation, session management.
"""
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from supabase import create_client

from app.core.config import get_settings
from app.core.security import get_current_user_id
from app.models.schemas import (
    InterviewStartRequest,
    InterviewStartResponse,
    InterviewAnswerRequest,
    InterviewAnswerResponse,
)
from app.rag.retriever import retrieve_chunks, get_source_filenames
from app.agents.interview_agent import start_interview, evaluate_answer_and_continue
from app.agents.orchestrator import get_groq_client

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix="/interview", tags=["interview"])


@router.post("/start", response_model=InterviewStartResponse)
def start_interview_session(
    request: InterviewStartRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Start a new grounded mock interview session."""
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    groq_client = get_groq_client()

    chunks = retrieve_chunks(
        supabase=supabase,
        query=request.topic,
        user_id=user_id,
        subject=request.subject,
        top_k=8,
    )

    source_filenames = get_source_filenames(supabase, chunks) if chunks else []

    try:
        result = start_interview(
            groq_client=groq_client,
            chunks=chunks,
            topic=request.topic,
            difficulty=request.difficulty.value,
            source_filenames=source_filenames,
        )
    except Exception as error:
        logger.error(f"Interview start error: {error}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Interview service temporarily unavailable.",
        )

    if not result.get("grounded"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=result.get("refusal", "Insufficient notes to start interview."),
        )

    # Create session in DB
    session_id = str(uuid.uuid4())
    supabase.table("interview_sessions").insert({
        "id": session_id,
        "user_id": user_id,
        "topic": request.topic,
        "subject": request.subject,
        "difficulty": request.difficulty.value,
        "status": "active",
        "exchanges": [{
            "question": result["question"],
            "user_answer": None,
            "evaluation": None,
        }],
    }).execute()

    return InterviewStartResponse(
        session_id=session_id,
        first_question=result["question"],
        topic=request.topic,
        grounded=True,
        sources_used=result.get("sources_used", []),
    )


@router.post("/answer", response_model=InterviewAnswerResponse)
def submit_interview_answer(
    request: InterviewAnswerRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Submit an answer, receive evaluation, and get next question."""
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    groq_client = get_groq_client()

    # Fetch session and verify ownership
    session_result = (
        supabase.table("interview_sessions")
        .select("*")
        .eq("id", request.session_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not session_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    session = session_result.data[0]
    if session["status"] != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session is not active")

    exchanges = session.get("exchanges", [])
    current_question = exchanges[-1]["question"] if exchanges else ""
    exchange_count = len(exchanges)

    # Re-retrieve notes context for this session's topic
    chunks = retrieve_chunks(
        supabase=supabase,
        query=current_question,
        user_id=user_id,
        subject=session.get("subject"),
        top_k=6,
    )

    try:
        evaluation = evaluate_answer_and_continue(
            groq_client=groq_client,
            question=current_question,
            user_answer=request.user_answer,
            chunks=chunks,
            exchange_count=exchange_count,
        )
    except Exception as error:
        logger.error(f"Interview evaluation error: {error}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Evaluation service temporarily unavailable.",
        )

    # Update last exchange with the user's answer + evaluation
    exchanges[-1]["user_answer"] = request.user_answer
    exchanges[-1]["evaluation"] = evaluation["evaluation"]
    exchanges[-1]["score"] = evaluation["score"]

    # Add next question if interview continues
    if not evaluation["is_complete"] and evaluation.get("next_question"):
        exchanges.append({"question": evaluation["next_question"], "user_answer": None})

    # Persist updated exchanges
    update_data = {"exchanges": exchanges}
    if evaluation["is_complete"]:
        scores = [ex.get("score", 0) for ex in exchanges if ex.get("score") is not None]
        avg_score = sum(scores) / len(scores) if scores else 0
        update_data.update({
            "status": "completed",
            "total_questions": exchange_count,
            "overall_score": round(avg_score, 2),
        })

    supabase.table("interview_sessions").update(update_data).eq("id", request.session_id).execute()

    return InterviewAnswerResponse(
        evaluation=evaluation["evaluation"],
        score=evaluation["score"],
        model_answer=evaluation["model_answer"],
        improvement_tips=evaluation.get("improvement_tips", []),
        next_question=evaluation.get("next_question"),
        is_complete=evaluation["is_complete"],
    )
