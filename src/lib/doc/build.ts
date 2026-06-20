// ────────────────────────────────────────────────────────────────────────────
// Expand agent-friendly NodeSpecs into real TipTap JSON nodes.
//
// The agent never has to emit ProseMirror internals. It says:
//   { type:"heading", attrs:{level:2}, text:"Introduction" }
//   { type:"bulletList", items:["cats","dogs"] }
//   { type:"table", rows:[["a","b"],["c","d"]] }
// and we build the full nested node structure, assigning a fresh block id.
// ────────────────────────────────────────────────────────────────────────────
import { nanoid } from "nanoid";
import type { Block, BlockAttrs, NodeSpec, TipTapDoc } from "./schema";

export function newBlockId(): string {
  // short, readable, low-collision: 8 chars
  return "b" + nanoid(7);
}

function inline(text: string) {
  return [{ type: "text", text }];
}

/** Build a single top-level block (with id) from a NodeSpec. */
export function buildBlock(spec: NodeSpec, id: string = newBlockId()): Block {
  const attrs: BlockAttrs & Record<string, unknown> = { ...(spec.attrs ?? {}), id };

  switch (spec.type) {
    case "heading":
      return { id, type: "heading", attrs, content: inline(spec.text ?? "") };

    case "paragraph":
      return { id, type: "paragraph", attrs, content: inline(spec.text ?? "") };

    case "blockquote":
      return { id, type: "blockquote", attrs, content: inline(spec.text ?? "") };

    case "codeBlock":
      return { id, type: "codeBlock", attrs, content: inline(spec.text ?? "") };

    case "horizontalRule":
      return { id, type: "horizontalRule" };

    case "bulletList":
    case "orderedList":
      return {
        id,
        type: spec.type,
        content: (spec.items ?? []).map((text) => ({
          type: "listItem",
          content: [
            { type: "paragraph", content: inline(text) },
          ],
        })),
      };

    case "image":
      return {
        id,
        type: "image",
        attrs: { ...attrs, src: spec.src ?? "", alt: spec.alt ?? "" },
      };

    case "table": {
      const rows = spec.rows ?? [];
      return {
        id,
        type: "table",
        content: rows.map((cells) => ({
          type: "tableRow",
          content: cells.map((cell) => ({
            type: "tableCell",
            content: [{ type: "paragraph", content: inline(cell) }],
          })),
        })),
      };
    }

    default:
      // Unknown type → fall back to a paragraph so we never lose content.
      return { id, type: "paragraph", attrs, content: inline(spec.text ?? "") };
  }
}

/** Build a fresh empty doc. */
export function emptyDoc(): TipTapDoc {
  return { type: "doc", content: [] };
}

/** Build a doc from a list of NodeSpecs (used by the generate endpoint). */
export function docFromSpecs(specs: NodeSpec[]): TipTapDoc {
  return { type: "doc", content: specs.map((s) => buildBlock(s)) };
}
