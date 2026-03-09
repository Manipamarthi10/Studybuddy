"""
Agents API — Direct access to individual agents.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from core.security import get_current_user, sanitize_prompt
from services.rag_pipeline import rag
from agents.orchestrator import run_agents

router = APIRouter()


class AgentRequest(BaseModel):
    message: str
    agent: Optional[str] = "auto"  # tutor | quiz | revision | planner | interview | doubt | auto
    subject: Optional[str] = None


class AgentResponse(BaseModel):
    response: str
    agent: str
    sources: list


@router.post("/run", response_model=AgentResponse)
async def run_agent(
    req: AgentRequest,
    user: dict = Depends(get_current_user),
):
    clean_msg = sanitize_prompt(req.message)

    rag_result = await rag.query(
        question=clean_msg,
        user_id=user["user_id"],
        subject=req.subject,
    )
    context = "\n\n".join(rag_result.context_used)

    result = await run_agents(
        message=clean_msg,
        user_id=user["user_id"],
        context=context,
    )

    return AgentResponse(
        response=result["response"],
        agent=result["agent"],
        sources=rag_result.sources,
    )
