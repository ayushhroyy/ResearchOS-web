// Web search via Serper (https://serper.dev). Returns organic results with
// title/url/snippet for citation. Used to fetch external references the
// knowledge base doesn't already cover.
//
// Key is server-side only (SERPER_API_KEY); the client never sees it.
import { NextResponse } from "next/server";
import { userIdFromRequest } from "@/lib/db/supabase";

export const runtime = "edge";

export async function POST(req: Request) {
  const userId = await userIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const key = process.env.SERPER_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "SERPER_API_KEY not configured" },
      { status: 500 },
    );
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

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `serper ${res.status}: ${t.slice(0, 200)}` },
      { status: 502 },
    );
  }

  const data = (await res.json()) as {
    organic?: { title: string; link: string; snippet?: string }[];
  };

  const results = (data.organic ?? []).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet ?? "",
  }));

  return NextResponse.json({ results });
}
