/**
 * Body Damage Routing — outer-absorbs-then-passes-through container cascade.
 *
 * Canon (locked Mike 2026-05-19):
 *  - Every body part is an item with its own resist and material.
 *  - On a hit, the outer layer absorbs damage up to its resist. Excess
 *    "passes through" to the layer beneath.
 *  - Piercing damage: the attacker designates ONE internal to receive the
 *    full passed-through amount.
 *  - All other damage types: passed-through excess splits EVENLY across
 *    every internal in the container. Each internal independently checks
 *    its share against its own resist.
 *  - When damage applied to a part meets or exceeds its resist, the part
 *    drops one condition tier.
 *  - Body parts use the standard 4-tier condition (4=Indestructible,
 *    3=Undamaged, 2=Worn, 1=Broken, 0=Destroyed).
 *  - "Body" is no longer a damage type — all damage resolves against
 *    material + a typed damage class (piercing/slashing/heat/cold/etc.).
 *
 * This module is pure: it takes the current body-tree, returns a new
 * body-tree + a report of what changed. Caller persists the result.
 */

import type { GrowthWorldItem } from '@/types/item';

export type DamageType =
  | 'piercing'
  | 'slashing'
  | 'bashing'
  | 'heat'
  | 'cold'
  | 'decay'
  | 'energy';

export interface DamageEvent {
  /** How much damage applied to the part itself (after absorption). */
  partPath: string[];
  partName: string;
  damageType: DamageType;
  damageDealt: number;
  resist: number;
  /** Was this enough to drop a condition tier? */
  brokeTier: boolean;
  /** Condition before and after. */
  conditionBefore: number;
  conditionAfter: number;
}

export interface RouteDamageResult {
  /** New body item tree with conditions updated. */
  next: GrowthWorldItem;
  /** Per-part damage events (in resolution order). */
  events: DamageEvent[];
  /** True if any part was destroyed (condition 0). */
  anyDestroyed: boolean;
}

export interface RouteDamageOptions {
  /**
   * For piercing damage only: the path to the internal that catches the
   * full passed-through amount. Path = array of `partName` strings from
   * root to target. If omitted, piercing falls back to even-split (same
   * behavior as other damage types) — a safe default for accidental misuses.
   */
  piercingTargetPath?: string[];
}

const FALLBACK_RESIST = 0;
const FULL_CONDITION = 3;

/** Deep clone of an item subtree. */
function cloneItem(item: GrowthWorldItem): GrowthWorldItem {
  return JSON.parse(JSON.stringify(item)) as GrowthWorldItem;
}

/**
 * Apply `amount` damage of `damageType` to the part `target` itself
 * (no further cascade). Records the event and updates the part's condition.
 * Returns the per-part amount dealt (after resist absorption capped to 0).
 */
function applyToPart(
  target: GrowthWorldItem,
  path: string[],
  damageType: DamageType,
  amount: number,
  events: DamageEvent[],
): { dealt: number; destroyed: boolean } {
  const resist = target.baseResist ?? FALLBACK_RESIST;
  const dealt = Math.max(0, amount - resist);
  const conditionBefore = target.condition ?? FULL_CONDITION;
  let conditionAfter = conditionBefore;
  let brokeTier = false;
  if (amount >= resist && conditionAfter > 0) {
    conditionAfter = conditionAfter - 1;
    brokeTier = true;
    target.condition = conditionAfter;
  }
  events.push({
    partPath: path,
    partName: target.partName ?? '(unnamed part)',
    damageType,
    damageDealt: dealt,
    resist,
    brokeTier,
    conditionBefore,
    conditionAfter,
  });
  return { dealt, destroyed: conditionAfter === 0 };
}

/**
 * Recursively route damage from a node down into its contents.
 *
 * Algorithm:
 *  1. Apply damage to the current node (its resist absorbs up to `resist`,
 *     excess is the passthrough amount).
 *  2. If there are no internals, stop.
 *  3. Piercing: route passthrough to the designated internal at this depth
 *     (consuming one path segment). Fall back to even-split if no path.
 *  4. Other types: even-split passthrough across all internals; each child
 *     receives Math.floor(passthrough / N), no remainder reassignment
 *     (the half-points are absorbed into the bearer's mass — by design).
 */
function routeDownward(
  node: GrowthWorldItem,
  parentPath: string[],
  damageType: DamageType,
  amount: number,
  options: RouteDamageOptions,
  events: DamageEvent[],
): { destroyedAny: boolean } {
  const myPath = node.partName ? [...parentPath, node.partName] : parentPath;
  const resist = node.baseResist ?? FALLBACK_RESIST;
  const passthrough = Math.max(0, amount - resist);
  const r1 = applyToPart(node, myPath, damageType, amount, events);
  let destroyedAny = r1.destroyed;

  const internals = node.contains;
  if (!internals || internals.length === 0 || passthrough === 0) {
    return { destroyedAny };
  }

  if (damageType === 'piercing' && options.piercingTargetPath && options.piercingTargetPath.length > 0) {
    // The first segment of the path selects which child to descend into.
    const [next, ...rest] = options.piercingTargetPath;
    const targetIdx = internals.findIndex(c => c.partName === next);
    if (targetIdx === -1) {
      // Target not found at this level — degrade gracefully to even-split.
      return distributeEvenly(node, internals, myPath, damageType, passthrough, options, events, destroyedAny);
    }
    const child = internals[targetIdx];
    const childResult = routeDownward(
      child,
      myPath,
      damageType,
      passthrough,
      { ...options, piercingTargetPath: rest },
      events,
    );
    destroyedAny = destroyedAny || childResult.destroyedAny;
    return { destroyedAny };
  }

  return distributeEvenly(node, internals, myPath, damageType, passthrough, options, events, destroyedAny);
}

function distributeEvenly(
  parent: GrowthWorldItem,
  internals: GrowthWorldItem[],
  parentPath: string[],
  damageType: DamageType,
  passthrough: number,
  options: RouteDamageOptions,
  events: DamageEvent[],
  destroyedAnyIn: boolean,
): { destroyedAny: boolean } {
  void parent; // referenced for parity with the routing API
  let destroyedAny = destroyedAnyIn;
  const share = Math.floor(passthrough / internals.length);
  if (share <= 0) return { destroyedAny };
  for (const child of internals) {
    const childResult = routeDownward(child, parentPath, damageType, share, options, events);
    destroyedAny = destroyedAny || childResult.destroyedAny;
  }
  return { destroyedAny };
}

/**
 * Public entry point: route `amount` damage of `damageType` against the
 * given body tree. Returns the new tree + per-part damage events.
 */
export function routeDamage(
  bodyRoot: GrowthWorldItem,
  damageType: DamageType,
  amount: number,
  options: RouteDamageOptions = {},
): RouteDamageResult {
  const next = cloneItem(bodyRoot);
  const events: DamageEvent[] = [];
  const { destroyedAny } = routeDownward(next, [], damageType, amount, options, events);
  return { next, events, anyDestroyed: destroyedAny };
}

/**
 * Human baseline anatomy — the core parts that enable life, thought, speech,
 * and perception. Per canon, finer anatomy lazy-spawns when narrative requires.
 * Each seed declares its own anatomy from scratch — this is the Human default,
 * not a base class for other seeds to extend.
 */
export const HUMAN_BASELINE_ANATOMY: GrowthWorldItem = {
  description: 'Human baseline anatomy',
  isBodyPart: true,
  partName: 'Body',
  baseResist: 4,
  condition: 3,
  materialClass: 'Soft',
  contains: [
    {
      description: 'Cranial container — protects the brain and houses sensory organs.',
      isBodyPart: true,
      partName: 'Head',
      baseResist: 6,
      condition: 3,
      materialClass: 'Hard',
      contains: [
        { description: 'Seat of thought.', isBodyPart: true, partName: 'Brain', baseResist: 2, condition: 3, materialClass: 'Soft' },
        { description: 'Left eye.', isBodyPart: true, partName: 'Left Eye', baseResist: 1, condition: 3, materialClass: 'Soft' },
        { description: 'Right eye.', isBodyPart: true, partName: 'Right Eye', baseResist: 1, condition: 3, materialClass: 'Soft' },
        { description: 'Left ear.', isBodyPart: true, partName: 'Left Ear', baseResist: 1, condition: 3, materialClass: 'Soft' },
        { description: 'Right ear.', isBodyPart: true, partName: 'Right Ear', baseResist: 1, condition: 3, materialClass: 'Soft' },
        { description: 'Tongue — speech organ.', isBodyPart: true, partName: 'Tongue', baseResist: 1, condition: 3, materialClass: 'Soft' },
      ],
    },
    {
      description: 'Thoracic container — houses heart and lungs.',
      isBodyPart: true,
      partName: 'Torso',
      baseResist: 5,
      condition: 3,
      materialClass: 'Soft',
      contains: [
        { description: 'Cardiac muscle — circulation.', isBodyPart: true, partName: 'Heart', baseResist: 2, condition: 3, materialClass: 'Soft' },
        { description: 'Left lung — respiration.', isBodyPart: true, partName: 'Left Lung', baseResist: 2, condition: 3, materialClass: 'Soft' },
        { description: 'Right lung — respiration.', isBodyPart: true, partName: 'Right Lung', baseResist: 2, condition: 3, materialClass: 'Soft' },
      ],
    },
  ],
};
