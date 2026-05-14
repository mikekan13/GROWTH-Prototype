/**
 * GRO.WTH Material System — TypeScript Interfaces
 * Materials define the physical properties of items: resist, weight, tech level, and special modifiers.
 * Based on the canonical rules in GRO.WTH Repository/03_ITEMS_CRAFTING/Material_System.md
 */

// Resist type determines crafting methods and layering behavior
export type ResistType = 'soft' | 'hard';

// Material modifier categories from the repository
export type MaterialMod =
  // Damage Resistance Mods
  | 'Dampening'      // Halve specific damage type
  | 'Heat Resistant'
  | 'Cold Resistant'
  | 'Decay Resistant'
  | 'Energy Resistant'
  | 'Piercing Resistant'
  | 'Slashing Resistant'
  | 'Bashing Resistant'
  | 'Proof'           // Near-immunity to a damage type
  // Damage Vulnerability Mods
  | 'Vulnerable'      // Double damage from a type
  | 'Heat Intolerance'
  | 'Cold Intolerance'
  | 'Flammable'       // Extra condition loss from fire
  | 'Combustible'     // Can be instantly destroyed by fire
  // Physical Property Mods
  | 'Flexible'        // Reduce encumbrance
  | 'Restrictive'     // Double encumbrance
  | 'Protective'      // Increased armor resist
  | 'Brittle'         // Breaks easily on critical fail
  | 'Fragile'         // Condition degrades faster
  | 'Sharp'           // Bonus vs soft materials
  | 'Absorbent'       // Soaks liquids; gains Heat Resistant when wet, Cold Intolerant when wet
  | 'Unrepairable'    // Cannot be repaired non-magically
  | 'Conductive'      // Passes energy damage through
  | 'Insulating';     // Blocks energy/heat transfer

export interface Material {
  name: string;
  resistType: ResistType;
  baseResist: number;       // 1-50: Inherent durability
  baseWeight: number;       // 1-6: Base weight category (Featherlight → Hefty)
  valueRating: number;      // 1-10: Rarity/desirability
  mods: MaterialMod[];      // Special properties inherited by items made from this material
  description?: string;     // Flavor text
}

/**
 * When combining materials for an item:
 *   Final Resist = (Primary Resist + Subordinate Resist) / 2 (rounded)
 *   Resist Type = Primary material's type
 *   Mods = Union of all component mods (duplicates listed once)
 *   Weight = Average of component weights + item-type modifier + Flexible/Restrictive
 */
export interface ItemMaterials {
  primary: string;          // Material name (key into catalog)
  subordinate?: string;     // Optional secondary material
}

// Weight level labels (0-10 scale, canonical from repository)
export const WEIGHT_LEVEL_LABELS: Record<number, string> = {
  0: 'Negligible',
  1: 'Featherlight',
  2: 'Light',
  3: 'Moderate',
  4: 'Heavy',
  5: 'Very Heavy',
  6: 'Hefty',
  7: 'Massive',
  8: 'Massive',
  9: 'Massive',
  10: 'Immovable',
};

export function getWeightLabel(level: number): string {
  return WEIGHT_LEVEL_LABELS[Math.min(Math.max(level, 0), 10)] || `W${level}`;
}

// Carry-capacity formula: each point of Clout grants this many lbs of comfortable carry.
export const LBS_PER_CLOUT_LEVEL = 10;

export function getCarryCapacityLbs(clout: number): number {
  return Math.max(0, clout) * LBS_PER_CLOUT_LEVEL;
}

// Best-effort conversion for legacy items still using the 0-10 weightLevel abstraction.
// Placeholder until items are re-seeded with weightLbs.
export function legacyWeightLevelToLbs(level: number | undefined): number {
  if (level == null) return 0;
  return level * 2;
}

// Read effective lbs from a partial item-data shape, preferring weightLbs and falling back to legacy.
export function getItemWeightLbs(data: { weightLbs?: number; weightLevel?: number }): number {
  if (typeof data.weightLbs === 'number') return data.weightLbs;
  return legacyWeightLevelToLbs(data.weightLevel);
}

// Condition labels — canon 5-level scale per ruling r-2026-04-22-12.
export const CONDITION_LABELS: Record<number, string> = {
  4: 'Indestructible',
  3: 'Undamaged',
  2: 'Worn',
  1: 'Broken',
  0: 'Destroyed',
};

// Armor layer rules from repository
export const ARMOR_LAYER_RULES = {
  clothing: { maxLayers: 3, resistMultiplier: 0.5, mobilityPenalty: 0 },
  lightArmor: { maxLayers: 1, resistMultiplier: 1.0, mobilityPenalty: 0 },
  heavyArmor: { maxLayers: 1, resistMultiplier: 1.5, mobilityPenalty: -1 }, // -1 Celerity
} as const;
