/**
 * Dice rolling utilities for GRO.WTH resolution system.
 * SERVER-ONLY — all RNG happens on the server. Never import this from client code.
 *
 * Uses crypto.getRandomValues() with rejection sampling for uniform distribution.
 * No game system should call these directly — use DiceService instead.
 * These remain exported for unit testing and the service layer.
 *
 * For client-safe utilities (parseDie, getSkillDieType), import from '@/lib/dice-utils'.
 */
import 'server-only';

import type { FateDie } from '@/types/growth';

// ── Types ──────────────────────────────────────────────────────────────────

export interface DieResult {
  die: string;       // e.g. "d8", "+2", "d6"
  value: number;     // The rolled value (or flat bonus)
  isFlat: boolean;   // True for skill levels 1-3 (flat bonus, no roll)
}

export interface SkillCheckResult {
  skillDie: DieResult;
  fateDie: DieResult;
  effort: number;           // Points wagered from attribute pool
  flatModifiers: number;    // Sum of any flat mods (traits, conditions, etc.)
  total: number;            // SD + FD + effort + flatMods
  dr: number;               // Difficulty Rating
  success: boolean;         // total >= dr
  margin: number;           // total - dr (positive = success margin, negative = fail margin)
  isSkilled: boolean;       // Whether this was a skilled or unskilled check
}

export interface UnskilledCheckResult {
  fateDie: DieResult;
  effort: number;
  flatModifiers: number;
  total: number;
  dr: number;
  success: boolean;
  margin: number;
  isSkilled: false;
}

// ── Cryptographic RNG ─────────────────────────────────────────────────────

/**
 * Generate a cryptographically uniform random integer in [1, sides].
 * Uses rejection sampling to eliminate modulo bias.
 *
 * For GRO.WTH dice (d4/d6/d8/d12/d20), rejection rate is negligible (<0.0000002%).
 */
export function rollDie(sides: number): number {
  if (sides <= 0) return 0;
  if (sides === 1) return 1;

  // Rejection sampling: discard values in the biased tail of uint32 range
  const limit = Math.floor(0x100000000 / sides) * sides;
  const array = new Uint32Array(1);

  let value: number;
  do {
    crypto.getRandomValues(array);
    value = array[0];
  } while (value >= limit);

  return (value % sides) + 1;
}

/**
 * Generate a batch of cryptographic random values.
 * More efficient than calling rollDie() in a loop when rolling multiple dice.
 */
export function rollDice(specs: Array<{ sides: number }>): number[] {
  return specs.map(s => rollDie(s.sides));
}

// ── Parsing ───────────────────────────────────────────────────────────────

// Import shared utilities for local use + re-export for backward compatibility
import { parseDie, getSkillDieType } from './dice-utils';
export { parseDie, getSkillDieType };

/** Roll a skill die for a given skill level. */
export function rollSkillDie(skillLevel: number): DieResult {
  const info = getSkillDieType(skillLevel);
  if (info.isFlat) {
    return { die: info.die, value: info.flatBonus, isFlat: true };
  }
  return { die: info.die, value: rollDie(info.sides), isFlat: false };
}

/** Roll a fate die (d4, d6, d8, d12, d20). */
export function rollFateDie(fateDie: FateDie): DieResult {
  const sides = parseDie(fateDie);
  return { die: fateDie, value: rollDie(sides), isFlat: false };
}

// ── Resolution (Legacy — used by character-actions.ts) ────────────────────

/** Perform a skilled check: Roll SD → (wager effort) → Roll FD → compute total vs DR. */
export function skilledCheck(params: {
  skillLevel: number;
  fateDie: FateDie;
  effort: number;
  dr: number;
  flatModifiers?: number;
}): SkillCheckResult {
  const { skillLevel, fateDie, effort, dr, flatModifiers = 0 } = params;
  const skillDie = rollSkillDie(skillLevel);
  const fate = rollFateDie(fateDie);
  const total = skillDie.value + fate.value + effort + flatModifiers;
  return {
    skillDie,
    fateDie: fate,
    effort,
    flatModifiers,
    total,
    dr,
    success: total >= dr,
    margin: total - dr,
    isSkilled: true,
  };
}

/** Perform an unskilled check: (wager effort blind) → Roll FD → compute total vs DR. */
export function unskilledCheck(params: {
  fateDie: FateDie;
  effort: number;
  dr: number;
  flatModifiers?: number;
}): SkillCheckResult {
  const { fateDie, effort, dr, flatModifiers = 0 } = params;
  const fate = rollFateDie(fateDie);
  const total = fate.value + effort + flatModifiers;
  return {
    skillDie: { die: '-', value: 0, isFlat: true },
    fateDie: fate,
    effort,
    flatModifiers,
    total,
    dr,
    success: total >= dr,
    margin: total - dr,
    isSkilled: false,
  };
}
