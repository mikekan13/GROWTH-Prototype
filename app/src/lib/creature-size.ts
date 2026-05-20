/**
 * Creature Size — helpers for the asymmetric footprint model.
 *
 * Canon (locked Mike 2026-05-19):
 *  - Size = grid footprint stored as `width × length` (in 5ft squares).
 *  - `height` is descriptive only; used by the Terminal for contextual rulings.
 *  - Open-ended linear scaling. No category enum.
 *  - Hard rules tied to size (the deterministic minimum the engine guarantees):
 *      1. Reach scales with footprint.
 *      2. A creature can squeeze through an opening one size smaller than its own footprint.
 *  - NOT size-tied: carrying capacity (Clout), push/pull/shove (Clout contests),
 *    cover/line-of-sight (Terminal contextual rulings).
 *  - Grapple works regardless of disparity; effect scales narratively.
 */

import type { CreatureSize } from '@/types/growth';

/** The "size value" used in numeric comparisons — the larger of width and length. */
export function sizeValue(size: CreatureSize | undefined): number {
  if (!size) return 1;
  return Math.max(size.width, size.length);
}

/**
 * Hard rule #1: melee reach scales with footprint. A 1×1 creature reaches 1 square;
 * a 2×2 reaches 2 squares; etc. Asymmetric creatures reach to the larger dimension.
 */
export function meleeReachSquares(size: CreatureSize | undefined): number {
  return Math.max(1, sizeValue(size));
}

/**
 * Hard rule #2: a creature can squeeze through an opening one size smaller
 * than its own footprint. `openingSize` is the size of the gap in 5ft squares.
 */
export function canSqueezeThrough(size: CreatureSize | undefined, openingSize: number): boolean {
  const me = sizeValue(size);
  return openingSize >= me - 1;
}

/** Pretty-printer for chat / UI ("2×3 (height 8)"). */
export function formatSize(size: CreatureSize | undefined): string {
  if (!size) return '1×1';
  const base = `${size.width}×${size.length}`;
  return size.height !== undefined ? `${base} (height ${size.height})` : base;
}

/**
 * Default human baseline. New characters get this until a seed declares otherwise.
 */
export const HUMAN_BASELINE_SIZE: CreatureSize = { width: 1, length: 1, height: 6 };
