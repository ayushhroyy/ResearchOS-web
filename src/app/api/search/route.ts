// Vector search: embed the query, then call the match_chunks() SQL helper
// (security-definer, RLS-safe via query_user). Returns ranked chunks with
// their source file name for citation.
import { NextResponse } from "next/server";
import { adminClient, userIdFromRequest } from "@/lib/db/supabase";
import { embed } from "@/lib/ai/embed";

export async function POST(req: Request) {
  const userId = await userIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let query: string;
  let matchCount: number;
  try {
    const body = await req.json();
    query = body.query;
    matchCount = Number(body.matchCount ?? 6);
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embed(query);
  } catch (err) {
    const m = err instanceof Error ? err.message : "embed failed";
    return NextResponse.json({ error: m }, { status: 502 });
  }

  const admin = adminClient();
  const { data: matches, error } = await admin.rpc("match_chunks", {
    query_embedding: queryEmbedding,
    query_user: userId,
    match_count: matchCount,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!matches || matches.length === 0) {
    return NextResponse.json({ results: [] });
  }

  // Hydrate source names for citation.
  const sourceIds = [...new Set(matches.map((m: { source_id: string }) => m.source_id))];
  const { data: sources } = await admin
    .from("sources")
    .select("id,name")
    .in("id", sourceIds);
  const nameById = new Map((sources ?? []).map((s) => [s.id, s.name]));

  const results = matches.map(
    (m: {
      id: string;
      source_id: string;
      content: string;
      ordinal: number;
      similarity: number;
    }) => ({
      chunkId: m.id,
      sourceId: m.source_id,
      sourceName: nameById.get(m.source_id) ?? "unknown",
      content: m.content,
      ordinal: m.ordinal,
      similarity: m.similarity,
    }),
  );

  return NextResponse.json({ results });
}
