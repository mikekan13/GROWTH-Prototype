// Finding 80 (2026-11-05): words a being types or says inside an act are its own words, never a claim about the world.

const QUOTE_RE = /["“]([^"“”]*)["”]/g;

/** The first double-quoted run that carries a letter or digit, trimmed; undefined when there is none. Pure. */
export function firstQuotedWords(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  for (const m of text.matchAll(QUOTE_RE)) {
    const w = m[1].trim();
    if (/[\p{L}\p{N}]/u.test(w)) return w;
  }
  return undefined;
}

/** The text with every double-quoted run removed: what the grounding check judges (a quoted word is never a world claim). Pure. */
export function withoutQuotedRuns(text: string): string {
  return text.replace(QUOTE_RE, ' ').replace(/\s{2,}/g, ' ').trim();
}
