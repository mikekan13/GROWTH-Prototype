/**
 * The memory chain (Mike 2026-09-23, MEMORY-DESIGN §3).
 *
 * "It isn't just classified in the 10 domains but also has the chain to back
 * it. Items, locations, other entities — all tracking from their perspective
 * is the chain." A memory's chain is what it is backed by: the canon event it
 * perceived, the entities present, the items involved, the place, the goals
 * it touched, and what came before it. Pure helpers; no DB.
 */

export interface MemoryChain {
  /** Canon events this memory perceived (the primary one is also DayaMemoryEntry.truthRef). */
  truthRefs: string[];
  /** Other characters involved (characterIds). */
  entities: string[];
  /** CampaignItem ids involved. */
  items: string[];
  /** Where it happened. */
  locationId: string | null;
  /** Goals of THIS being that the event touched. */
  goalIds: string[];
  /** The being's previous memory in this thread (perception → perception), if any. */
  antecedentId: string | null;
}

export const EMPTY_CHAIN: MemoryChain = { truthRefs: [], entities: [], items: [], locationId: null, goalIds: [], antecedentId: null };

export function makeChain(partial: Partial<MemoryChain>): MemoryChain {
  return {
    truthRefs: dedupe(partial.truthRefs ?? []),
    entities: dedupe(partial.entities ?? []),
    items: dedupe(partial.items ?? []),
    locationId: partial.locationId ?? null,
    goalIds: dedupe(partial.goalIds ?? []),
    antecedentId: partial.antecedentId ?? null,
  };
}

export function parseChain(raw: string | null | undefined): MemoryChain {
  if (!raw) return { ...EMPTY_CHAIN };
  try { return makeChain(JSON.parse(raw) as Partial<MemoryChain>); } catch { return { ...EMPTY_CHAIN }; }
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs.filter(Boolean))];
}

/**
 * Which of a being's goals did this text touch? v0 = keyword overlap between
 * the narration and the goal's description (the same "keywords to an extent"
 * rule as domains). The vine matcher in daya/mechanics/resolve.ts does the
 * same for adjudications; both will move to the model classifier together.
 */
export function goalsTouched(text: string, goals: Array<{ id: string; description: string }>, minOverlap = 2): string[] {
  const t = new Set(text.toLowerCase().split(/[^a-z']+/).filter(w => w.length >= 4));
  const out: string[] = [];
  for (const g of goals) {
    const gw = g.description.toLowerCase().split(/[^a-z']+/).filter(w => w.length >= 4);
    let overlap = 0;
    for (const w of new Set(gw)) if (t.has(w)) overlap++;
    if (overlap >= minOverlap) out.push(g.id);
  }
  return out;
}
