// Supabase clients.
//   - browserClient(): uses the anon key + the user's session cookie. RLS-enforced.
//   - adminClient():   uses the service-role key, bypasses RLS. SERVER ROUTES ONLY.
//
// Both are HTTP-based (@supabase/supabase-js) — no Node TCP driver, so they run
// on the Cloudflare edge runtime. We import the browser bundle explicitly to
// avoid pulling in Node-only code paths.
import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Browser client bound to the logged-in user (RLS-scoped). */
export function browserClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not set.");
  }
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON);
}

/**
 * Admin client — bypasses RLS. Use ONLY inside server route handlers to do
 * work on behalf of an authenticated user (after you've verified their
 * identity). NEVER import this from a client component or expose the key.
 */
export function adminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not set (server-only).");
  }
  return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolve the authenticated user's id from a JWT sent to a route handler. */
export async function userIdFromRequest(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id as string;
}
