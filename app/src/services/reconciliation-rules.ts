/**
 * Reconciliation — the deterministic half (pure, unit-tested).
 *
 * JEWL's read of the Watcher's narration against the simulated reality has
 * a model half (services/reconciliation.ts asks the C tier in JEWL's voice)
 * and this rule half: what can be decided without a model —
 *   - a quoted line introduced by a noun phrase the roster doesn't know is a
 *     NEW PRESENCE the world needs an entity for;
 *   - matching a needed element against what the campaign already has
 *     (planned or active) by name and description overlap;
 *   - the over-estimate for what has to be spun up.
 *
 * Every number in IMPROV_TUNING is a PLACEHOLDER until Mike prices it.
 */
import type { ParsedProse } from './table-prose';

export type ReconKind = 'relocation' | 'new_presence' | 'contradicted_fact' | 'contradiction' | 'continuity';

export interface PlanItem {
  kind: 'location' | 'npc' | 'item';
  /** What the narration called for. */
  description: string;
  /** A name if the narration gave one or one can be derived ("the inn", "Bright-eyed lass"). */
  name: string;
  /** An existing element that fits — nothing to spin up. */
  matchId: string | null;
  matchName: string | null;
  /** Real-price placeholder for a stub (0 when matched). */
  baseKrma: number;
  /** Where it goes: for an npc, the location plan item's name it belongs in (resolved on confirm). */
  at?: string | null;
}

export const IMPROV_TUNING = {
  /** [PLACEHOLDER] a stubbed place — cf. location krmaReserve, unpriced as of 09-26. */
  locationBaseKrma: 1000,
  /** [PLACEHOLDER] a stubbed person — the remade Human seed (rulings 08-04: 225). */
  npcBaseKrma: 225,
  /** [PLACEHOLDER] a stubbed thing. */
  itemBaseKrma: 50,
  /** DoorDash rule (Mike 09-26): hold MORE than it would really be; settle same-or-under. */
  overEstimate: 1.5,
  /** [PLACEHOLDER] how much must rest on a canon event before it counts as cemented (memories + vines + later events). */
  cementLoad: 3,
  /** Name/description overlap needed to reuse an existing element instead of stubbing one. */
  matchThreshold: 0.2,
} as const;

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'at', 'to', 'with', 'from', 'by', 'for', 'is', 'are', 'was', 'were', 'you', 'your', 'it', 'its', 'this', 'that', 'over', 'behind', 'into', 'onto', 'under']);

export function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9']+/).filter((t) => t.length >= 3 && !STOP.has(t)));
}

export function overlap(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let n = 0;
  for (const t of ta) if (tb.has(t)) n++;
  return n / Math.min(ta.size, tb.size);
}

export interface Candidate { id: string; name: string; description: string }

/** Best existing element for a need, or null when nothing fits well enough. */
export function matchCandidate(need: { name: string; description: string }, candidates: Candidate[], threshold = IMPROV_TUNING.matchThreshold): Candidate | null {
  let best: { c: Candidate; score: number } | null = null;
  for (const c of candidates) {
    const score = Math.max(overlap(need.name, c.name) * 1.2, overlap(`${need.name} ${need.description}`, `${c.name} ${c.description}`));
    if (score >= threshold && (!best || score > best.score)) best = { c, score };
  }
  return best?.c ?? null;
}

/** Rule-based needs from the prose alone: quotes introduced by an unknown noun phrase are people the world has to have. */
export function presenceNeeds(parsed: ParsedProse): Array<{ kind: 'npc'; name: string; description: string }> {
  const out: Array<{ kind: 'npc'; name: string; description: string }> = [];
  const seen = new Set<string>();
  for (const q of parsed.quotes) {
    if (q.speakerId || q.speakerLabel === 'someone present') continue;
    const key = q.speakerLabel.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: 'npc', name: titleCase(q.speakerLabel), description: q.context ?? q.speakerLabel });
  }
  return out;
}

export function titleCase(phrase: string): string {
  return phrase.replace(/^(a|an|the)\s+/i, '').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 60);
}

export function baseKrmaFor(kind: PlanItem['kind']): number {
  return kind === 'location' ? IMPROV_TUNING.locationBaseKrma : kind === 'npc' ? IMPROV_TUNING.npcBaseKrma : IMPROV_TUNING.itemBaseKrma;
}

/** Sum of stub bases × the over-estimate, whole KRMA. Matched items cost nothing to reuse. */
export function estimatePlan(plan: PlanItem[]): { real: number; held: number } {
  const real = plan.reduce((sum, p) => sum + (p.matchId ? 0 : p.baseKrma), 0);
  return { real, held: Math.ceil(real * IMPROV_TUNING.overEstimate) };
}

/** A canon event is cemented when enough rests on it (Mike 09-26: the GM locks it in by building on it). */
export function isCemented(load: { memories: number; vines: number; laterEvents: number }): boolean {
  return load.memories + load.vines + load.laterEvents >= IMPROV_TUNING.cementLoad;
}
