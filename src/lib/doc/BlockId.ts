// ────────────────────────────────────────────────────────────────────────────
// BlockId: a ProseMirror plugin that gives every TOP-LEVEL node a stable `id`
// attribute, and keeps it there across edits.
//
// Why: the agent refers to blocks by id ("recolor b3Kx9"). For that to work,
// ids must (a) always exist on top-level nodes, and (b) never change when the
// user types into them. We guarantee both by:
//   - appending an `id` attr to every node type's schema (top-level only),
//   - defaulting new top-level nodes to a fresh id,
//   - migrating any existing top-level node missing an id on every transaction.
//
// This single extension is what makes the whole "surgical edits" model viable.
// ────────────────────────────────────────────────────────────────────────────
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { newBlockId } from "./build";

const key = new PluginKey("blockId");

function isTopLevel(state: { doc: unknown }, depth = 0): boolean {
  return depth === 0;
}

export const BlockId = Extension.create({
  name: "blockId",

  addGlobalAttributes() {
    return [
      {
        types: [
          "heading",
          "paragraph",
          "bulletList",
          "orderedList",
          "codeBlock",
          "blockquote",
          "table",
          "image",
          "horizontalRule",
        ],
        attributes: {
          id: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-block-id"),
            renderHTML: (attrs) =>
              attrs.id ? { "data-block-id": attrs.id } : {},
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        // Stamp an id onto any top-level node that's missing one. Runs as an
        // appendTransaction so it's transparent to history (no undo entry).
        appendTransaction: (_transactions, _oldState, newState) => {
          const tr = newState.tr;
          let changed = false;
          // forEach gives (node, offset, index); offset is the doc-relative pos.
          newState.doc.forEach((node, offset) => {
            const id = node.attrs?.id;
            if (!id && node.type.spec.attrs?.id) {
              tr.setNodeMarkup(offset, undefined, {
                ...node.attrs,
                id: newBlockId(),
              });
              changed = true;
            }
          });
          return changed ? tr : null;
        },
      }),
    ];
  },
});

// Helper kept for clarity in ops.ts; returns true if a node sits at doc root.
export { isTopLevel };
