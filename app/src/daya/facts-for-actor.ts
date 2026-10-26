/**
 * Which world facts an acting being is handed (hello world 2026-10-17).
 *
 * The adjudicator used to get EVERY live fact in the campaign: 300 rows,
 * 35 KB a call, and Kristopher's trial, psychiatric care and hotel room in
 * Violet's context. Two rules fix both:
 *
 *   PRIVACY   a fact keyed to another character (`kristopher.*`) is that
 *             character's own; the actor never sees it. Facts keyed to the
 *             actor, to places and to things stay.
 *   RELEVANCE what the intent touches comes first (words of the intent in
 *             the key or the fact), then the newest; the rest is cut at the
 *             cap. Nothing hand-written per campaign — the intent itself
 *             picks the facts.
 *
 * Also here: the being's own body as the adjudicator and the scene see it —
 * what it wears and carries, split from one held-items query. Pure.
 */

export interface FactLike { subjectKey: string; fact: string }

export const ACTOR_FACTS_CAP = 60;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
/** The first segment of a subject key: `violet_apartment.door` → violet_apartment; `kitchenette:fridge` → kitchenette. */
export const subjectHead = (key: string) => key.split(/[.:]/)[0]!.toLowerCase();

const INTENT_STOP = new Set(['the', 'and', 'her', 'his', 'she', 'him', 'them', 'they', 'with', 'from', 'into', 'onto', 'then', 'that', 'this', 'toward', 'towards', 'their', 'back', 'down', 'over', 'out', 'off', 'for', 'one', 'two']);

export function factsForActor<T extends FactLike>(
  all: T[],
  opts: { actorName: string; otherNames: string[]; intent: string; cap?: number },
): T[] {
  const cap = opts.cap ?? ACTOR_FACTS_CAP;
  const me = slug(opts.actorName);
  const mine = new Set([me, me.split('_')[0]!].filter(Boolean));
  const others = new Set<string>();
  for (const n of opts.otherNames) {
    const s = slug(n);
    if (!s || mine.has(s)) continue;
    others.add(s);
    const first = s.split('_')[0]!;
    if (first && !mine.has(first)) others.add(first);
  }
  const words = (opts.intent.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !INTENT_STOP.has(w));
  const score = (f: FactLike): number => {
    const head = subjectHead(f.subjectKey);
    if (mine.has(head)) return 100;
    const text = `${f.subjectKey.replace(/[._:-]+/g, ' ')} ${f.fact}`.toLowerCase();
    let s = 0;
    for (const w of words) if (text.includes(w)) s += 1;
    return s;
  };
  const kept = all
    .map((f, i) => ({ f, i, s: others.has(subjectHead(f.subjectKey)) ? -1 : score(f) }))
    .filter((x) => x.s >= 0);
  if (kept.length <= cap) return kept.map((x) => x.f);
  // Intent-relevant first, then the newest (callers pass facts oldest-first); keep the original order among the chosen.
  const chosen = new Set(kept.slice().sort((a, b) => b.s - a.s || b.i - a.i).slice(0, cap).map((x) => x.i));
  return kept.filter((x) => chosen.has(x.i)).map((x) => x.f);
}

export interface HeldRow { name: string; data: string | null }
export interface HeldSplit { wearing: string[]; carrying: string[]; written?: Array<{ name: string; text: string }> }

const WRITTEN_CAP = 600;
/** Worn (equippedTo set on the item) vs carried, from the held-items rows; and what is written on any of them (`data.text`). Pure. */
export function splitHeld(rows: HeldRow[]): HeldSplit {
  const wearing: string[] = [];
  const carrying: string[] = [];
  const written: Array<{ name: string; text: string }> = [];
  for (const r of rows) {
    let worn = false;
    let text = '';
    try {
      const d = JSON.parse(r.data ?? '{}') as { equippedTo?: unknown; text?: unknown };
      worn = !!d.equippedTo;
      text = typeof d.text === 'string' ? d.text.replace(/[ \t]+/g, ' ').trim() : '';
    } catch { worn = false; }
    (worn ? wearing : carrying).push(r.name);
    if (text) written.push({ name: r.name, text: text.slice(0, WRITTEN_CAP) });
  }
  return { wearing, carrying, written };
}

/** The lines a being is told about its own body. Second person; nothing invented. Pure. */
export function heldLines(h: HeldSplit, opts: { written?: boolean } = {}): string[] {
  const lines: string[] = [];
  lines.push(h.wearing.length ? `You are wearing: ${h.wearing.join(', ')}.` : 'You are wearing nothing but what is on your sheet as underwear.');
  lines.push(h.carrying.length ? `You have on you: ${h.carrying.join(', ')}.` : 'You carry nothing else.');
  // What is written on a thing you hold is yours to read (HW8 2026-10-25: the being read a "Paid" stamp off a receipt
  // it had never seen; now the receipt is real and says NOT PAID, and the being is told what it says).
  if (opts.written !== false) for (const w of h.written ?? []) lines.push(`Written on the ${w.name}:\n${w.text}`);
  return lines;
}
