// Generate a full document from a user query.
//
// Flow: query → embed → vector search (top-k) → system prompt → LLM returns
// a JSON array of NodeSpecs → we expand to TipTap JSON → stream it back to
// the client as Server-Sent Events.
//
// The LLM is told to emit SIMPLE NodeSpecs (not ProseMirror internals); we
// expand them server-side via buildBlock(). This keeps the model's output
// cheap and reliable.
import { NextResponse } from "next/server";
import { adminClient, userIdFromRequest } from "@/lib/db/supabase";
import { embed } from "@/lib/ai/embed";
import { aiClient, AI_MODELS } from "@/lib/ai/client";
import { docFromSpecs } from "@/lib/doc/build";
import type { NodeSpec } from "@/lib/doc/schema";
import { nanoid } from "nanoid";

export const runtime = "edge";

interface ChunkHit {
  source_id: string;
  content: string;
  sourceName?: string;
}

const SYSTEM = `You are a document architect. Given a user request and a set of
knowledge-base excerpts, produce a complete, well-structured document as a JSON
object: { "title": string, "blocks": NodeSpec[] }.

NodeSpec is one of:
  { "type": "heading",    "attrs": { "level": 1|2|3 }, "text": "..." }
  { "type": "paragraph",  "text": "..." }
  { "type": "bulletList", "items": ["...", "..."] }
  { "type": "orderedList","items": ["...", "..."] }
  { "type": "blockquote", "text": "..." }
  { "type": "codeBlock",  "text": "..." }
  { "type": "table",      "rows": [["a","b"], ["c","d"]] }
  { "type": "image",      "src": "<url>", "alt": "..." }
  { "type": "horizontalRule" }

Rules:
- Do NOT include block ids; the system assigns them.
- Lead with a single level-1 heading as the title.
- Use 2-3 levels of headings to organize sections.
- Ground the content in the provided excerpts; do not invent facts.
- Output ONLY the JSON object, no markdown fences, no commentary.`;

export async function POST(req: Request) {
  const userId = await userIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let query: string;
  try {
    const body = await req.json();
    query = body.query;
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  // 1. Retrieve relevant chunks.
  let hits: ChunkHit[] = [];
  try {
    const qVec = await embed(query);
    const admin = adminClient();
    const { data: matches } = await admin.rpc("match_chunks", {
      query_embedding: qVec,
      query_user: userId,
      match_count: 8,
    });
    if (matches?.length) {
      const ids = [...new Set(matches.map((m: { source_id: string }) => m.source_id))];
      const { data: srcs } = await admin
        .from("sources")
        .select("id,name")
        .in("id", ids);
      const nameById = new Map((srcs ?? []).map((s) => [s.id, s.name]));
      hits = matches.map((m: { source_id: string; content: string }) => ({
        source_id: m.source_id,
        content: m.content,
        sourceName: nameById.get(m.source_id),
      }));
    }
  } catch {
    // Retrieval is best-effort; we can still generate without it.
    hits = [];
  }

  // 2. Build the prompt.
  const context = hits.length
    ? hits
        .map(
          (h, i) =>
            `--- EXCERPT ${i + 1} (${h.sourceName ?? "source"}) ---\n${h.content}`,
        )
        .join("\n\n")
    : "(no matching excerpts found in the knowledge base)";

  // 3. Call the LLM (non-streaming — we need the full JSON to parse safely).
  const completion = await aiClient().chat.completions.create({
    model: AI_MODELS.chat,
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `REQUEST:\n${query}\n\nKNOWLEDGE BASE:\n${context}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: { title?: string; blocks?: unknown[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "model returned invalid JSON" },
      { status: 502 },
    );
  }

  // 4. Expand specs → TipTap JSON.
  const doc = docFromSpecs((parsed.blocks ?? []) as NodeSpec[]);

  // 5. SSE: a status event, then the final document.
  const docId = "d" + nanoid(10);
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (ev: string, data: unknown) =>
        controller.enqueue(
          enc.encode(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      send("title", { title: parsed.title ?? "Untitled" });
      send("done", { docId, doc });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
