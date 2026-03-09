"""
Core configuration using Pydantic Settings.
All secrets loaded from environment variables / .env file.
"""

from pydantic_settings import BaseSettings
from typing import List
from pathlib import Path


class Settings(BaseSettings):
    # App
    APP_NAME: str = "StudyBuddy AI"
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-in-production"

    # LLM - Groq (Llama 3)
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_FAST_MODEL: str = "llama-3.1-8b-instant"  # For lightweight tasks

    # Embeddings
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    EMBEDDING_DIMENSION: int = 384

    # Vector DB - Supabase
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    # Storage
    MAX_FILE_SIZE_MB: int = 50
    ALLOWED_FILE_TYPES: List[str] = ["pdf", "txt", "md", "docx"]

    # RAG Pipeline
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 64
    TOP_K_RETRIEVAL: int = 6
    SIMILARITY_THRESHOLD: float = 0.7

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 30

    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "https://studybuddy-ai.vercel.app"
    ]

    # Redis (for caching & task queue)
    REDIS_URL: str = "redis://localhost:6379"

    class Config:
        env_file = str(Path(__file__).resolve().parent.parent / ".env")
        case_sensitive = True


settings = Settings()
