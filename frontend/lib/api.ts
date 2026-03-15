import { getAuthToken } from "./supabase";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();
  if (!token) throw new Error("Not authenticated");

  const response = await fetch(`${BACKEND_URL}/api/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(error.detail || `Request failed: ${response.status}`);
  }

  return response.json();
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
export async function sendChatMessage(payload: {
  message: string;
  mode: string;
  history: { role: string; content: string }[];
  subject?: string;
}) {
  return apiFetch<{
    answer: string;
    sources: { filename?: string; similarity?: number }[];
    agent_used: string;
    grounded: boolean;
  }>("/chat/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── Documents ────────────────────────────────────────────────────────────────
export async function uploadDocument(file: File, subject?: string) {
  const token = await getAuthToken();
  if (!token) throw new Error("Not authenticated");

  const formData = new FormData();
  formData.append("file", file);
  if (subject) formData.append("subject", subject);

  const response = await fetch(`${BACKEND_URL}/api/v1/documents/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(error.detail || "Upload failed");
  }
  return response.json();
}

export async function listDocuments() {
  return apiFetch<{
    documents: {
      id: string;
      original_name: string;
      file_type: string;
      subject?: string;
      chunk_count: number;
      file_size_bytes: number;
      status: string;
      created_at: string;
    }[];
    total: number;
  }>("/documents/");
}

export async function deleteDocument(documentId: string) {
  return apiFetch(`/documents/${documentId}`, { method: "DELETE" });
}

export async function getDocumentStatus(documentId: string) {
  return apiFetch<{ id: string; status: string; chunk_count: number; error_message?: string }>(
    `/documents/${documentId}/status`
  );
}

// ─── Quiz ─────────────────────────────────────────────────────────────────────
export async function generateQuiz(payload: {
  topic: string;
  subject?: string;
  difficulty: string;
  num_questions: number;
}) {
  return apiFetch<{
    topic: string;
    questions: {
      question: string;
      options: { label: string; text: string }[];
      correct_option: string;
      explanation: string;
      source_file?: string;
    }[];
    grounded: boolean;
    sources_used: string[];
  }>("/quiz/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function submitQuiz(payload: {
  topic: string;
  subject?: string;
  difficulty: string;
  questions: object[];
  user_answers: Record<string, string>;
}) {
  return apiFetch<{
    result_id: string;
    score_percent: number;
    correct_answers: number;
    total_questions: number;
    weak_areas: string[];
    per_question: { index: number; is_correct: boolean; explanation: string }[];
  }>("/quiz/submit", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── Interview ────────────────────────────────────────────────────────────────
export async function startInterview(payload: {
  topic: string;
  subject?: string;
  difficulty: string;
}) {
  return apiFetch<{
    session_id: string;
    first_question: string;
    topic: string;
    grounded: boolean;
    sources_used: string[];
  }>("/interview/start", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function submitInterviewAnswer(payload: {
  session_id: string;
  user_answer: string;
}) {
  return apiFetch<{
    evaluation: string;
    score: number;
    model_answer: string;
    improvement_tips: string[];
    next_question?: string;
    is_complete: boolean;
  }>("/interview/answer", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── Progress ─────────────────────────────────────────────────────────────────
export async function getProgressSummary() {
  return apiFetch<{
    total_quizzes: number;
    average_score: number;
    total_interviews: number;
    weak_topics: string[];
    strong_topics: string[];
    recent_activity: { type: string; topic: string; score: number; date: string }[];
    study_streak_days: number;
  }>("/progress/summary");
}
