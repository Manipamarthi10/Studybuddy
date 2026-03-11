"""
StudyBuddy AI — FastAPI Application Entry Point
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.api.v1.endpoints.chat import router as chat_router
from app.api.v1.endpoints.documents import router as documents_router
from app.api.v1.endpoints.quiz import router as quiz_router
from app.api.v1.endpoints.interview import router as interview_router
from app.api.v1.endpoints.progress import router as progress_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: pre-load the embedding model to avoid cold start on first request."""
    logger.info("StudyBuddy AI backend starting...")
    try:
        from app.rag.ingestion import get_embedding_model
        get_embedding_model()
        logger.info("Embedding model ready")
    except Exception as error:
        logger.warning(f"Embedding model pre-load failed (will load on demand): {error}")
    yield
    logger.info("StudyBuddy AI backend shutting down")


app = FastAPI(
    title="StudyBuddy AI API",
    description="Personal Second Brain for Students — Grounded RAG-powered learning platform",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────
API_PREFIX = "/api/v1"

app.include_router(chat_router, prefix=API_PREFIX)
app.include_router(documents_router, prefix=API_PREFIX)
app.include_router(quiz_router, prefix=API_PREFIX)
app.include_router(interview_router, prefix=API_PREFIX)
app.include_router(progress_router, prefix=API_PREFIX)


# ─── Health Check ─────────────────────────────────────────────────────────────
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "StudyBuddy AI API"}


@app.get("/")
def root():
    return {"message": "StudyBuddy AI API v1.0", "docs": "/docs"}


# ─── Global Error Handler ─────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again."},
    )
