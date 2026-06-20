// Generate a full document from a user query — AGENTIC.
//
// Flow: query → embed → vector search (top-k) → agentic loop where the model
// may call `web_search` to research/ground, then calls `write_document` to
// emit NodeSpecs. We expand to TipTap JSON and stream it back via SSE.
//
// Web search is ALWAYS available to the model as a tool: it uses it whenever
// the knowledge base doesn't cover something or needs grounding/recent info.
//
// SSE events:
//   event: status  data: { message }      ← "Searching the web: …"
//   event: title   data: { title }
//   event: done    data: { docId, doc, sources }
import { NextResponse } from "next/server";
import type { ChatCompletionMessageParam } from "openai/resources";
import { adminClient, userIdFromRequest } from "@/lib/db/supabase";
import { embed } from "@/lib/ai/embed";
import { aiClient, AI_MODELS } from "@/lib/ai/client";
import { webSearch } from "@/lib/ai/web";
import { docFromSpecs } from "@/lib/doc/build";
import type { NodeSpec } from "@/lib/doc/schema";
import { nanoid } from "nanoid";

export const runtime = "edge";

const MAX_STEPS = 6; // bound the loop so it always terminates

interface ChunkHit {
  source_id: string;
  content: string;
  sourceName?: string;
}

const SYSTEM = `You are ResearchOS, a document architect and researcher.
Given a user request and knowledge-base excerpts, produce a complete,
well-structured document.

You have TWO tools:
  1. web_search(query) — search the open web. Use it whenever the knowledge
     base doesn't cover something, to verify facts, get recent info, or find
     references/citations. Research as much as you need — it is always available.
  2. write_document(title, blocks) — submit the final document. This ENDS the
     task. blocks is an array of NodeSpec (see below).

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
- Ground content in the knowledge base AND/OR web search. Do not invent facts
  or numbers you couldn't verify. Prefer citing real sources.
- When you're done researching, call write_document ONCE with the full document.`;

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

  // 1. Retrieve relevant chunks (best-effort).
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
    hits = [];
  }

  const context = hits.length
    ? hits
        .map(
          (h, i) =>
            `--- EXCERPT ${i + 1} (${h.sourceName ?? "source"}) ---\n${h.content}`,
        )
        .join("\n\n")
    : "(no matching excerpts found in the knowledge base)";

  // 2. SSE stream + run the agentic loop, pushing events as we go.
  const encoder = new TextEncoder();
  const sources: { title: string; url: string }[] = [];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: string, data: unknown) =>
        controller.enqueue(
          encoder.encode(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`),
        );

      try {
        const messages: ChatCompletionMessageParam[] = [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `REQUEST:\n${query}\n\nKNOWLEDGE BASE:\n${context}`,
          },
        ];

        let doc: ReturnType<typeof docFromSpecs> | null = null;
        let title = "Untitled";

        const tools = [
          {
            type: "function" as const,
            function: {
              name: "web_search",
              description:
                "Search the open web for information, facts, or references.",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "The search query." },
                },
                required: ["query"],
              },
            },
          },
          {
            type: "function" as const,
            function: {
              name: "write_document",
              description: "Submit the final document. Ends the task.",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  blocks: {
                    type: "array",
                    description: "Ordered NodeSpec blocks.",
                    items: { type: "object" },
                  },
                },
                required: ["title", "blocks"],
              },
            },
          },
        ];

        for (let step = 0; step < MAX_STEPS && !doc; step++) {
          const completion = await aiClient().chat.completions.create({
            model: AI_MODELS.chat,
            temperature: 0.4,
            messages,
            tools,
          });

          const choice = completion.choices[0]?.message;
          // Push the assistant turn into history (carries any tool_calls).
          messages.push(choice);

          const calls = choice?.tool_calls ?? [];
          let producedDoc = false;

          for (const call of calls) {
            if (call.type !== "function") continue;
            const fn = call.function;
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(fn.arguments || "{}");
            } catch {
              /* empty args */
            }

            if (fn.name === "web_search") {
              const q = String(args.query ?? "");
              send("status", { message: `Searching the web: ${q}` });
              let resultText = "(no results)";
              try {
                const results = await webSearch(q, 6);
                for (const r of results) {
                  if (!sources.some((s) => s.url === r.url)) {
                    sources.push({ title: r.title, url: r.url });
                  }
                }
                resultText = results
                  .map(
                    (r, i) =>
                      `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`,
                  )
                  .join("\n\n");
              } catch {
                resultText = "(web search failed; proceed without it)";
              }
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: JSON.stringify({ query: q, results: resultText }),
              });
              continue;
            }

            if (fn.name === "write_document") {
              title = String(args.title ?? "Untitled");
              const blocks = (args.blocks ?? []) as NodeSpec[];
              doc = docFromSpecs(blocks);
              producedDoc = true;
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: JSON.stringify({ ok: true }),
              });
              break;
            }
          }

          // No tool calls? The model may have emitted the doc as plain JSON
          // (fallback path). Try to parse it.
          if (!producedDoc && calls.length === 0 && choice?.content) {
            try {
              const parsed = JSON.parse(choice.content) as {
                title?: string;
                blocks?: NodeSpec[];
              };
              if (Array.isArray(parsed.blocks)) {
                title = parsed.title ?? "Untitled";
                doc = docFromSpecs(parsed.blocks);
              }
            } catch {
              /* not JSON; keep looping */
            }
          }
        }

        if (!doc) {
          send("error", { error: "could not generate a document" });
        } else {
          send("title", { title });
          send("done", { docId: "d" + nanoid(10), doc, sources });
        }
      } catch (err) {
        const m = err instanceof Error ? err.message : "generation failed";
        send("error", { error: m });
      } finally {
        controller.close();
      }
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
