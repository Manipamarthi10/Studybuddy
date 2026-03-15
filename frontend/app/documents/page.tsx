"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, Trash2, CheckCircle, Clock, AlertCircle, File, X } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { Button, Badge, Card, EmptyState, ErrorBanner } from "@/components/ui";
import { uploadDocument, listDocuments, deleteDocument } from "@/lib/api";
import { cn, formatBytes, formatDate } from "@/lib/utils";

interface Doc {
  id: string;
  original_name: string;
  file_type: string;
  subject?: string;
  chunk_count: number;
  file_size_bytes: number;
  status: string;
  created_at: string;
}

const STATUS_CONFIG = {
  ready: { label: "Ready", icon: CheckCircle, color: "text-sage-400", bg: "bg-sage-400/10" },
  processing: { label: "Processing", icon: Clock, color: "text-amber-400", bg: "bg-amber-400/10" },
  failed: { label: "Failed", icon: AlertCircle, color: "text-red-400", bg: "bg-red-400/10" },
};

const FILE_TYPE_COLORS: Record<string, string> = {
  pdf: "text-red-400 bg-red-400/10 border-red-400/20",
  docx: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  txt: "text-ink-400 bg-ink-400/10 border-white/10",
  md: "text-sage-400 bg-sage-400/10 border-sage-400/20",
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [subject, setSubject] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const data = await listDocuments();
      setDocuments(data.documents);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError("");

    const file = files[0];
    try {
      await uploadDocument(file, subject || undefined);
      setSubject("");
      setTimeout(loadDocuments, 1000); // Give a moment then refresh
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("Delete this document and all its data?")) return;
    try {
      await deleteDocument(docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    handleUpload(e.dataTransfer.files);
  };

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-ink-100 font-display">Your Study Materials</h2>
          <p className="text-sm text-ink-400 mt-1">Upload notes — quizzes and interviews are generated only from these files.</p>
        </div>

        {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}

        {/* Upload Zone */}
        <motion.div
          onDragEnter={() => setDragActive(true)}
          onDragLeave={() => setDragActive(false)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200",
            dragActive
              ? "border-amber-500/60 bg-amber-500/8"
              : "border-white/10 hover:border-white/20 hover:bg-white/3"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <div className="flex flex-col items-center gap-3">
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center border transition-colors",
              dragActive ? "bg-amber-500/15 border-amber-500/30" : "bg-ink-800 border-white/10"
            )}>
              <Upload className={cn("w-5 h-5", dragActive ? "text-amber-400" : "text-ink-400")} />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-200">
                {uploading ? "Uploading..." : "Drop your notes here or click to browse"}
              </p>
              <p className="text-xs text-ink-500 mt-1">PDF, DOCX, TXT, MD — up to 20MB</p>
            </div>
            {!uploading && (
              <div className="flex gap-2 mt-2">
                {["PDF", "DOCX", "TXT", "MD"].map((type) => (
                  <span key={type} className="text-xs px-2.5 py-1 bg-ink-700/60 border border-white/8 rounded-lg text-ink-400 font-mono">
                    {type}
                  </span>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Subject input */}
        <div className="flex gap-3 items-center">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject tag (optional) — e.g. Operating Systems"
            className="flex-1 bg-ink-800/60 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-amber-500/50 transition-colors"
          />
        </div>

        {/* Documents list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink-300">{documents.length} document{documents.length !== 1 ? "s" : ""}</h3>
            <button onClick={loadDocuments} className="text-xs text-ink-500 hover:text-amber-400 transition-colors">Refresh</button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-16 rounded-2xl" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <EmptyState
              title="No documents yet"
              description="Upload your first notes above. Once processed, you can generate quizzes, start interviews, and chat with your AI tutor."
            />
          ) : (
            <AnimatePresence mode="popLayout">
              <div className="space-y-2">
                {documents.map((doc, i) => {
                  const statusConfig = STATUS_CONFIG[doc.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.failed;
                  const StatusIcon = statusConfig.icon;
                  const typeColor = FILE_TYPE_COLORS[doc.file_type] || FILE_TYPE_COLORS.txt;

                  return (
                    <motion.div
                      key={doc.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ delay: i * 0.04 }}
                    >
                      <Card className="flex items-center gap-4 px-4 py-3.5">
                        {/* File type icon */}
                        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center border text-xs font-bold font-mono shrink-0", typeColor)}>
                          {doc.file_type.toUpperCase()}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink-100 truncate">{doc.original_name}</p>
                          <div className="flex items-center gap-3 mt-0.5">
                            {doc.subject && (
                              <span className="text-xs text-ink-500">{doc.subject}</span>
                            )}
                            <span className="text-xs text-ink-600">{formatBytes(doc.file_size_bytes)}</span>
                            {doc.status === "ready" && (
                              <span className="text-xs text-ink-500">{doc.chunk_count} chunks</span>
                            )}
                            <span className="text-xs text-ink-600">{formatDate(doc.created_at)}</span>
                          </div>
                        </div>

                        {/* Status */}
                        <div className={cn("flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full shrink-0", statusConfig.bg, statusConfig.color)}>
                          <StatusIcon className={cn("w-3 h-3", doc.status === "processing" && "animate-spin")} />
                          {statusConfig.label}
                        </div>

                        {/* Delete */}
                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="p-1.5 rounded-lg text-ink-600 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </AppShell>
  );
}
