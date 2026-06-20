"use client";
// Document actions: export to Markdown, print-to-PDF, and inject web-search
// references. Rendered in the editor pane header.
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const { session } = useAuth();
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
    if (!session || !webQuery.trim() || !onAddWebRefs) return;
    setSearching(true);
    try {
      const res = await fetch("/api/web", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
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
        <div className="flex items-center gap-1">
          <Input
            placeholder="Web references…"
            value={webQuery}
            onChange={(e) => setWebQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runWebSearch()}
            disabled={searching || !hasDoc}
            className="h-8 w-44 text-xs"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={runWebSearch}
            disabled={searching || !hasDoc || !webQuery.trim()}
            className="h-8 text-xs"
          >
            {searching ? "…" : "Web"}
          </Button>
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium hover:bg-accent">
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
