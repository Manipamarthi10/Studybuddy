"""
Interview Agent
Grounded mock interview — first question and all follow-ups from uploaded notes only.
"""
import json
import logging
import re
from typing import Optional

from groq import Groq

from app.agents.prompts import (
    INTERVIEW_START_SYSTEM_PROMPT,
    INTERVIEW_START_USER_TEMPLATE,
    INTERVIEW_EVALUATE_SYSTEM_PROMPT,
)
from app.core.config import get_settings
from app.rag.retriever import RetrievedChunk, build_context_string, has_sufficient_context

logger = logging.getLogger(__name__)
settings = get_settings()

MIN_CONTEXT_CHUNKS = 2
MAX_INTERVIEW_EXCHANGES = 5


def _parse_json_response(raw: str) -> dict:
    """Parse JSON from model output, stripping any markdown."""
    cleaned = re.sub(r"```(?:json)?", "", raw).strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON found in interview agent output")
    return json.loads(cleaned[start:end])


def start_interview(
    groq_client: Groq,
    chunks: list[RetrievedChunk],
    topic: str,
    difficulty: str,
    source_filenames: Optional[list[str]] = None,
) -> dict:
    """
    Generate the first interview question from retrieved notes.
    Returns a refusal dict if context is insufficient.
    """
    if not has_sufficient_context(chunks, min_chunks=MIN_CONTEXT_CHUNKS):
        return {
            "grounded": False,
            "refusal": f"I could not find enough relevant content in your uploaded notes to start an interview on '{topic}'. Please upload notes covering this topic first.",
        }

    context = build_context_string(chunks)
    system_prompt = INTERVIEW_START_SYSTEM_PROMPT.format(
        context=context,
        topic=topic,
    )
    user_message = INTERVIEW_START_USER_TEMPLATE.format(
        difficulty=difficulty,
        topic=topic,
    )

    try:
        response = groq_client.chat.completions.create(
            model=settings.groq_model_heavy,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            max_tokens=1024,
            temperature=0.2,
        )
        parsed = _parse_json_response(response.choices[0].message.content)
    except Exception as error:
        logger.error(f"Interview start failed: {error}")
        raise

    if not parsed.get("grounded", True):
        return parsed  # Return model's own refusal

    return {
        "grounded": True,
        "question": parsed.get("question", ""),
        "hint": parsed.get("hint", ""),
        "source_topic": parsed.get("source_topic", ""),
        "sources_used": source_filenames or [],
    }


def evaluate_answer_and_continue(
    groq_client: Groq,
    question: str,
    user_answer: str,
    chunks: list[RetrievedChunk],
    exchange_count: int,
) -> dict:
    """
    Evaluate the student's answer and generate the next question.
    After MAX_INTERVIEW_EXCHANGES, marks is_complete = True.
    """
    context = build_context_string(chunks) if chunks else "Use general interview judgment."
    system_prompt = INTERVIEW_EVALUATE_SYSTEM_PROMPT.format(
        question=question,
        user_answer=user_answer,
        context=context,
    )

    try:
        response = groq_client.chat.completions.create(
            model=settings.groq_model_heavy,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": "Evaluate this answer and continue the interview."},
            ],
            max_tokens=2048,
            temperature=0.3,
        )
        parsed = _parse_json_response(response.choices[0].message.content)
    except Exception as error:
        logger.error(f"Interview evaluation failed: {error}")
        raise

    # Enforce max exchanges
    if exchange_count >= MAX_INTERVIEW_EXCHANGES:
        parsed["is_complete"] = True
        parsed["next_question"] = None

    return {
        "evaluation": parsed.get("evaluation", ""),
        "score": float(parsed.get("score", 5.0)),
        "strengths": parsed.get("strengths", []),
        "improvement_tips": parsed.get("improvement_tips", []),
        "model_answer": parsed.get("model_answer", ""),
        "next_question": parsed.get("next_question"),
        "is_complete": parsed.get("is_complete", False),
    }
