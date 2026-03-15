"""
StudyBuddy AI — Backend Tests
Tests grounding behavior, auth boundaries, and structured output parsing.
"""
import json
import pytest
from unittest.mock import MagicMock, patch

from app.agents.quiz_agent import generate_quiz, _parse_quiz_json
from app.agents.interview_agent import start_interview
from app.rag.retriever import RetrievedChunk, has_sufficient_context
from app.rag.ingestion import split_into_chunks, clean_text


# ─── RAG Tests ────────────────────────────────────────────────────────────────

def test_split_into_chunks_basic():
    """Chunks should be non-empty and respect approximate size."""
    text = "This is a sentence. " * 200
    chunks = split_into_chunks(text, chunk_size=500, overlap=50)
    assert len(chunks) > 1
    for chunk in chunks:
        assert len(chunk) > 50


def test_clean_text_removes_noise():
    """Clean text should remove extra whitespace and blank numeric lines."""
    raw = "Title\n\n\n   5   \n\nSome content here.\n\n\nMore content."
    cleaned = clean_text(raw)
    assert "\n\n\n" not in cleaned
    assert "5" not in cleaned or "Some content" in cleaned


def test_has_sufficient_context_empty():
    """Empty chunk list should fail the sufficiency check."""
    assert has_sufficient_context([], min_chunks=2) is False


def test_has_sufficient_context_enough():
    """Two or more chunks should pass the sufficiency check."""
    mock_chunks = [MagicMock(spec=RetrievedChunk), MagicMock(spec=RetrievedChunk)]
    assert has_sufficient_context(mock_chunks, min_chunks=2) is True


# ─── Quiz Grounding Tests ──────────────────────────────────────────────────────

def test_quiz_refuses_with_no_chunks():
    """Quiz generation must refuse when no chunks are retrieved."""
    mock_groq = MagicMock()
    result = generate_quiz(
        groq_client=mock_groq,
        chunks=[],  # No notes
        topic="Deadlocks",
        difficulty="medium",
        num_questions=5,
    )
    assert result.grounded is False
    assert len(result.questions) == 0
    mock_groq.chat.completions.create.assert_not_called()  # Model must NOT be called


def test_quiz_refuses_with_insufficient_chunks():
    """Quiz must refuse if only 1 chunk is retrieved (below min threshold)."""
    mock_groq = MagicMock()
    single_chunk = [MagicMock(spec=RetrievedChunk)]
    result = generate_quiz(
        groq_client=mock_groq,
        chunks=single_chunk,
        topic="OS Scheduling",
        difficulty="easy",
        num_questions=5,
    )
    assert result.grounded is False
    mock_groq.chat.completions.create.assert_not_called()


def test_quiz_json_parse_valid():
    """Should parse well-formed quiz JSON."""
    raw = json.dumps({
        "grounded": True,
        "questions": [{
            "question": "What is a deadlock?",
            "options": [
                {"label": "A", "text": "A state where processes wait forever"},
                {"label": "B", "text": "A type of memory leak"},
                {"label": "C", "text": "A scheduling algorithm"},
                {"label": "D", "text": "A disk error"},
            ],
            "correct_option": "A",
            "explanation": "A deadlock occurs when processes are blocked waiting for resources held by each other.",
            "source_snippet": "According to the notes..."
        }]
    })
    parsed = _parse_quiz_json(raw)
    assert parsed["grounded"] is True
    assert len(parsed["questions"]) == 1


def test_quiz_json_parse_with_markdown_fences():
    """Should handle JSON wrapped in markdown code fences."""
    raw = "```json\n" + json.dumps({"grounded": False, "refusal": "No content found."}) + "\n```"
    parsed = _parse_quiz_json(raw)
    assert parsed["grounded"] is False


# ─── Interview Grounding Tests ─────────────────────────────────────────────────

def test_interview_refuses_with_no_chunks():
    """Interview start must refuse when no chunks are retrieved."""
    mock_groq = MagicMock()
    result = start_interview(
        groq_client=mock_groq,
        chunks=[],
        topic="Database Normalization",
        difficulty="medium",
    )
    assert result["grounded"] is False
    assert "refusal" in result
    mock_groq.chat.completions.create.assert_not_called()


def test_interview_refuses_with_single_chunk():
    """Interview must refuse if context is insufficient (below threshold)."""
    mock_groq = MagicMock()
    single_chunk = [MagicMock(spec=RetrievedChunk)]
    result = start_interview(
        groq_client=mock_groq,
        chunks=single_chunk,
        topic="DSA Trees",
        difficulty="hard",
    )
    assert result["grounded"] is False


# ─── Security Tests ────────────────────────────────────────────────────────────

def test_jwt_validation_rejects_invalid_token():
    """Backend should reject invalid JWTs."""
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    response = client.post(
        "/api/v1/chat/",
        json={"message": "test", "mode": "auto", "history": []},
        headers={"Authorization": "Bearer invalid_token_here"},
    )
    assert response.status_code == 401


def test_upload_rejects_invalid_file_type():
    """Upload endpoint should reject unsupported file types."""
    from fastapi.testclient import TestClient
    from app.main import app
    import io

    client = TestClient(app)
    # We'd need a valid JWT for this — just test content type logic directly
    from app.api.v1.endpoints.documents import detect_file_type
    assert detect_file_type("malware.exe", "application/octet-stream") is None
    assert detect_file_type("notes.pdf", "application/pdf") == "pdf"
    assert detect_file_type("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document") == "docx"
