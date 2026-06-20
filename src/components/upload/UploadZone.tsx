"use client";
// Upload + ingest flow:
//   1. user picks files
//   2. for each: GET /api/upload-token → PUT file to Supabase Storage →
//      POST /api/ingest { sourceId } (OCR + chunk + embed)
//   3. onDone() lets the parent refresh the sources list
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

export interface UploadItem {
  id: string;
  name: string;
  status: "uploading" | "processing" | "ready" | "error";
  message?: string;
}

export function UploadZone({ onDone }: { onDone?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);

      const staged: UploadItem[] = list.map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        status: "uploading",
      }));
      setItems((prev) => [...staged, ...prev]);

      await Promise.all(
        list.map(async (file, i) => {
          const itemId = staged[i].id;
          const patch = (p: Partial<UploadItem>) =>
            setItems((prev) =>
              prev.map((it) => (it.id === itemId ? { ...it, ...p } : it)),
            );

          try {
            // 1. request upload token + sources row
            const tRes = await fetch("/api/upload-token", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                name: file.name,
                mimeType: file.type || "application/octet-stream",
                bytes: file.size,
              }),
            });
            if (!tRes.ok) throw new Error(await responseError(tRes, "upload token failed"));
            const t = await tRes.json();

            // 2. PUT the bytes directly to Supabase Storage
            const upRes = await fetch(t.uploadUrl, {
              method: "PUT",
              headers: {
                "Content-Type": file.type || "application/octet-stream",
                "x-upsert": "true",
              },
              body: file,
            });
            if (!upRes.ok) throw new Error(await responseError(upRes, "upload to storage failed"));

            // 3. ingest: OCR + chunk + embed
            patch({ status: "processing", message: "Reading & indexing…" });
            const iRes = await fetch("/api/ingest", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ sourceId: t.sourceId }),
            });
            if (!iRes.ok) {
              const j = await iRes.json().catch(() => ({}));
              throw new Error(j.error ?? "ingest failed");
            }
            patch({ status: "ready", message: undefined });
            toast.success(`Indexed ${file.name}`);
          } catch (err) {
            const message = err instanceof Error ? err.message : "failed";
            patch({ status: "error", message });
            toast.error(`${file.name}: ${message}`);
          }
        }),
      );

      onDone?.();
    },
    [onDone],
  );

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        className={`group relative w-full rounded-xl border border-dashed p-5 text-center text-sm transition-all ${
          dragging
            ? "border-primary bg-primary/10 ring-ring/40 ring-2"
            : "border-border/70 hover:border-primary/40 hover:bg-accent/30"
        }`}
      >
        <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground transition-transform group-hover:scale-105">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 16V4m0 0 4 4m-4-4-4 4M5 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="font-medium">Drop files or click to upload</div>
        <div className="text-muted-foreground/70 mt-0.5 text-xs">
          Images · PDFs · text &amp; markdown
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,text/*,.md,.txt"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </button>

      {items.length > 0 && (
        <ul className="space-y-1 text-sm">
          {items.map((it, i) => (
            <li
              key={it.id}
              className="hover:bg-accent/40 flex items-center gap-2 rounded-md px-2 py-1.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate" title={it.name}>
                  {it.name}
                </span>
                {it.message && (
                  <span className="text-muted-foreground/70 block truncate text-xs" title={it.message}>
                    {it.message}
                  </span>
                )}
              </span>
              <StatusPill status={it.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function responseError(res: Response, fallback: string) {
  const body = await res.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : fallback;
}

function StatusPill({ status }: { status: UploadItem["status"] }) {
  const map = {
    uploading: { t: "Uploading", dot: "bg-muted-foreground/50" },
    processing: { t: "Indexing", dot: "bg-amber-500 animate-pulse" },
    ready: { t: "Ready", dot: "bg-emerald-500" },
    error: { t: "Error", dot: "bg-destructive" },
  }[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${map.dot}`} />
      {map.t}
    </span>
  );
}
