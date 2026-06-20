// Supabase admin client for server route handlers.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const SHARED_USER_ID =
  process.env.RESEARCHOS_USER_ID ?? "00000000-0000-0000-0000-000000000000";

/**
 * Admin client — bypasses RLS. Use ONLY inside server route handlers.
 * NEVER import this from a client component or expose the key.
 */
export function adminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not set (server-only).");
  }
  return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Shared workspace owner used after removing browser login. */
export async function userIdFromRequest(req?: Request) {
  void req;
  return SHARED_USER_ID;
}
