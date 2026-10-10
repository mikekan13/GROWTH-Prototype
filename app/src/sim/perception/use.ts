/**
 * USE TEACHES — perception unit 12 (Mike Q3, 2026-10-09: "they could use the blade and over time find out
 * how the magic works"; Q4: "Use raises an aspect slowly regardless of knowledge").
 *
 * Which aspects a round's USES exercise, per being per item. Pure, no I/O. Written once per round per being
 * (services/familiarity.recordUseBatch, source 'use' — the small step, FAMILIARITY_TUNING.step.use), with NO
 * domain gate: using a thing teaches you the parts of it the use touched, whether or not you know the domain.
 *
 * What exercises what (the events the round engine has today — orchestrator picks, [QUESTION] for Mike):
 *   wielded through the round (held at round start, still up)   → weight
 *   an attack that dealt damage while holding it                 → damage
 *   the held item took a hit (interposed / redirected)           → hardness, condition
 *   worn armour took a hit (body cascade wornDamage)             → hardness, condition
 *   an item ability fired                                        → ability:<id>   (no engine event fires one yet)
 * Only aspects the item actually HAS are written (the caller filters by listAspects).
 */
import type { RoundLogEntry } from '@/sim/round/types';
import { aspectKey } from './aspects';

export interface RoundUseInput {
  log: Array<Pick<RoundLogEntry, 'kind' | 'actorId' | 'targetId' | 'detail'>>;
  /** Each participant's held item at the start of the round (null = empty-handed). */
  heldAtStart: Record<string, string | null>;
  /** Participants who were up when the round began (a downed being wields nothing). */
  upAtStart: string[];
  /** Worn items that took damage this round. */
  wornHits: Array<{ wearerId: string; itemId: string }>;
  /** Item abilities that fired this round (hook for when the engine fires them). */
  abilitiesFired?: Array<{ userId: string; itemId: string; abilityId: string }>;
}

export interface ItemUse { userId: string; itemId: string; aspects: string[] }

/** The round's uses, one entry per (being, item), aspects de-duplicated in a stable order. Pure. */
export function usesFromRound(input: RoundUseInput): ItemUse[] {
  const acc = new Map<string, ItemUse>();
  const add = (userId: string | null | undefined, itemId: string | null | undefined, ...aspects: string[]) => {
    if (!userId || !itemId) return;
    const k = `${userId}|${itemId}`;
    const u = acc.get(k) ?? { userId, itemId, aspects: [] };
    for (const a of aspects) if (!u.aspects.includes(a)) u.aspects.push(a);
    acc.set(k, u);
  };
  const up = new Set(input.upAtStart);
  for (const [who, item] of Object.entries(input.heldAtStart)) if (up.has(who)) add(who, item, 'weight');
  for (const l of input.log) {
    if (l.kind === 'damage' && l.actorId) add(l.actorId, input.heldAtStart[l.actorId], 'damage');
    const d = l.detail as { itemId?: unknown; conditionBefore?: unknown } | undefined;
    if (l.kind === 'note' && l.actorId && typeof d?.itemId === 'string' && typeof d.conditionBefore === 'number') add(l.actorId, d.itemId, 'hardness', 'condition');
  }
  for (const h of input.wornHits) add(h.wearerId, h.itemId, 'hardness', 'condition');
  for (const f of input.abilitiesFired ?? []) add(f.userId, f.itemId, aspectKey('ability', f.abilityId));
  return [...acc.values()];
}
