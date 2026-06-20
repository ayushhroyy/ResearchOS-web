// List the caller's sources (RLS-scoped via the JWT). Used by the KB panel.
import { NextResponse } from "next/server";
import { adminClient, userIdFromRequest } from "@/lib/db/supabase";

export async function GET(req: Request) {
  const userId = await userIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = adminClient();
  const { data, error } = await admin
    .from("sources")
    .select("id,name,kind,status,bytes,created_at,error")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ sources: data ?? [] });
}
