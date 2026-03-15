"use client";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, BrainCircuit, FileText, MessageSquare, TrendingUp,
  LogOut, ChevronRight, Sparkles, Menu, X
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/tutor", label: "AI Tutor", icon: MessageSquare, description: "Chat with your notes" },
  { href: "/quiz", label: "Quiz", icon: BrainCircuit, description: "Test your knowledge" },
  { href: "/interview", label: "Interview", icon: Sparkles, description: "Mock interviews" },
  { href: "/documents", label: "Documents", icon: FileText, description: "Manage your notes" },
  { href: "/progress", label: "Progress", icon: TrendingUp, description: "Track growth" },
];

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  const currentPage = NAV_ITEMS.find((item) => pathname.startsWith(item.href));

  return (
    <div className="flex h-screen overflow-hidden bg-ink-950">
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 flex flex-col",
          "bg-ink-900 border-r border-white/5",
          "transition-transform duration-300 ease-in-out",
          "lg:relative lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="px-5 py-6 border-b border-white/5">
          <Link href="/tutor" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-100 font-display tracking-tight">StudyBuddy</p>
              <p className="text-xs text-ink-400">AI</p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item, index) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group",
                    isActive
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/20"
                      : "text-ink-300 hover:bg-white/5 hover:text-ink-100"
                  )}
                >
                  <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-amber-400" : "text-ink-400 group-hover:text-ink-300")} />
                  <span className="flex-1 font-medium">{item.label}</span>
                  {isActive && <ChevronRight className="w-3 h-3 text-amber-500/60" />}
                </Link>
              </motion.div>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="px-3 py-4 border-t border-white/5">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
            <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
              <span className="text-xs font-semibold text-amber-400">
                {user?.email?.[0]?.toUpperCase() ?? "U"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-ink-200 truncate">{user?.email}</p>
              <p className="text-xs text-ink-500">Student</p>
            </div>
            <button
              onClick={handleSignOut}
              className="p-1.5 rounded-md text-ink-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="shrink-0 h-14 border-b border-white/5 bg-ink-900/50 backdrop-blur-sm flex items-center px-4 gap-4">
          <button
            className="lg:hidden p-2 rounded-md text-ink-400 hover:text-ink-200 hover:bg-white/5 transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-sm font-semibold text-ink-200">{currentPage?.label || "StudyBuddy AI"}</h1>
            <p className="text-xs text-ink-500 hidden sm:block">{currentPage?.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-sage-400 bg-sage-400/10 border border-sage-400/20 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-sage-400 animate-pulse-soft" />
              Grounded AI
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
