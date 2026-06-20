// Greedy text chunker for RAG.
// Packs paragraphs into chunks up to `target` chars, then seeds the NEXT
// chunk with a tail of the previous paragraph for overlap so context isn't
// lost across boundaries.

export interface Chunk {
  ordinal: number;
  content: string;
}

const TARGET = 1500; // ~500 tokens
const OVERLAP = 200;

export function chunkText(
  text: string,
  opts: { target?: number; overlap?: number } = {},
): Chunk[] {
  const target = opts.target ?? TARGET;
  const overlap = opts.overlap ?? OVERLAP;

  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  // Paragraphs (split on blank lines), falling back to single lines.
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const blocks = paragraphs.length
    ? paragraphs
    : normalized.split("\n").map((l) => l.trim()).filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  // Tail of the last committed chunk, prepended to the next one for overlap.
  let overlapSeed = "";

  for (const block of blocks) {
    const piece = overlapSeed ? `${overlapSeed}\n\n${block}` : block;
    const candidate = current ? `${current}\n\n${piece}` : piece;

    if (candidate.length <= target) {
      current = candidate;
      continue;
    }

    // Block doesn't fit → flush current and start fresh from `piece`.
    if (current) {
      chunks.push(current);
      overlapSeed = takeTail(current, overlap);
    } else {
      // `piece` alone already exceeds target → flush it as-is.
      chunks.push(piece);
      overlapSeed = takeTail(piece, overlap);
    }
    current = overlapSeed ? overlapSeed : "";
  }
  if (current.trim()) chunks.push(current);

  return chunks.map((content, i) => ({ ordinal: i, content }));
}

function takeTail(s: string, n: number): string {
  if (s.length <= n) return "";
  const tail = s.slice(-n);
  const sp = tail.indexOf(" ");
  return sp === -1 ? tail : tail.slice(sp + 1);
}
