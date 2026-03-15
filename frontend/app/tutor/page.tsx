"use client";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, BookOpen, FileText, Bot, User, Sparkles } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { Button, Badge, EmptyState, ErrorBanner, LoadingSkeleton } from "@/components/ui";
import { sendChatMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

type Mode = "auto" | "tutor" | "revision" | "planner" | "doubt";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: { filename?: string; similarity?: number }[];
  agent_used?: string;
  grounded?: boolean;
}

const MODES: { value: Mode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "tutor", label: "Tutor" },
  { value: "revision", label: "Revision" },
  { value: "planner", label: "Planner" },
  { value: "doubt", label: "Doubt Solver" },
];

export default function TutorPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    setInput("");
    setError("");

    const newMessages: Message[] = [...messages, { role: "user", content: userMessage }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const response = await sendChatMessage({
        message: userMessage,
        mode,
        history: newMessages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      });

      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: response.answer,
          sources: response.sources,
          agent_used: response.agent_used,
          grounded: response.grounded,
        },
      ]);
    } catch (err: any) {
      setError(err.message || "Failed to get response");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        {/* Mode selector */}
        <div className="shrink-0 px-4 py-3 border-b border-white/5 flex items-center gap-2 overflow-x-auto">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150",
                mode === m.value
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "text-ink-400 hover:text-ink-200 hover:bg-white/5"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          {messages.length === 0 && (
            <EmptyState
              icon={<Bot className="w-6 h-6 text-amber-400" />}
              title="Ask anything from your notes"
              description="Upload your study materials first, then ask questions. The AI will answer only from your uploaded notes — no hallucinations."
            />
          )}

          <AnimatePresence>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={cn("flex gap-3 max-w-3xl", msg.role === "user" ? "ml-auto flex-row-reverse" : "")}
              >
                {/* Avatar */}
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                  msg.role === "assistant"
                    ? "bg-amber-500/15 border border-amber-500/25"
                    : "bg-ink-700 border border-white/8"
                )}>
                  {msg.role === "assistant"
                    ? <Sparkles className="w-4 h-4 text-amber-400" />
                    : <User className="w-4 h-4 text-ink-400" />
                  }
                </div>

                {/* Bubble */}
                <div className={cn(
                  "flex-1 min-w-0",
                  msg.role === "user" ? "flex justify-end" : ""
                )}>
                  {msg.role === "user" ? (
                    <div className="bg-ink-800 border border-white/8 rounded-2xl rounded-tr-sm px-4 py-3 text-sm text-ink-100 max-w-md">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="bg-ink-800/50 border border-white/6 rounded-2xl rounded-tl-sm px-5 py-4">
                      <div className="prose-study text-sm">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>

                      {/* Sources + metadata */}
                      {(msg.sources?.length || msg.agent_used) && (
                        <div className="mt-3 pt-3 border-t border-white/6 flex flex-wrap gap-2">
                          {msg.grounded !== undefined && (
                            <Badge variant={msg.grounded ? "sage" : "amber"}>
                              <span className={cn("w-1.5 h-1.5 rounded-full", msg.grounded ? "bg-sage-400" : "bg-amber-400")} />
                              {msg.grounded ? "From your notes" : "No notes found"}
                            </Badge>
                          )}
                          {msg.agent_used && msg.agent_used !== "auto" && (
                            <Badge variant="neutral">{msg.agent_used} agent</Badge>
                          )}
                          {msg.sources?.slice(0, 2).map((s, si) => s.filename && (
                            <Badge key={si} variant="neutral">
                              <FileText className="w-3 h-3" />
                              {s.filename.split(".")[0].slice(0, 20)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3 max-w-3xl">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
              </div>
              <div className="bg-ink-800/50 border border-white/6 rounded-2xl rounded-tl-sm flex-1">
                <LoadingSkeleton lines={3} />
              </div>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 pb-2">
            <ErrorBanner message={error} onDismiss={() => setError("")} />
          </div>
        )}

        {/* Input */}
        <div className="shrink-0 px-4 pb-4">
          <div className="bg-ink-800/60 border border-white/10 rounded-2xl flex items-end gap-3 px-4 py-3 focus-within:border-amber-500/30 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask something from your notes... (Enter to send, Shift+Enter for new line)"
              rows={1}
              className="flex-1 bg-transparent text-sm text-ink-100 placeholder:text-ink-500 resize-none focus:outline-none min-h-[24px] max-h-32 leading-6"
              style={{ height: "auto" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 128) + "px";
              }}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              variant="primary"
              size="sm"
              className="shrink-0 mb-0.5"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
