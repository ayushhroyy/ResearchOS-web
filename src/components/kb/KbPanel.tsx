"use client";
// Knowledge cluster panel: lists indexed sources, lets you test retrieval.
import { useCallback, useEffect, useState } from "react";
import { UploadZone } from "@/components/upload/UploadZone";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Source {
  id: string;
  name: string;
  kind: "image" | "pdf" | "note";
  status: "pending" | "processing" | "ready" | "error";
  bytes: number | null;
  error: string | null;
}

interface SearchResult {
  chunkId: string;
  sourceId: string;
  sourceName: string;
  content: string;
  ordinal: number;
  similarity: number;
}

const KIND_LABEL = { image: "IMG", pdf: "PDF", note: "TXT" } as const;

export function KbPanel() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // loadSources does the fetch + state updates as one async unit. We avoid
  // any synchronous setState in the effect body (React 19 rule) by setting
  // loading=false INSIDE the awaited promise resolution instead of a .finally.
  const loadSources = useCallback(async () => {
    const res = await fetch("/api/sources");
    if (res.ok) {
      const { sources } = (await res.json()) as { sources: Source[] };
      setSources(sources);
      setLoadError(null);
    } else {
      const body = await res.json().catch(() => null);
      setLoadError(typeof body?.error === "string" ? body.error : "could not load sources");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Initial fetch on mount/auth-change. setState happens inside the async
    // callback, not synchronously here — but the rule can't see through the
    // await, so we scope it to this line.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSources();
  }, [loadSources]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await loadSources();
    setLoading(false);
  }, [loadSources]);

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setResults(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, matchCount: 6 }),
      });
      if (!res.ok) throw new Error("search failed");
      const { results } = (await res.json()) as { results: SearchResult[] };
      setResults(results);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-5">
      <section>
        <SectionLabel>Add files</SectionLabel>
        <UploadZone onDone={refresh} />
      </section>

      <section className="min-h-0 flex-1">
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Indexed sources</SectionLabel>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground text-[11px] font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "…" : "Refresh"}
          </button>
        </div>
        <ScrollArea className="h-[32vh]">
          {loadError ? (
            <div className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-xs">
              {loadError}
            </div>
          ) : sources.length === 0 ? (
            <div className="border-border/60 text-muted-foreground/70 rounded-lg border border-dashed py-6 text-center text-xs">
              Nothing indexed yet. Drop a file above.
            </div>
          ) : (
            <ul className="space-y-1">
              {sources.map((s) => (
                <li
                  key={s.id}
                  className="hover:bg-accent/50 group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                >
                  <span className="bg-muted text-muted-foreground inline-flex h-5 w-8 shrink-0 items-center justify-center rounded text-[9px] font-semibold tracking-wide">
                    {KIND_LABEL[s.kind]}
                  </span>
                  <span className="truncate flex-1" title={s.name}>
                    {s.name}
                  </span>
                  <StatusDot status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </section>

      <section>
        <SectionLabel>Test retrieval</SectionLabel>
        <div className="bg-card focus-within:ring-ring/30 flex items-center gap-1 rounded-lg border p-1.5 focus-within:ring-2">
          <input
            placeholder="Query your cluster…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            className="placeholder:text-muted-foreground/60 h-7 flex-1 bg-transparent px-1.5 text-xs outline-none"
          />
          <Button
            size="sm"
            onClick={runSearch}
            disabled={searching}
            className="h-7 text-xs"
          >
            {searching ? "…" : "Search"}
          </Button>
        </div>
        {results && (
          <div className="mt-2 space-y-2">
            {results.length === 0 ? (
              <p className="text-muted-foreground/70 text-xs">
                No matches — upload more files or rephrase.
              </p>
            ) : (
              results.map((r) => (
                <div
                  key={r.chunkId}
                  className="bg-card border-border/70 rounded-lg border p-2.5 text-xs"
                >
                  <div className="text-muted-foreground mb-1 flex items-center gap-2">
                    <span className="truncate font-medium">{r.sourceName}</span>
                    <span className="opacity-40">·</span>
                    <span>#{r.ordinal}</span>
                    <span className="text-primary ml-auto font-medium">
                      {(r.similarity * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-muted-foreground line-clamp-4 leading-relaxed">
                    {r.content}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-muted-foreground mb-2 text-[11px] font-semibold uppercase tracking-wider">
      {children}
    </h3>
  );
}

function StatusDot({
  status,
}: {
  status: "pending" | "processing" | "ready" | "error";
}) {
  const map = {
    ready: { c: "bg-emerald-500", t: "" },
    processing: { c: "bg-amber-500 animate-pulse", t: "" },
    pending: { c: "bg-muted-foreground/40", t: "" },
    error: { c: "bg-destructive", t: "" },
  }[status];
  return (
    <span className="h-1.5 w-1.5 shrink-0 rounded-full" title={status}>
      <span className={`block h-full w-full rounded-full ${map.c}`} />
    </span>
  );
}
