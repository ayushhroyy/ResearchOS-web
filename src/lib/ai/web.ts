// Shared Serper web search. Used by /api/web (standalone) AND by the agent
// generate/edit loops as a tool the model can call mid-generation.
//
// Key is read from SERPER_API_KEY. Returns title/url/snippet per result.
// All fetch — edge-safe.

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

const SERPER_ENDPOINT = "https://google.serper.dev/search";

/**
 * Run a web search. Returns up to `num` organic results.
 * Throws on missing key or non-2xx.
 */
export async function webSearch(
  query: string,
  num = 6,
): Promise<WebResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) {
    throw new Error("SERPER_API_KEY not configured");
  }

  const res = await fetch(SERPER_ENDPOINT, {
    method: "POST",
    headers: {
      "X-API-KEY": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`serper ${res.status}: ${t.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    organic?: { title: string; link: string; snippet?: string }[];
  };

  return (data.organic ?? []).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet ?? "",
  }));
}
