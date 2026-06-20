"use client";
// Exposes the Supabase browser client + the current session via context.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { browserClient } from "@/lib/db/supabase";

type Ctx = { supabase: SupabaseClient | null; session: Session | null; loading: boolean };
const AuthContext = createContext<Ctx>({
  supabase: null,
  session: null,
  loading: true,
});

// Create the client once, lazily, at module init time. If env isn't
// configured yet (e.g. first run), this is null and we render signed-out.
function initClient(): SupabaseClient | null {
  try {
    return browserClient();
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // useState initializer runs once on mount — avoids the
  // "setState inside effect" lint and the cascading render it warns about.
  const [supabase] = useState<SupabaseClient | null>(initClient);
  const [session, setSession] = useState<Session | null>(null);
  // `loading` is true until we've either resolved the session OR discovered
  // there's no client configured. Derived, never set synchronously in effect.
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setResolved(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  // No client ⇒ nothing to wait for. Otherwise wait for first getSession().
  const loading = supabase ? !resolved : false;

  const value = useMemo(
    () => ({ supabase, session, loading }),
    [supabase, session, loading],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
