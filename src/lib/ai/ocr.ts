// OCR via aimlapi's /v1/ocr endpoint (Mistral OCR).
//
// aimlapi's OCR takes a *URL* (image_url or document_url), not raw bytes.
// So the caller must first place the file somewhere fetchable and pass us
// a signed URL (e.g. a Supabase Storage signed URL). We POST to /v1/ocr and
// stitch the per-page markdown into one string.
//
// All HTTP (fetch) — edge-safe.
import { AI_BASE_URL, AI_KEY, AI_MODELS } from "./client";

interface OcrPage {
  index: number;
  markdown: string;
  images?: unknown[];
  dimensions?: { dpi: number; height: number; width: number };
}
interface OcrResponse {
  pages?: OcrPage[];
  model?: string;
  usage_info?: { pages_processed?: number; doc_size_bytes?: number };
  detail?: string; // present on error
}

/**
 * Run OCR on a document/image reachable at `url`.
 * @param url     publicly fetchable URL (Supabase signed URL, etc.)
 * @param kind    "image" | "pdf" — decides the document.type field
 */
export async function ocrUrl(
  url: string,
  kind: "image" | "pdf",
): Promise<string> {
  const document =
    kind === "image"
      ? { type: "image_url", image_url: url }
      : { type: "document_url", document_url: url };

  const res = await fetch(`${AI_BASE_URL}/ocr`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: AI_MODELS.ocr, document }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OCR failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as OcrResponse;
  const pages = data.pages ?? [];
  if (pages.length === 0) {
    throw new Error("OCR returned no pages");
  }
  // Join pages with a blank line; strip trailing image placeholders.
  return pages
    .map((p) => p.markdown.trim())
    .filter(Boolean)
    .join("\n\n");
}
