"""
RAG Ingestion Pipeline
Handles: PDF/DOCX/TXT/MD parsing → cleaning → chunking → embedding → Supabase pgvector storage
"""
import io
import re
import uuid
import logging
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF
import docx
from fastembed import TextEmbedding
from supabase import Client

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Lazy-loaded singleton — loaded once on first use
_embedding_model: Optional[TextEmbedding] = None


def get_embedding_model() -> TextEmbedding:
    global _embedding_model
    if _embedding_model is None:
        logger.info("Loading embedding model: %s", settings.embedding_model_name)
        _embedding_model = TextEmbedding(settings.embedding_model_name)
        logger.info("Embedding model loaded")
    return _embedding_model


# ─── Text Extraction ──────────────────────────────────────────────────────────

def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF bytes using PyMuPDF."""
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        pages = []
        for page in doc:
            text = page.get_text("text")
            if text.strip():
                pages.append(text)
        doc.close()
        return "\n\n".join(pages)
    except Exception as error:
        logger.error(f"PDF extraction failed: {error}")
        raise ValueError(f"Failed to read PDF: {error}")


def extract_text_from_docx(file_bytes: bytes) -> str:
    """Extract text from DOCX bytes using python-docx."""
    try:
        doc = docx.Document(io.BytesIO(file_bytes))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return "\n\n".join(paragraphs)
    except Exception as error:
        logger.error(f"DOCX extraction failed: {error}")
        raise ValueError(f"Failed to read DOCX: {error}")


def extract_text(file_bytes: bytes, file_type: str) -> str:
    """Route to the correct extractor by file type."""
    if file_type == "pdf":
        return extract_text_from_pdf(file_bytes)
    elif file_type == "docx":
        return extract_text_from_docx(file_bytes)
    elif file_type in ("txt", "md"):
        return file_bytes.decode("utf-8", errors="replace")
    else:
        raise ValueError(f"Unsupported file type: {file_type}")


# ─── Text Cleaning ─────────────────────────────────────────────────────────────

def clean_text(raw_text: str) -> str:
    """Remove noise from extracted text."""
    # Remove excessive whitespace and blank lines
    text = re.sub(r"\n{3,}", "\n\n", raw_text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    # Remove page headers/footers (lines with only numbers)
    text = re.sub(r"^\s*\d+\s*$", "", text, flags=re.MULTILINE)
    # Remove null bytes
    text = text.replace("\x00", "")
    return text.strip()


# ─── Chunking ─────────────────────────────────────────────────────────────────

def split_into_chunks(
    text: str,
    chunk_size: int = None,
    overlap: int = None,
) -> list[str]:
    """
    Split text into overlapping chunks by character count.
    Tries to break at sentence/paragraph boundaries for coherence.
    """
    chunk_size = chunk_size or settings.chunk_size
    overlap = overlap or settings.chunk_overlap

    # Split into sentences first
    sentences = re.split(r"(?<=[.!?])\s+|\n\n", text)
    sentences = [s.strip() for s in sentences if s.strip()]

    chunks = []
    current_chunk = ""

    for sentence in sentences:
        if len(current_chunk) + len(sentence) + 1 <= chunk_size:
            current_chunk += (" " if current_chunk else "") + sentence
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            # Start new chunk with overlap from previous
            if len(current_chunk) > overlap:
                overlap_text = current_chunk[-overlap:]
                current_chunk = overlap_text + " " + sentence
            else:
                current_chunk = sentence

    if current_chunk.strip():
        chunks.append(current_chunk.strip())

    # Filter out very short chunks (noise)
    return [c for c in chunks if len(c) > 50]


# ─── Embeddings ───────────────────────────────────────────────────────────────

def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate 384-dim embeddings."""
    model = get_embedding_model()
    return [emb.tolist() for emb in model.embed(texts)]


def generate_query_embedding(query: str) -> list[float]:
    """Generate embedding for a single query string."""
    model = get_embedding_model()
    return next(model.embed([query])).tolist()


# ─── Storage ──────────────────────────────────────────────────────────────────

def store_chunks_in_supabase(
    supabase: Client,
    document_id: str,
    user_id: str,
    chunks: list[str],
    embeddings: list[list[float]],
    subject: Optional[str] = None,
) -> int:
    """Store text chunks + embeddings in Supabase chunks table."""
    rows = []
    for index, (chunk_text, embedding) in enumerate(zip(chunks, embeddings)):
        rows.append(
            {
                "id": str(uuid.uuid4()),
                "document_id": document_id,
                "user_id": user_id,
                "content": chunk_text,
                "embedding": embedding,
                "chunk_index": index,
                "subject": subject,
                "metadata": {"chunk_index": index, "document_id": document_id},
            }
        )

    # Insert in batches of 50
    batch_size = 50
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        supabase.table("chunks").insert(batch).execute()

    return len(rows)


# ─── Main Pipeline ────────────────────────────────────────────────────────────

def ingest_document(
    supabase: Client,
    file_bytes: bytes,
    file_type: str,
    document_id: str,
    user_id: str,
    subject: Optional[str] = None,
) -> int:
    """
    Full ingestion pipeline:
    1. Extract text
    2. Clean text
    3. Split into chunks
    4. Generate embeddings
    5. Store in Supabase
    Returns number of chunks created.
    """
    logger.info(f"Starting ingestion for document {document_id} (type: {file_type})")

    # Step 1+2: Extract and clean
    raw_text = extract_text(file_bytes, file_type)
    cleaned_text = clean_text(raw_text)

    if len(cleaned_text) < 100:
        raise ValueError("Document contains insufficient text content after extraction.")

    logger.info(f"Extracted {len(cleaned_text)} characters from {document_id}")

    # Step 3: Chunk
    chunks = split_into_chunks(cleaned_text)
    logger.info(f"Created {len(chunks)} chunks from {document_id}")

    if not chunks:
        raise ValueError("No usable text chunks could be created from this document.")

    # Step 4: Embed
    embeddings = generate_embeddings(chunks)

    # Step 5: Store
    count = store_chunks_in_supabase(
        supabase=supabase,
        document_id=document_id,
        user_id=user_id,
        chunks=chunks,
        embeddings=embeddings,
        subject=subject,
    )

    logger.info(f"Ingestion complete for {document_id}: {count} chunks stored")
    return count
