/**
 * Pure shaping for the ticker's tidbits: sampling a pool of data-derived lines (no I/O, client-safe, tested).
 */

/** Data-derived lines, grouped by where they came from; every list may be empty. */
export interface TidbitPool {
  facts?: string[];
  memories?: string[];
  beings?: string[];
  places?: string[];
  things?: string[];
  history?: string[];
}

/** FALLBACK ONLY — a tiny generic set, used to fill when a campaign has too little data. At most six lines. */
export const FALLBACK_TIDBITS: readonly string[] = [
  'KRMA is the only currency.',
  'Everything is a container, all the way down.',
  'A person is Body, Spirit and Soul.',
  'Death takes only Frequency.',
  'Memory is fallible. The record is not.',
  'Every character begins with a story.',
];

export const TIDBIT_COUNT = 12;
const MIN_REAL = 3;

export function clip(text: string, max = 180): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 40))}…`;
}

function shuffle<T>(xs: T[], random: () => number): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * ~12 lines, sampled at random but spread across the pool's kinds (round-robin over shuffled groups), so one
 * big list (a hundred memories) does not drown the rest. Under MIN_REAL real lines, the fallback fills the gap
 * and `fallback` is true.
 */
export function sampleTidbits(pool: TidbitPool, random: () => number = Math.random, count = TIDBIT_COUNT): { tidbits: string[]; fallback: boolean } {
  const groups = (Object.values(pool) as Array<string[] | undefined>).map((g) => shuffle([...new Set((g ?? []).filter((s) => s && s.trim()))], random)).filter((g) => g.length > 0);
  const out: string[] = [];
  while (out.length < count && groups.some((g) => g.length > 0)) {
    for (const g of shuffle(groups, random)) {
      const next = g.shift();
      if (next !== undefined && out.length < count) out.push(next);
    }
  }
  const real = out.length;
  if (real >= MIN_REAL) return { tidbits: shuffle(out, random), fallback: false };
  const fill = shuffle([...FALLBACK_TIDBITS], random).slice(0, Math.max(0, count - real));
  return { tidbits: shuffle([...out, ...fill], random), fallback: true };
}
