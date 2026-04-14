/**
 * GRO.WTH Material Catalog — Starter set of common materials
 * Based on GRO.WTH Repository/03_ITEMS_CRAFTING/Material_System.md
 * and X_ARCHIVE_ORIGINS/GROWTH Material and Item Creation Artifact
 *
 * This is the foundation catalog. GMs can define custom materials per campaign.
 */

import type { Material } from '@/types/material';

export const MATERIAL_CATALOG: Record<string, Material> = {
  // ── Soft Materials ─────────────────────────────────────────────────────────

  'Linen': {
    name: 'Linen',
    resistType: 'soft',
    baseResist: 6,

    baseWeight: 1,
    valueRating: 2,
    mods: ['Flammable', 'Absorbent'],
    description: 'Common plant fiber cloth. Light and breathable.',
  },

  'Wool': {
    name: 'Wool',
    resistType: 'soft',
    baseResist: 8,

    baseWeight: 2,
    valueRating: 3,
    mods: ['Absorbent', 'Heat Resistant'],
    description: 'Animal fiber. Warm and insulating even when wet.',
  },

  'Leather': {
    name: 'Leather',
    resistType: 'soft',
    baseResist: 17,

    baseWeight: 2,
    valueRating: 3,
    mods: ['Flexible'],
    description: 'Tanned animal hide. Versatile and durable for soft material.',
  },

  'Hardened Leather': {
    name: 'Hardened Leather',
    resistType: 'soft',
    baseResist: 22,

    baseWeight: 3,
    valueRating: 4,
    mods: ['Protective'],
    description: 'Boiled or wax-treated leather. Rigid and protective.',
  },

  'Silk': {
    name: 'Silk',
    resistType: 'soft',
    baseResist: 10,

    baseWeight: 1,
    valueRating: 6,
    mods: ['Flexible', 'Slashing Resistant'],
    description: 'Luxurious insect fiber. Surprisingly cut-resistant.',
  },

  'Hide': {
    name: 'Hide',
    resistType: 'soft',
    baseResist: 14,

    baseWeight: 3,
    valueRating: 2,
    mods: ['Cold Resistant'],
    description: 'Untanned thick animal skin. Heavy but warm.',
  },

  'Canvas': {
    name: 'Canvas',
    resistType: 'soft',
    baseResist: 8,

    baseWeight: 2,
    valueRating: 2,
    mods: ['Absorbent'],
    description: 'Heavy-duty woven fabric. Sturdy for bags and tents.',
  },

  // ── Hard Materials ─────────────────────────────────────────────────────────

  'Wood': {
    name: 'Wood',
    resistType: 'hard',
    baseResist: 12,

    baseWeight: 2,
    valueRating: 1,
    mods: ['Flammable'],
    description: 'Common construction timber. Easy to work, burns easily.',
  },

  'Bone': {
    name: 'Bone',
    resistType: 'hard',
    baseResist: 14,

    baseWeight: 2,
    valueRating: 1,
    mods: ['Brittle'],
    description: 'Animal or monster bone. Hard but prone to shattering.',
  },

  'Stone': {
    name: 'Stone',
    resistType: 'hard',
    baseResist: 20,

    baseWeight: 5,
    valueRating: 1,
    mods: ['Brittle', 'Heat Resistant'],
    description: 'Raw stone. Very heavy but fire-resistant.',
  },

  'Bronze': {
    name: 'Bronze',
    resistType: 'hard',
    baseResist: 24,

    baseWeight: 4,
    valueRating: 4,
    mods: ['Conductive'],
    description: 'Copper-tin alloy. The first metal armor material.',
  },

  'Iron': {
    name: 'Iron',
    resistType: 'hard',
    baseResist: 28,

    baseWeight: 4,
    valueRating: 3,
    mods: ['Conductive'],
    description: 'Smelted iron. Strong but heavy and prone to rust.',
  },

  'Steel': {
    name: 'Steel',
    resistType: 'hard',
    baseResist: 34,

    baseWeight: 4,
    valueRating: 5,
    mods: ['Sharp'],
    description: 'Carbon-hardened iron. The standard for quality weapons and armor.',
  },

  'Copper': {
    name: 'Copper',
    resistType: 'hard',
    baseResist: 16,

    baseWeight: 4,
    valueRating: 3,
    mods: ['Conductive', 'Flexible'],
    description: 'Soft, malleable metal. Good conductor.',
  },

  'Silver': {
    name: 'Silver',
    resistType: 'hard',
    baseResist: 18,

    baseWeight: 4,
    valueRating: 7,
    mods: ['Conductive'],
    description: 'Precious metal. Valued for its beauty and mystical associations.',
  },

  'Gold': {
    name: 'Gold',
    resistType: 'hard',
    baseResist: 10,

    baseWeight: 5,
    valueRating: 9,
    mods: ['Conductive', 'Flexible'],
    description: 'Dense precious metal. Too soft for combat, prized for adornment.',
  },

  'Crystal': {
    name: 'Crystal',
    resistType: 'hard',
    baseResist: 15,

    baseWeight: 3,
    valueRating: 6,
    mods: ['Brittle', 'Energy Resistant'],
    description: 'Natural crystalline formation. Channels and resists energy.',
  },

  'Obsidian': {
    name: 'Obsidian',
    resistType: 'hard',
    baseResist: 12,

    baseWeight: 3,
    valueRating: 3,
    mods: ['Sharp', 'Brittle'],
    description: 'Volcanic glass. Razor-sharp edges but shatters on impact.',
  },

  // ── Advanced Materials ─────────────────────────────────────────────────────

  'Chainmail': {
    name: 'Chainmail',
    resistType: 'hard',
    baseResist: 30,

    baseWeight: 4,
    valueRating: 5,
    mods: ['Flexible', 'Slashing Resistant'],
    description: 'Interlocking metal rings. Flexible for metal armor.',
  },

  'Plate': {
    name: 'Plate',
    resistType: 'hard',
    baseResist: 40,

    baseWeight: 5,
    valueRating: 7,
    mods: ['Protective', 'Restrictive'],
    description: 'Shaped steel plates. Maximum mundane protection.',
  },

  'Mithril': {
    name: 'Mithril',
    resistType: 'hard',
    baseResist: 38,

    baseWeight: 2,
    valueRating: 9,
    mods: ['Flexible', 'Protective'],
    description: 'Legendary light metal. Strong as steel, light as silk.',
  },

  'Darkwood': {
    name: 'Darkwood',
    resistType: 'hard',
    baseResist: 20,

    baseWeight: 1,
    valueRating: 7,
    mods: ['Heat Resistant'],
    description: 'Magically dense timber. Light as balsa, hard as oak.',
  },

  'Dragonscale': {
    name: 'Dragonscale',
    resistType: 'hard',
    baseResist: 45,

    baseWeight: 3,
    valueRating: 10,
    mods: ['Heat Resistant', 'Protective', 'Sharp'],
    description: 'Scales from a true dragon. Nearly indestructible.',
  },
};

/**
 * Get a material by name (case-insensitive lookup).
 */
export function getMaterial(name: string): Material | undefined {
  return MATERIAL_CATALOG[name] || Object.values(MATERIAL_CATALOG).find(
    m => m.name.toLowerCase() === name.toLowerCase()
  );
}

/**
 * Calculate combined properties when two materials are used together.
 * Per repository rules:
 *   Final Resist = (Primary + Subordinate) / 2 (rounded)
 *   Resist Type = primary's type
 *   Mods = union of both (deduped)
 *   Weight = average (rounded)
 */
export function combineMaterials(primary: Material, subordinate: Material): Material {
  const combinedMods = [...new Set([...primary.mods, ...subordinate.mods])];

  return {
    name: `${primary.name}/${subordinate.name}`,
    resistType: primary.resistType,
    baseResist: Math.round((primary.baseResist + subordinate.baseResist) / 2),
    baseWeight: Math.round((primary.baseWeight + subordinate.baseWeight) / 2),
    valueRating: Math.round((primary.valueRating + subordinate.valueRating) / 2),
    mods: combinedMods,
    description: `${primary.name} with ${subordinate.name} components.`,
  };
}

/**
 * List all material names in the catalog.
 */
export function getMaterialNames(): string[] {
  return Object.keys(MATERIAL_CATALOG);
}
