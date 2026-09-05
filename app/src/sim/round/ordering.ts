/**
 * Within-slot ordering (pure) — Layers 2–4 of the speed stack, with a hook for
 * Layer 5 (the simulation's contextual call).
 *
 * Layer 2 (Mike 09-03/04): the action's pillar gauge — Celerity / Frequency /
 *   Wisdom MAX POOL — with a pillar BIAS Spirit > Soul > Body. The bias is a
 *   prior on the values, not a strict sort: Celerity 200 on a Body action goes
 *   before Wisdom 20 on a Soul action.
 * Layer 3 (Mike 09-04): skill-governor tier (Wisdom-only fastest … more
 *   governors slower). Categorical.
 * Layer 4 (Mike 09-05): modifiers — items, ActionMod, conditions, Blossoms.
 *   v0 exposes `modifierBonus` only.
 * Layer 5: the sim's contextual call — an optional async hook that may
 *   reorder a slot; v0 callers pass none, so the deterministic prior stands.
 *
 * Tuning constants are deliberately visible: they are the knobs Mike will
 * turn once rounds are running.
 */
import type { Intention, OrderedSlot, OrderedSlotEntry, Participant, Pillar, Slot } from './types';
import { gaugeForPillar, governorTier } from './action-economy';

export const PILLAR_BIAS: Record<Pillar, number> = { spirit: 1.3, soul: 1.15, body: 1.0 };
/** Multiplier per governor tier step below tier 1 (tier 1 = ×1.0). */
export const GOVERNOR_TIER_STEP = 0.08;
/** An unassigned (reserve) action has no pillar/skill yet — it is ordered by the participant's best gauge. */
export const RESERVE_BIAS = 1.0;

export interface SpeedInput {
  participant: Participant;
  intention: Intention | null;
  modifierBonus?: number; // layer 4 hook
}

export function speedScore(input: SpeedInput): { score: number; trace: string } {
  const { participant: p, intention } = input;
  const mod = input.modifierBonus ?? 0;
  if (!intention) {
    const best = Math.max(p.gauges.celerity * PILLAR_BIAS.body, p.gauges.frequency * PILLAR_BIAS.spirit, p.gauges.wisdom * PILLAR_BIAS.soul);
    const score = best * RESERVE_BIAS + mod;
    return { score, trace: `reserve: best gauge ${best.toFixed(1)}${mod ? ` +mod ${mod}` : ''}` };
  }
  const gauge = gaugeForPillar(p.gauges, intention.pillar);
  const bias = PILLAR_BIAS[intention.pillar];
  let score = gauge * bias;
  let trace = `L2 ${intention.pillar} gauge ${gauge} × bias ${bias}`;
  if (intention.skillName) {
    const skill = p.skills.find(s => s.name === intention.skillName);
    const tier = governorTier(skill?.governors);
    const mult = Math.max(0.2, 1 - (tier - 1) * GOVERNOR_TIER_STEP);
    score *= mult;
    trace += ` · L3 governor tier ${tier} ×${mult.toFixed(2)}`;
  }
  if (mod) {
    score += mod;
    trace += ` · L4 +${mod}`;
  }
  return { score, trace };
}

export type ContextualCall = (slot: OrderedSlot, participants: Participant[]) => Promise<OrderedSlot | null>;

/**
 * Order every slot. Deterministic: score desc, then participant id asc. The
 * optional Layer-5 hook may return a reordered slot (or null to keep it).
 */
export async function orderSlots(
  slots: Slot[],
  participants: Participant[],
  intentions: Intention[],
  contextualCall?: ContextualCall,
): Promise<OrderedSlot[]> {
  const byId = new Map(participants.map(p => [p.id, p]));
  const intById = new Map(intentions.map(i => [i.id, i]));
  const out: OrderedSlot[] = [];
  for (const slot of slots) {
    const entries: OrderedSlotEntry[] = slot.entries.map(e => {
      const p = byId.get(e.participantId);
      const intention = e.intentionId ? intById.get(e.intentionId) ?? null : null;
      if (!p) return { ...e, speedScore: 0, speedTrace: 'unknown participant' };
      const { score, trace } = speedScore({ participant: p, intention });
      return { ...e, speedScore: score, speedTrace: trace };
    });
    entries.sort((a, b) => (b.speedScore - a.speedScore) || a.participantId.localeCompare(b.participantId));
    let ordered: OrderedSlot = { index: slot.index, entries };
    if (contextualCall) {
      const override = await contextualCall(ordered, participants);
      if (override) ordered = override;
    }
    out.push(ordered);
  }
  return out;
}
