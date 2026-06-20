// ────────────────────────────────────────────────────────────────────────────
// agent.ts — the agentic edit loop.
//
// Input:  the current document (as a skeleton) + the user's edit request.
// Output: an EditPlan { summary, ops }.
//
// We give the model ONE tool, `apply_edits`, whose args are exactly an Op[].
// The model plans the edit and calls the tool; we read the args back out.
// This is deterministic and robust — no parsing prose, no guessing structure.
// ────────────────────────────────────────────────────────────────────────────
import { aiClient, AI_MODELS } from "./client";
import { skeletonText } from "@/lib/doc/skeleton";
import type { EditPlan, Op, TipTapDoc } from "@/lib/doc/schema";

const SYSTEM = `You are an editing agent for a structured document. You NEVER
rewrite the whole document. Instead you emit a precise list of OPERATIONS on
blocks, identified by their stable ids.

The document is presented to you as a SKELETON: one line per block with its
id, type, and a short text preview. To know the full text of a block, look at
its preview; if you need to change wording, replace the whole text via
update_text.

OPERATION TYPES:
  { "op":"insert", "after": <blockId|null>, "node": NodeSpec }
      Insert a new block AFTER the given id (null = insert at the very top).
  { "op":"update_text", "id": <blockId>, "text": "full new text" }
      Replace the entire text of a text block (paragraph/heading/etc.).
  { "op":"update_format", "id": <blockId>, "patch": { "color":"#hex", "textAlign":"left|center|right", "level":1|2|3 } }
      Change formatting attrs. Only include keys you're changing.
  { "op":"delete", "id": <blockId> }
  { "op":"move", "id": <blockId>, "before": <blockId> }   // or "after"

NodeSpec for inserts:
  { "type":"heading", "attrs":{"level":2}, "text":"Dogs" }
  { "type":"paragraph", "text":"..." }
  { "type":"bulletList", "items":["...","..."] }
  { "type":"orderedList", "items":["..."] }
  { "type":"blockquote", "text":"..." }
  { "type":"codeBlock", "text":"..." }
  { "type":"table", "rows":[["h1","h2"],["a","b"]] }
  { "type":"image", "src":"<url>", "alt":"..." }
  { "type":"horizontalRule" }

RULES:
- Use the EXACT block ids from the skeleton. Never invent ids.
- Be surgical: emit the minimum ops that satisfy the request.
- For "add a section about X": insert a heading then 1-2 paragraphs (multiple inserts, after the right anchor).
- For color/format: use update_format with a hex color (#rrggbb) or named attr.
- Call the apply_edits tool ONCE with all ops.`;

/**
 * Plan an edit: given the doc + request, return the Op[] to apply.
 * One LLM round-trip (no multi-step needed for surgical edits).
 */
export async function planEdit(
  doc: TipTapDoc,
  request: string,
): Promise<EditPlan> {
  const skeleton = skeletonText(doc);

  const completion = await aiClient().chat.completions.create({
    model: AI_MODELS.chat,
    temperature: 0.2,
    tools: [
      {
        type: "function",
        function: {
          name: "apply_edits",
          description: "Apply a batch of surgical operations to the document.",
          parameters: {
            type: "object",
            properties: {
              summary: {
                type: "string",
                description: "One-line human description of the edit.",
              },
              ops: {
                type: "array",
                description: "Ordered list of operations to apply.",
                items: { type: "object" },
              },
            },
            required: ["summary", "ops"],
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "apply_edits" } },
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `EDIT REQUEST:\n${request}\n\nDOCUMENT SKELETON:\n${skeleton}`,
      },
    ],
  });

  const calls = completion.choices[0]?.message?.tool_calls ?? [];
  // We asked for a function tool; narrow to that variant of the union.
  const call = calls.find((c) => c.type === "function" && "function" in c);
  const fn = call && "function" in call ? call.function : undefined;
  if (!fn?.arguments) {
    throw new Error("agent did not call apply_edits");
  }

  let parsed: EditPlan;
  try {
    parsed = JSON.parse(fn.arguments) as EditPlan;
  } catch {
    throw new Error("agent returned malformed edit plan");
  }

  if (!Array.isArray(parsed.ops)) {
    throw new Error("agent edit plan missing ops array");
  }

  return {
    summary: parsed.summary ?? "Applied edit.",
    ops: parsed.ops as Op[],
  };
}
