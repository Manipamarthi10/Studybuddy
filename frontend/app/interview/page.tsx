"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Send, CheckCircle, AlertTriangle, ChevronRight, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import AppShell from "@/components/layout/AppShell";
import { Button, Badge, Card, EmptyState, ErrorBanner, ProgressBar, Select } from "@/components/ui";
import { startInterview, submitInterviewAnswer } from "@/lib/api";
import { cn } from "@/lib/utils";

type Phase = "setup" | "active" | "complete";

interface Exchange {
  question: string;
  userAnswer: string;
  evaluation: string;
  score: number;
  modelAnswer: string;
  tips: string[];
  expanded: boolean;
}

export default function InterviewPage() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [topic, setTopic] = useState("");
  const [subject, setSubject] = useState("");
  const [difficulty, setDifficulty] = useState("medium");

  const [sessionId, setSessionId] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [userAnswer, setUserAnswer] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleStart = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await startInterview({ topic, subject: subject || undefined, difficulty });
      setSessionId(res.session_id);
      setCurrentQuestion(res.first_question);
      setExchanges([]);
      setPhase("active");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!userAnswer.trim() || loading) return;
    const answer = userAnswer.trim();
    setUserAnswer("");
    setLoading(true);
    setError("");

    try {
      const res = await submitInterviewAnswer({ session_id: sessionId, user_answer: answer });
      const newExchange: Exchange = {
        question: currentQuestion,
        userAnswer: answer,
        evaluation: res.evaluation,
        score: res.score,
        modelAnswer: res.model_answer,
        tips: res.improvement_tips || [],
        expanded: true,
      };
      setExchanges((prev) => [...prev, newExchange]);

      if (res.is_complete || !res.next_question) {
        setPhase("complete");
      } else {
        setCurrentQuestion(res.next_question!);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const avgScore = exchanges.length > 0
    ? exchanges.reduce((s, e) => s + e.score, 0) / exchanges.length
    : 0;

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <AnimatePresence mode="wait">

          {/* SETUP */}
          {phase === "setup" && (
            <motion.div key="setup" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-ink-100 font-display">Mock Interview</h2>
                <p className="text-sm text-ink-400 mt-1">Questions are generated only from your uploaded notes.</p>
              </div>

              <Badge variant="amber">
                <AlertTriangle className="w-3 h-3" />
                Requires relevant uploaded notes to begin
              </Badge>

              {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}

              <Card className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ink-400 uppercase tracking-wider">Interview Topic *</label>
                  <input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Database Normalization, Deadlocks, DSA"
                    className="w-full bg-ink-800/60 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ink-400 uppercase tracking-wider">Subject (optional)</label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. DBMS"
                    className="w-full bg-ink-800/60 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                  />
                </div>
                <Select
                  label="Difficulty"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  options={[{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]}
                />
                <Button onClick={handleStart} variant="primary" size="lg" loading={loading} disabled={!topic.trim()} className="w-full">
                  <Sparkles className="w-4 h-4" />
                  Start Interview
                </Button>
              </Card>

              <p className="text-xs text-ink-600 text-center">
                The interviewer will only ask questions grounded in your uploaded notes.
                If no relevant notes are found, the interview will not start.
              </p>
            </motion.div>
          )}

          {/* ACTIVE INTERVIEW */}
          {phase === "active" && (
            <motion.div key="active" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
              <div className="flex items-center justify-between">
                <Badge variant="sage">
                  <span className="w-1.5 h-1.5 rounded-full bg-sage-400 animate-pulse" />
                  Interview in progress
                </Badge>
                <span className="text-xs text-ink-500">{exchanges.length + 1} question{exchanges.length ? 's answered' : ''}</span>
              </div>

              {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}

              {/* Past exchanges */}
              {exchanges.map((ex, i) => (
                <Card key={i} className="p-5 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-md bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-amber-400">Q{i + 1}</span>
                    </div>
                    <p className="text-sm font-medium text-ink-200">{ex.question}</p>
                  </div>

                  <div className="ml-9 space-y-3">
                    <div className="bg-ink-700/40 border border-white/6 rounded-xl px-3 py-2.5">
                      <p className="text-xs text-ink-500 mb-1">Your answer</p>
                      <p className="text-sm text-ink-300">{ex.userAnswer}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "text-sm font-bold px-3 py-1 rounded-lg",
                        ex.score >= 7 ? "bg-sage-500/15 text-sage-300" :
                        ex.score >= 5 ? "bg-amber-500/15 text-amber-300" :
                        "bg-red-500/15 text-red-400"
                      )}>
                        {ex.score.toFixed(1)}/10
                      </div>
                      <p className="text-sm text-ink-400 flex-1">{ex.evaluation}</p>
                    </div>

                    {ex.tips.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs text-ink-500 font-medium">Tips to improve:</p>
                        {ex.tips.map((tip, ti) => (
                          <p key={ti} className="text-xs text-ink-400 flex gap-1.5">
                            <span className="text-amber-500 shrink-0">•</span>
                            {tip}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              ))}

              {/* Current question */}
              {!loading && (
                <Card className="p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <p className="text-sm font-medium text-ink-100 leading-relaxed">{currentQuestion}</p>
                  </div>

                  <textarea
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    placeholder="Type your answer here... Be thorough and specific."
                    rows={5}
                    className="w-full bg-ink-800/60 border border-white/8 rounded-xl px-4 py-3 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-amber-500/50 transition-colors resize-none"
                  />

                  <div className="flex justify-end mt-3">
                    <Button onClick={handleSubmitAnswer} variant="primary" loading={loading} disabled={!userAnswer.trim()}>
                      Submit Answer
                      <Send className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </Card>
              )}

              {loading && (
                <Card className="p-5 flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-amber-500/40 border-t-amber-400 rounded-full animate-spin" />
                  <p className="text-sm text-ink-400">Evaluating your answer…</p>
                </Card>
              )}
            </motion.div>
          )}

          {/* COMPLETE */}
          {phase === "complete" && (
            <motion.div key="complete" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <Card className="p-8 text-center">
                <CheckCircle className="w-10 h-10 text-sage-400 mx-auto mb-3" />
                <h2 className="text-2xl font-bold font-display text-ink-100">Interview Complete</h2>
                <p className="text-sm text-ink-400 mt-1">Average score</p>
                <p className="text-4xl font-bold text-amber-400 mt-2">{avgScore.toFixed(1)}<span className="text-lg text-ink-400">/10</span></p>
                <div className="mt-4">
                  <ProgressBar value={avgScore} max={10} className="h-2.5" />
                </div>
              </Card>

              <div className="space-y-3">
                {exchanges.map((ex, i) => (
                  <Card key={i} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-ink-400">Q{i + 1}: {ex.question.slice(0, 60)}…</p>
                      <span className={cn("text-sm font-bold", ex.score >= 7 ? "text-sage-400" : ex.score >= 5 ? "text-amber-400" : "text-red-400")}>
                        {ex.score.toFixed(1)}/10
                      </span>
                    </div>
                    <p className="text-sm text-ink-500 mb-2">{ex.evaluation}</p>
                    <div className="bg-ink-700/30 rounded-lg p-3">
                      <p className="text-xs text-ink-500 mb-1">Model answer</p>
                      <p className="text-xs text-ink-400 leading-relaxed">{ex.modelAnswer.slice(0, 200)}…</p>
                    </div>
                  </Card>
                ))}
              </div>

              <Button onClick={() => { setPhase("setup"); setExchanges([]); setError(""); }} variant="secondary" className="w-full">
                <RotateCcw className="w-4 h-4" />
                Start Another Interview
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
