/**
 * Damage-to-attribute targeting cost logic — the Affinity Cycle.
 *
 * AUTHORITATIVE SPEC: GRO.WTH Repository/05_COMBAT_STRUCTURE/
 * Damage_Targeting_KV_Spec.md (Mike-provided, ruling r-2026-06-10-02).
 *
 * The 7 damage types and 7 cycle attributes form a closed ring. Targeting
 * the natural attribute = baseline KV; every step of ring distance
 * multiplies the item's Damage Value KV component (1×/2×/5×/10×).
 * Frequency is off-ring and always 20×. Flow is UNDEFINED in canon
 * (spec §7.1) — blocked at authoring until Mike rules.
 *
 * Guidepost, never a gate: off-alignment targeting is legal advanced
 * strategy, priced. Deviation from base mechanics always costs more KRMA.
 */

export type DamageTypeLetter = 'P' | 'S' | 'H' | 'D' | 'C' | 'B' | 'E';
export type DamageTypeName =
  | 'piercing' | 'slashing' | 'heat' | 'decay' | 'cold' | 'bashing' | 'energy';

export type CycleAttribute =
  | 'clout' | 'celerity' | 'constitution' | 'focus' | 'willpower' | 'wisdom' | 'wit';
export type TargetAttribute = CycleAttribute | 'frequency' | 'flow';

/** The ring, in canonical order (spec §2). Index = position on the cycle. */
export const CYCLE: readonly CycleAttribute[] = [
  'clout', 'celerity', 'constitution', 'focus', 'willpower', 'wisdom', 'wit',
] as const;

/** Natural affinity per damage type (spec §2). */
export const NATURAL_TARGET: Record<DamageTypeName, CycleAttribute> = {
  piercing: 'clout',
  slashing: 'celerity',
  heat: 'constitution',
  decay: 'focus',
  cold: 'willpower',
  bashing: 'wisdom',
  energy: 'wit',
};

export const LETTER_TO_NAME: Record<DamageTypeLetter, DamageTypeName> = {
  P: 'piercing', S: 'slashing', H: 'heat', D: 'decay', C: 'cold', B: 'bashing', E: 'energy',
};

/**
 * Targeting multipliers are META LEVERS, not constants (spec §7.4,
 * r-2026-06-10-03): the Terminal / KV Authority may steer the live meta by
 * tuning them — globally, per ring distance, or per damage type. These are
 * the canonical LAUNCH DEFAULTS (spec §3); pass a config to override.
 */
export interface TargetingConfig {
  /** Multiplier by ring distance. Index = distance 0..3. */
  distanceMultiplier: readonly [number, number, number, number];
  /** Frequency is off-ring and always the most expensive target. */
  frequencyMultiplier: number;
  /** Optional per-damage-type overrides — the per-type meta lever.
   *  A partial table: only the cells being steered need entries. */
  perTypeOverride?: Partial<Record<DamageTypeName, Partial<Record<TargetAttribute, number>>>>;
}

export const DEFAULT_TARGETING_CONFIG: TargetingConfig = {
  distanceMultiplier: [1, 2, 5, 10],
  frequencyMultiplier: 20,
};

/** Legacy named exports for the launch defaults. */
export const DISTANCE_MULTIPLIER = DEFAULT_TARGETING_CONFIG.distanceMultiplier;
export const FREQUENCY_MULTIPLIER = DEFAULT_TARGETING_CONFIG.frequencyMultiplier;

/** Symmetric, direction-agnostic distance on the 7-ring (spec §3). */
export function ringDistance(a: CycleAttribute, b: CycleAttribute): number {
  const i = CYCLE.indexOf(a);
  const j = CYCLE.indexOf(b);
  const raw = Math.abs(i - j);
  return Math.min(raw, 7 - raw);
}

export class FlowTargetingUndefinedError extends Error {
  constructor() {
    super('Flow targeting multiplier is undefined in canon (Damage_Targeting_KV_Spec §7.1) — blocked until Mike rules');
    this.name = 'FlowTargetingUndefinedError';
  }
}

/**
 * KV multiplier for a damage entry's declared target (spec §3).
 * Applies to the Damage Value component of item KV only (spec §5).
 * Throws FlowTargetingUndefinedError for 'flow' per spec §6 rule 4.
 * `config` defaults to the launch values; the meta-tuning source can
 * supply overrides (spec §7.4 — multipliers are meta levers).
 */
export function targetingMultiplier(
  dmg: DamageTypeName,
  target: TargetAttribute,
  config: TargetingConfig = DEFAULT_TARGETING_CONFIG,
): number {
  const override = config.perTypeOverride?.[dmg]?.[target];
  if (override !== undefined) return override;
  if (target === 'frequency') return config.frequencyMultiplier;
  if (target === 'flow') throw new FlowTargetingUndefinedError();
  return config.distanceMultiplier[ringDistance(NATURAL_TARGET[dmg], target)];
}

/** Non-throwing variant for UI hints: returns null where canon is silent. */
export function targetingMultiplierOrNull(
  dmg: DamageTypeName,
  target: TargetAttribute,
  config: TargetingConfig = DEFAULT_TARGETING_CONFIG,
): number | null {
  if (target === 'flow' && config.perTypeOverride?.[dmg]?.flow === undefined) return null;
  return targetingMultiplier(dmg, target, config);
}

/**
 * Human hint per spec §6 rule 5 — surface the guidepost in authoring UIs:
 * "This targeting costs 5× — natural target for Piercing is Clout".
 */
export function targetingHint(dmg: DamageTypeName, target: TargetAttribute): string {
  const natural = NATURAL_TARGET[dmg];
  if (target === 'flow') return `Flow targeting is not yet priced (canon §7.1) — natural target for ${cap(dmg)} is ${cap(natural)}`;
  const m = targetingMultiplier(dmg, target);
  if (m === 1) return `Natural target (1×)`;
  return `This targeting costs ${m}× — natural target for ${cap(dmg)} is ${cap(natural)}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
