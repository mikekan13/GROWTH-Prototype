/**
 * Skill points per pillar (Mike 2026-10-17).
 *
 * - A pillar's skill points = floor(sum of its attribute LEVELS ÷ 3).
 *   Spirit counts Flow + Focus only — Frequency is the fluid KRMA in the
 *   character, not levels — so Spirit runs lower by design.
 * - Each learned skill COMMITS one point per governor, in that governor's
 *   pillar (Clout + Celerity + Focus = 2 Body + 1 Spirit).
 * - A buffed (added) governor commits a point too.
 * - Available = total − committed. A skill can be learned (or a governor
 *   added) only if the needed points are available.
 */
import type { SkillGovernor } from '@/types/growth';

export type SkillPillar = 'body' | 'spirit' | 'soul';

export const GOVERNOR_PILLAR: Record<SkillGovernor, SkillPillar> = {
  clout: 'body', celerity: 'body', constitution: 'body',
  flow: 'spirit', focus: 'spirit',
  willpower: 'soul', wisdom: 'soul', wit: 'soul',
};

const PILLAR_ATTRS: Record<SkillPillar, SkillGovernor[]> = {
  body: ['clout', 'celerity', 'constitution'],
  spirit: ['flow', 'focus'],
  soul: ['willpower', 'wisdom', 'wit'],
};

export const SKILL_PILLARS: SkillPillar[] = ['body', 'spirit', 'soul'];

export interface PillarSkillPoints { total: number; committed: number; available: number }
export type SkillPointsByPillar = Record<SkillPillar, PillarSkillPoints>;

type AttrLevels = Partial<Record<string, { level?: number } | undefined>>;

/** Points a skill with these governors needs, per pillar. */
export function skillPointCost(governors: readonly string[]): Record<SkillPillar, number> {
  const cost: Record<SkillPillar, number> = { body: 0, spirit: 0, soul: 0 };
  for (const g of governors) {
    const p = GOVERNOR_PILLAR[g as SkillGovernor];
    if (p) cost[p] += 1;
  }
  return cost;
}

export function computeSkillPoints(
  attributes: AttrLevels | null | undefined,
  skills: ReadonlyArray<{ governors?: readonly string[] }>,
): SkillPointsByPillar {
  const out = {} as SkillPointsByPillar;
  const committed: Record<SkillPillar, number> = { body: 0, spirit: 0, soul: 0 };
  for (const s of skills) {
    const c = skillPointCost(s.governors ?? []);
    for (const p of SKILL_PILLARS) committed[p] += c[p];
  }
  for (const p of SKILL_PILLARS) {
    const levels = PILLAR_ATTRS[p].reduce((sum, a) => sum + (attributes?.[a]?.level ?? 0), 0);
    const total = Math.floor(levels / 3);
    out[p] = { total, committed: committed[p], available: total - committed[p] };
  }
  return out;
}

/** Pillars that lack points for a skill with these governors (empty = learnable). */
export function missingSkillPoints(points: SkillPointsByPillar, governors: readonly string[]): SkillPillar[] {
  const cost = skillPointCost(governors);
  return SKILL_PILLARS.filter(p => cost[p] > points[p].available);
}
