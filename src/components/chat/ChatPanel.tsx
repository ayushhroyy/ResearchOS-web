"use client";
// The chat panel (middle pane). Two modes:
//   - generate: a query with no active document → /api/generate (SSE)
//   - edit:     a message with an active document → /api/edit (Phase 3)
//
// Controlled by the page: document + title state live one level up so the
// editor pane (right) and this chat pane (middle) stay in sync.
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const { session } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi! Upload some files to your knowledge cluster, then tell me what to build — a report, a paper, a question bank. I'll generate it here.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !session || busy) return;

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
            Authorization: `Bearer ${session.access_token}`,
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
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ query: text }),
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "generate failed");
        }
        await readSse(res.body, {
          title: (d) => onTitle((d as { title: string }).title),
          done: (d) => {
            onDoc((d as { doc: TipTapDoc }).doc);
            setMessages((m) => [
              ...m,
              {
                role: "assistant",
                content:
                  "Done — your document is in the editor on the right. Ask for edits to refine it.",
              },
            ]);
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
    }
  }, [input, session, busy, doc, onDoc, onTitle, applyEdits]);

  const hasDoc = !!doc && (doc.content?.length ?? 0) > 0;

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground ml-auto"
                  : m.role === "system"
                    ? "bg-muted text-muted-foreground"
                    : "bg-muted"
              }`}
            >
              {m.content}
            </div>
          ))}
          {busy && (
            <div className="bg-muted max-w-[90%] rounded-lg px-3 py-2 text-sm">
              <span className="animate-pulse">Working…</span>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-border flex gap-2 border-t p-3">
        <Input
          placeholder={
            hasDoc
              ? "Ask for an edit… (e.g. add a section on dogs)"
              : "What should I build from your files?"
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={busy}
        />
        <Button onClick={send} disabled={busy}>
          {busy ? "…" : "Send"}
        </Button>
      </div>
    </div>
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
    try {
      handlers[event]?.(JSON.parse(raw));
    } catch {
      // ignore malformed lines
    }
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
