-- ============================================================
-- StudyBuddy AI — Supabase Database Setup
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Enable pgvector extension
create extension if not exists vector;

-- 2. Documents table
create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  filename    text not null,
  file_type   text,
  subject     text default 'General',
  created_at  timestamptz default now()
);

-- 3. Chunks table with vector embedding
create table if not exists chunks (
  id          uuid primary key default gen_random_uuid(),
  doc_id      uuid references documents(id) on delete cascade,
  user_id     uuid not null,
  text        text not null,
  embedding   vector(384),  -- matches all-MiniLM-L6-v2 dimension
  metadata    jsonb default '{}',
  created_at  timestamptz default now()
);

-- 4. HNSW index for fast ANN search (better than ivfflat for < 1M rows)
create index if not exists chunks_embedding_idx
  on chunks using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- 5. Quiz results
create table if not exists quiz_results (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  subject     text,
  score       float,
  weak_topics jsonb default '[]',
  created_at  timestamptz default now()
);

-- 6. Interview sessions
create table if not exists interview_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  topic       text,
  messages    jsonb default '[]',
  score       float default 0,
  created_at  timestamptz default now()
);

-- ── Row Level Security ────────────────────────────────────────────────────────

alter table documents         enable row level security;
alter table chunks            enable row level security;
alter table quiz_results      enable row level security;
alter table interview_sessions enable row level security;

-- Users can only see their own data
drop policy if exists "own documents" on documents;
create policy "own documents" on documents
  for all using (auth.uid() = user_id);

drop policy if exists "own chunks" on chunks;
create policy "own chunks" on chunks
  for all using (auth.uid() = user_id);

drop policy if exists "own quiz results" on quiz_results;
create policy "own quiz results" on quiz_results
  for all using (auth.uid() = user_id);

drop policy if exists "own interview sessions" on interview_sessions;
create policy "own interview sessions" on interview_sessions
  for all using (auth.uid() = user_id);

-- ── Semantic Search RPC Function ──────────────────────────────────────────────
-- Called by the RAG pipeline for vector similarity search

create or replace function match_chunks(
  query_embedding  vector(384),
  match_threshold  float,
  match_count      int,
  filter_user_id   uuid,
  filter_subject   text default null
)
returns table (
  id        uuid,
  text      text,
  metadata  jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    c.id,
    c.text,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join documents d on c.doc_id = d.id
  where c.user_id = filter_user_id
    and (filter_subject is null or d.subject = filter_subject)
    and 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;
