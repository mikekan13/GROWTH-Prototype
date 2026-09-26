/**
 * Term-frequency vectors + cosine — the v0 "words" step shared by identity
 * probes and ladder recall. Pure; swap for an embedding service without
 * changing callers.
 */
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'is', 'am', 'are', 'was', 'i', 'my', 'me', 'it', 'that', 'this', 'for', 'with', 'be', 'as', 'you', 'your', 'not', 'but', 'so', 'do', 'if', 'would', 'what', 'who', 'they', 'them', 'their', 'have', 'has', 'had']);

export function vectorize(text: string): Map<string, number> {
  const v = new Map<string, number>();
  for (const raw of text.toLowerCase().split(/[^a-z']+/)) {
    const t = raw.replace(/'s$/, '');
    if (t.length < 3 || STOP.has(t)) continue;
    v.set(t, (v.get(t) ?? 0) + 1);
  }
  return v;
}

export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, na = 0, nb = 0;
  for (const [k, x] of a) { na += x * x; const y = b.get(k); if (y) dot += x * y; }
  for (const [, y] of b) nb += y * y;
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
