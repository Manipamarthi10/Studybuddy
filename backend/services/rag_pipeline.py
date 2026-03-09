"""
RAG Pipeline — Core intelligence engine.

Flow:
  INGEST:  file → extract → clean → chunk → embed → store in pgvector
  QUERY:   question → embed → vector search → inject context → LLM → answer
"""

from __future__ import annotations

import hashlib
import io
import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

import fitz  # PyMuPDF
from docx import Document as DocxDocument
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer
from groq import Groq

from core.config import settings
from core.database import get_supabase_admin
import logging

logger = logging.getLogger(__name__)


@dataclass
class DocumentChunk:
    chunk_id: str
    doc_id: str
    user_id: str
    text: str
    embedding: List[float] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


@dataclass
class RAGResult:
    answer: str
    sources: List[str]
    context_used: List[str]
    grounded: bool  # True if answer was based on retrieved docs


class RAGPipeline:
    """
    Singleton RAG pipeline.
    Lazily loads embedding model on first use to save startup time.
    """

    _instance: Optional["RAGPipeline"] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def _ensure_init(self):
        if not self._initialized:
            self.embedder = SentenceTransformer(settings.EMBEDDING_MODEL)
            self.groq = Groq(api_key=settings.GROQ_API_KEY)
            self.splitter = RecursiveCharacterTextSplitter(
                chunk_size=settings.CHUNK_SIZE,
                chunk_overlap=settings.CHUNK_OVERLAP,
                separators=["\n\n", "\n", ".", "!", "?", ";", " ", ""],
            )
            self._initialized = True

    # ── INGESTION ─────────────────────────────────────────────────────────────

    async def ingest(
        self,
        file_bytes: bytes,
        filename: str,
        user_id: str,
        subject: str = "General",
    ) -> dict:
        self._ensure_init()
        try:
            db = get_supabase_admin()
        except Exception as e:
            logger.error(f"Supabase not available, returning mock response: {str(e)}")
            # Return mock success for offline mode
            return {"doc_id": str(uuid.uuid4()), "chunks": 1, "filename": filename}

        # 1. Register document
        doc_id = str(uuid.uuid4())
        try:
            db.table("documents").insert({
                "id": doc_id,
                "user_id": user_id,
                "filename": filename,
                "file_type": Path(filename).suffix.lower().strip("."),
                "subject": subject,
            }).execute()
        except Exception as e:
            logger.error(f"Failed to register document: {str(e)}")

        # 2. Extract text
        raw = self._extract_text(file_bytes, filename)
        if len(raw.strip()) < 50:
            raise ValueError("Could not extract meaningful text from this file.")

        # 3. Clean
        clean = self._clean(raw)

        # 4. Chunk
        chunks_text = self.splitter.split_text(clean)
        logger.info(f"[RAG] {filename} → {len(chunks_text)} chunks")

        # 5. Batch embed
        embeddings = self.embedder.encode(
            chunks_text,
            batch_size=32,
            normalize_embeddings=True,
        ).tolist()

        # 6. Store in Supabase
        rows = [
            {
                "id": str(uuid.uuid4()),
                "doc_id": doc_id,
                "user_id": user_id,
                "text": text,
                "embedding": emb,
                "metadata": {"chunk_index": i, "filename": filename, "subject": subject},
            }
            for i, (text, emb) in enumerate(zip(chunks_text, embeddings))
        ]
        # Supabase has a 1000-row limit per insert — batch it
        try:
            for i in range(0, len(rows), 500):
                db.table("chunks").insert(rows[i : i + 500]).execute()
        except Exception as e:
            logger.error(f"Failed to store chunks: {str(e)}")

        return {"doc_id": doc_id, "chunks": len(chunks_text), "filename": filename}

    # ── QUERY ─────────────────────────────────────────────────────────────────

    async def query(
        self,
        question: str,
        user_id: str,
        subject: Optional[str] = None,
        system_role: str = "tutor",
        chat_history: List[dict] = [],
    ) -> RAGResult:
        self._ensure_init()
        db = None
        try:
            db = get_supabase_admin()
        except Exception as e:
            logger.error(f"Supabase not available, using LLM without RAG context: {str(e)}")
            # Fallback to LLM-only mode
            retrieved = []
            context_block = "No context available (offline mode)."
            grounded = False

        if db:
            # 1. Embed question
            q_emb = self.embedder.encode(question, normalize_embeddings=True).tolist()

            # 2. Vector similarity search via Supabase RPC
            # (requires the match_chunks SQL function — see database.py comments)
            rpc_params = {
                "query_embedding": q_emb,
                "match_threshold": settings.SIMILARITY_THRESHOLD,
                "match_count": settings.TOP_K_RETRIEVAL,
                "filter_user_id": user_id,
            }
            if subject:
                rpc_params["filter_subject"] = subject

            try:
                resp = db.rpc("match_chunks", rpc_params).execute()
                retrieved = resp.data or []
            except Exception as e:
                logger.error(f"Vector search failed: {str(e)}")
                retrieved = []

        # 3. Build context
        if not retrieved:
            # No relevant docs found — tell LLM to say so
            context_block = "No relevant context found in the student's uploaded documents."
            grounded = False
        else:
            context_block = "\n\n---\n\n".join(
                f"[Source: {r['metadata'].get('filename', 'unknown')}]\n{r['text']}"
                for r in retrieved
            )
            grounded = True

        sources = list({r["metadata"].get("filename", "unknown") for r in retrieved})

        # 4. Build system prompt based on role
        system_prompts = {
            "tutor": (
                "You are StudyBuddy AI, an expert personal tutor. "
                "Answer ONLY using the provided context from the student's documents. "
                "If the answer is not in the context, say 'I couldn't find that in your notes.' "
                "Be clear, structured, and use examples. Use markdown formatting."
            ),
            "quiz": (
                "You are a quiz generator. Generate questions strictly from the provided context."
            ),
            "interview": (
                "You are a technical interview coach. Use the context to frame realistic questions."
            ),
            "revision": (
                "You are a revision assistant. Summarize the context into clear bullet points."
            ),
        }

        system = system_prompts.get(system_role, system_prompts["tutor"])

        # 5. Build messages
        messages = [
            *chat_history[-6:],  # Last 3 turns for context window efficiency
            {
                "role": "user",
                "content": f"CONTEXT FROM STUDENT DOCUMENTS:\n{context_block}\n\nQUESTION: {question}",
            },
        ]

        # 6. Generate with Groq Llama 3
        response = self.groq.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[{"role": "system", "content": system}, *messages],
            temperature=0.3,  # Low temp = more factual
            max_tokens=1024,
        )

        answer = response.choices[0].message.content

        return RAGResult(
            answer=answer,
            sources=sources,
            context_used=[r["text"][:200] for r in retrieved],
            grounded=grounded,
        )

    # ── HELPERS ───────────────────────────────────────────────────────────────

    def _extract_text(self, file_bytes: bytes, filename: str) -> str:
        ext = Path(filename).suffix.lower()
        if ext == ".pdf":
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            return "\n\n".join(page.get_text() for page in doc)
        elif ext == ".docx":
            doc = DocxDocument(io.BytesIO(file_bytes))
            return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())
        elif ext in (".txt", ".md"):
            return file_bytes.decode("utf-8", errors="ignore")
        else:
            raise ValueError(f"Unsupported file type: {ext}")

    def _clean(self, text: str) -> str:
        text = re.sub(r"\s{3,}", "\n\n", text)
        text = re.sub(r"[^\x00-\x7F]+", " ", text)
        text = re.sub(r"\.{3,}", "...", text)
        return text.strip()


rag = RAGPipeline()
