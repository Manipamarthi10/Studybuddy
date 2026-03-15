"use client";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { AlertCircle, Upload, BookOpen } from "lucide-react";

// ─── Button ───────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: React.ReactNode;
}

export function Button({ variant = "primary", size = "md", loading, children, className, disabled, ...props }: ButtonProps) {
  const variants = {
    primary: "bg-amber-500 hover:bg-amber-400 text-ink-950 font-semibold shadow-lg shadow-amber-500/20",
    secondary: "bg-white/8 hover:bg-white/12 text-ink-200 border border-white/10",
    ghost: "hover:bg-white/6 text-ink-300 hover:text-ink-100",
    danger: "bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/20",
  };
  const sizes = {
    sm: "text-xs px-3 py-1.5 rounded-lg",
    md: "text-sm px-4 py-2.5 rounded-xl",
    lg: "text-sm px-6 py-3 rounded-xl",
  };
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {loading && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
interface BadgeProps { children: React.ReactNode; variant?: "amber" | "sage" | "neutral" | "red"; className?: string }

export function Badge({ children, variant = "neutral", className }: BadgeProps) {
  const variants = {
    amber: "bg-amber-500/15 text-amber-300 border-amber-500/25",
    sage: "bg-sage-500/15 text-sage-300 border-sage-500/25",
    neutral: "bg-white/8 text-ink-300 border-white/10",
    red: "bg-red-500/15 text-red-400 border-red-500/25",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border", variants[variant], className)}>
      {children}
    </span>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
interface CardProps { children: React.ReactNode; className?: string; hover?: boolean }

export function Card({ children, className, hover }: CardProps) {
  return (
    <div className={cn(
      "bg-ink-800/60 border border-white/7 rounded-2xl",
      hover && "hover:border-white/12 hover:bg-ink-800/80 transition-all duration-150 cursor-pointer",
      className
    )}>
      {children}
    </div>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  variant?: "default" | "blocked";
}

export function EmptyState({ icon, title, description, action, variant = "default" }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center text-center py-16 px-8"
    >
      <div className={cn(
        "w-14 h-14 rounded-2xl flex items-center justify-center mb-4",
        variant === "blocked" ? "bg-amber-500/10 border border-amber-500/20" : "bg-ink-700/60 border border-white/8"
      )}>
        {icon || (variant === "blocked" ? <AlertCircle className="w-6 h-6 text-amber-400" /> : <BookOpen className="w-6 h-6 text-ink-400" />)}
      </div>
      <h3 className="text-base font-semibold text-ink-200 mb-2 font-display">{title}</h3>
      <p className="text-sm text-ink-400 max-w-sm leading-relaxed mb-6">{description}</p>
      {action && (
        <Button onClick={action.onClick} variant="secondary" size="sm">
          <Upload className="w-3.5 h-3.5" />
          {action.label}
        </Button>
      )}
    </motion.div>
  );
}

// ─── LoadingSkeleton ──────────────────────────────────────────────────────────
export function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={cn("skeleton h-4 rounded", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

// ─── GroundedBadge ────────────────────────────────────────────────────────────
export function GroundedBadge({ grounded }: { grounded: boolean }) {
  return grounded ? (
    <Badge variant="sage">
      <span className="w-1.5 h-1.5 rounded-full bg-sage-400" />
      From your notes
    </Badge>
  ) : (
    <Badge variant="amber">
      <AlertCircle className="w-3 h-3" />
      No notes found
    </Badge>
  );
}

// ─── Textarea ─────────────────────────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full bg-ink-800/60 border border-white/8 rounded-xl px-4 py-3 text-sm text-ink-100 placeholder:text-ink-500",
        "focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20",
        "resize-none transition-colors duration-150",
        className
      )}
    />
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      {...props}
      className={cn(
        "w-full bg-ink-800/60 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-ink-100 placeholder:text-ink-500",
        "focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20",
        "transition-colors duration-150",
        className
      )}
    />
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[];
  label?: string;
}

export function Select({ options, label, className, ...props }: SelectProps) {
  return (
    <div className="space-y-1.5">
      {label && <label className="text-xs font-medium text-ink-400 uppercase tracking-wider">{label}</label>}
      <select
        {...props}
        className={cn(
          "w-full bg-ink-800/60 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-ink-100",
          "focus:outline-none focus:border-amber-500/50",
          "transition-colors duration-150 cursor-pointer",
          className
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-ink-900">{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
export function ProgressBar({ value, max = 100, className }: { value: number; max?: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = pct >= 80 ? "bg-sage-400" : pct >= 60 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className={cn("h-2 rounded-full bg-ink-700", className)}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={cn("h-full rounded-full", color)}
      />
    </div>
  );
}

// ─── Toast / inline error ─────────────────────────────────────────────────────
export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm"
    >
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-red-400/60 hover:text-red-400 transition-colors">✕</button>
      )}
    </motion.div>
  );
}
