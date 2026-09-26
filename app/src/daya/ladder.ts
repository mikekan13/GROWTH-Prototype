/**
 * Ladder recall (Mike 2026-09-23, MEMORY-DESIGN §3) — pure.
 *
 * "Goals are a heavy weight for sure, but even before that would be
 * survival." Recall order: classify the cue → survival → goals → domain →
 * walk the chain → words last. A memory's TIER is the highest rung it stands
 * on; ordering is tier first, then the affect/recency/words score within the
 * tier. Survival is DERIVED from the sheet and the situation, never authored.
 */
import type { MemoryChain } from './chain';
import { classifyDomains } from './domains';
import { goalsTouched } from './chain';
import { vectorize, cosine } from './probes-vec';

export type Rung = 'survival' | 'goals' | 'domain' | 'chain' | 'words' | 'none';

export const RUNG_RANK: Record<Rung, number> = { survival: 5, goals: 4, domain: 3, chain: 2, words: 1, none: 0 };

export interface LadderMemory {
  id: string;
  content: string;
  valence: number;
  arousal: number;
  domain: string | null;
  domains: string[];
  chain: MemoryChain;
}

export interface LadderContext {
  cue: string;
  cueRefs: string[];
  /** The being's ACTIVE goals. */
  goals: Array<{ id: string; description: string }>;
  /** Derived from the sheet + the present situation by the caller (survival is never authored). */
  situation: { threatened: boolean; frequencyLow: boolean };
  /** Domains the cue itself is about (computed if omitted). */
  cueDomains?: string[];
}

export interface LadderResult {
  rung: Rung;
  /** 0..1 strength on that rung. */
  strength: number;
  /** Words-tier relevance (TF cosine), for callers blending it with keyword overlap. */
  words: number;
}

/** Survival relevance of a memory: threat-shaped affect, or death/harm domains, sharpened when the being is in danger now. */
export function survivalStrength(m: LadderMemory, situation: LadderContext['situation']): number {
  const threatAffect = m.arousal >= 0.7 && m.valence <= -0.3 ? 1 : 0;
  const harmDomain = m.domains.includes('dissolution') ? 0.7 : m.domains.includes('restoration') ? 0.4 : 0;
  const base = Math.max(threatAffect, harmDomain);
  if (base === 0) return 0;
  const danger = situation.threatened || situation.frequencyLow ? 1 : 0.6;
  return Math.min(1, base * danger);
}

export function goalStrength(m: LadderMemory, ctx: LadderContext): number {
  if (ctx.goals.length === 0) return 0;
  const ids = new Set(ctx.goals.map(g => g.id));
  if (m.chain.goalIds.some(g => ids.has(g))) return 1;
  return goalsTouched(m.content, ctx.goals).length > 0 ? 0.6 : 0;
}

export function domainStrength(m: LadderMemory, cueDomains: string[]): number {
  if (cueDomains.length === 0 || m.domains.length === 0) return 0;
  if (m.domain && m.domain === cueDomains[0]) return 1;
  return m.domains.some(d => cueDomains.includes(d)) ? 0.6 : 0;
}

export function chainStrength(m: LadderMemory, cueRefs: string[]): number {
  if (cueRefs.length === 0) return 0;
  const hits = cueRefs.filter(r => m.chain.entities.includes(r) || m.chain.items.includes(r) || m.chain.locationId === r || m.chain.truthRefs.includes(r)).length;
  return hits === 0 ? 0 : Math.min(1, 0.5 + 0.25 * hits);
}

export function wordsStrength(cue: string, content: string): number {
  return cosine(vectorize(cue), vectorize(content));
}

export function climb(m: LadderMemory, ctx: LadderContext): LadderResult {
  const cueDomains = ctx.cueDomains ?? classifyDomains(ctx.cue).all;
  const words = wordsStrength(ctx.cue, m.content);
  const rungs: Array<[Rung, number]> = [
    ['survival', survivalStrength(m, ctx.situation)],
    ['goals', goalStrength(m, ctx)],
    ['domain', domainStrength(m, cueDomains)],
    ['chain', chainStrength(m, ctx.cueRefs)],
    ['words', words >= 0.2 ? words : 0],
  ];
  for (const [rung, strength] of rungs) if (strength > 0) return { rung, strength, words };
  return { rung: 'none', strength: 0, words };
}

/** Sort key: higher rung first, then strength, then the caller's score. */
export function ladderCompare(a: { rung: Rung; strength: number; score: number }, b: { rung: Rung; strength: number; score: number }): number {
  const r = RUNG_RANK[b.rung] - RUNG_RANK[a.rung];
  if (r !== 0) return r;
  if (b.strength !== a.strength) return b.strength - a.strength;
  return b.score - a.score;
}
