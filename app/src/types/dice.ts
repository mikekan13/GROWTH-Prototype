/**
 * GRO.WTH Dice System — Type Definitions
 *
 * All dice rolling flows through these types. The DiceService is the single
 * entry point — no game system calls rollDie() directly.
 *
 * Flow: RollRequest → DiceService.roll() → RollResult → event bus → terminal + 3D renderer
 */

import type { FateDie } from './growth';

// ── Die Types ─────────────────────────────────────────────────────────────

export type DieType = 'd4' | 'd6' | 'd8' | 'd12' | 'd20';

/** Pillar-aware die color for 3D renderer */
export type DieColor = 'red' | 'blue' | 'purple' | 'teal' | 'gold' | 'white' | 'black';

// ── Roll Request ──────────────────────────────────────────────────────────

/** What triggered the roll — extensible discriminated union */
export type RollSource =
  | { type: 'skill_check'; skillName: string; skillLevel: number; characterId: string }
  | { type: 'unskilled_check'; characterId: string }
  | { type: 'death_save'; characterId: string }
  | { type: 'fear_check'; fearName: string; characterId: string }
  | { type: 'magic_resistance'; characterId: string }
  | { type: 'item_use'; itemId: string; characterId: string }
  | { type: 'encounter'; encounterId: string }
  | { type: 'quick_roll'; context: string }
  | { type: 'contested'; attackerId: string; defenderId: string }
  | { type: 'custom'; context: string };

/** A single die to roll */
export interface DieSpec {
  die: DieType | 'flat';
  label: string;        // "Skill Die", "Fate Die", "Item Bonus", etc.
  sides: number;        // 0 for flat bonuses
  flatValue?: number;   // For flat bonuses (skill levels 1-3)
  color?: DieColor;     // Visual hint for 3D renderer
}

/** A request to roll one or more dice, optionally vs a DR */
export interface RollRequest {
  id: string;
  source: RollSource;
  dice: DieSpec[];
  dr?: number;
  effort?: number;
  effortAttribute?: string;
  flatModifiers?: number;
  metadata?: Record<string, unknown>;
}

// ── Roll Result ───────────────────────────────────────────────────────────

/** The outcome of a single die in the roll */
export interface DieOutcome {
  die: DieType | 'flat';
  label: string;
  value: number;       // Final value (after any injection)
  maxValue: number;    // Max possible (sides count, or flat value)
  natural: number;     // What the RNG actually produced (before injection)
  wasInjected: boolean;
}

/** The complete result of a roll */
export interface RollResult {
  id: string;
  request: RollRequest;
  rolls: DieOutcome[];
  total: number;
  dr?: number;
  success?: boolean;
  margin?: number;
  timestamp: number;
  injected: boolean;           // Was ANY die overridden?
  injectionVisible: boolean;   // Should injection be shown? (Godhead-only)
}

// ── Contested Roll ────────────────────────────────────────────────────────

export interface ContestedRollResult {
  attacker: RollResult;
  defender: RollResult;
  attackerWins: boolean;
}

// ── Injection Types ───────────────────────────────────────────────────────

export type InjectionFilter =
  | { type: 'character'; characterId: string }
  | { type: 'roll_source'; sourceType: RollSource['type'] }
  | { type: 'next_roll' }
  | { type: 'skill'; skillName: string }
  | { type: 'custom'; predicate: (req: RollRequest) => boolean };

export type InjectionOverride =
  | { type: 'set_values'; values: number[] }
  | { type: 'set_total'; total: number }
  | { type: 'ensure_success' }
  | { type: 'ensure_failure' }
  | { type: 'clamp_min'; min: number }
  | { type: 'clamp_max'; max: number }
  | { type: 'add_modifier'; bonus: number };

export interface DiceInjection {
  id: string;
  priority: number;
  filter: InjectionFilter;
  override: InjectionOverride;
  oneShot: boolean;
  expiresAt?: number;
  reason: string;
  createdBy: 'godhead' | 'ai_oracle' | 'system';
}

// ── Backward Compatibility ────────────────────────────────────────────────

/** Maps to the existing DieResult interface in lib/dice.ts for gradual migration */
export interface LegacyDieResult {
  die: string;
  value: number;
  isFlat: boolean;
}

/** Maps to the existing SkillCheckResult for gradual migration */
export interface LegacySkillCheckResult {
  skillDie: LegacyDieResult;
  fateDie: LegacyDieResult;
  effort: number;
  flatModifiers: number;
  total: number;
  dr: number;
  success: boolean;
  margin: number;
  isSkilled: boolean;
}
