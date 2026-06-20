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
    // Sync the editor's now-current doc back into React state.
    setDoc(editor.getJSON() as unknown as TipTapDoc);
    return result;
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
            <div className="border-border bg-muted/30 flex h-10 shrink-0 items-center gap-2 border-b px-4">
              <span className="text-sm font-medium">{title}</span>
            </div>
            <div className="min-h-0 flex-1">
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
