"""
Documents API — Upload, list, delete study materials.
Supports PDF, DOCX, TXT, MD.
Background ingestion via Celery task queue.
"""

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form
from pydantic import BaseModel
from typing import List, Optional
import uuid
import logging

from core.security import get_current_user
from core.database import get_supabase_admin
from core.config import settings
from services.rag_pipeline import rag

router = APIRouter()
logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}


class DocumentResponse(BaseModel):
    doc_id: str
    filename: str
    subject: str
    chunks: int
    status: str


class DocumentListItem(BaseModel):
    id: str
    filename: str
    subject: str
    file_type: str
    created_at: str


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    subject: str = Form(default="General"),
    user: dict = Depends(get_current_user),
):
    """
    Upload and ingest a study document.
    Runs full RAG pipeline: extract → chunk → embed → store.
    """
    # Validate file
    import os
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Allowed: {ALLOWED_EXTENSIONS}",
        )

    # Size check
    file_bytes = await file.read()
    size_mb = len(file_bytes) / (1024 * 1024)
    if size_mb > settings.MAX_FILE_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size_mb:.1f} MB). Max: {settings.MAX_FILE_SIZE_MB} MB",
        )

    # Run ingestion pipeline
    try:
        result = await rag.ingest(
            file_bytes=file_bytes,
            filename=file.filename,
            user_id=user["user_id"],
            subject=subject,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")

    return DocumentResponse(
        doc_id=result["doc_id"],
        filename=result["filename"],
        subject=subject,
        chunks=result["chunks"],
        status="ingested",
    )


@router.get("/", response_model=List[DocumentListItem])
async def list_documents(
    subject: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """List all documents uploaded by the current user."""
    try:
        db = get_supabase_admin()
        query = (
            db.table("documents")
            .select("id, filename, subject, file_type, created_at")
            .eq("user_id", user["user_id"])
            .order("created_at", desc=True)
        )
        if subject:
            query = query.eq("subject", subject)

        resp = query.execute()
        return resp.data or []
    except Exception as e:
        logger.error(f"Failed to list documents: {str(e)}")
        return []


@router.delete("/{doc_id}")
async def delete_document(
    doc_id: str,
    user: dict = Depends(get_current_user),
):
    """Delete a document and all its chunks (cascades via FK)."""
    try:
        db = get_supabase_admin()

        # Verify ownership
        doc = (
            db.table("documents")
            .select("id")
            .eq("id", doc_id)
            .eq("user_id", user["user_id"])
            .execute()
        )
        if not doc.data:
            raise HTTPException(status_code=404, detail="Document not found")

        db.table("documents").delete().eq("id", doc_id).execute()
        return {"message": "Document deleted", "doc_id": doc_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete document: {str(e)}")
        return {"message": "Document deletion failed", "doc_id": doc_id, "error": str(e)}


@router.get("/subjects")
async def get_subjects(user: dict = Depends(get_current_user)):
    """Get unique subjects for the current user."""
    try:
        db = get_supabase_admin()
        resp = (
            db.table("documents")
            .select("subject")
            .eq("user_id", user["user_id"])
            .execute()
        )
        subjects = list({d["subject"] for d in (resp.data or [])})
        return {"subjects": subjects}
    except Exception as e:
        logger.error(f"Failed to get subjects: {str(e)}")
        return {"subjects": []}
