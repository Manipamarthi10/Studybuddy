"""
Supabase client + pgvector table initialization.

Run this SQL in your Supabase SQL editor first:
──────────────────────────────────────────────
  create extension if not exists vector;

  create table if not exists documents (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    filename text not null,
    file_type text,
    subject text,
    created_at timestamptz default now()
  );

  create table if not exists chunks (
    id uuid primary key default gen_random_uuid(),
    doc_id uuid references documents(id) on delete cascade,
    user_id uuid not null,
    text text not null,
    embedding vector(384),
    metadata jsonb default '{}',
    created_at timestamptz default now()
  );

  create index on chunks using ivfflat (embedding vector_cosine_ops)
    with (lists = 100);

  create table if not exists quiz_results (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    subject text,
    score float,
    weak_topics jsonb default '[]',
    created_at timestamptz default now()
  );

  create table if not exists interview_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    topic text,
    messages jsonb default '[]',
    score float,
    created_at timestamptz default now()
  );

  -- Row Level Security
  alter table documents enable row level security;
  alter table chunks enable row level security;

  create policy "users see own docs" on documents
    for all using (auth.uid() = user_id);

  create policy "users see own chunks" on chunks
    for all using (auth.uid() = user_id);
──────────────────────────────────────────────
"""

from supabase import create_client, Client
from core.config import settings
import logging

logger = logging.getLogger(__name__)

_supabase: Client | None = None


def get_supabase() -> Client:
    global _supabase
    if _supabase is None:
        _supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    return _supabase


def get_supabase_admin() -> Client:
    """Service role client — bypasses RLS, use only server-side."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


async def init_db():
    logger.info("Database connection initialized")
