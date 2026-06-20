"use client";
import { useCallback, useRef, useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { KbPanel } from "@/components/kb/KbPanel";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { TipTapEditor } from "@/components/editor/TipTapEditor";
import { DocActions, type WebRef } from "@/components/editor/DocActions";
import { applyOps, type ApplyResult } from "@/lib/doc/ops";
import type { Editor } from "@tiptap/react";
import type { Op, TipTapDoc } from "@/lib/doc/schema";

export default function Home() {
  // Document state lives at the top so the chat (input) and editor (display)
  // share it. The editor's live instance is captured so ops can be applied.
  const [doc, setDoc] = useState<TipTapDoc | null>(null);
  const [title, setTitle] = useState("Untitled");
  const editorRef = useRef<Editor | null>(null);

  // Apply a batch of agent ops to the live editor, then sync state up.
  const applyEdits = useCallback((ops: Op[]): ApplyResult => {
    const editor = editorRef.current;
    if (!editor) return { applied: 0, skipped: [] };
    const result = applyOps(editor, ops);
    setDoc(editor.getJSON() as unknown as TipTapDoc);
    return result;
  }, []);

  // Append a references section built from web-search hits. We insert a
  // "References" heading then a bullet list at the end of the doc, using the
  // editor commands directly (the second insert needs the first's position,
  // which ops-by-id can't express since the heading id is minted on insert).
  const addWebRefs = useCallback((refs: WebRef[]) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.chain().focus("end").enter().enter().run();
    editor.commands.insertContent([
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "References" }] },
      {
        type: "bulletList",
        content: refs.map((r) => ({
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: r.title + " — " },
                { type: "text", marks: [{ type: "link", attrs: { href: r.url } }], text: r.url },
              ],
            },
          ],
        })),
      },
    ]);
    setDoc(editor.getJSON() as unknown as TipTapDoc);
  }, []);

  return (
    <div className="app-canvas flex h-screen flex-col">
      <header className="border-border/70 flex h-12 shrink-0 items-center justify-between border-b px-4 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <span className="brand-mark">R</span>
          <span className="text-sm font-semibold tracking-tight">ResearchOS</span>
          <span className="text-muted-foreground ml-1 hidden text-xs sm:inline">
            agentic document editing
          </span>
        </div>
      </header>

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        {/* Knowledge cluster */}
        <ResizablePanel defaultSize={22} minSize={16} maxSize={32}>
          <PaneShell label="Knowledge cluster" sublabel="Your indexed sources">
            <KbPanel />
          </PaneShell>
        </ResizablePanel>
        <ResizableHandle />

        {/* Chat */}
        <ResizablePanel defaultSize={34} minSize={24}>
          <ChatPanel
            doc={doc}
            onDoc={setDoc}
            onTitle={setTitle}
            applyEdits={applyEdits}
          />
        </ResizablePanel>
        <ResizableHandle />

        {/* Editor */}
        <ResizablePanel defaultSize={44} minSize={24}>
          <div className="flex h-full flex-col">
            <div className="border-border/70 bg-card/40 flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
                  Document
                </span>
                <span className="text-muted-foreground/40">/</span>
                <span className="truncate text-sm font-medium">{title}</span>
              </div>
              <DocActions title={title} doc={doc} onAddWebRefs={addWebRefs} />
            </div>
            <div className="min-h-0 flex-1" data-print="doc">
              <TipTapEditor
                doc={doc}
                onChange={setDoc}
                onReady={(e) => (editorRef.current = e)}
              />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function PaneShell({
  label,
  sublabel,
  children,
}: {
  label: string;
  sublabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-border/70 bg-card/40 flex h-12 shrink-0 flex-col justify-center gap-0 border-b px-4">
        <span className="text-sm font-semibold tracking-tight">{label}</span>
        {sublabel && (
          <span className="text-muted-foreground text-[11px]">{sublabel}</span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  );
}
