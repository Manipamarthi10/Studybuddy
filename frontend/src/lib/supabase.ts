import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export async function getToken(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || null;
}

export async function ensureToken(): Promise<string> {
  const existing = await getToken();
  if (existing) return existing;

  const fallbackToken = process.env.NEXT_PUBLIC_API_BEARER_TOKEN;
  if (fallbackToken) return fallbackToken;

  if (!supabase) {
    throw new Error(
      "Set NEXT_PUBLIC_API_BEARER_TOKEN or configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session?.access_token) {
    throw new Error(
      "Authentication required. Sign in via Supabase or set NEXT_PUBLIC_API_BEARER_TOKEN in frontend/.env.local"
    );
  }

  return data.session.access_token;
}
