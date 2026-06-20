// aimlapi client — aimlapi is OpenAI-compatible, so we use the `openai` SDK
// with a custom baseURL. One client serves chat, vision, embeddings, and OCR.
//
// All requests are HTTP (fetch) — safe on the Cloudflare edge runtime.
import OpenAI from "openai";

export const AI_BASE_URL =
  process.env.AIMLAPI_BASE_URL ?? "https://api.aimlapi.com/v1";

export const AI_KEY = process.env.AIMLAPI_KEY ?? "";

export const AI_MODELS = {
  chat: process.env.AIMLAPI_CHAT_MODEL ?? "gpt-4o-mini",
  vision: process.env.AIMLAPI_VISION_MODEL ?? "gpt-4o-mini",
  ocr: process.env.AIMLAPI_OCR_MODEL ?? "mistral-ocr-latest",
  embedding: process.env.AIMLAPI_EMBEDDING_MODEL ?? "text-embedding-3-small",
} as const;

export const EMBEDDING_DIM = Number(
  process.env.AIMLAPI_EMBEDDING_DIM ?? 1024,
);

// Lazily built so importing this module never throws in environments
// without a key (e.g. during `next build` type-check).
let _client: OpenAI | null = null;
export function aiClient(): OpenAI {
  if (!_client) {
    if (!AI_KEY) {
      throw new Error(
        "AIMLAPI_KEY is not set. Copy .env.example → .env.local and fill it in.",
      );
    }
    _client = new OpenAI({ baseURL: AI_BASE_URL, apiKey: AI_KEY });
  }
  return _client;
}
