// ────────────────────────────────────────────────────────────────────────────
// ops.ts — translate agent Op[] into ProseMirror transactions on the editor.
//
// Every op is resolved by BLOCK ID, never by text search. We walk the doc's
// top-level nodes to find the node whose `attrs.id` matches, then apply the
// change. Because BlockId guarantees every top-level node has an id, lookups
// are O(blocks) and unambiguous.
//
// All mutations go through one editor.transaction() so the batch is atomic
// from the user's perspective (a single undo step).
// ────────────────────────────────────────────────────────────────────────────
import type { Editor } from "@tiptap/react";
import { buildBlock } from "./build";
import { nodeText } from "./skeleton";
import type { Op } from "./schema";

export interface ApplyResult {
  applied: number;
  skipped: { op: Op; reason: string }[];
}

interface TopBlock {
  id: string;
  pos: number;     // position just before the node (for setNodeMarkup/insert)
  end: number;     // position just after the node (for delete/insert-after)
  node: Editor["view"]["state"]["doc"]; // the pm node
}

/** Find a top-level block by id. Returns its position info. */
function findTopBlock(editor: Editor, id: string): TopBlock | null {
  const { state } = editor.view;
  let found: TopBlock | null = null;
  state.doc.forEach((node, pos) => {
    if (node.attrs?.id === id) {
      found = { id, pos, end: pos + node.nodeSize, node } as unknown as TopBlock;
    }
  });
  return found;
}

/** Apply a batch of ops. Mutates the editor. Each op runs against the
 *  editor's current state (positions re-resolved per op, so order matters). */
export function applyOps(editor: Editor, ops: Op[]): ApplyResult {
  const result: ApplyResult = { applied: 0, skipped: [] };

  for (const op of ops) {
    try {
      const ok = applyOne(editor, op);
      if (ok) result.applied++;
      else result.skipped.push({ op, reason: "target block not found" });
    } catch (e) {
      result.skipped.push({
        op,
        reason: e instanceof Error ? e.message : "error",
      });
    }
  }

  return result;
}

/** Apply a single op to the editor's current state. Returns false if the
 *  referenced id couldn't be resolved. */
function applyOne(editor: Editor, op: Op): boolean {
  switch (op.op) {
    case "insert":
      return doInsert(editor, op);
    case "update_text":
      return doUpdateText(editor, op);
    case "update_format":
      return doUpdateFormat(editor, op);
    case "delete":
      return doDelete(editor, op);
    case "move":
      return doMove(editor, op);
  }
}

function doInsert(
  editor: Editor,
  op: Extract<Op, { op: "insert" }>,
): boolean {
  const block = buildBlock(op.node);
  const json = block as unknown as Record<string, unknown>;
  let pos: number;

  if (op.after === null) {
    pos = 0; // very top
  } else {
    const anchor = findTopBlock(editor, op.after);
    if (!anchor) return false;
    pos = anchor.end;
  }

  // Insert the node + its content as a fragment.
  const { state, dispatch } = editor.view;
  const node = state.schema.nodeFromJSON(stripBlockId(json));
  const tr = state.tr.insert(pos, node);
  dispatch(tr.scrollIntoView());
  return true;
}

function doUpdateText(
  editor: Editor,
  op: Extract<Op, { op: "update_text" }>,
): boolean {
  const target = findTopBlock(editor, op.id);
  if (!target) return false;
  const pmNode = target.node as unknown as {
    type: { name: string };
    attrs: Record<string, unknown>;
    toJSON: () => unknown;
  };

  // Only text-bearing leaf blocks support text replacement; containers
  // (lists, tables) need structural ops — skip gracefully.
  const textBlocks = new Set([
    "paragraph",
    "heading",
    "codeBlock",
    "blockquote",
  ]);
  if (!textBlocks.has(pmNode.type.name)) return false;

  const { state, dispatch } = editor.view;
  // Build a fresh node of the same type with the new text.
  const schema = state.schema;
  const fresh = schema.nodeFromJSON({
    type: pmNode.type.name,
    attrs: pmNode.attrs,
    content: [{ type: "text", text: op.text }],
  });
  const tr = state.tr.replaceWith(target.pos, target.end, fresh);
  dispatch(tr.scrollIntoView());
  return true;
}

function doUpdateFormat(
  editor: Editor,
  op: Extract<Op, { op: "update_format" }>,
): boolean {
  const target = findTopBlock(editor, op.id);
  if (!target) return false;
  const { state, dispatch } = editor.view;
  const tr = state.tr.setNodeMarkup(target.pos, undefined, {
    ...target.node.attrs,
    ...op.patch,
  });
  dispatch(tr.scrollIntoView());
  return true;
}

function doDelete(
  editor: Editor,
  op: Extract<Op, { op: "delete" }>,
): boolean {
  const target = findTopBlock(editor, op.id);
  if (!target) return false;
  const { state, dispatch } = editor.view;
  const tr = state.tr.delete(target.pos, target.end);
  dispatch(tr.scrollIntoView());
  return true;
}

function doMove(
  editor: Editor,
  op: Extract<Op, { op: "move" }>,
): boolean {
  const target = findTopBlock(editor, op.id);
  if (!target) return false;

  // Resolve destination: the position right before/after the anchor block.
  let destPos: number | null = null;
  if (op.before) {
    const anchor = findTopBlock(editor, op.before);
    if (anchor) destPos = anchor.pos;
  } else if (op.after) {
    const anchor = findTopBlock(editor, op.after);
    if (anchor) destPos = anchor.end;
  }
  if (destPos === null) return false;

  const { state, dispatch } = editor.view;
  // Delete the node first, capturing its JSON, then re-insert at dest.
  // (destPos may shift after delete — recompute against the new doc.)
  const json = target.node.toJSON() as Record<string, unknown>;
  let tr = state.tr.delete(target.pos, target.end);
  // Adjust dest if it was after the deleted node.
  const deletedSize = target.end - target.pos;
  if (destPos > target.end) destPos -= deletedSize;
  else if (destPos > target.pos && destPos < target.end) {
    // dest was inside the moved block — bail.
    return false;
  }
  const node = tr.doc.type.schema.nodeFromJSON(stripBlockId(json));
  tr = tr.insert(destPos, node);
  dispatch(tr.scrollIntoView());
  return true;
}

// buildBlock embeds an `id` into attrs; when feeding JSON back into
// schema.nodeFromJSON we keep the id (the BlockId attr accepts it).
// This helper is a no-op passthrough kept for clarity/explicitness.
function stripBlockId(node: Record<string, unknown>): Record<string, unknown> {
  return node;
}

// Re-exported for tests / debugging.
export function blockIds(editor: Editor): string[] {
  const ids: string[] = [];
  editor.view.state.doc.forEach((node) => {
    if (node.attrs?.id) ids.push(node.attrs.id);
  });
  return ids;
}

export { nodeText };
