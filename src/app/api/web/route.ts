// Web search via Serper (https://serper.dev). Returns organic results with
// title/url/snippet for citation. Used standalone by the editor's web-reference
// field; the agent loops call lib/ai/web directly.
import { NextResponse } from "next/server";
import { userIdFromRequest } from "@/lib/db/supabase";
import { webSearch } from "@/lib/ai/web";

export const runtime = "edge";

export async function POST(req: Request) {
  const userId = await userIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let query: string;
  let num: number;
  try {
    const body = await req.json();
    query = body.query;
    num = Number(body.num ?? 6);
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  try {
    const results = await webSearch(query, num);
    return NextResponse.json({ results });
  } catch (err) {
    const m = err instanceof Error ? err.message : "search failed";
    return NextResponse.json({ error: m }, { status: 502 });
  }
}
