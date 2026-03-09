"""
StudyBuddy AI - FastAPI Backend
Production-grade AI learning platform
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
import uvicorn

from api.chat import router as chat_router
from api.documents import router as documents_router
from api.quiz import router as quiz_router
from api.interview import router as interview_router
from api.agents import router as agents_router
from core.config import settings
from core.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    await init_db()
    yield


app = FastAPI(
    title="StudyBuddy AI",
    description="Personal Second Brain for Students",
    version="1.0.0",
    lifespan=lifespan
)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Routers
app.include_router(chat_router, prefix="/api/chat", tags=["RAG Chat"])
app.include_router(documents_router, prefix="/api/documents", tags=["Documents"])
app.include_router(quiz_router, prefix="/api/quiz", tags=["Quiz Generator"])
app.include_router(interview_router, prefix="/api/interview", tags=["Interview Prep"])
app.include_router(agents_router, prefix="/api/agents", tags=["Multi-Agent"])


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "StudyBuddy AI"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
