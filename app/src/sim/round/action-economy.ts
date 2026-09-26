/**
 * Action economy + speed gauges + governor tiers (pure).
 *
 * Canon:
 *  - Actions per pillar = max(1 + ActionMod, ActionMod + floor(sum of pillar
 *    attribute LEVELS / 25)); Frequency EXCLUDED from Spirit (r-2026-05-20-01).
 *  - Speed gauges (Mike 09-03): Celerity (Body), Frequency (Spirit), Wisdom
 *    (Soul) — MAX POOL values.
 *  - Governor speed tiers (Mike 09-04): a skill can't be governed by
 *    Frequency, so the only speed gauges that can appear as governors are
 *    Wisdom and Celerity. Tier 1 = Wisdom only; 2 = Wisdom + Celerity only;
 *    3 = Celerity only; 4+ = any other mix, more governors = slower.
 */
import type { GrowthAttribute, GrowthAttributes, GrowthCharacter, GrowthSkill } from '@/types/growth';
import type { ActionPools, AttrKey, FateDie, Governor, Participant, ParticipantSkill, Pillar, SpeedGauges } from './types';
import { ATTR_KEYS } from './types';

export const ACTION_DIVISOR = 25;

export const FATE_DIE_MAX: Record<FateDie, number> = { d4: 4, d6: 6, d8: 8, d12: 12, d20: 20 };

/**
 * Canon (GROWTH-DESIGN-TRUTH §Resolution): max Effort on a roll = Fate Die
 * max + Skill Level (skilled) / Fate Die max only (unskilled).
 */
export function effortCap(fateDie: FateDie, skillLevel: number | null): number {
  return FATE_DIE_MAX[fateDie] + (skillLevel ?? 0);
}

/** Snapshot of every attribute pool (current / max) from a sheet. Frequency has no augments. */
export function attributeSnapshot(sheet: Pick<GrowthCharacter, 'attributes'> | undefined): Participant['attrs'] {
  const a = sheet?.attributes;
  const out = {} as Participant['attrs'];
  for (const key of ATTR_KEYS) {
    if (key === 'frequency') {
      out[key] = { current: a?.frequency?.current ?? 0, max: a?.frequency?.level ?? 0 };
    } else {
      const attr = a?.[key];
      out[key] = { current: attr?.current ?? 0, max: poolMax(attr) };
    }
  }
  return out;
}

/**
 * Canon (Combat_Grid_System): Effort wagered on a roll must come from the
 * SAME pillar's attribute pool as the action spent. Eligible governors = the
 * skill's governors that belong to the action's pillar; unskilled = the
 * pillar's own attributes (Frequency never — it is the life pool).
 */
export function eligibleEffortAttributes(pillar: Pillar, skill: ParticipantSkill | null): Governor[] {
  const pillarAttrs = PILLAR_ATTRIBUTES[pillar].filter(k => k !== 'frequency') as Governor[];
  if (!skill) return pillarAttrs;
  const eligible = skill.governors.filter(g => pillarAttrs.includes(g));
  return eligible.length ? eligible : pillarAttrs;
}

export function isAttrKey(s: string): s is AttrKey {
  return (ATTR_KEYS as string[]).includes(s);
}

export const PILLAR_ATTRIBUTES: Record<Pillar, Array<keyof GrowthAttributes>> = {
  body: ['clout', 'celerity', 'constitution'],
  spirit: ['flow', 'focus'],          // Frequency excluded — life pool, not an action source
  soul: ['willpower', 'wisdom', 'wit'],
};

/** Max pool = level + augmentPositive − augmentNegative (Frequency: level only). */
export function poolMax(attr: { level: number; augmentPositive?: number; augmentNegative?: number } | undefined): number {
  if (!attr) return 0;
  return Math.max(0, (attr.level ?? 0) + (attr.augmentPositive ?? 0) - (attr.augmentNegative ?? 0));
}

function level(attr: GrowthAttribute | { level: number } | undefined): number {
  return attr?.level ?? 0;
}

export function actionsForPillar(attrs: GrowthAttributes | undefined, pillar: Pillar, actionMod = 0): number {
  if (!attrs) return Math.max(1, 1 + actionMod);
  const sum = PILLAR_ATTRIBUTES[pillar].reduce((acc, key) => acc + level(attrs[key] as GrowthAttribute), 0);
  return Math.max(1 + actionMod, actionMod + Math.floor(sum / ACTION_DIVISOR));
}

export function actionPools(sheet: Pick<GrowthCharacter, 'attributes'> | undefined, actionMod = 0): ActionPools {
  const attrs = sheet?.attributes;
  return {
    body: actionsForPillar(attrs, 'body', actionMod),
    spirit: actionsForPillar(attrs, 'spirit', actionMod),
    soul: actionsForPillar(attrs, 'soul', actionMod),
  };
}

export function totalActions(pools: ActionPools): number {
  return pools.body + pools.spirit + pools.soul;
}

export function speedGauges(sheet: Pick<GrowthCharacter, 'attributes'> | undefined): SpeedGauges {
  const a = sheet?.attributes;
  return {
    celerity: poolMax(a?.celerity),
    frequency: a?.frequency?.level ?? 0,
    wisdom: poolMax(a?.wisdom),
  };
}

/** The gauge that governs an action of the given pillar. */
export function gaugeForPillar(gauges: SpeedGauges, pillar: Pillar): number {
  switch (pillar) {
    case 'body': return gauges.celerity;
    case 'spirit': return gauges.frequency;
    case 'soul': return gauges.wisdom;
  }
}

/**
 * Governor speed tier for a skill (lower = faster). Frequency can never be a
 * governor, so only Wisdom and Celerity count as speed governors.
 */
export function governorTier(governors: readonly Governor[] | undefined): number {
  if (!governors || governors.length === 0) return 4;
  const set = new Set(governors);
  const hasWis = set.has('wisdom');
  const hasCel = set.has('celerity');
  if (set.size === 1 && hasWis) return 1;
  if (set.size === 2 && hasWis && hasCel) return 2;
  if (set.size === 1 && hasCel) return 3;
  // Any other mix: 4 for a single non-speed governor, +1 per extra governor.
  return 4 + Math.max(0, set.size - 1);
}

export function toParticipantSkills(skills: GrowthSkill[] | undefined): ParticipantSkill[] {
  return (skills ?? []).map(s => ({
    name: s.name,
    level: s.level ?? 0,
    governors: (s.governors ?? []) as Governor[],
  }));
}

/** Which pillar a governor attribute belongs to. */
export function pillarOfGovernor(g: Governor): Pillar {
  if (g === 'clout' || g === 'celerity' || g === 'constitution') return 'body';
  if (g === 'flow' || g === 'focus') return 'spirit';
  return 'soul';
}

/**
 * Canon (Combat_Grid_System): a multi-governor skill may be triggered from any
 * PARTICIPATING pillar's action. Returns true if the skill has a governor in
 * the given pillar.
 */
export function skillUsableFromPillar(skill: ParticipantSkill, pillar: Pillar): boolean {
  return skill.governors.some(g => pillarOfGovernor(g) === pillar);
}
