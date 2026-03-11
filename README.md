# StudyBuddy AI — Personal Second Brain for Students

A production-grade AI learning platform grounded in your uploaded notes.

## Stack
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, Framer Motion
- **Backend**: FastAPI, Python 3.11, LangGraph, LangChain
- **LLM**: Groq (llama-3.3-70b-versatile + llama-3.1-8b-instant)
- **Embeddings**: sentence-transformers/all-MiniLM-L6-v2 (384-dim)
- **Database**: Supabase Postgres + pgvector
- **Auth**: Supabase Auth (JWT)

## Quick Start

### 1. Clone & setup env
```bash
cp .env.example .env
# Fill in your keys
```

### 2. Start with Docker Compose
```bash
docker-compose up --build
```

### 3. Run Supabase migrations
```bash
# In Supabase SQL editor, run supabase/migrations/001_initial.sql
```

### 4. Access
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## Project Structure
```
studybuddy-ai/
├── frontend/          # Next.js 14 app
├── backend/           # FastAPI service
├── supabase/          # DB migrations & RLS policies
├── docker-compose.yml
└── .env.example
```

## Core Product Rule
Quiz and Interview features are **grounded only in uploaded notes**.
If relevant notes are not found, the system refuses clearly — it never fabricates answers.

## Deployment
- Frontend → Vercel
- Backend → Railway / Render / Fly.io
- Database → Supabase (managed)
