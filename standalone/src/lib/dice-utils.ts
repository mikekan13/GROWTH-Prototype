/**
 * Pure dice utilities — shared between client and server.
 * No RNG, no crypto, just parsing and lookup tables.
 */

// ── Parsing ───────────────────────────────────────────────────────────────

/** Parse a die string like "d8" into its sides count. Returns 0 if invalid. */
export function parseDie(die: string): number {
  const match = die.match(/^d(\d+)$/);
  if (!match) return 0;
  return parseInt(match[1], 10);
}

// ── Skill Die Lookup ──────────────────────────────────────────────────────

/** Get the skill die type for a given skill level. */
export function getSkillDieType(level: number): { die: string; sides: number; isFlat: boolean; flatBonus: number } {
  if (level <= 0) return { die: '-', sides: 0, isFlat: true, flatBonus: 0 };
  if (level <= 3) return { die: `+${level}`, sides: 0, isFlat: true, flatBonus: level };
  if (level <= 5) return { die: 'd4', sides: 4, isFlat: false, flatBonus: 0 };
  if (level <= 7) return { die: 'd6', sides: 6, isFlat: false, flatBonus: 0 };
  if (level <= 11) return { die: 'd8', sides: 8, isFlat: false, flatBonus: 0 };
  if (level <= 19) return { die: 'd12', sides: 12, isFlat: false, flatBonus: 0 };
  return { die: 'd20', sides: 20, isFlat: false, flatBonus: 0 };
}

/** Valid die types for quick rolls */
export const VALID_DIE_TYPES = ['d4', 'd6', 'd8', 'd12', 'd20'] as const;

/** Check if a string is a valid die type */
export function isValidDie(die: string): boolean {
  return parseDie(die) > 0;
}
