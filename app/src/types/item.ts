/**
 * GRO.WTH World Item System — TypeScript Interfaces
 * World items are campaign-level entities that exist independently of character inventories.
 * They appear on the Relations Canvas and can be assigned to characters or locations.
 */

export type WorldItemType = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'tool' | 'artifact' | 'prima_materia' | 'misc';

export interface GrowthWorldItem {
  description: string;
  material?: string;            // Primary material (e.g. "Steel", "Leather", "Gold")
  techLevel?: number;           // 1-10: Required tech level to use
  weightLevel?: number;         // 0-10: Weight category
  condition?: number;           // 1-4: Undamaged(4), Worn(3), Broken(2), Destroyed(1)
  rarity?: ItemRarity;
  value?: number;               // KV value
  notes?: string;               // GM notes

  // Weapon-specific (P:S:H/D\C:B:E format)
  damage?: {
    piercing: number;
    slashing: number;
    heat: number;
    decay: number;
    cold: number;
    bashing: number;
    energy: number;
  };
  range?: string;               // Melee, short, medium, long
  weaponProperties?: string[];  // Unblockable, Brittle, Strong, etc.
  targetAttribute?: string;     // Which attribute the weapon targets

  // Armor-specific
  armorLayer?: 'clothing' | 'lightArmor' | 'heavyArmor';
  resistance?: number;          // Base resistance value
  coveredParts?: string[];      // Body parts covered

  // Material modifiers
  materialModifiers?: string[]; // Dampening, Resistant, Proof, Flexible, etc.

  // Prima Materia specific
  primaMateria?: {
    school: string;             // Magic school
    level: number;              // 1-10 power level
    stable: boolean;            // Stable vs unstable
    charges?: number;           // Remaining uses (stable only)
  };

  // Equipped state (tracked per-character when item is held)
  equipped?: boolean;

  // Tags for filtering/searching
  tags?: string[];
}

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'very_rare' | 'legendary' | 'artifact';

/**
 * A CampaignItem held by a character, used by InventoryCard.
 * This is the bridge between the DB CampaignItem and the UI.
 */
export interface HeldItemData {
  id: string;
  name: string;
  type: WorldItemType;
  status: string;
  data: GrowthWorldItem;
}

export const ITEM_TYPE_ICONS: Record<WorldItemType, string> = {
  weapon: '\u2694\uFE0F',       // crossed swords
  armor: '\u{1F6E1}\uFE0F',    // shield
  accessory: '\u{1F4FF}',      // prayer beads
  consumable: '\u{1F9EA}',     // test tube
  tool: '\u{1F527}',           // wrench
  artifact: '\u{1F48E}',       // gem
  prima_materia: '\u{2728}',   // sparkles
  misc: '\u{1F4E6}',           // package
};

export const RARITY_COLORS: Record<ItemRarity, string> = {
  common: '#c0c0c0',
  uncommon: '#4ade80',
  rare: '#60a5fa',
  very_rare: '#c4a0e8',
  legendary: '#ffcc78',
  artifact: '#f7525f',
};

// Format damage in the canonical P:S:H/D\C:B:E format
export function formatDamage(damage: GrowthWorldItem['damage']): string {
  if (!damage) return '-';
  return `${damage.piercing}:${damage.slashing}:${damage.heat}/${damage.decay}\\${damage.cold}:${damage.bashing}:${damage.energy}`;
}

// Condition label helpers
export function getConditionLabel(condition: number): string {
  switch (condition) {
    case 4: return 'Undamaged';
    case 3: return 'Worn';
    case 2: return 'Broken';
    case 1: return 'Destroyed';
    default: return 'Unknown';
  }
}

export function getConditionColor(condition: number): string {
  switch (condition) {
    case 4: return '#4ade80';
    case 3: return '#ffcc78';
    case 2: return '#f59e0b';
    case 1: return '#E8585A';
    default: return '#808080';
  }
}
