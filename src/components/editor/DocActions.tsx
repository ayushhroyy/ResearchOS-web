"use client";
// Document actions: export to Markdown, print-to-PDF, and inject web-search
// references. Rendered in the editor pane header.
import { useState } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { docToMarkdown, downloadMarkdown } from "@/lib/doc/serialize-md";
import type { TipTapDoc } from "@/lib/doc/schema";

export interface WebRef {
  title: string;
  url: string;
  snippet: string;
}

export interface DocActionsProps {
  title: string;
  doc: TipTapDoc | null;
  /** Called with web-search results so the parent can append them as a
   *  references section in the document. */
  onAddWebRefs?: (refs: WebRef[]) => void;
}

export function DocActions({ title, doc, onAddWebRefs }: DocActionsProps) {
  const [searching, setSearching] = useState(false);
  const [webQuery, setWebQuery] = useState("");

  const hasDoc = !!doc && (doc.content?.length ?? 0) > 0;

  const exportMd = () => {
    if (!hasDoc || !doc) {
      toast.error("Nothing to export yet");
      return;
    }
    downloadMarkdown(title || "document", docToMarkdown(doc));
  };

  const exportPdf = () => {
    if (!hasDoc) {
      toast.error("Nothing to export yet");
      return;
    }
    // Client-side PDF via the browser's print dialog. The print CSS in
    // globals.css scopes printing to the editor content.
    window.print();
  };

  const runWebSearch = async () => {
    if (!webQuery.trim() || !onAddWebRefs) return;
    setSearching(true);
    try {
      const res = await fetch("/api/web", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: webQuery, num: 6 }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "search failed");
      }
      const { results } = (await res.json()) as { results: WebRef[] };
      if (results.length === 0) {
        toast("No web results found");
      } else {
        onAddWebRefs(results);
        toast.success(`Added ${results.length} references`);
      }
      setWebQuery("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "search failed");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {onAddWebRefs && (
        <div className="bg-card focus-within:ring-ring/30 flex items-center gap-1 rounded-lg border px-2 py-1 focus-within:ring-2">
          <SearchIcon />
          <input
            placeholder="Add web references…"
            value={webQuery}
            onChange={(e) => setWebQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runWebSearch()}
            disabled={searching || !hasDoc}
            className="placeholder:text-muted-foreground/60 h-7 w-36 bg-transparent text-xs outline-none"
          />
          <button
            type="button"
            onClick={runWebSearch}
            disabled={searching || !hasDoc || !webQuery.trim()}
            className="text-primary hover:text-primary/80 h-7 px-1.5 text-xs font-medium disabled:opacity-40"
          >
            {searching ? "…" : "Search"}
          </button>
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger className="hover:bg-accent text-muted-foreground hover:text-foreground inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors">
          <DownloadIcon />
          Export
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={exportMd}>Markdown (.md)</DropdownMenuItem>
          <DropdownMenuItem onClick={exportPdf}>PDF (print)</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="text-muted-foreground shrink-0">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
