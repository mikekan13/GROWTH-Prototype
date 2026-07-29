/**
 * Effort as motivated choice — persona harness mechanics coupling.
 *
 * The Body Interface (WP9) emits an `effortContext` band
 * ('casual'|'deliberate'|'straining') describing HOW MUCH the entity is
 * throwing herself at a `Do:` intent. This module converts that band into an
 * actual pool wager BEFORE the check resolves, using two multipliers the
 * entity herself supplies (never the true sheet, never a designer dial):
 *
 *   effortPoints = round( base[effortContext] * careWeight * selfSkillFactor )
 *
 *   careWeight       0.5..1.5, linear in a caller-supplied 0..1 `care` scalar
 *                    (how much this matters right now — salience of the
 *                    driving desire/vine blended with current arousal).
 *   selfSkillFactor  0.7..1.3, linear in the entity's BELIEVED skill level
 *                    (0..20 ladder) — she wagers on what she THINKS she can
 *                    do. An inflated believed sheet overspends; a deflated
 *                    one underspends. NEVER the true sheet's level.
 *
 * HARD RULE (never default to max): the raw product is clamped to
 * min(ceiling[effortContext], poolCurrent). A drained pool caps the wager
 * regardless of how much she cares or believes she can do — felt as fatigue,
 * never explained (the seal, Ruling 13, covers delivery; this module only
 * guarantees the NUMBER never exceeds what's actually there).
 */

export type EffortContext = 'casual' | 'deliberate' | 'straining';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * All numeric knobs in one place — tunable without touching the formula.
 * `ceiling` bounds the wager even for a maximally-caring, maximally-confident
 * entity; `careWeight`/`selfSkillFactor` ranges are the linear-map endpoints
 * described above.
 */
export const EFFORT_TUNING = {
  base: { casual: 1, deliberate: 3, straining: 6 } as Record<EffortContext, number>,
  ceiling: { casual: 2, deliberate: 5, straining: 9 } as Record<EffortContext, number>,
  careWeight: { min: 0.5, max: 1.5 },
  selfSkillFactor: { min: 0.7, max: 1.3, levelReference: 20 },
} as const;

/** Linear map: 0..1 care -> 0.5..1.5 careWeight. */
export function careWeightFor(care: number): number {
  const c = clamp01(care);
  const { min, max } = EFFORT_TUNING.careWeight;
  return min + c * (max - min);
}

/**
 * Linear map: believed skill level (0..20 ladder, dice-utils.ts's skill-die
 * bands) -> 0.7..1.3 selfSkillFactor. A believed level of 0 (no applicable
 * skill / stranger to the task) sits at the FLOOR, not the middle — an
 * entity with nothing to go on doesn't wager confidently.
 */
export function selfSkillFactorFor(believedSkillLevel: number): number {
  const { min, max, levelReference } = EFFORT_TUNING.selfSkillFactor;
  const frac = clamp01(Math.max(0, believedSkillLevel) / levelReference);
  return min + frac * (max - min);
}

/**
 * The `care` scalar itself — how much this moment matters to her right now.
 * Ensemble callers derive this from the driving vine/desire's salience
 * (0..1, e.g. a goal's priority normalized) blended with current arousal
 * (0..1, e.g. DayaAffect.stress as an arousal proxy). Equal-weighted blend;
 * either input alone can drive it (a low-stakes but thrilling moment, or a
 * calm but deeply-wanted one, both register).
 */
export function careScalarFrom(input: { vineSalience?: number; arousal?: number }): number {
  const vine = clamp01(input.vineSalience ?? 0);
  const arousal = clamp01(input.arousal ?? 0);
  return clamp01(0.5 * vine + 0.5 * arousal);
}

export interface EffortComputeInput {
  effortContext: EffortContext;
  /** 0..1 — how much this matters right now (see careScalarFrom). */
  care: number;
  /** Entity's BELIEVED skill level for the task (0 if no applicable belief exists) — NEVER the true sheet's level. */
  believedSkillLevel: number;
  /** The governing pool's CURRENT value — the hard ceiling regardless of care/confidence. */
  poolCurrent: number;
}

export interface EffortComputeResult {
  effortPoints: number;
  careWeight: number;
  selfSkillFactor: number;
  /** The raw product before ceiling/pool clamping — useful for tests/audit, never delivered anywhere. */
  rawBeforeClamp: number;
  ceiling: number;
}

/** Pure — no I/O. Computes the actual pool wager for a Do: intent. */
export function computeEffort(input: EffortComputeInput): EffortComputeResult {
  const base = EFFORT_TUNING.base[input.effortContext];
  const careWeight = careWeightFor(input.care);
  const selfSkillFactor = selfSkillFactorFor(input.believedSkillLevel);
  const rawBeforeClamp = base * careWeight * selfSkillFactor;
  const ceiling = EFFORT_TUNING.ceiling[input.effortContext];
  const poolCurrent = Math.max(0, input.poolCurrent);
  const effortPoints = Math.max(0, Math.min(Math.round(rawBeforeClamp), ceiling, poolCurrent));
  return { effortPoints, careWeight, selfSkillFactor, rawBeforeClamp, ceiling };
}
