// Server-side Supabase session handling for App Router route handlers.
// Reads the auth cookies set by @supabase/ssr's browser client.
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON } from "@/lib/db/supabase";

export async function serverClient() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — set is a no-op there. Fine.
        }
      },
    },
  });
}

/** The current user's id, or null if not signed in. */
export async function currentUserId(): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON) return null;
  const supabase = await serverClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
