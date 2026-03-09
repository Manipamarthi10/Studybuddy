/**
 * StudyBuddy API client.
 * All calls go through here — easy to swap base URL or add auth headers.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "API error");
  }
  return res.json();
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  response: string;
  agent: string;
  sources: string[];
  grounded: boolean;
  mode: string;
}

export async function sendChat(
  message: string,
  chatHistory: ChatMessage[],
  token: string,
  subject?: string,
  mode = "auto"
): Promise<ChatResponse> {
  return apiFetch(
    "/api/chat/",
    {
      method: "POST",
      body: JSON.stringify({ message, chat_history: chatHistory, subject, mode }),
    },
    token
  );
}

// ── Documents ─────────────────────────────────────────────────────────────────

export async function uploadDocument(
  file: File,
  subject: string,
  token: string
): Promise<{ doc_id: string; filename: string; chunks: number }> {
  const form = new FormData();
  form.append("file", file);
  form.append("subject", subject);
  const res = await fetch(`${BASE}/api/documents/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}

export async function listDocuments(token: string): Promise<any[]> {
  return apiFetch("/api/documents/", {}, token);
}

export async function deleteDocument(docId: string, token: string): Promise<void> {
  await apiFetch(`/api/documents/${docId}`, { method: "DELETE" }, token);
}

// ── Quiz ─────────────────────────────────────────────────────────────────────

export async function generateQuiz(
  topic: string,
  subject: string | undefined,
  difficulty: string,
  token: string
): Promise<any> {
  return apiFetch(
    "/api/quiz/generate",
    {
      method: "POST",
      body: JSON.stringify({ topic, subject, difficulty, num_questions: 5 }),
    },
    token
  );
}

export async function submitQuiz(payload: any, token: string): Promise<any> {
  return apiFetch(
    "/api/quiz/submit",
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
}

export async function getWeaknesses(token: string): Promise<any> {
  return apiFetch("/api/quiz/weaknesses", {}, token);
}

// ── Interview ─────────────────────────────────────────────────────────────────

export async function startInterview(
  topic: string,
  difficulty: string,
  company: string | undefined,
  token: string
): Promise<any> {
  return apiFetch(
    "/api/interview/start",
    { method: "POST", body: JSON.stringify({ topic, difficulty, company }) },
    token
  );
}

export async function submitAnswer(
  sessionId: string,
  question: string,
  answer: string,
  topic: string,
  token: string
): Promise<any> {
  return apiFetch(
    "/api/interview/answer",
    {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, question, answer, topic }),
    },
    token
  );
}

export async function getInterviewTopics(token: string): Promise<any> {
  return apiFetch("/api/interview/topics", {}, token);
}
