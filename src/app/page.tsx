"use client";
import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { SignIn } from "@/components/auth/SignIn";
import { Button } from "@/components/ui/button";
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
  const { session, loading } = useAuth();

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

  if (loading) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
        Loading…
      </div>
    );
  }

  if (!session) return <SignIn />;

  return (
    <div className="flex h-screen flex-col">
      <header className="border-border flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold tracking-tight">Rabbitt</span>
          <span className="text-muted-foreground text-xs">
            agentic document editing
          </span>
        </div>
        <SignOut />
      </header>

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        {/* Knowledge cluster */}
        <ResizablePanel defaultSize={22} minSize={16} maxSize={32}>
          <div className="h-full overflow-y-auto p-4">
            <KbPanel />
          </div>
        </ResizablePanel>
        <ResizableHandle />

        {/* Chat */}
        <ResizablePanel defaultSize={34} minSize={24}>
          <ChatPanel
            doc={doc}
            onDoc={setDoc}
            onTitle={setTitle}
            onEditorReady={(e) => (editorRef.current = e)}
            applyEdits={applyEdits}
          />
        </ResizablePanel>
        <ResizableHandle />

        {/* Editor */}
        <ResizablePanel defaultSize={44} minSize={24}>
          <div className="flex h-full flex-col">
            <div className="border-border bg-muted/30 flex h-10 shrink-0 items-center justify-between gap-2 border-b px-4">
              <span className="text-sm font-medium">{title}</span>
              <DocActions title={title} doc={doc} onAddWebRefs={addWebRefs} />
            </div>
            <div className="min-h-0 flex-1" data-print="doc">
              <TipTapEditor doc={doc} onChange={setDoc} />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function SignOut() {
  const { supabase } = useAuth();
  return (
    <Button variant="ghost" size="sm" onClick={() => supabase?.auth.signOut()}>
      Sign out
    </Button>
  );
}
