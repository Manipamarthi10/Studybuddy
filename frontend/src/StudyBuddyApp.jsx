import { useState, useRef, useEffect } from "react";
import {
  sendChat,
  uploadDocument,
  listDocuments,
  deleteDocument,
  generateQuiz,
  submitQuiz,
  startInterview as startInterviewApi,
  submitAnswer,
} from "./lib/api";
import { ensureToken } from "./lib/supabase";

const Icon = ({ d, size = 20, stroke = "currentColor", fill = "none" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const icons = {
  brain: "M9.5 2a2.5 2.5 0 0 1 5 0m-5 0H7a5 5 0 0 0-5 5v2a5 5 0 0 0 5 5h10a5 5 0 0 0 5-5V7a5 5 0 0 0-5-5h-2.5m-5 0v3m5-3v3M9 13v6m6-6v6m-3-6v6",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  quiz: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  interview: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13 0l-3 3m0 0-3-3m3 3V8",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
  x: "M18 6 6 18M6 6l12 12",
  check: "M20 6 9 17l-5-5",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  alert: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  loader: "M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83",
  trash: "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  spark: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  chart: "M18 20V10M12 20V4M6 20v-6",
};

const normalizeQuizOptions = (options = []) =>
  options.map((opt, idx) => {
    if (/^[A-D]\)/.test(opt)) return opt;
    return `${String.fromCharCode(65 + idx)}) ${opt}`;
  });

export default function StudyBuddyApp() {
  const [activeTab, setActiveTab] = useState("chat");
  const [chatMessages, setChatMessages] = useState([
    { role: "assistant", content: "# 👋 Welcome to StudyBuddy AI!\n\nI'm your personal AI tutor. I can:\n- **Answer questions** from your uploaded notes\n- **Generate quizzes** to test your knowledge\n- **Simulate interviews** for placement prep\n- **Create revision summaries**\n\nUpload your notes or ask me anything!", agent: "tutor" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [mode, setMode] = useState("auto");
  const [quizState, setQuizState] = useState("idle");
  const [quizTopic, setQuizTopic] = useState("Operating Systems");
  const [quizDifficulty, setQuizDifficulty] = useState("medium");
  const [quizId, setQuizId] = useState("");
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [quizResult, setQuizResult] = useState(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const [interviewState, setInterviewState] = useState("idle");
  const [interviewTopic, setInterviewTopic] = useState("os");
  const [interviewDifficulty, setInterviewDifficulty] = useState("medium");
  const [sessionId, setSessionId] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [interviewAnswer, setInterviewAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [interviewTotal, setInterviewTotal] = useState(5);
  const [uploading, setUploading] = useState(false);
  const [uploadSubject, setUploadSubject] = useState("General");
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  useEffect(() => {
    const loadDocuments = async () => {
      try {
        const token = await ensureToken();
        const docs = await listDocuments(token);
        setDocuments((docs || []).map((doc) => ({
          id: doc.id,
          filename: doc.filename,
          subject: doc.subject || "General",
          chunks: doc.chunks ?? 0,
        })));
      } catch (error) {
        console.error("Failed to load documents", error);
      }
    };
    loadDocuments();
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setChatMessages(m => [...m, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const token = await ensureToken();
      const chatHistory = chatMessages.map((msg) => ({ role: msg.role, content: msg.content }));
      const result = await sendChat(userMsg, chatHistory, token, undefined, mode);
      setChatMessages(m => [...m, { role: "assistant", content: result.response, agent: result.agent }]);
    } catch (error) {
      const errText = error?.message || "Failed to reach backend chat API";
      setChatMessages(m => [...m, {
        role: "assistant",
        content: `⚠️ ${errText}`,
        agent: "system",
      }]);
    } finally {
      setLoading(false);
    }
  };

  const startQuiz = async () => {
    setQuizState("loading");
    try {
      const token = await ensureToken();
      const quiz = await generateQuiz(quizTopic, quizTopic, quizDifficulty, token);
      const normalized = (quiz.questions || []).map((q, i) => ({
        ...q,
        id: q.id ?? String(i),
        options: normalizeQuizOptions(q.options || []),
      }));
      setQuizId(quiz.quiz_id || "");
      setQuestions(normalized);
      setAnswers({});
      setCurrentQ(0);
      setShowExplanation(false);
      setQuizState("active");
    } catch (error) {
      setQuizState("idle");
    }
  };

  const selectAnswer = (qId, ans) => {
    if (answers[qId]) return;
    setAnswers(a => ({ ...a, [qId]: ans }));
    setShowExplanation(true);
  };

  const nextQuestion = async () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ(q => q + 1);
      setShowExplanation(false);
    } else {
      try {
        const token = await ensureToken();
        const correct_answers = questions.reduce((acc, q) => {
          acc[q.id] = q.answer;
          return acc;
        }, {});
        const result = await submitQuiz(
          {
            quiz_id: quizId || `local-${Date.now()}`,
            topic: quizTopic,
            subject: quizTopic,
            answers,
            correct_answers,
          },
          token
        );
        setQuizResult(result);
      } catch (error) {
        const correct = questions.filter(q => answers[q.id]?.toUpperCase() === q.answer).length;
        const score = (correct / questions.length) * 100;
        setQuizResult({
          score: Math.round(score),
          correct,
          total: questions.length,
          weak_topics: score < 70 ? [quizTopic] : [],
          recommendation: `Backend submit failed, local result shown.`,
        });
      }
      setQuizState("result");
    }
  };

  const startInterview = async () => {
    setInterviewState("loading");
    try {
      const token = await ensureToken();
      const session = await startInterviewApi(interviewTopic, interviewDifficulty, undefined, token);
      setCurrentQuestion(session.question || "");
      setQuestionIndex((session.question_number || 1) - 1);
      setInterviewTotal(session.total_questions || 5);
      setInterviewAnswer("");
      setFeedback(null);
      setSessionId(session.session_id || "");
      setInterviewState("active");
    } catch (error) {
      setInterviewState("idle");
    }
  };

  const submitInterviewAnswer = async () => {
    if (!interviewAnswer.trim()) return;
    setInterviewState("evaluating");
    try {
      const token = await ensureToken();
      const result = await submitAnswer(sessionId, currentQuestion, interviewAnswer, interviewTopic, token);
      setFeedback({
        ...result,
        improvement_tips: result.improvement_tips || [],
      });
      setInterviewState("feedback");
    } catch (error) {
      setInterviewState("active");
    }
  };

  const nextInterviewQuestion = () => {
    if (feedback?.follow_up) {
      setQuestionIndex(qi => qi + 1);
      setCurrentQuestion(feedback.follow_up);
      setInterviewAnswer("");
      setFeedback(null);
      setInterviewState("active");
      return;
    }
    setInterviewState("idle");
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const token = await ensureToken();
      const result = await uploadDocument(file, uploadSubject, token);
      setDocuments(d => [...d, {
        id: result.doc_id,
        filename: result.filename,
        subject: uploadSubject,
        chunks: result.chunks,
      }]);
      setChatMessages(m => [...m, {
        role: "assistant",
        content: `✅ **"${result.filename}"** uploaded!\n\n- Subject: ${uploadSubject}\n- Chunks created: ${result.chunks}`,
        agent: "system"
      }]);
      setActiveTab("chat");
    } catch (error) {
      setChatMessages(m => [...m, {
        role: "assistant",
        content: `⚠️ ${error?.message || "Document upload failed"}`,
        agent: "system"
      }]);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ 
      display: "flex",
      height: "100vh",
      background: "linear-gradient(135deg, #f5f7fa 0%, #e9ecf1 100%)",
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Premium Sidebar */}
      <aside style={{
        width: "280px",
        background: "linear-gradient(180deg, #667eea 0%, #764ba2 100%)",
        display: "flex",
        flexDirection: "column",
        borderRadius: "0 24px 24px 0",
        boxShadow: "0 20px 50px rgba(102, 126, 234, 0.3)",
        padding: "24px",
        color: "white"
      }}>
        {/* Logo */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{
              width: "48px",
              height: "48px",
              background: "rgba(255,255,255,0.25)",
              backdropFilter: "blur(10px)",
              borderRadius: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <Icon d={icons.brain} size={24} stroke="white" />
            </div>
            <div>
              <h1 style={{ fontSize: "18px", fontWeight: "700", margin: "0", letterSpacing: "-0.5px" }}>StudyBuddy</h1>
              <p style={{ fontSize: "11px", opacity: 0.8, margin: "4px 0 0 0" }}>AI Learning</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
          {[
            { id: "chat", label: "💬 AI Tutor" },
            { id: "quiz", label: "📝 Quiz" },
            { id: "interview", label: "🎤 Interview" },
            { id: "documents", label: "📚 Documents" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "12px 16px",
                background: activeTab === tab.id 
                  ? "rgba(255,255,255,0.25)" 
                  : "rgba(255,255,255,0.08)",
                border: activeTab === tab.id 
                  ? "2px solid rgba(255,255,255,0.3)"
                  : "2px solid transparent",
                backdropFilter: "blur(10px)",
                borderRadius: "14px",
                color: "white",
                fontWeight: "600",
                fontSize: "14px",
                cursor: "pointer",
                transition: "all 300ms ease",
                textAlign: "left",
                transform: activeTab === tab.id ? "translateX(4px)" : "translateX(0)"
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab.id) {
                  e.target.style.background = "rgba(255,255,255,0.15)";
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab.id) {
                  e.target.style.background = "rgba(255,255,255,0.08)";
                }
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Stats */}
        <div style={{
          background: "rgba(255,255,255,0.1)",
          backdropFilter: "blur(10px)",
          borderRadius: "16px",
          padding: "16px",
          textAlign: "center"
        }}>
          <p style={{ fontSize: "11px", opacity: 0.8, margin: "0", textTransform: "uppercase", letterSpacing: "1px" }}>Documents</p>
          <p style={{ fontSize: "28px", fontWeight: "700", margin: "8px 0 0 0" }}>{documents.length}</p>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {activeTab === "chat" && (
          <>
            {/* Header */}
            <div style={{
              padding: "24px 32px",
              background: "rgba(255,255,255,0.8)",
              backdropFilter: "blur(10px)",
              borderBottom: "1px solid rgba(102, 126, 234, 0.1)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              boxShadow: "0 4px 16px rgba(0,0,0,0.05)"
            }}>
              <div>
                <h1 style={{ fontSize: "28px", fontWeight: "700", margin: "0", color: "#1a1a1a" }}>AI Tutor</h1>
                <p style={{ fontSize: "13px", color: "#666", margin: "6px 0 0 0" }}>Powered by Llama 3</p>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                {["auto", "tutor", "revision", "planner"].map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    style={{
                      background: mode === m 
                        ? "linear-gradient(135deg, #667eea, #764ba2)" 
                        : "white",
                      color: mode === m ? "white" : "#667eea",
                      padding: "8px 16px",
                      borderRadius: "12px",
                      border: mode === m ? "none" : "2px solid #e5e7eb",
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: "pointer",
                      transition: "all 300ms ease",
                      boxShadow: mode === m ? "0 8px 24px rgba(102, 126, 234, 0.3)" : "0 2px 8px rgba(0,0,0,0.05)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px"
                    }}
                    onMouseEnter={(e) => {
                      if (mode === m) {
                        e.target.style.transform = "translateY(-2px)";
                        e.target.style.boxShadow = "0 12px 32px rgba(102, 126, 234, 0.4)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = "translateY(0)";
                      if (mode === m) {
                        e.target.style.boxShadow = "0 8px 24px rgba(102, 126, 234, 0.3)";
                      }
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Area */}
            <div style={{
              flex: 1,
              overflowY: "auto",
              padding: "32px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              background: "linear-gradient(135deg, #f5f7fa 0%, #e9ecf1 100%)"
            }}>
              {chatMessages.map((msg, i) => (
                <div key={i} style={{
                  display: "flex",
                  gap: "16px",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start"
                }}>
                  {msg.role === "assistant" && (
                    <div style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "12px",
                      background: "linear-gradient(135deg, #667eea, #764ba2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "white",
                      fontWeight: "700",
                      fontSize: "14px",
                      boxShadow: "0 4px 12px rgba(102, 126, 234, 0.3)",
                      flexShrink: 0
                    }}>AI</div>
                  )}
                  <div style={{
                    maxWidth: "600px",
                    background: msg.role === "user" 
                      ? "linear-gradient(135deg, #667eea, #764ba2)"
                      : "white",
                    color: msg.role === "user" ? "white" : "#333",
                    padding: "16px 20px",
                    borderRadius: msg.role === "user" ? "20px 20px 6px 20px" : "20px 20px 20px 6px",
                    boxShadow: msg.role === "user"
                      ? "0 8px 24px rgba(102, 126, 234, 0.25)"
                      : "0 4px 16px rgba(0,0,0,0.08)",
                    border: msg.role === "user" ? "none" : "1px solid rgba(102, 126, 234, 0.1)",
                    lineHeight: "1.6",
                    fontSize: "14px",
                    fontWeight: "500"
                  }}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: "flex", gap: "16px", alignItems: "flex-end" }}>
                  <div style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "12px",
                    background: "linear-gradient(135deg, #667eea, #764ba2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontWeight: "700",
                    fontSize: "14px",
                    boxShadow: "0 4px 12px rgba(102, 126, 234, 0.3)",
                    flexShrink: 0
                  }}>AI</div>
                  <div style={{
                    background: "white",
                    padding: "16px 20px",
                    borderRadius: "20px 20px 20px 6px",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                    display: "flex",
                    gap: "8px"
                  }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "#667eea",
                        animation: `bounce 1.4s ${i * 0.2}s infinite`
                      }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div style={{
              padding: "24px 32px",
              background: "rgba(255,255,255,0.8)",
              backdropFilter: "blur(10px)",
              borderTop: "1px solid rgba(102, 126, 234, 0.1)",
              boxShadow: "0 -4px 16px rgba(0,0,0,0.05)"
            }}>
              <div style={{ display: "flex", gap: "16px", alignItems: "flex-end" }}>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Ask anything from your notes..."
                  style={{
                    flex: 1,
                    padding: "14px 18px",
                    borderRadius: "16px",
                    border: "2px solid #e5d4f1",
                    background: "white",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "#333",
                    resize: "none",
                    outline: "none",
                    maxHeight: "120px",
                    fontFamily: "inherit",
                    transition: "all 200ms ease"
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#667eea";
                    e.target.style.boxShadow = "0 0 0 3px rgba(102, 126, 234, 0.1)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#e5d4f1";
                    e.target.style.boxShadow = "none";
                  }}
                  rows={1}
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "14px",
                    background: input.trim() && !loading
                      ? "linear-gradient(135deg, #667eea, #764ba2)"
                      : "#e5e7eb",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                    transition: "all 300ms ease",
                    boxShadow: input.trim() && !loading 
                      ? "0 8px 24px rgba(102, 126, 234, 0.3)"
                      : "0 2px 8px rgba(0,0,0,0.05)",
                    flexShrink: 0
                  }}
                  onMouseEnter={(e) => {
                    if (input.trim() && !loading) {
                      e.target.style.transform = "translateY(-3px)";
                      e.target.style.boxShadow = "0 12px 32px rgba(102, 126, 234, 0.4)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = "translateY(0)";
                    if (input.trim() && !loading) {
                      e.target.style.boxShadow = "0 8px 24px rgba(102, 126, 234, 0.3)";
                    }
                  }}
                >
                  <Icon d={icons.send} size={20} stroke={input.trim() ? "white" : "#ccc"} />
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === "quiz" && (
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "28px 32px",
            background: "linear-gradient(135deg, #f5f7fa 0%, #e9ecf1 100%)"
          }}>
            <div style={{ maxWidth: "960px", margin: "0 auto", display: "grid", gap: "16px" }}>
              <div style={{
                background: "white",
                borderRadius: "20px",
                border: "1px solid rgba(102, 126, 234, 0.12)",
                boxShadow: "0 10px 30px rgba(23, 33, 69, 0.08)",
                padding: "22px"
              }}>
                <h2 style={{ margin: 0, fontSize: "24px", color: "#1f2740" }}>Quiz Studio</h2>
                <p style={{ margin: "6px 0 16px", color: "#67718e", fontSize: "14px" }}>Generate topic-wise quizzes and track your score instantly.</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 180px auto", gap: "10px" }}>
                  <input
                    value={quizTopic}
                    onChange={(e) => setQuizTopic(e.target.value)}
                    placeholder="Enter topic, e.g. Operating Systems"
                    style={{
                      height: "44px",
                      borderRadius: "12px",
                      border: "1px solid #d9dfef",
                      padding: "0 12px",
                      fontSize: "14px"
                    }}
                  />
                  <select
                    value={quizDifficulty}
                    onChange={(e) => setQuizDifficulty(e.target.value)}
                    style={{ height: "44px", borderRadius: "12px", border: "1px solid #d9dfef", padding: "0 10px", fontSize: "14px" }}
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                  <button
                    onClick={startQuiz}
                    disabled={quizState === "loading"}
                    style={{
                      height: "44px",
                      border: "none",
                      borderRadius: "12px",
                      padding: "0 18px",
                      fontWeight: 700,
                      color: "white",
                      background: "linear-gradient(135deg, #667eea, #764ba2)",
                      cursor: quizState === "loading" ? "not-allowed" : "pointer"
                    }}
                  >
                    {quizState === "loading" ? "Generating..." : "Start Quiz"}
                  </button>
                </div>
              </div>

              {quizState === "active" && questions.length > 0 && (
                <div style={{
                  background: "white",
                  borderRadius: "20px",
                  border: "1px solid rgba(102, 126, 234, 0.12)",
                  boxShadow: "0 10px 30px rgba(23, 33, 69, 0.08)",
                  padding: "22px"
                }}>
                  <p style={{ margin: 0, color: "#67718e", fontSize: "13px" }}>Question {currentQ + 1} of {questions.length}</p>
                  <h3 style={{ margin: "8px 0 16px", color: "#1f2740" }}>{questions[currentQ]?.question}</h3>
                  <div style={{ display: "grid", gap: "10px" }}>
                    {(questions[currentQ]?.options || []).map((opt) => {
                      const selected = answers[questions[currentQ].id] === opt[0];
                      return (
                        <button
                          key={opt}
                          onClick={() => selectAnswer(questions[currentQ].id, opt[0])}
                          disabled={!!answers[questions[currentQ].id]}
                          style={{
                            textAlign: "left",
                            borderRadius: "12px",
                            border: selected ? "2px solid #667eea" : "1px solid #dbe2f3",
                            background: selected ? "rgba(102, 126, 234, 0.08)" : "#fff",
                            padding: "12px 14px",
                            fontSize: "14px",
                            cursor: answers[questions[currentQ].id] ? "default" : "pointer"
                          }}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  {showExplanation && (
                    <div style={{ marginTop: "14px", padding: "12px", borderRadius: "12px", background: "#f7f8fc", color: "#4f5874" }}>
                      Correct answer: <strong>{questions[currentQ]?.answer}</strong>
                    </div>
                  )}
                  <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={nextQuestion}
                      disabled={!answers[questions[currentQ]?.id]}
                      style={{
                        height: "42px",
                        border: "none",
                        borderRadius: "12px",
                        padding: "0 18px",
                        fontWeight: 700,
                        color: "white",
                        background: "linear-gradient(135deg, #1f7edb, #2e95ff)",
                        cursor: !answers[questions[currentQ]?.id] ? "not-allowed" : "pointer"
                      }}
                    >
                      {currentQ === questions.length - 1 ? "Submit Quiz" : "Next"}
                    </button>
                  </div>
                </div>
              )}

              {quizState === "result" && quizResult && (
                <div style={{
                  background: "white",
                  borderRadius: "20px",
                  border: "1px solid rgba(102, 126, 234, 0.12)",
                  boxShadow: "0 10px 30px rgba(23, 33, 69, 0.08)",
                  padding: "22px"
                }}>
                  <h3 style={{ margin: 0, color: "#1f2740" }}>Quiz Result</h3>
                  <p style={{ margin: "8px 0", color: "#3a4563" }}>Score: <strong>{quizResult.score}%</strong></p>
                  <p style={{ margin: "4px 0", color: "#3a4563" }}>Correct: {quizResult.correct} / {quizResult.total}</p>
                  {quizResult.recommendation && <p style={{ margin: "8px 0 0", color: "#67718e" }}>{quizResult.recommendation}</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "interview" && (
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "28px 32px",
            background: "linear-gradient(135deg, #f5f7fa 0%, #e9ecf1 100%)"
          }}>
            <div style={{ maxWidth: "960px", margin: "0 auto", display: "grid", gap: "16px" }}>
              <div style={{
                background: "white",
                borderRadius: "20px",
                border: "1px solid rgba(102, 126, 234, 0.12)",
                boxShadow: "0 10px 30px rgba(23, 33, 69, 0.08)",
                padding: "22px"
              }}>
                <h2 style={{ margin: 0, fontSize: "24px", color: "#1f2740" }}>Interview Lab</h2>
                <p style={{ margin: "6px 0 16px", color: "#67718e", fontSize: "14px" }}>Practice technical rounds with AI feedback.</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 180px auto", gap: "10px" }}>
                  <select
                    value={interviewTopic}
                    onChange={(e) => setInterviewTopic(e.target.value)}
                    style={{ height: "44px", borderRadius: "12px", border: "1px solid #d9dfef", padding: "0 10px", fontSize: "14px" }}
                  >
                    <option value="os">Operating Systems</option>
                    <option value="dbms">DBMS</option>
                    <option value="cn">Computer Networks</option>
                    <option value="dsa">DSA</option>
                  </select>
                  <select
                    value={interviewDifficulty}
                    onChange={(e) => setInterviewDifficulty(e.target.value)}
                    style={{ height: "44px", borderRadius: "12px", border: "1px solid #d9dfef", padding: "0 10px", fontSize: "14px" }}
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                  <button
                    onClick={startInterview}
                    disabled={interviewState === "loading"}
                    style={{
                      height: "44px",
                      border: "none",
                      borderRadius: "12px",
                      padding: "0 18px",
                      fontWeight: 700,
                      color: "white",
                      background: "linear-gradient(135deg, #667eea, #764ba2)",
                      cursor: interviewState === "loading" ? "not-allowed" : "pointer"
                    }}
                  >
                    {interviewState === "loading" ? "Starting..." : "Start Interview"}
                  </button>
                </div>
              </div>

              {(interviewState === "active" || interviewState === "evaluating" || interviewState === "feedback") && (
                <div style={{
                  background: "white",
                  borderRadius: "20px",
                  border: "1px solid rgba(102, 126, 234, 0.12)",
                  boxShadow: "0 10px 30px rgba(23, 33, 69, 0.08)",
                  padding: "22px"
                }}>
                  <p style={{ margin: 0, color: "#67718e", fontSize: "13px" }}>Question {questionIndex + 1} of {interviewTotal}</p>
                  <h3 style={{ margin: "8px 0 14px", color: "#1f2740" }}>{currentQuestion}</h3>
                  <textarea
                    value={interviewAnswer}
                    onChange={(e) => setInterviewAnswer(e.target.value)}
                    placeholder="Type your answer here..."
                    rows={5}
                    style={{ width: "100%", borderRadius: "12px", border: "1px solid #d9dfef", padding: "12px", fontSize: "14px", resize: "vertical" }}
                  />
                  <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                    {interviewState !== "feedback" && (
                      <button
                        onClick={submitInterviewAnswer}
                        disabled={!interviewAnswer.trim() || interviewState === "evaluating"}
                        style={{
                          height: "42px",
                          border: "none",
                          borderRadius: "12px",
                          padding: "0 18px",
                          fontWeight: 700,
                          color: "white",
                          background: "linear-gradient(135deg, #1f7edb, #2e95ff)",
                          cursor: !interviewAnswer.trim() ? "not-allowed" : "pointer"
                        }}
                      >
                        {interviewState === "evaluating" ? "Evaluating..." : "Submit Answer"}
                      </button>
                    )}
                    {interviewState === "feedback" && (
                      <button
                        onClick={nextInterviewQuestion}
                        style={{
                          height: "42px",
                          border: "none",
                          borderRadius: "12px",
                          padding: "0 18px",
                          fontWeight: 700,
                          color: "white",
                          background: "linear-gradient(135deg, #667eea, #764ba2)",
                          cursor: "pointer"
                        }}
                      >
                        Next Question
                      </button>
                    )}
                  </div>
                  {feedback && (
                    <div style={{ marginTop: "14px", borderRadius: "12px", background: "#f7f8fc", padding: "12px" }}>
                      <p style={{ margin: "0 0 6px", color: "#1f2740", fontWeight: 700 }}>Feedback</p>
                      <p style={{ margin: 0, color: "#4f5874" }}>{feedback.feedback || feedback.evaluation || "Answer reviewed."}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "documents" && (
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "28px 32px",
            background: "linear-gradient(135deg, #f5f7fa 0%, #e9ecf1 100%)"
          }}>
            <div style={{ maxWidth: "960px", margin: "0 auto", display: "grid", gap: "16px" }}>
              <div style={{
                background: "white",
                borderRadius: "20px",
                border: "1px solid rgba(102, 126, 234, 0.12)",
                boxShadow: "0 10px 30px rgba(23, 33, 69, 0.08)",
                padding: "22px",
                display: "grid",
                gridTemplateColumns: "1fr 180px auto",
                gap: "10px"
              }}>
                <input
                  value={uploadSubject}
                  onChange={(e) => setUploadSubject(e.target.value)}
                  placeholder="Subject name"
                  style={{ height: "44px", borderRadius: "12px", border: "1px solid #d9dfef", padding: "0 12px", fontSize: "14px" }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  onChange={handleFileUpload}
                  style={{ height: "44px", borderRadius: "12px", border: "1px solid #d9dfef", padding: "8px", fontSize: "12px" }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{
                    height: "44px",
                    border: "none",
                    borderRadius: "12px",
                    padding: "0 18px",
                    fontWeight: 700,
                    color: "white",
                    background: "linear-gradient(135deg, #667eea, #764ba2)",
                    cursor: uploading ? "not-allowed" : "pointer"
                  }}
                >
                  {uploading ? "Uploading..." : "Upload"}
                </button>
              </div>

              <div style={{
                background: "white",
                borderRadius: "20px",
                border: "1px solid rgba(102, 126, 234, 0.12)",
                boxShadow: "0 10px 30px rgba(23, 33, 69, 0.08)",
                padding: "14px"
              }}>
                {documents.length === 0 ? (
                  <p style={{ margin: "8px", color: "#67718e" }}>No documents yet.</p>
                ) : (
                  documents.map((doc) => (
                    <div
                      key={doc.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        alignItems: "center",
                        gap: "10px",
                        padding: "10px 12px",
                        borderRadius: "12px",
                        border: "1px solid #e2e8f6",
                        marginBottom: "8px"
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, color: "#1f2740", fontWeight: 600 }}>{doc.filename}</p>
                        <p style={{ margin: "2px 0 0", color: "#67718e", fontSize: "12px" }}>{doc.subject} • {doc.chunks ?? 0} chunks</p>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            const token = await ensureToken();
                            await deleteDocument(doc.id, token);
                            setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
                          } catch (error) {
                            console.error("Delete failed", error);
                          }
                        }}
                        style={{
                          height: "34px",
                          border: "1px solid #f1c4c4",
                          borderRadius: "10px",
                          background: "#fff5f5",
                          color: "#c03e3e",
                          fontWeight: 700,
                          padding: "0 12px",
                          cursor: "pointer"
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-8px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
