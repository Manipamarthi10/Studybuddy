"""
Chat API — AI Tutor endpoint
Routes to the correct agent and returns grounded responses.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from supabase import create_client

from app.core.config import get_settings
from app.core.security import get_current_user_id
from app.models.schemas import ChatRequest, ChatResponse
from app.rag.retriever import retrieve_chunks, get_source_filenames
from app.agents.orchestrator import get_groq_client, resolve_agent_mode, run_agent

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/", response_model=ChatResponse)
def chat(
    request: ChatRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Main chat endpoint — routes to tutor/revision/planner agent with RAG."""
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)
    groq_client = get_groq_client()

    # Retrieve relevant chunks from user's notes
    chunks = retrieve_chunks(
        supabase=supabase,
        query=request.message,
        user_id=user_id,
        subject=request.subject,
    )

    # Get source metadata for citation
    sources = [chunk.to_source_dict() for chunk in chunks]
    if chunks:
        filenames = get_source_filenames(supabase, chunks)
        for i, source in enumerate(sources):
            if i < len(filenames):
                source["filename"] = filenames[i]

    # Resolve which agent to use
    agent_mode = resolve_agent_mode(request.mode, request.message, groq_client)

    try:
        answer = run_agent(
            mode=agent_mode,
            query=request.message,
            chunks=chunks,
            history=request.history,
            client=groq_client,
        )
    except Exception as error:
        logger.error(f"Agent execution failed: {error}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service temporarily unavailable. Please try again.",
        )

    return ChatResponse(
        answer=answer,
        sources=sources,
        agent_used=agent_mode,
        grounded=len(chunks) > 0,
    )
