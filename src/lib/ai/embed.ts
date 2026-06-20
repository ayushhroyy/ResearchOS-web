// Embeddings via aimlapi. Returns a single vector for one input, or a batch.
import { aiClient, AI_MODELS } from "./client";

export async function embed(text: string): Promise<number[]> {
  const { data } = await aiClient().embeddings.create({
    model: AI_MODELS.embedding,
    input: text,
  });
  return data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { data } = await aiClient().embeddings.create({
    model: AI_MODELS.embedding,
    input: texts,
  });
  return data.map((d) => d.embedding);
}
