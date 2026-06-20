"use client";
// Upload + ingest flow:
//   1. user picks files
//   2. for each: GET /api/upload-token → PUT file to Supabase Storage →
//      POST /api/ingest { sourceId } (OCR + chunk + embed)
//   3. onDone() lets the parent refresh the sources list
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthProvider";

export interface UploadItem {
  name: string;
  status: "uploading" | "processing" | "ready" | "error";
  message?: string;
}

export function UploadZone({ onDone }: { onDone?: () => void }) {
  const { session } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!session) {
        toast.error("Sign in first");
        return;
      }
      const list = Array.from(files);
      const token = session.access_token;

      const staged: UploadItem[] = list.map((f) => ({
        name: f.name,
        status: "uploading",
      }));
      setItems((prev) => [...staged, ...prev]);

      await Promise.all(
        list.map(async (file, i) => {
          const patch = (p: Partial<UploadItem>) =>
            setItems((prev) =>
              prev.map((it, j) =>
                j === prev.length - staged.length + i ? { ...it, ...p } : it,
              ),
            );

          try {
            // 1. request upload token + sources row
            const tRes = await fetch("/api/upload-token", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                name: file.name,
                mimeType: file.type || "application/octet-stream",
                bytes: file.size,
              }),
            });
            if (!tRes.ok) throw new Error("upload token failed");
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
            if (!upRes.ok) throw new Error("upload to storage failed");

            // 3. ingest: OCR + chunk + embed
            patch({ status: "processing", message: "Reading & indexing…" });
            const iRes = await fetch("/api/ingest", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
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
    [session, onDone],
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
        className={`rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors ${
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
        }`}
      >
        <div className="font-medium">Drop files or click to upload</div>
        <div className="text-muted-foreground mt-1 text-xs">
          Images, PDFs, text &amp; markdown notes
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
        <ul className="text-sm space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="truncate flex-1">{it.name}</span>
              <StatusPill status={it.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: UploadItem["status"] }) {
  const map = {
    uploading: { t: "Uploading", c: "text-muted-foreground" },
    processing: { t: "Indexing", c: "text-amber-600" },
    ready: { t: "Ready", c: "text-emerald-600" },
    error: { t: "Error", c: "text-destructive" },
  }[status];
  return <span className={`text-xs ${map.c}`}>{map.t}</span>;
}
