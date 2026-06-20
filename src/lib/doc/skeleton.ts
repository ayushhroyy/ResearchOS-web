// ────────────────────────────────────────────────────────────────────────────
// Skeleton: a compressed view of the doc we send the agent as context.
//
// Instead of sending full ProseMirror JSON, we send one line per top-level
// block: {id, type, summary}. The summary is a short text preview (first
// ~80 chars of text). This keeps the agent's context small and focused on
// block identity/structure — which is exactly what it needs to emit ops.
// ────────────────────────────────────────────────────────────────────────────
import type { TipTapDoc, BlockAttrs } from "./schema";

export interface SkeletonBlock {
  id: string;
  type: string;
  summary: string;
  attrs?: BlockAttrs;
}

/** Extract all inline text from a (possibly nested) node. */
export function nodeText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (typeof node === "object") {
    const n = node as { text?: string; content?: unknown[] };
    if (typeof n.text === "string") return n.text;
    if (Array.isArray(n.content)) return n.content.map(nodeText).join("");
  }
  return "";
}

function summarize(text: string, max = 90): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? one.slice(0, max) + "…" : one;
}

export function toSkeleton(doc: TipTapDoc): SkeletonBlock[] {
  return (doc.content ?? []).map((block) => {
    let summary = "";
    if (block.type === "table") {
      const rows = (block.content as unknown[] ?? []).length;
      summary = `[${rows} row table]`;
    } else if (block.type === "image") {
      summary = block.attrs?.alt ? `[image: ${block.attrs.alt}]` : "[image]";
    } else {
      summary = summarize(nodeText(block.content));
    }
    return { id: block.id, type: block.type, summary, attrs: block.attrs };
  });
}

/** Render the skeleton as a compact text block for the agent prompt. */
export function skeletonText(doc: TipTapDoc): string {
  const sk = toSkeleton(doc);
  if (sk.length === 0) return "(empty document)";
  return sk
    .map((b) => `- ${b.id} [${b.type}]${b.attrs?.level ? ` h${b.attrs.level}` : ""}: ${b.summary}`)
    .join("\n");
}
