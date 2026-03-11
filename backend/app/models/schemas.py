from typing import Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


# ─── Shared Enums ────────────────────────────────────────────────────────────

class Difficulty(str, Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


class AgentMode(str, Enum):
    auto = "auto"
    tutor = "tutor"
    revision = "revision"
    planner = "planner"
    doubt = "doubt"


# ─── Chat ────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str
    sources: list[dict] = Field(default_factory=list)
    timestamp: Optional[str] = None


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    mode: AgentMode = AgentMode.auto
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)
    subject: Optional[str] = None
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict] = Field(default_factory=list)
    agent_used: str
    session_id: Optional[str] = None
    grounded: bool = True


# ─── Documents ───────────────────────────────────────────────────────────────

class DocumentUploadResponse(BaseModel):
    document_id: str
    filename: str
    status: str
    chunk_count: int = 0
    message: str


class DocumentMeta(BaseModel):
    id: str
    filename: str
    original_name: str
    file_type: str
    subject: Optional[str] = None
    chunk_count: int
    file_size_bytes: int
    status: str
    created_at: str


class DocumentListResponse(BaseModel):
    documents: list[DocumentMeta]
    total: int


# ─── Quiz ─────────────────────────────────────────────────────────────────────

class QuizGenerateRequest(BaseModel):
    topic: str = Field(..., min_length=2, max_length=200)
    subject: Optional[str] = None
    difficulty: Difficulty = Difficulty.medium
    num_questions: int = Field(default=5, ge=3, le=15)


class QuizOption(BaseModel):
    label: str  # A, B, C, D
    text: str


class QuizQuestion(BaseModel):
    question: str
    options: list[QuizOption]
    correct_option: str  # A, B, C, or D
    explanation: str
    source_file: Optional[str] = None


class QuizGenerateResponse(BaseModel):
    quiz_id: Optional[str] = None
    topic: str
    questions: list[QuizQuestion]
    grounded: bool = True
    sources_used: list[str] = Field(default_factory=list)


class QuizSubmitRequest(BaseModel):
    topic: str
    subject: Optional[str] = None
    difficulty: Difficulty = Difficulty.medium
    questions: list[dict]  # original questions
    user_answers: dict[str, str]  # question_index -> chosen option label


class QuizResultResponse(BaseModel):
    result_id: str
    score_percent: float
    correct_answers: int
    total_questions: int
    weak_areas: list[str]
    per_question: list[dict]


# ─── Interview ────────────────────────────────────────────────────────────────

class InterviewStartRequest(BaseModel):
    topic: str = Field(..., min_length=2, max_length=200)
    subject: Optional[str] = None
    difficulty: Difficulty = Difficulty.medium


class InterviewStartResponse(BaseModel):
    session_id: str
    first_question: str
    topic: str
    grounded: bool = True
    sources_used: list[str] = Field(default_factory=list)


class InterviewAnswerRequest(BaseModel):
    session_id: str
    user_answer: str = Field(..., min_length=1, max_length=5000)


class InterviewAnswerResponse(BaseModel):
    evaluation: str
    score: float  # 0-10
    model_answer: str
    improvement_tips: list[str]
    next_question: Optional[str] = None
    is_complete: bool = False
    session_complete_summary: Optional[dict] = None


# ─── Progress ─────────────────────────────────────────────────────────────────

class ProgressSummary(BaseModel):
    total_quizzes: int
    average_score: float
    total_interviews: int
    weak_topics: list[str]
    strong_topics: list[str]
    recent_activity: list[dict]
    study_streak_days: int
