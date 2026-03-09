"""
Chat API — RAG-powered conversational endpoint.
Combines RAG retrieval with agent routing.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, validator
from typing import List, Optional

from core.security import get_current_user, sanitize_prompt
from services.rag_pipeline import rag
from agents.orchestrator import run_agents

router = APIRouter()


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    subject: Optional[str] = None
    chat_history: List[ChatMessage] = []
    mode: Optional[str] = "auto"  # auto | tutor | quiz | interview | revision

    @validator("message")
    def message_not_empty(cls, v):
        if not v.strip():
            raise ValueError("Message cannot be empty")
        if len(v) > 4000:
            raise ValueError("Message too long (max 4000 chars)")
        return v


class ChatResponse(BaseModel):
    response: str
    agent: str
    sources: List[str]
    grounded: bool
    mode: str


@router.post("/", response_model=ChatResponse)
async def chat(
    req: ChatRequest,
    user: dict = Depends(get_current_user),
):
    user_id = user["user_id"]

    # 1. Sanitize against prompt injection
    clean_msg = sanitize_prompt(req.message)

    # 2. RAG retrieval
    rag_result = await rag.query(
        question=clean_msg,
        user_id=user_id,
        subject=req.subject,
        system_role=req.mode if req.mode != "auto" else "tutor",
        chat_history=[m.dict() for m in req.chat_history],
    )

    # 3. If mode is auto, route through agent system with retrieved context
    if req.mode == "auto":
        agent_result = await run_agents(
            message=clean_msg,
            user_id=user_id,
            context="\n\n".join(rag_result.context_used),
        )
        response_text = agent_result["response"]
        agent_name = agent_result["agent"]
    else:
        response_text = rag_result.answer
        agent_name = req.mode

    return ChatResponse(
        response=response_text,
        agent=agent_name,
        sources=rag_result.sources,
        grounded=rag_result.grounded,
        mode=agent_name,
    )


@router.post("/stream")
async def chat_stream(
    req: ChatRequest,
    user: dict = Depends(get_current_user),
):
    """
    Streaming endpoint for real-time token delivery.
    Use Server-Sent Events on the frontend.
    """
    from fastapi.responses import StreamingResponse
    from groq import Groq
    from core.config import settings
    import json

    user_id = user["user_id"]
    clean_msg = sanitize_prompt(req.message)

    rag_result = await rag.query(
        question=clean_msg,
        user_id=user_id,
        subject=req.subject,
    )

    context = "\n\n".join(rag_result.context_used)
    groq_client = Groq(api_key=settings.GROQ_API_KEY)

    def generate():
        stream = groq_client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are StudyBuddy AI. Answer using only the provided context.",
                },
                {
                    "role": "user",
                    "content": f"CONTEXT:\n{context}\n\nQUESTION: {clean_msg}",
                },
            ],
            stream=True,
            max_tokens=1024,
            temperature=0.3,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            if delta:
                yield f"data: {json.dumps({'token': delta})}\n\n"
        # Send sources at end
        yield f"data: {json.dumps({'done': True, 'sources': rag_result.sources})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
