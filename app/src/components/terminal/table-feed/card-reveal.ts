/**
 * A being's card is shown ONCE, typed out at reading speed (ruling 10, 2026-11-04), and never rewritten.
 * Pure + a tiny registry: the terminal reports the card ids it sees; the first sighting after the feed has
 * been seeded (history loaded) starts the reveal clock; every later render derives how much to show from
 * the clock, so a refetch, a remount or a strict-mode double render never re-types a card.
 */
import type { FeedSegment } from '@/lib/feed-segments';

export const CARD_MS_PER_CHAR = 18;
export const CARD_MAX_MS = 6000;

/** How long a card of this many characters takes to type out (capped). */
export function revealDuration(totalChars: number): number {
  return Math.min(CARD_MAX_MS, Math.max(0, totalChars) * CARD_MS_PER_CHAR);
}

/** How many characters are visible `elapsedMs` after the start. */
export function revealChars(totalChars: number, elapsedMs: number): number {
  const d = revealDuration(totalChars);
  if (d <= 0 || elapsedMs >= d) return totalChars;
  return Math.max(0, Math.floor((elapsedMs / d) * totalChars));
}

export function segmentChars(segments: FeedSegment[]): number {
  return segments.reduce((n, s) => n + s.text.length, 0);
}

/** Cut segments to the first `chars` characters (a segment cut to nothing is dropped). */
export function truncateSegments(segments: FeedSegment[], chars: number): FeedSegment[] {
  const out: FeedSegment[] = [];
  let left = chars;
  for (const s of segments) {
    if (left <= 0) break;
    out.push(s.text.length <= left ? s : { ...s, text: s.text.slice(0, left) });
    left -= s.text.length;
  }
  return out;
}

export interface CardReveal {
  /** Report the card ids now on screen. Returns the ids newly seen that will be typed (none while seeding). */
  observe(ids: string[], now?: number): string[];
  /** Reveal start (ms epoch) for a card that is being typed, else undefined. */
  startOf(id: string): number | undefined;
  /** Forget everything and treat the next observation as history (view changed). */
  reset(): void;
}

const MAX_STORED = 500;

function readStored(key: string | undefined): string[] {
  if (!key) return [];
  try {
    const raw = sessionStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

function writeStored(key: string | undefined, ids: Set<string>): void {
  if (!key) return;
  try { sessionStorage.setItem(key, JSON.stringify([...ids].slice(-MAX_STORED))); } catch { /* memory only */ }
}

/** `storageKey` (e.g. per campaign) persists shown ids in sessionStorage so a reload does not re-type history. */
export function createCardReveal(storageKey?: string): CardReveal {
  let shown = new Set<string>(readStored(storageKey));
  const starts = new Map<string, number>();
  let seeded = false;
  return {
    observe(ids, now = Date.now()) {
      const fresh: string[] = [];
      let changed = false;
      for (const id of ids) {
        if (shown.has(id)) continue;
        shown.add(id);
        changed = true;
        if (seeded) { starts.set(id, now); fresh.push(id); }
      }
      seeded = true;
      if (changed) {
        if (shown.size > MAX_STORED * 2) shown = new Set([...shown].slice(-MAX_STORED));
        writeStored(storageKey, shown);
      }
      return fresh;
    },
    startOf: (id) => starts.get(id),
    reset() { starts.clear(); seeded = false; shown = new Set(readStored(storageKey)); },
  };
}
