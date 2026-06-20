// ────────────────────────────────────────────────────────────────────────────
// THE CORE CONTRACT
//
// The document is a tree of BLOCKS. Every top-level block carries a stable
// `id` (assigned once, never recycled) so the agent can refer to it across
// many edits without brittle text matching.
//
// The agent NEVER rewrites the document. It emits an Op[] (a batch of
// operations) via tool-calling. We translate each Op into a ProseMirror
// transaction. This is what makes edits surgical, fast, and cheap — and what
// lets the doc grow without the LLM cost ballooning.
// ────────────────────────────────────────────────────────────────────────────

// Block ids are short nanoids (e.g. "b3Kx9"). Prefixed so they read well in
// agent skeletons ("b3Kx9") and never collide with auto-generated ones.
export type BlockId = string;

/** The kind of a top-level block. Mirrors the TipTap node types we register. */
export type BlockType =
  | "heading"
  | "paragraph"
  | "bulletList"
  | "orderedList"
  | "codeBlock"
  | "blockquote"
  | "table"
  | "image"
  | "horizontalRule";

/** Formatting attrs shared by most text blocks. */
export interface BlockAttrs {
  // text-style
  color?: string | null;        // hex/css color, e.g. "#e11d48"
  textAlign?: "left" | "center" | "right" | null;
  // heading-specific
  level?: 1 | 2 | 3 | 4 | 5 | 6 | null;
}

/** A serializable top-level block as it lives in TipTap JSON. */
export interface Block {
  id: BlockId;
  type: BlockType;
  attrs?: BlockAttrs & Record<string, unknown>;
  content?: unknown; // node content — opaque here; TipTap owns the shape
}

/** The TipTap document: just an array of top-level blocks. */
export interface TipTapDoc {
  type: "doc";
  content: Block[];
}

// ── Node specs the agent may INSERT ──────────────────────────────────────────

export interface InlineText {
  type?: "text";
  text: string;
}

/** Minimal, agent-friendly node spec. We expand it into full TipTap JSON. */
export interface NodeSpec {
  type: BlockType;
  attrs?: Partial<BlockAttrs>;
  /** For text-bearing blocks: the text content. */
  text?: string;
  /**
   * For lists: array of item strings. For tables: rows of cell strings.
   * Kept simple so the agent doesn't have to emit ProseMirror internals.
   */
  items?: string[];
  rows?: string[][];
  src?: string;   // image url (data url or remote)
  alt?: string;
}

// ── OPERATIONS ───────────────────────────────────────────────────────────────

export interface InsertOp {
  op: "insert";
  /** Anchor: insert AFTER this block. Use null to insert at the very top. */
  after: BlockId | null;
  node: NodeSpec;
}

export interface UpdateTextOp {
  op: "update_text";
  id: BlockId;
  text: string;
}

export interface UpdateFormatOp {
  op: "update_format";
  id: BlockId;
  /** Partial patch — only the attrs you change. {color:"#e11d48"} recolors. */
  patch: Partial<BlockAttrs>;
}

export interface DeleteOp {
  op: "delete";
  id: BlockId;
}

export interface MoveOp {
  op: "move";
  id: BlockId;
  /** Move so it sits BEFORE this block. Mutually exclusive with `after`. */
  before?: BlockId | null;
  /** Move so it sits AFTER this block. Mutually exclusive with `before`. */
  after?: BlockId | null;
}

export type Op =
  | InsertOp
  | UpdateTextOp
  | UpdateFormatOp
  | DeleteOp
  | MoveOp;

/** The full tool payload the agent returns in one round-trip. */
export interface EditPlan {
  /** Short human summary shown in the chat, e.g. "Recolored b2, added Dogs". */
  summary: string;
  ops: Op[];
}
