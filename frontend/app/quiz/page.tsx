"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BrainCircuit, CheckCircle, XCircle, ChevronRight, RotateCcw, Trophy, FileText } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { Button, Badge, Card, EmptyState, ErrorBanner, ProgressBar, Select } from "@/components/ui";
import { generateQuiz, submitQuiz } from "@/lib/api";
import { cn } from "@/lib/utils";

type Phase = "setup" | "loading" | "quiz" | "results";

interface Question {
  question: string;
  options: { label: string; text: string }[];
  correct_option: string;
  explanation: string;
  source_file?: string;
}

export default function QuizPage() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [topic, setTopic] = useState("");
  const [subject, setSubject] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [numQuestions, setNumQuestions] = useState(5);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState("");
  const [sourcesUsed, setSourcesUsed] = useState<string[]>([]);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setPhase("loading");
    setError("");
    try {
      const res = await generateQuiz({ topic, subject: subject || undefined, difficulty, num_questions: numQuestions });
      if (!res.grounded || res.questions.length === 0) {
        setError("I could not find enough relevant content in your uploaded notes to generate a quiz on this topic. Please upload notes covering this topic first.");
        setPhase("setup");
        return;
      }
      setQuestions(res.questions);
      setSourcesUsed(res.sources_used);
      setCurrentIndex(0);
      setSelectedAnswers({});
      setRevealed(false);
      setPhase("quiz");
    } catch (err: any) {
      setError(err.message);
      setPhase("setup");
    }
  };

  const handleAnswer = (label: string) => {
    if (revealed) return;
    setSelectedAnswers((prev) => ({ ...prev, [currentIndex]: label }));
    setRevealed(true);
  };

  const handleNext = async () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setRevealed(!!selectedAnswers[currentIndex + 1]);
    } else {
      // Submit
      try {
        const res = await submitQuiz({
          topic,
          subject: subject || undefined,
          difficulty,
          questions,
          user_answers: Object.fromEntries(Object.entries(selectedAnswers).map(([k, v]) => [k, v])),
        });
        setResults(res);
        setPhase("results");
      } catch (err: any) {
        setError(err.message);
      }
    }
  };

  const handleReset = () => {
    setPhase("setup");
    setQuestions([]);
    setResults(null);
    setSelectedAnswers({});
    setCurrentIndex(0);
    setError("");
  };

  const currentQ = questions[currentIndex];
  const selected = selectedAnswers[currentIndex];

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* SETUP */}
        <AnimatePresence mode="wait">
          {phase === "setup" && (
            <motion.div key="setup" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-ink-100 font-display">Generate a Quiz</h2>
                <p className="text-sm text-ink-400 mt-1">Questions will be generated only from your uploaded notes.</p>
              </div>

              <Badge variant="amber">
                <FileText className="w-3 h-3" />
                Grounded in your notes only — no general knowledge
              </Badge>

              {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}

              <Card className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ink-400 uppercase tracking-wider">Topic *</label>
                  <input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Deadlocks in Operating Systems"
                    className="w-full bg-ink-800/60 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                    onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ink-400 uppercase tracking-wider">Subject (optional)</label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Operating Systems"
                    className="w-full bg-ink-800/60 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="Difficulty"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    options={[{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]}
                  />
                  <Select
                    label="Questions"
                    value={String(numQuestions)}
                    onChange={(e) => setNumQuestions(Number(e.target.value))}
                    options={[3, 5, 8, 10, 15].map((n) => ({ value: String(n), label: `${n} questions` }))}
                  />
                </div>
                <Button onClick={handleGenerate} variant="primary" size="lg" disabled={!topic.trim()} className="w-full">
                  <BrainCircuit className="w-4 h-4" />
                  Generate Quiz from Notes
                </Button>
              </Card>
            </motion.div>
          )}

          {/* LOADING */}
          {phase === "loading" && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-12 h-12 border-2 border-amber-500/40 border-t-amber-400 rounded-full animate-spin" />
              <p className="text-sm text-ink-400">Searching your notes for relevant content…</p>
            </motion.div>
          )}

          {/* QUIZ */}
          {phase === "quiz" && currentQ && (
            <motion.div key="quiz" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <Badge variant="sage">From your notes</Badge>
                <span className="text-xs text-ink-500">{currentIndex + 1} / {questions.length}</span>
              </div>
              <ProgressBar value={currentIndex + 1} max={questions.length} />

              {/* Question */}
              <Card className="p-6">
                <p className="text-sm font-medium text-ink-200 leading-relaxed mb-5">{currentQ.question}</p>
                <div className="space-y-2.5">
                  {currentQ.options.map((option) => {
                    const isSelected = selected === option.label;
                    const isCorrect = revealed && option.label === currentQ.correct_option;
                    const isWrong = revealed && isSelected && option.label !== currentQ.correct_option;
                    return (
                      <motion.button
                        key={option.label}
                        onClick={() => handleAnswer(option.label)}
                        whileHover={!revealed ? { scale: 1.01 } : {}}
                        whileTap={!revealed ? { scale: 0.99 } : {}}
                        className={cn(
                          "w-full text-left px-4 py-3 rounded-xl border text-sm transition-all duration-200",
                          !revealed && "hover:border-amber-500/40 hover:bg-amber-500/5 cursor-pointer",
                          revealed && "cursor-default",
                          isCorrect ? "bg-sage-500/15 border-sage-500/40 text-sage-200" :
                          isWrong ? "bg-red-500/15 border-red-500/40 text-red-300" :
                          isSelected ? "bg-amber-500/10 border-amber-500/30 text-amber-200" :
                          "bg-ink-800/40 border-white/7 text-ink-300"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span className={cn(
                            "w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
                            isCorrect ? "bg-sage-500/30 text-sage-300" :
                            isWrong ? "bg-red-500/30 text-red-300" :
                            "bg-ink-700 text-ink-400"
                          )}>
                            {option.label}
                          </span>
                          <span className="flex-1">{option.text}</span>
                          {isCorrect && <CheckCircle className="w-4 h-4 text-sage-400 shrink-0 mt-0.5" />}
                          {isWrong && <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Explanation */}
                <AnimatePresence>
                  {revealed && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-4 pt-4 border-t border-white/6">
                      <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-1.5">Explanation</p>
                      <p className="text-sm text-ink-300 leading-relaxed">{currentQ.explanation}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>

              <div className="flex justify-end">
                <Button onClick={handleNext} variant="primary" disabled={!selected}>
                  {currentIndex < questions.length - 1 ? "Next Question" : "Finish Quiz"}
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* RESULTS */}
          {phase === "results" && results && (
            <motion.div key="results" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <Card className="p-8 text-center">
                <Trophy className={cn("w-10 h-10 mx-auto mb-3", results.score_percent >= 80 ? "text-amber-400" : results.score_percent >= 60 ? "text-amber-500" : "text-ink-400")} />
                <h2 className="text-3xl font-bold font-display text-ink-100">{Math.round(results.score_percent)}%</h2>
                <p className="text-sm text-ink-400 mt-1">{results.correct_answers} of {results.total_questions} correct</p>
                <div className="mt-4">
                  <ProgressBar value={results.score_percent} className="h-2.5" />
                </div>
              </Card>

              {results.weak_areas?.length > 0 && (
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-ink-300 mb-3">Areas to Review</h3>
                  <div className="flex flex-wrap gap-2">
                    {results.weak_areas.map((area: string) => (
                      <Badge key={area} variant="amber">{area}</Badge>
                    ))}
                  </div>
                </Card>
              )}

              <Button onClick={handleReset} variant="secondary" className="w-full">
                <RotateCcw className="w-4 h-4" />
                Take Another Quiz
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
