"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { TrendingUp, BrainCircuit, Sparkles, AlertTriangle, CheckCircle, BarChart2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import AppShell from "@/components/layout/AppShell";
import { Card, Badge, EmptyState, ErrorBanner } from "@/components/ui";
import { getProgressSummary } from "@/lib/api";
import { cn, formatDate } from "@/lib/utils";

export default function ProgressPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getProgressSummary()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-ink-100 font-display">Learning Progress</h2>
          <p className="text-sm text-ink-400 mt-1">Track your growth over time.</p>
        </div>

        {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}

        {!data || (data.total_quizzes === 0 && data.total_interviews === 0) ? (
          <EmptyState
            icon={<BarChart2 className="w-6 h-6 text-ink-400" />}
            title="No activity yet"
            description="Complete quizzes and interviews to see your progress here."
          />
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "Quizzes Taken", value: data.total_quizzes, icon: BrainCircuit, color: "text-amber-400" },
                { label: "Avg Quiz Score", value: `${Math.round(data.average_score)}%`, icon: TrendingUp, color: "text-sage-400" },
                { label: "Interviews Done", value: data.total_interviews, icon: Sparkles, color: "text-blue-400" },
              ].map((stat, i) => {
                const Icon = stat.icon;
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <Card className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <Icon className={cn("w-4 h-4", stat.color)} />
                      </div>
                      <p className="text-2xl font-bold font-display text-ink-100">{stat.value}</p>
                      <p className="text-xs text-ink-500 mt-0.5">{stat.label}</p>
                    </Card>
                  </motion.div>
                );
              })}
            </div>

            {/* Weak + Strong topics */}
            <div className="grid sm:grid-cols-2 gap-4">
              {data.weak_topics.length > 0 && (
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-semibold text-ink-300">Topics to Review</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.weak_topics.map((t: string) => (
                      <Badge key={t} variant="amber">{t}</Badge>
                    ))}
                  </div>
                </Card>
              )}
              {data.strong_topics.length > 0 && (
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="w-4 h-4 text-sage-400" />
                    <h3 className="text-sm font-semibold text-ink-300">Strong Topics</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.strong_topics.map((t: string) => (
                      <Badge key={t} variant="sage">{t}</Badge>
                    ))}
                  </div>
                </Card>
              )}
            </div>

            {/* Recent activity */}
            {data.recent_activity.length > 0 && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-ink-300 mb-4">Recent Activity</h3>
                <div className="space-y-3">
                  {data.recent_activity.map((item: any, i: number) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                      className="flex items-center gap-3"
                    >
                      <div className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                        item.type === "quiz" ? "bg-amber-500/15" : "bg-blue-500/15"
                      )}>
                        {item.type === "quiz"
                          ? <BrainCircuit className="w-3.5 h-3.5 text-amber-400" />
                          : <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink-200 truncate">{item.topic}</p>
                        <p className="text-xs text-ink-500">{item.type === "quiz" ? "Quiz" : "Interview"} · {formatDate(item.date)}</p>
                      </div>
                      <span className={cn(
                        "text-sm font-semibold shrink-0",
                        item.score >= 80 || item.score >= 8 ? "text-sage-400" :
                        item.score >= 60 || item.score >= 6 ? "text-amber-400" : "text-red-400"
                      )}>
                        {item.type === "quiz" ? `${Math.round(item.score)}%` : `${item.score?.toFixed(1) || "—"}/10`}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
