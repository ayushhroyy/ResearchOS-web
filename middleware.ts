// Refreshes the Supabase auth session on every request so the user stays
// logged in across server components / route handlers.
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON } from "@/lib/db/supabase";

export async function middleware(req: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_ANON) return NextResponse.next();

  const res = NextResponse.next({ request: req });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(toSet) {
        toSet.forEach(({ name, value }) => req.cookies.set(name, value));
        res.cookies.getAll();
      },
    },
  });

  // Touching the session refreshes the access token cookie when needed.
  await supabase.auth.getUser();

  return res;
}

export const config = {
  // Run on everything except static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|map)$).*)"],
};
