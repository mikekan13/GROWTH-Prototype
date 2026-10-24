/**
 * A being's spoken line is stored as the words alone (HW3 2026-10-24: Violet's
 * Say came out as `"It's still warm."` and the feed, which already paints
 * speech, showed the quote marks). The model wraps `Say:` content in quotes
 * about half the time; the marks are not hers. Pure.
 */

const OPEN = new Set(['"', '“', '„', '«']);
const CLOSE = new Set(['"', '”', '»']);
const ANY_DOUBLE = /["“”„«»]/;

/**
 * Strip ONE pair of quote marks that wraps the whole line. A quote inside the
 * line (`"Yes," she said, "now."`) stays — only a wrapper comes off, and only
 * when nothing else in the line is quoted. A lone leading quote with no
 * partner (the model stopped early) comes off too.
 */
export function stripSpeechQuotes(text: string): string {
  const t = text.trim();
  if (t.length < 2) return t;
  const first = t[0];
  const last = t[t.length - 1];
  if (OPEN.has(first) && CLOSE.has(last)) {
    const inner = t.slice(1, -1).trim();
    return ANY_DOUBLE.test(inner) ? t : inner;
  }
  if (OPEN.has(first) && !ANY_DOUBLE.test(t.slice(1))) return t.slice(1).trim();
  return t;
}
