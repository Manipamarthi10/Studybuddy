from functools import lru_cache
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        extra="ignore",
    )

    # Groq
    groq_api_key: str
    groq_model_heavy: str = "llama-3.3-70b-versatile"
    groq_model_fast: str = "llama-3.1-8b-instant"

    # Supabase
    supabase_url: str = Field(
        validation_alias=AliasChoices("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
    )
    supabase_anon_key: str = Field(
        validation_alias=AliasChoices("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY")
    )
    supabase_service_role_key: str
    supabase_jwt_secret: str

    # Security
    secret_key: str
    allowed_origins: str = "http://localhost:3000"

    # RAG
    chunk_size: int = 1000
    chunk_overlap: int = 200
    retrieval_count: int = 6
    similarity_threshold: float = 0.3
    max_file_size_mb: int = 20

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Runtime behavior
    preload_embedding_model: bool = False
    embedding_model_name: str = "all-MiniLM-L6-v2"
    embedding_local_files_only: bool = False

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",")]

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024


@lru_cache()
def get_settings() -> Settings:
    return Settings()
