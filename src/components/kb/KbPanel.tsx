"use client";
// Knowledge cluster panel: lists indexed sources, lets you test retrieval.
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { UploadZone } from "@/components/upload/UploadZone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

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
  const { session } = useAuth();
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  // loadSources does the fetch + state updates as one async unit. We avoid
  // any synchronous setState in the effect body (React 19 rule) by setting
  // loading=false INSIDE the awaited promise resolution instead of a .finally.
  const loadSources = useCallback(async (token: string) => {
    const res = await fetch("/api/sources", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const { sources } = (await res.json()) as { sources: Source[] };
      setSources(sources);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!session) return;
    // Initial fetch on mount/auth-change. setState happens inside the async
    // callback, not synchronously here — but the rule can't see through the
    // await, so we scope it to this line.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSources(session.access_token);
  }, [session, loadSources]);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    await loadSources(session.access_token);
    setLoading(false);
  }, [session, loadSources]);

  const runSearch = async () => {
    if (!session || !query.trim()) return;
    setSearching(true);
    setResults(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
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
    <div className="flex h-full flex-col gap-4">
      <section>
        <h3 className="mb-2 text-sm font-semibold">Add to knowledge cluster</h3>
        <UploadZone onDone={refresh} />
      </section>

      <section className="min-h-0 flex-1">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Sources</h3>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            {loading ? "…" : "Refresh"}
          </Button>
        </div>
        <ScrollArea className="h-[35vh]">
          {sources.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No files yet. Upload something to build your cluster.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {sources.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="text-[10px]">
                    {KIND_LABEL[s.kind]}
                  </Badge>
                  <span className="truncate flex-1" title={s.name}>
                    {s.name}
                  </span>
                  <span
                    className={
                      s.status === "ready"
                        ? "text-xs text-emerald-600"
                        : s.status === "error"
                          ? "text-xs text-destructive"
                          : "text-muted-foreground text-xs"
                    }
                  >
                    {s.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Test retrieval</h3>
        <div className="flex gap-2">
          <Input
            placeholder="Ask something from your files…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
          />
          <Button size="sm" onClick={runSearch} disabled={searching}>
            {searching ? "…" : "Search"}
          </Button>
        </div>
        {results && (
          <div className="mt-2 space-y-2">
            {results.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No matches. Upload more files or try another query.
              </p>
            ) : (
              results.map((r) => (
                <div
                  key={r.chunkId}
                  className="border-border bg-muted/30 rounded-md border p-2 text-xs"
                >
                  <div className="text-muted-foreground mb-1 flex items-center gap-2">
                    <span className="font-medium">{r.sourceName}</span>
                    <span>· chunk {r.ordinal}</span>
                    <span>· {(r.similarity * 100).toFixed(0)}%</span>
                  </div>
                  <p className="line-clamp-4">{r.content}</p>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
