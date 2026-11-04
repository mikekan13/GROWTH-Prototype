/**
 * roster-match: resolve a misspelled name (e.g. speech-to-text "Christopher")
 * to the roster character it means ("Kristopher"). A near miss on a known name
 * is that person, not a question. Pure: no I/O, no DB, no word lists; everything
 * is derived from the roster passed in.
 *
 * Integration (to be wired by the caller): table-prose.ts `sentenceActor` and the
 * JEWL referent read in table-referents.ts should call `nearestRosterName` when no
 * exact roster name matches.
 */

export interface RosterName { id: string; name: string }

/** Damerau-Levenshtein (optimal string alignment): a transposition counts 1. */
function dl(a: string, b: string): number {
  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** Tiny phonetic normalizer for K/C/Ch and ph/f slips. */
function norm(s: string): string {
  return s.toLowerCase()
    .replace(/ph/g, 'f')
    .replace(/^ch/, 'k')
    .replace(/^c(?=[^aeiou])/, 'k')
    .replace(/(.)\1+/g, '$1');
}

function threshold(len: number): number {
  return len >= 9 ? 3 : len >= 6 ? 2 : len >= 4 ? 1 : -1;
}

/** The token with a trailing possessive removed, plus the token itself. */
function forms(token: string): string[] {
  const t = token.toLowerCase();
  const out = [t];
  const m = t.match(/^(.+?)['’]s$/);
  if (m) out.push(m[1]);
  else if (t.endsWith('s') && t.length > 1) out.push(t.slice(0, -1));
  return out;
}

export function nearestRosterName(token: string, roster: RosterName[]): RosterName | null {
  const fs = forms(token);
  const exact = roster.find(r => {
    const full = r.name.toLowerCase();
    return fs.some(f => f === full || f === full.split(/\s+/)[0]);
  });
  if (exact) return exact;

  const scored: Array<{ entry: RosterName; raw: number }> = [];
  for (const entry of roster) {
    const names = [entry.name, entry.name.trim().split(/\s+/)[0]];
    let best = Infinity;
    for (const f of fs) {
      if (f.length < 4) continue;
      const max = threshold(f.length);
      for (const n of names) {
        const nl = n.toLowerCase();
        const raw = dl(f, nl);
        if (raw <= max) best = Math.min(best, raw);
        else if (dl(norm(f), norm(nl)) <= max) best = Math.min(best, raw);
      }
    }
    if (best !== Infinity) scored.push({ entry, raw: best });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => a.raw - b.raw);
  if (scored.length > 1 && scored[1].raw - scored[0].raw <= 1) return null;
  return scored[0].entry;
}

export function rosterNamesIn(
  text: string,
  roster: RosterName[],
): Array<{ token: string; index: number; entry: RosterName; exact: boolean }> {
  const hits: Array<{ token: string; index: number; entry: RosterName; exact: boolean }> = [];
  for (const m of text.matchAll(/\b[A-Z][a-z’']+\b/g)) {
    const entry = nearestRosterName(m[0], roster);
    if (!entry) continue;
    const low = m[0].toLowerCase();
    const full = entry.name.toLowerCase();
    hits.push({ token: m[0], index: m.index ?? 0, entry, exact: low === full || low === full.split(/\s+/)[0] });
  }
  return hits;
}
