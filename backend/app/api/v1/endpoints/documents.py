"""
Documents API
Handles file upload, ingestion trigger, listing, and deletion.
"""
import uuid
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, BackgroundTasks, status
from supabase import create_client, Client

from app.core.config import get_settings
from app.core.security import get_current_user_id
from app.models.schemas import DocumentUploadResponse, DocumentListResponse, DocumentMeta
from app.rag.ingestion import ingest_document

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/documents", tags=["documents"])

ALLOWED_TYPES = {"pdf", "docx", "txt", "md"}
ALLOWED_MIME_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
    "text/markdown": "md",
    "application/octet-stream": None,  # detect by extension
}


def get_supabase_service_client() -> Client:
    """Service role client — bypasses RLS for backend operations."""
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def detect_file_type(filename: str, content_type: str) -> Optional[str]:
    """Determine file type from extension and/or MIME type."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in ALLOWED_TYPES:
        return ext
    return ALLOWED_MIME_TYPES.get(content_type)


def run_ingestion(
    supabase: Client,
    file_bytes: bytes,
    file_type: str,
    document_id: str,
    user_id: str,
    subject: Optional[str],
) -> None:
    """Background task: ingest document and update status."""
    try:
        chunk_count = ingest_document(
            supabase=supabase,
            file_bytes=file_bytes,
            file_type=file_type,
            document_id=document_id,
            user_id=user_id,
            subject=subject,
        )
        supabase.table("documents").update({
            "status": "ready",
            "chunk_count": chunk_count,
        }).eq("id", document_id).execute()
        logger.info(f"Document {document_id} ingestion complete: {chunk_count} chunks")
    except Exception as error:
        logger.error(f"Ingestion failed for {document_id}: {error}")
        supabase.table("documents").update({
            "status": "failed",
            "error_message": str(error)[:500],
        }).eq("id", document_id).execute()


@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    subject: Optional[str] = Form(None),
    user_id: str = Depends(get_current_user_id),
):
    """Upload a document and start background ingestion."""
    # Validate file size
    file_bytes = await file.read()
    if len(file_bytes) > settings.max_file_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {settings.max_file_size_mb}MB",
        )

    # Validate file type
    file_type = detect_file_type(file.filename or "", file.content_type or "")
    if not file_type:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_TYPES)}",
        )

    supabase = get_supabase_service_client()
    document_id = str(uuid.uuid4())
    safe_filename = f"{document_id}.{file_type}"

    # Create document record in DB
    supabase.table("documents").insert({
        "id": document_id,
        "user_id": user_id,
        "filename": safe_filename,
        "original_name": file.filename or "unknown",
        "file_type": file_type,
        "subject": subject,
        "file_size_bytes": len(file_bytes),
        "status": "processing",
    }).execute()

    # Queue background ingestion
    background_tasks.add_task(
        run_ingestion,
        supabase,
        file_bytes,
        file_type,
        document_id,
        user_id,
        subject,
    )

    return DocumentUploadResponse(
        document_id=document_id,
        filename=file.filename or "unknown",
        status="processing",
        message="Document uploaded successfully. Processing in background.",
    )


@router.get("/", response_model=DocumentListResponse)
def list_documents(
    user_id: str = Depends(get_current_user_id),
):
    """List all documents uploaded by the authenticated user."""
    supabase = get_supabase_service_client()
    result = (
        supabase.table("documents")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    docs = [
        DocumentMeta(
            id=row["id"],
            filename=row["filename"],
            original_name=row["original_name"],
            file_type=row["file_type"],
            subject=row.get("subject"),
            chunk_count=row.get("chunk_count", 0),
            file_size_bytes=row.get("file_size_bytes", 0),
            status=row["status"],
            created_at=row["created_at"],
        )
        for row in (result.data or [])
    ]
    return DocumentListResponse(documents=docs, total=len(docs))


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Delete a document and all its chunks (cascade via FK)."""
    supabase = get_supabase_service_client()

    # Verify ownership
    result = (
        supabase.table("documents")
        .select("id")
        .eq("id", document_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    supabase.table("documents").delete().eq("id", document_id).execute()


@router.get("/{document_id}/status")
def get_document_status(
    document_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Poll ingestion status for a specific document."""
    supabase = get_supabase_service_client()
    result = (
        supabase.table("documents")
        .select("id, status, chunk_count, error_message")
        .eq("id", document_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    return result.data[0]
