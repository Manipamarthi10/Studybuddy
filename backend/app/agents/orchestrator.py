"""
Agent Orchestration Layer
Routes queries to the correct agent. Quiz and Interview agents are handled
by their dedicated endpoint logic — this module handles chat-mode agents.
"""
import logging
import re
from typing import Optional

from groq import Groq

from app.core.config import get_settings
from app.agents.prompts import (
    ROUTING_SYSTEM_PROMPT,
    TUTOR_SYSTEM_PROMPT,
    REVISION_SYSTEM_PROMPT,
    PLANNER_SYSTEM_PROMPT,
)
from app.rag.retriever import RetrievedChunk, build_context_string
from app.models.schemas import AgentMode, ChatMessage

logger = logging.getLogger(__name__)
settings = get_settings()


def get_groq_client() -> Groq:
    return Groq(api_key=settings.groq_api_key)


# ─── Rule-based Router ─────────────────────────────────────────────────────────

REVISION_KEYWORDS = {"summarize", "summary", "revise", "revision", "key points", "quick notes", "overview"}
PLANNER_KEYWORDS = {"study plan", "schedule", "exam plan", "prepare for", "roadmap", "when to study", "week plan"}
DOUBT_KEYWORDS = {"why does", "why is", "confused about", "don't understand", "explain deeply", "in depth"}


def rule_based_route(query: str) -> Optional[str]:
    """Fast, cheap routing. Returns mode name or None if uncertain."""
    query_lower = query.lower()

    for keyword in PLANNER_KEYWORDS:
        if keyword in query_lower:
            return "planner"

    for keyword in REVISION_KEYWORDS:
        if keyword in query_lower:
            return "revision"

    for keyword in DOUBT_KEYWORDS:
        if keyword in query_lower:
            return "doubt"

    return None


def model_based_route(query: str, client: Groq) -> str:
    """Use fast Groq model for ambiguous routing."""
    try:
        response = client.chat.completions.create(
            model=settings.groq_model_fast,
            messages=[
                {"role": "user", "content": ROUTING_SYSTEM_PROMPT.format(query=query)}
            ],
            max_tokens=10,
            temperature=0.0,
        )
        mode = response.choices[0].message.content.strip().lower()
        valid_modes = {"tutor", "revision", "planner", "doubt"}
        return mode if mode in valid_modes else "tutor"
    except Exception as error:
        logger.warning(f"Model routing failed, defaulting to tutor: {error}")
        return "tutor"


def resolve_agent_mode(requested_mode: AgentMode, query: str, client: Groq) -> str:
    """Determine final agent mode: auto → rule-based → model-based."""
    if requested_mode != AgentMode.auto:
        return requested_mode.value

    # Try cheap rule-based first
    rule_result = rule_based_route(query)
    if rule_result:
        return rule_result

    # Fall back to model classification
    return model_based_route(query, client)


# ─── Agent Execution ──────────────────────────────────────────────────────────

def format_history(history: list[ChatMessage]) -> list[dict]:
    """Convert ChatMessage history to Groq-compatible format."""
    formatted = []
    for msg in history[-10:]:  # Keep last 10 messages only
        formatted.append({"role": msg.role, "content": msg.content})
    return formatted


def run_tutor_agent(
    query: str,
    chunks: list[RetrievedChunk],
    history: list[ChatMessage],
    client: Groq,
) -> str:
    """Run the tutor agent with grounded context."""
    context = build_context_string(chunks) if chunks else "No relevant notes found."
    messages = [
        {"role": "system", "content": TUTOR_SYSTEM_PROMPT.format(context=context)},
        *format_history(history),
        {"role": "user", "content": query},
    ]
    response = client.chat.completions.create(
        model=settings.groq_model_heavy,
        messages=messages,
        max_tokens=2048,
        temperature=0.3,
    )
    return response.choices[0].message.content


def run_revision_agent(
    topic: str,
    chunks: list[RetrievedChunk],
    client: Groq,
) -> str:
    """Run the revision agent to produce structured summaries."""
    context = build_context_string(chunks) if chunks else "No relevant notes found."
    messages = [
        {"role": "system", "content": REVISION_SYSTEM_PROMPT.format(context=context)},
        {"role": "user", "content": REVISION_SYSTEM_PROMPT.replace("{context}", context).replace("{topic}", topic)},
        {"role": "user", "content": f"Create a revision summary for: {topic}"},
    ]
    response = client.chat.completions.create(
        model=settings.groq_model_heavy,
        messages=messages,
        max_tokens=2048,
        temperature=0.2,
    )
    return response.choices[0].message.content


def run_planner_agent(
    goal: str,
    chunks: list[RetrievedChunk],
    client: Groq,
) -> str:
    """Run the planner agent to build a study plan from note topics."""
    context = build_context_string(chunks) if chunks else "No relevant notes found."
    messages = [
        {"role": "system", "content": PLANNER_SYSTEM_PROMPT.format(context=context)},
        {"role": "user", "content": f"Create a study plan for: {goal}"},
    ]
    response = client.chat.completions.create(
        model=settings.groq_model_heavy,
        messages=messages,
        max_tokens=2048,
        temperature=0.4,
    )
    return response.choices[0].message.content


def run_agent(
    mode: str,
    query: str,
    chunks: list[RetrievedChunk],
    history: list[ChatMessage],
    client: Groq,
) -> str:
    """Dispatch to the correct agent by mode."""
    if mode == "revision":
        return run_revision_agent(query, chunks, client)
    elif mode == "planner":
        return run_planner_agent(query, chunks, client)
    else:
        # tutor and doubt both use the tutor agent (doubt gets same grounded treatment)
        return run_tutor_agent(query, chunks, history, client)
