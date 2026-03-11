"""
RAG Retriever
Handles: query embedding → pgvector similarity search → context assembly
"""
import logging
from typing import Optional
from supabase import Client

from app.rag.ingestion import generate_query_embedding
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class RetrievedChunk:
    """Represents a single retrieved chunk with its metadata."""

    def __init__(self, data: dict):
        self.id = data.get("id", "")
        self.document_id = data.get("document_id", "")
        self.content = data.get("content", "")
        self.metadata = data.get("metadata", {})
        self.subject = data.get("subject")
        self.similarity = data.get("similarity", 0.0)

    def to_source_dict(self) -> dict:
        return {
            "chunk_id": self.id,
            "document_id": self.document_id,
            "subject": self.subject,
            "similarity": round(self.similarity, 3),
        }


def retrieve_chunks(
    supabase: Client,
    query: str,
    user_id: str,
    top_k: int = None,
    threshold: float = None,
    subject: Optional[str] = None,
) -> list[RetrievedChunk]:
    """
    Retrieve semantically relevant chunks from the user's uploaded notes.
    Returns empty list if nothing meets the threshold (caller must handle this).
    """
    top_k = top_k or settings.retrieval_count
    threshold = threshold or settings.similarity_threshold

    query_embedding = generate_query_embedding(query)

    try:
        result = supabase.rpc(
            "match_chunks",
            {
                "query_embedding": query_embedding,
                "match_user_id": user_id,
                "match_count": top_k,
                "match_threshold": threshold,
                "filter_subject": subject,
            },
        ).execute()
    except Exception as error:
        logger.error(f"Supabase retrieval failed: {error}")
        return []

    if not result.data:
        return []

    return [RetrievedChunk(row) for row in result.data]


def build_context_string(chunks: list[RetrievedChunk], max_chars: int = 8000) -> str:
    """
    Assemble retrieved chunks into a single context string for injection into prompts.
    Respects max character budget to avoid context overflow.
    """
    parts = []
    total_chars = 0

    for i, chunk in enumerate(chunks, 1):
        section = f"[Source {i}]\n{chunk.content}"
        if total_chars + len(section) > max_chars:
            break
        parts.append(section)
        total_chars += len(section)

    return "\n\n---\n\n".join(parts)


def has_sufficient_context(chunks: list[RetrievedChunk], min_chunks: int = 2) -> bool:
    """Check if retrieval returned enough grounded context to proceed."""
    return len(chunks) >= min_chunks


def get_source_filenames(supabase: Client, chunk_list: list[RetrievedChunk]) -> list[str]:
    """Fetch original document filenames for the retrieved chunk sources."""
    document_ids = list({c.document_id for c in chunk_list if c.document_id})
    if not document_ids:
        return []

    try:
        result = (
            supabase.table("documents")
            .select("id, original_name")
            .in_("id", document_ids)
            .execute()
        )
        return [row["original_name"] for row in (result.data or [])]
    except Exception as error:
        logger.warning(f"Failed to fetch source filenames: {error}")
        return []
