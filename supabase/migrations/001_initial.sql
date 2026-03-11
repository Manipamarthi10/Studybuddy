-- ============================================================
-- StudyBuddy AI — Supabase Database Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================
-- TABLE: documents
-- Stores uploaded document metadata per user
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'docx', 'txt', 'md')),
    subject TEXT,
    storage_path TEXT,
    chunk_count INTEGER DEFAULT 0,
    file_size_bytes BIGINT DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: chunks
-- Stores text chunks with vector embeddings (384-dim)
-- ============================================================
CREATE TABLE IF NOT EXISTS chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(384),
    chunk_index INTEGER NOT NULL,
    subject TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index for fast approximate nearest-neighbor search
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
    ON chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Index for filtering by user
CREATE INDEX IF NOT EXISTS chunks_user_id_idx ON chunks(user_id);
CREATE INDEX IF NOT EXISTS chunks_document_id_idx ON chunks(document_id);
CREATE INDEX IF NOT EXISTS chunks_subject_idx ON chunks(subject);

-- ============================================================
-- TABLE: quiz_results
-- Stores quiz attempts and per-question results
-- ============================================================
CREATE TABLE IF NOT EXISTS quiz_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    subject TEXT,
    difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    total_questions INTEGER NOT NULL,
    correct_answers INTEGER NOT NULL,
    score_percent NUMERIC(5, 2) NOT NULL,
    time_taken_seconds INTEGER,
    questions JSONB NOT NULL DEFAULT '[]',
    -- Each question: { question, options, correct, user_answer, explanation, source_file }
    weak_areas JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quiz_results_user_id_idx ON quiz_results(user_id);
CREATE INDEX IF NOT EXISTS quiz_results_created_at_idx ON quiz_results(created_at DESC);

-- ============================================================
-- TABLE: interview_sessions
-- Stores mock interview sessions and evaluations
-- ============================================================
CREATE TABLE IF NOT EXISTS interview_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    subject TEXT,
    difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
    total_questions INTEGER DEFAULT 0,
    overall_score NUMERIC(5, 2),
    exchanges JSONB NOT NULL DEFAULT '[]',
    -- Each exchange: { question, user_answer, evaluation, score, model_answer, tips, sources }
    summary JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS interview_sessions_user_id_idx ON interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS interview_sessions_created_at_idx ON interview_sessions(created_at DESC);

-- ============================================================
-- TABLE: chat_sessions
-- Stores tutor chat history per user
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    mode TEXT NOT NULL DEFAULT 'tutor' CHECK (mode IN ('tutor', 'revision', 'planner', 'doubt')),
    messages JSONB NOT NULL DEFAULT '[]',
    -- Each message: { role, content, sources, timestamp }
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_sessions_user_id_idx ON chat_sessions(user_id);

-- ============================================================
-- FUNCTION: match_chunks
-- Semantic similarity search scoped to a user
-- ============================================================
CREATE OR REPLACE FUNCTION match_chunks(
    query_embedding vector(384),
    match_user_id UUID,
    match_count INT DEFAULT 6,
    match_threshold FLOAT DEFAULT 0.3,
    filter_subject TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    content TEXT,
    metadata JSONB,
    subject TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.document_id,
        c.content,
        c.metadata,
        c.subject,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM chunks c
    WHERE
        c.user_id = match_user_id
        AND (filter_subject IS NULL OR c.subject = filter_subject)
        AND 1 - (c.embedding <=> query_embedding) > match_threshold
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Users can only access their own data
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

-- Documents policies
CREATE POLICY "Users can view own documents"
    ON documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own documents"
    ON documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own documents"
    ON documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own documents"
    ON documents FOR DELETE USING (auth.uid() = user_id);

-- Chunks policies
CREATE POLICY "Users can view own chunks"
    ON chunks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own chunks"
    ON chunks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own chunks"
    ON chunks FOR DELETE USING (auth.uid() = user_id);

-- Quiz results policies
CREATE POLICY "Users can view own quiz results"
    ON quiz_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own quiz results"
    ON quiz_results FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Interview sessions policies
CREATE POLICY "Users can view own interview sessions"
    ON interview_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own interview sessions"
    ON interview_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own interview sessions"
    ON interview_sessions FOR UPDATE USING (auth.uid() = user_id);

-- Chat sessions policies
CREATE POLICY "Users can view own chat sessions"
    ON chat_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own chat sessions"
    ON chat_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own chat sessions"
    ON chat_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own chat sessions"
    ON chat_sessions FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Service role bypass (for backend operations)
-- The backend uses service_role key which bypasses RLS
-- ============================================================

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Supabase Storage bucket for document uploads
-- Run this separately if needed
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('documents', 'documents', false);
-- 
-- CREATE POLICY "Users can upload own documents"
--     ON storage.objects FOR INSERT WITH CHECK (
--         bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]
--     );
-- CREATE POLICY "Users can read own documents"
--     ON storage.objects FOR SELECT USING (
--         bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]
--     );
-- CREATE POLICY "Users can delete own documents"
--     ON storage.objects FOR DELETE USING (
--         bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]
--     );
