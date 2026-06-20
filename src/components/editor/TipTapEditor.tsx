"use client";
// The TipTap editor (right pane). Responsibilities:
//   - render the document from TipTap JSON
//   - register extensions incl. BlockId (stable per-block ids)
//   - expose the editor instance + current doc up to the parent via props,
//     so the chat panel can apply Ops[] to it
import { useEffect, useRef } from "react";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Placeholder from "@tiptap/extension-placeholder";
import { BlockId } from "@/lib/doc/BlockId";
import type { TipTapDoc } from "@/lib/doc/schema";
import type { Editor } from "@tiptap/react";

export interface TipTapEditorProps {
  doc: TipTapDoc | null;
  /** Called whenever the doc changes (debounced by the parent if needed). */
  onChange?: (doc: TipTapDoc) => void;
  /** Parent receives the live editor instance so it can apply ops. */
  onReady?: (editor: Editor) => void;
}

export function TipTapEditor({ doc, onChange, onReady }: TipTapEditorProps) {
  // Keep latest callbacks without re-creating the editor. Updated in an
  // effect (never during render) per the React 19 refs rule.
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onChangeRef.current = onChange;
    onReadyRef.current = onReady;
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // StarterKit includes list, codeBlock, blockquote, heading, etc.
        heading: { levels: [1, 2, 3] },
      }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({
        placeholder: "Generate a document, or your edits will appear here.",
      }),
      BlockId,
    ],
    // Cast: our TipTapDoc is structurally JSONContent; the `unknown` content
    // field on Block just needs widening for the editor's type checker.
    content: (doc ?? { type: "doc", content: [] }) as unknown as JSONContent,
    onUpdate: ({ editor }) => {
      onChangeRef.current?.(editor.getJSON() as unknown as TipTapDoc);
    },
    immediatelyRender: false,
  });

  // Sync external doc changes into the editor (e.g. after generation).
  useEffect(() => {
    if (editor && doc) {
      const current = JSON.stringify(editor.getJSON());
      const incoming = JSON.stringify(doc);
      if (current !== incoming) {
        editor.commands.setContent(doc as unknown as JSONContent, {
          emitUpdate: false,
        });
      }
    }
  }, [editor, doc]);

  // Hand the instance up.
  useEffect(() => {
    if (editor) onReadyRef.current?.(editor);
  }, [editor]);

  return (
    <div className="prose-editor h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 py-10">
        <EditorContent
          editor={editor}
          className="prose dark:prose-invert max-w-none"
        />
      </div>
    </div>
  );
}
