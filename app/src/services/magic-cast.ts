/**
 * Magic cast-resolution engine (r-2026-07-22-01) — PURE.
 *
 * Canon roll formulas (validated Magic_School_*.md):
 *   - Wild Cast:  Fate Die + (weakest involved) School Skill die  vs DR
 *                 No Effort wager. Fail → Monkey Paw + marks the school trainable.
 *   - Woven Spell: Fate Die + School Skill die + Associated non-magic Skill die  vs DR
 *                 No Monkey Paw, no trainable mark.
 *   - Multi-school casts resolve on the WEAKEST involved school's die.
 *   - Each mana point spent adds +1 to the roll.
 *   - DR ≥ systemEngagementDR (config, default 50) flags godhead/Terminal review.
 *
 * No randomness, no db here: `computeCastPlan` derives the plan from the sheet
 * and `resolveCast` does the vs-DR math on already-rolled values. The rolling +
 * config-read + persistence wrapper lives elsewhere (mirrors advancement.ts /
 * advancement-ops.ts). The trainable-school MARK is returned as intent, not
 * applied — the advancement wiring (cost 2, r-2026-07-15-01) owns storage.
 */

import type { GrowthCharacter, MagicSchool, MagicPillar } from '@/types/growth';
import { MAGIC_SCHOOLS } from '@/types/growth';
import { getSkillDieType } from '@/lib/dice-utils';

export type CastMethod = 'wild' | 'woven';

export class CastError extends Error {}

export interface CastRequest {
  /** All schools the effect draws on. Multi-school → weakest die governs. */
  schools: MagicSchool[];
  method: CastMethod;
  /** The computed difficulty the cast rolls against (SpellDRBreakdown.total). */
  dr: number;
  /** Mana points spent — each adds +1 to the roll. */
  manaSpent?: number;
  /** Woven only: the associated non-magic skill name (adds its die). */
  associatedSkillName?: string;
}

export interface CastPlan {
  method: CastMethod;
  schools: MagicSchool[];
  /** The lowest-level involved school — its die is rolled. */
  weakestSchool: MagicSchool;
  weakestLevel: number;
  schoolDie: string;           // 'd6', '+2', or '-' (untrained)
  schoolDieSides: number;      // 0 when flat/untrained
  schoolFlat: number;          // flat bonus when levels 1-3, else 0
  /** Woven only. */
  associatedSkillName?: string;
  associatedSkillLevel?: number;
  associatedDie?: string;
  associatedDieSides?: number;
  associatedFlat?: number;
  dr: number;
  manaSpent: number;
  /** dr >= systemEngagementDR → the cast needs godhead/Terminal oversight. */
  requiresSystemReview: boolean;
}

export interface CastRolls {
  fateDieResult: number;
  /** School die face; ignored when the school die is flat (uses schoolFlat). */
  schoolDieResult?: number;
  /** Associated-skill die face (woven, non-flat). */
  associatedDieResult?: number;
}

export interface CastResolution {
  success: boolean;
  total: number;
  margin: number;
  dr: number;
  fate: number;
  school: number;
  associated: number;
  manaBonus: number;
  /** Wild cast that missed → the GM/JEWL owes a Monkey Paw. */
  monkeyPaw: boolean;
  /** Wild cast that missed → weakest school becomes trainable (advancement cost 2). */
  schoolToMarkTrainable: MagicSchool | null;
  requiresSystemReview: boolean;
}

/** A school's current skill level from the sheet (0 if unset). */
export function getSchoolLevel(character: GrowthCharacter, school: MagicSchool): number {
  const pillar = MAGIC_SCHOOLS[school]?.pillar;
  if (!pillar) return 0;
  const block = character.magic?.[pillar] as MagicPillar | undefined;
  return block?.skillLevels?.[school] ?? 0;
}

/**
 * Derive the cast plan from the character + request. Picks the weakest involved
 * school (lowest level → its die), resolves the woven associated-skill die, and
 * flags whether the DR crosses the system-engagement threshold.
 */
export function computeCastPlan(
  character: GrowthCharacter,
  request: CastRequest,
  systemEngagementDR: number,
): CastPlan {
  if (!request.schools || request.schools.length === 0) {
    throw new CastError('A cast must involve at least one school');
  }
  if (request.dr < 1) throw new CastError('DR must be at least 1');

  // Weakest = lowest skill level among the involved schools.
  let weakestSchool = request.schools[0];
  let weakestLevel = getSchoolLevel(character, weakestSchool);
  for (const s of request.schools.slice(1)) {
    const lvl = getSchoolLevel(character, s);
    if (lvl < weakestLevel) {
      weakestLevel = lvl;
      weakestSchool = s;
    }
  }

  const sd = getSkillDieType(weakestLevel);

  const plan: CastPlan = {
    method: request.method,
    schools: request.schools,
    weakestSchool,
    weakestLevel,
    schoolDie: sd.die,
    schoolDieSides: sd.sides,
    schoolFlat: sd.flatBonus,
    dr: request.dr,
    manaSpent: Math.max(0, request.manaSpent ?? 0),
    requiresSystemReview: request.dr >= systemEngagementDR,
  };

  if (request.method === 'woven') {
    if (!request.associatedSkillName) {
      throw new CastError('A Woven spell requires an associated non-magic skill');
    }
    const skill = (character.skills ?? []).find(
      (s) => s.name.toLowerCase() === request.associatedSkillName!.toLowerCase(),
    );
    const lvl = skill?.level ?? 0;
    const asd = getSkillDieType(lvl);
    plan.associatedSkillName = request.associatedSkillName;
    plan.associatedSkillLevel = lvl;
    plan.associatedDie = asd.die;
    plan.associatedDieSides = asd.sides;
    plan.associatedFlat = asd.flatBonus;
  }

  return plan;
}

/**
 * Resolve a cast against its DR using already-rolled dice. Pure math:
 * total = Fate + School(+flat) + Associated(woven) + mana, compared vs DR
 * (meet = beat). A missed Wild cast owes a Monkey Paw and marks the weakest
 * school trainable; a missed Woven cast does neither.
 */
export function resolveCast(plan: CastPlan, rolls: CastRolls): CastResolution {
  const fate = rolls.fateDieResult;

  const school = plan.schoolDieSides > 0 ? (rolls.schoolDieResult ?? 0) : plan.schoolFlat;

  let associated = 0;
  if (plan.method === 'woven') {
    associated = (plan.associatedDieSides ?? 0) > 0
      ? (rolls.associatedDieResult ?? 0)
      : (plan.associatedFlat ?? 0);
  }

  const manaBonus = plan.manaSpent;
  const total = fate + school + associated + manaBonus;
  const success = total >= plan.dr;
  const margin = total - plan.dr;

  const missedWild = plan.method === 'wild' && !success;

  return {
    success,
    total,
    margin,
    dr: plan.dr,
    fate,
    school,
    associated,
    manaBonus,
    monkeyPaw: missedWild,
    schoolToMarkTrainable: missedWild ? plan.weakestSchool : null,
    requiresSystemReview: plan.requiresSystemReview,
  };
}
