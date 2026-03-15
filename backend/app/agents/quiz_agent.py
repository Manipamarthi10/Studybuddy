"""
Quiz Agent
Grounded MCQ generation from retrieved notes only.
Refuses clearly if context is insufficient.
"""
import json
import logging
import re
from typing import Optional

from groq import Groq

from app.agents.prompts import QUIZ_SYSTEM_PROMPT, QUIZ_USER_TEMPLATE
from app.core.config import get_settings
from app.models.schemas import QuizGenerateResponse, QuizQuestion, QuizOption
from app.rag.retriever import RetrievedChunk, build_context_string, has_sufficient_context

logger = logging.getLogger(__name__)
settings = get_settings()

# Minimum chunks required to generate a quiz
MIN_CONTEXT_CHUNKS = 2


def _parse_quiz_json(raw: str) -> dict:
    """
    Safely parse JSON from LLM output.
    Strips markdown code fences if present.
    """
    # Remove markdown fences
    cleaned = re.sub(r"```(?:json)?", "", raw).strip()
    # Find the first { to last } in case there's surrounding text
    start = cleaned.find("{")
    end = cleaned.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON object found in model output")
    json_str = cleaned[start:end]
    return json.loads(json_str)


def generate_quiz(
    groq_client: Groq,
    chunks: list[RetrievedChunk],
    topic: str,
    difficulty: str,
    num_questions: int,
    source_filenames: Optional[list[str]] = None,
) -> QuizGenerateResponse:
    """
    Generate a grounded MCQ quiz from retrieved note chunks.
    Returns a refusal response if context is insufficient.
    """
    # Grounding gate — refuse before calling the model
    if not has_sufficient_context(chunks, min_chunks=MIN_CONTEXT_CHUNKS):
        return QuizGenerateResponse(
            topic=topic,
            questions=[],
            grounded=False,
            sources_used=[],
        )

    context = build_context_string(chunks)
    system_prompt = QUIZ_SYSTEM_PROMPT.format(
        context=context,
        topic=topic,
        num_questions=num_questions,
    )
    user_message = QUIZ_USER_TEMPLATE.format(
        num_questions=num_questions,
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
            max_tokens=4096,
            temperature=0.1,  # Low temperature for structured, factual output
        )
        raw_output = response.choices[0].message.content
        parsed = _parse_quiz_json(raw_output)
    except json.JSONDecodeError as error:
        logger.error(f"Quiz JSON parse failure: {error}")
        return QuizGenerateResponse(
            topic=topic,
            questions=[],
            grounded=False,
            sources_used=[],
        )
    except Exception as error:
        logger.error(f"Quiz generation failed: {error}")
        raise

    # Model says not grounded
    if not parsed.get("grounded", True):
        return QuizGenerateResponse(
            topic=topic,
            questions=[],
            grounded=False,
            sources_used=[],
        )

    # Parse questions from JSON
    raw_questions = parsed.get("questions", [])
    questions = []

    for raw_q in raw_questions:
        try:
            options = [
                QuizOption(label=opt["label"], text=opt["text"])
                for opt in raw_q.get("options", [])
            ]
            question = QuizQuestion(
                question=raw_q["question"],
                options=options,
                correct_option=raw_q.get("correct_option", "A"),
                explanation=raw_q.get("explanation", ""),
                source_file=source_filenames[0] if source_filenames else None,
            )
            questions.append(question)
        except (KeyError, TypeError) as parse_error:
            logger.warning(f"Skipping malformed question: {parse_error}")
            continue

    return QuizGenerateResponse(
        topic=topic,
        questions=questions,
        grounded=True,
        sources_used=source_filenames or [],
    )
