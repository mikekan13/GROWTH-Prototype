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
  techLevel: number;        // 1-10: Required tech sophistication to work with
  baseWeight: number;       // 1-6: Base weight category (Featherlight → Hefty)
  valueRating: number;      // 1-10: Rarity/desirability
  mods: MaterialMod[];      // Special properties inherited by items made from this material
  description?: string;     // Flavor text
}

/**
 * When combining materials for an item:
 *   Final Resist = (Primary Resist + Subordinate Resist) / 2 (rounded)
 *   Tech Level = Highest among components
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

// Condition labels (1-4 scale)
export const CONDITION_LABELS: Record<number, string> = {
  4: 'Undamaged',
  3: 'Worn',
  2: 'Broken',
  1: 'Destroyed',
};

// Armor layer rules from repository
export const ARMOR_LAYER_RULES = {
  clothing: { maxLayers: 3, resistMultiplier: 0.5, mobilityPenalty: 0 },
  lightArmor: { maxLayers: 1, resistMultiplier: 1.0, mobilityPenalty: 0 },
  heavyArmor: { maxLayers: 1, resistMultiplier: 1.5, mobilityPenalty: -1 }, // -1 Celerity
} as const;
