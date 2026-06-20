"use client";
// The chat panel (middle pane). Two modes:
//   - generate: a query with no active document → /api/generate (SSE)
//   - edit:     a message with an active document → /api/edit (Phase 3)
//
// Controlled by the page: document + title state live one level up so the
// editor pane (right) and this chat pane (middle) stay in sync.
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Editor } from "@tiptap/react";
import type { Op, TipTapDoc } from "@/lib/doc/schema";
import type { ApplyResult } from "@/lib/doc/ops";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatPanelProps {
  doc: TipTapDoc | null;
  onDoc: (doc: TipTapDoc) => void;
  onTitle: (title: string) => void;
  onEditorReady?: (editor: Editor) => void;
  /** Apply agent ops to the live editor. Returns how many succeeded. */
  applyEdits?: (ops: Op[]) => ApplyResult;
}

export function ChatPanel({ doc, onDoc, onTitle, applyEdits }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! Upload some files to your knowledge cluster, then tell me what to build — a report, a paper, a question bank. I'll generate it here.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;

    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setBusy(true);

    try {
      const hasDoc = !!doc && (doc.content?.length ?? 0) > 0;
      if (hasDoc) {
        // Edit path: ask the agent to plan ops, apply them to the editor.
        const res = await fetch("/api/edit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: text, doc }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "edit failed");
        }
        const { plan } = (await res.json()) as {
          plan: { summary: string; ops: Op[] };
        };
        const result = applyEdits
          ? applyEdits(plan.ops)
          : { applied: 0, skipped: [] as ApplyResult["skipped"] };
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              `${plan.summary}\n\n` +
              `Applied ${result.applied} of ${plan.ops.length} ops` +
              (result.skipped.length
                ? ` (skipped ${result.skipped.length}: ${result.skipped
                    .map((s) => s.reason)
                    .join("; ")})`
                : ""),
          },
        ]);
      } else {
        // Generate path: SSE stream from /api/generate.
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: text }),
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "generate failed");
        }
        await readSse(res.body, {
          status: (d) => {
            const message = (d as { message?: string }).message;
            if (message) setStatus(message);
          },
          title: (d) => onTitle((d as { title: string }).title),
          done: (d) => {
            const payload = d as {
              doc: TipTapDoc;
              sources?: { title: string; url: string }[];
            };
            onDoc(payload.doc);
            const refCount = payload.sources?.length ?? 0;
            setStatus(null);
            setMessages((m) => [
              ...m,
              {
                role: "assistant",
                content:
                  "Done — your document is in the editor. Ask for edits to refine it." +
                  (refCount ? ` Grounded with ${refCount} web source${refCount > 1 ? "s" : ""}.` : ""),
              },
            ]);
          },
          error: (d) => {
            const message = (d as { error?: string }).error ?? "generation failed";
            throw new Error(message);
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      toast.error(message);
      setMessages((m) => [
        ...m,
        { role: "system", content: `Error: ${message}` },
      ]);
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }, [input, busy, doc, onDoc, onTitle, applyEdits]);

  const hasDoc = !!doc && (doc.content?.length ?? 0) > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Pane header */}
      <div className="border-border/70 bg-card/40 flex h-12 shrink-0 items-center justify-between border-b px-4">
        <span className="text-sm font-semibold tracking-tight">
          {hasDoc ? "Refine" : "Compose"}
        </span>
        <span className="text-muted-foreground text-[11px]">
          {hasDoc ? "ask for surgical edits" : "describe what to build"}
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {messages.map((m, i) => (
            <ChatBubble key={i} role={m.role} content={m.content} />
          ))}
          {busy && (
            <div className="flex items-center gap-2 px-1">
              <TypingDots />
              <span className="text-muted-foreground text-xs">
                {status ?? "Working…"}
              </span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Composer */}
      <div className="border-border/70 border-t p-3">
        <div className="bg-card focus-within:ring-ring/40 flex items-end gap-2 rounded-xl border p-2 transition-shadow focus-within:ring-2">
          <textarea
            placeholder={
              hasDoc
                ? "Ask for an edit — e.g. “add a section on dogs”, “make the intro red”, “add a 3-column table”"
                : "What should I build from your files? — a report, a paper, a question bank…"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={busy}
            rows={2}
            className="placeholder:text-muted-foreground/70 max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none disabled:opacity-50"
          />
          <Button
            onClick={send}
            disabled={busy || !input.trim()}
            size="sm"
            className="h-8 shrink-0"
          >
            {busy ? "…" : "Send"}
          </Button>
        </div>
        <p className="text-muted-foreground/70 mt-1.5 px-1 text-[11px]">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}

function ChatBubble({
  role,
  content,
}: {
  role: "user" | "assistant" | "system";
  content: string;
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-primary text-primary-foreground max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md px-3.5 py-2 text-sm leading-relaxed shadow-sm">
          {content}
        </div>
      </div>
    );
  }
  if (role === "system") {
    return (
      <div className="bg-destructive/10 text-destructive max-w-[92%] whitespace-pre-wrap rounded-lg border border-destructive/20 px-3 py-2 text-xs">
        {content}
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="bg-card border-border max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md border px-3.5 py-2 text-sm leading-relaxed">
        {content}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-current"
          style={{
            animation: "ros-bounce 1.2s infinite",
            animationDelay: `${i * 0.15}s`,
            opacity: 0.4,
          }}
        />
      ))}
      <style>{`@keyframes ros-bounce{0%,80%,100%{transform:translateY(0);opacity:.3}40%{transform:translateY(-3px);opacity:1}}`}</style>
    </span>
  );
}

// Minimal SSE reader: parses `event:` / `data:` lines and dispatches.
async function readSse(
  body: ReadableStream<Uint8Array>,
  handlers: Record<string, (data: unknown) => void>,
) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let event = "message";
  const dataLines: string[] = [];

  const flush = () => {
    if (dataLines.length === 0) return;
    const raw = dataLines.join("\n");
    dataLines.length = 0;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // ignore malformed lines
      event = "message";
      return;
    }
    handlers[event]?.(parsed);
    event = "message";
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (line === "") {
        flush();
      } else if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }
  }
  flush();
}
