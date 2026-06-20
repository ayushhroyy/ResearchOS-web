"use client";
import { useAuth } from "@/components/auth/AuthProvider";
import { SignIn } from "@/components/auth/SignIn";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { KbPanel } from "@/components/kb/KbPanel";

export default function Home() {
  const { session, loading } = useAuth();

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
        <ResizablePanel defaultSize={24} minSize={18} maxSize={34}>
          <div className="h-full overflow-y-auto p-4">
            <KbPanel />
          </div>
        </ResizablePanel>
        <ResizableHandle />

        {/* Chat (stub — Phase 2/3) */}
        <ResizablePanel defaultSize={38} minSize={24}>
          <PaneStub
            title="Chat"
            note="Generate a doc or ask for edits here (Phase 2–3)."
          />
        </ResizablePanel>
        <ResizableHandle />

        {/* Editor (stub — Phase 2/3) */}
        <ResizablePanel defaultSize={38} minSize={24}>
          <PaneStub
            title="Document"
            note="TipTap editor with surgical block ops (Phase 2–3)."
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function SignOut() {
  const { supabase } = useAuth();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => supabase?.auth.signOut()}
    >
      Sign out
    </Button>
  );
}

function PaneStub({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex h-10 shrink-0 items-center border-b px-4">
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="text-muted-foreground flex flex-1 items-center justify-center p-6 text-center text-sm">
        {note}
      </div>
    </div>
  );
}
