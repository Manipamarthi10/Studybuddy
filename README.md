# StudyBuddy AI 🧠
### Personal Second Brain for Students

> RAG-powered AI tutor with multi-agent system, quiz generation, and interview prep.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│              Next.js 14 + TypeScript + Tailwind             │
│   Chat UI │ Quiz Generator │ Interview Sim │ Doc Manager    │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST / SSE
┌──────────────────────▼──────────────────────────────────────┐
│                    FASTAPI BACKEND                          │
│  /api/chat  /api/documents  /api/quiz  /api/interview       │
└──────┬──────────────┬──────────────────────────────────────-┘
       │              │
┌──────▼──────┐  ┌────▼───────────────────┐
│ RAG Pipeline│  │  Agent Orchestrator    │
│ ─────────── │  │  (LangGraph)           │
│ embed query │  │  ┌──────┐ ┌──────────┐ │
│ pgvector    │  │  │Tutor │ │  Quiz    │ │
│ search      │  │  ├──────┤ ├──────────┤ │
│ inject ctx  │  │  │Plnr  │ │Interview │ │
│ Groq LLM   │  │  └──────┘ └──────────┘ │
└──────┬──────┘  └────────────────────────┘
       │
┌──────▼──────────────────────────────────┐
│         Supabase (Postgres + pgvector)  │
│  documents │ chunks │ quiz_results      │
└─────────────────────────────────────────┘
```

---

## Quick Start

### 1. Prerequisites
- Python 3.11+
- Node.js 20+
- Supabase account (free tier works)
- Groq API key (free at console.groq.com)

### 2. Supabase Setup
1. Create a new Supabase project at supabase.com
2. Go to SQL Editor → paste contents of `supabase_setup.sql` → Run
3. Copy your project URL and anon key

### 3. Backend Setup
```bash
cd backend
cp .env.example .env
# Fill in GROQ_API_KEY, SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY

pip install -r requirements.txt
uvicorn main:app --reload
# Backend running at http://localhost:8000
# API docs at http://localhost:8000/docs
```

### 4. Frontend Setup
```bash
cd frontend
cp .env.local.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY

npm install
npm run dev
# Frontend at http://localhost:3000
```

### 5. Docker (Optional)
```bash
# From project root
docker-compose up --build
```

---

## API Reference

### Chat (RAG)
```
POST /api/chat/
Body: { message, subject?, chat_history[], mode? }
Returns: { response, agent, sources, grounded }
```

### Upload Document
```
POST /api/documents/upload
Form: file (PDF/DOCX/TXT/MD), subject
Returns: { doc_id, filename, chunks }
```

### Generate Quiz
```
POST /api/quiz/generate
Body: { topic, subject?, difficulty, num_questions }
Returns: { quiz_id, questions[{ question, options, answer, explanation }] }
```

### Start Interview
```
POST /api/interview/start
Body: { topic, difficulty, company? }
Returns: { session_id, question, hints }

POST /api/interview/answer
Body: { session_id, question, answer, topic }
Returns: { score, feedback, model_answer, improvement_tips }
```

---

## Project Structure

```
studybuddy/
├── backend/
│   ├── main.py                  # FastAPI app entry
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env.example
│   ├── core/
│   │   ├── config.py            # Pydantic settings
│   │   ├── database.py          # Supabase client + SQL docs
│   │   └── security.py          # JWT auth + injection protection
│   ├── services/
│   │   └── rag_pipeline.py      # Full RAG: ingest + query
│   ├── agents/
│   │   └── orchestrator.py      # LangGraph multi-agent system
│   └── api/
│       ├── chat.py              # Chat + streaming endpoints
│       ├── documents.py         # Upload/list/delete docs
│       ├── quiz.py              # Generate + submit quizzes
│       ├── interview.py         # Mock interview simulation
│       └── agents.py            # Direct agent access
│
├── frontend/
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── StudyBuddyApp.jsx    # Main app component
│       ├── lib/
│       │   ├── api.ts           # Backend API client
│       │   └── supabase.ts      # Supabase client
│       ├── pages/
│       │   ├── _app.tsx
│       │   └── index.tsx
│       └── styles/globals.css
│
├── supabase_setup.sql            # DB schema + pgvector + RLS
├── docker-compose.yml
└── README.md
```

---

## Deployment

### Backend (Railway / Render / Fly.io)
```bash
# Railway
railway init
railway up

# Or Render: connect GitHub, set env vars, deploy
```

### Frontend (Vercel)
```bash
cd frontend
vercel --prod
# Set env vars in Vercel dashboard
```

---

## RAG Pipeline Details

```
1. INGEST
   File → PyMuPDF/docx extract → clean text → RecursiveTextSplitter
   → sentence-transformers embed (batch=32) → Supabase pgvector insert

2. QUERY  
   User question → embed → match_chunks() RPC (cosine similarity)
   → top-k results → inject as context → Groq Llama 3 → grounded answer

3. ANTI-HALLUCINATION
   LLM is strictly instructed to answer only from retrieved context.
   If no context found, responds: "I couldn't find that in your notes."
```

---

## Agents (LangGraph)

| Agent | Trigger Keywords | Behavior |
|-------|-----------------|----------|
| Tutor | explain, what is, how does | Step-by-step explanation with examples |
| Quiz | quiz, test me, MCQ | JSON-structured MCQ generation |
| Revision | summary, revision, flashcard | Bullet-point revision sheets |
| Planner | schedule, study plan, exam on | Day-by-day study schedule table |
| Interview | interview, placement, DSA | Mock interview with evaluation |
| Doubt | (fallback) | Deep conceptual explanation |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| LLM | Llama 3 70B via Groq API |
| RAG | LangChain + sentence-transformers |
| Agents | LangGraph |
| Vector DB | Supabase pgvector (HNSW index) |
| Backend | FastAPI + Python 3.11 |
| Frontend | Next.js 14 + TypeScript + Tailwind |
| Auth | Supabase Auth (JWT) |
| Cache | Redis |
| Deploy | Vercel (FE) + Railway/Render (BE) |

---

## Future Improvements

- [ ] YouTube transcript ingestion (youtube-transcript-api)
- [ ] Voice mode (Whisper STT + TTS)
- [ ] Knowledge graph visualization (NetworkX + D3)
- [ ] Spaced repetition engine (SM-2 algorithm)
- [ ] Collaborative study rooms
- [ ] Offline mode (Ollama local LLM)
- [ ] Mobile app (React Native)
