/**
 * GRO.WTH World Item System — TypeScript Interfaces
 * World items are campaign-level entities that exist independently of character inventories.
 * They appear on the Relations Canvas and can be assigned to characters or locations.
 */

export type WorldItemType = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'tool' | 'artifact' | 'prima_materia' | 'misc';

/**
 * Item Ability — like Nectars/Thorns but for items.
 * Play-defining ability blocks attached to a specific item.
 * KV is processed into the item's total KV in the background (NOT shown in UI).
 */
export interface ItemAbility {
  name: string;
  description: string;
  mechanicalEffect?: string;
  kv?: number;            // Hidden from UI; contributes to item's total KV in the background
}

export interface GrowthWorldItem {
  description: string;

  // ── Materials (canon: Material_System.md) ──
  primaryMaterial?: string;        // Primary material; e.g. "Iron", "Leather"
  subordinateMaterials?: string[]; // Supporting materials (combination formula: Final Resist = (Primary + Subordinate) / 2)
  materialClass?: 'Soft' | 'Hard'; // Material classification (Mike 2026-05-14: Soft/Hard only — no Hybrid)
  material?: string;               // DEPRECATED: use primaryMaterial. Kept for back-compat with existing data.

  // ── Universal physical properties ──
  baseResist?: number;             // 1-50 (Material_System.md:34) — universal, not just armor
  weightLbs?: number;              // Actual weight in lbs (canon; replaces weightLevel)
  weightLevel?: number;            // DEPRECATED: 0-10 abstraction. Migrating to weightLbs.

  // ── Condition (canon: Equipment_Conditions.md, ruling r-2026-04-22-12) ──
  // 4=Indestructible, 3=Undamaged, 2=Worn, 1=Broken, 0=Destroyed.
  condition?: number;

  // ── Properties (canon-universal — NOT weapon-specific) ──
  // Inherited from constituent materials, may be augmented or dampened/cancelled
  // by the combined material makeup, plus item-specific additions.
  properties?: string[];           // Sharp, Brittle, Strong, Flexible, Flammable, etc.
  weaponProperties?: string[];     // DEPRECATED: same concept as `properties`. Kept for back-compat.
  materialModifiers?: string[];    // DEPRECATED: same concept as `properties`. Kept for back-compat.

  // ── Quality, Rarity, Value ──
  quality?: number;                // 1-10 (canon — descriptions TBD)
  // Rarity canon is 1-10 (Material_System.md:41). Old 6-bucket enum kept for back-compat with existing data.
  rarity?: ItemRarity | number;
  value?: number;                  // KV value

  // ── Item-level abilities (the Nectars/Thorns of items) ──
  itemAbilities?: ItemAbility[];

  // ── Weapon-specific (Weapon_System.md) ──
  damage?: {
    piercing: number;
    slashing: number;
    heat: number;
    decay: number;
    cold: number;
    bashing: number;
    energy: number;
  };
  range?: string;                  // melee / reach / "50ft" / etc.
  targetAttribute?: string;        // Which attribute the weapon targets (Celerity, Constitution, Clout)
  damageScaling?: boolean | string;// Optional: some weapons add wielder attribute level to damage
  shots?: number;                  // Firearms: rounds per load
  reload?: string;                 // Firearms: reload mechanism description

  // ── Armor-specific (Armor_System.md) ──
  armorCategory?: 'Clothing' | 'Light' | 'Heavy';
  armorLayer?: 'clothing' | 'lightArmor' | 'heavyArmor'; // DEPRECATED: use armorCategory
  resistance?: number;             // DEPRECATED: armor-only effective resist. Use baseResist (universal).
  coveredParts?: string[];         // DEPRECATED (Mike 2026-05-14: no coverage). Kept for back-compat.

  // ── Prima Materia (special class) ──
  primaMateria?: {
    school: string;
    level: number;
    stable: boolean;
    charges?: number;
  };

  // ── Equipped flag (tracked per-character when item is held) ──
  equipped?: boolean;

  // ── GM and free-form metadata ──
  notes?: string;
  tags?: string[];
}

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'very_rare' | 'legendary' | 'artifact';

// Canonical item properties — universal, not weapon-specific (Mike 2026-05-14).
// Inherited from constituent materials; may be dampened/cancelled by material makeup.
export const ITEM_PROPERTIES = [
  // From Weapon_System.md (re-classified as universal)
  'Unblockable',
  'Brittle',
  'Strong',
  'Regenerating',
  'Sharp',
  'Blunt',
  'Flexible',
  // From Material_System.md
  'Absorbent',
  'Flammable',
  'Combustible',
  'Restrictive',
  'Protective',
  'Fragile',
  'Unrepairable',
  'Heat Resistant',
  'Cold Resistant',
  'Electric Proof',
  'Electric Vulnerable',
  'Heat Proof',
  'Cold Proof',
  'Featherlight',
] as const;

// Legacy alias — same list, renamed (will be removed once callers migrate)
export const WEAPON_PROPERTIES = ITEM_PROPERTIES;

// BODY_PARTS removed pending modular-body discussion (Mike 2026-05-14: "body slots have never been just 4").
// Custom body composition system is design-pending; do NOT lock a slot list here.

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

// ── Rarity helpers (canon: Material_System.md:41 — 1-10 tier; legacy 6-bucket enum kept) ──

const RARITY_TIER_COLORS = [
  '#808080', // 0 (unused)
  '#a0a0a0', // 1 Ubiquitous
  '#c0c0c0', // 2 Common
  '#88b070', // 3
  '#4ade80', // 4 Uncommon
  '#60a5fa', // 5 Rare
  '#7c9ee8', // 6
  '#c4a0e8', // 7 Very Rare
  '#ffcc78', // 8 Legendary
  '#f7a878', // 9
  '#f7525f', // 10 Impossible / Artifact
];

export function getRarityColor(rarity: ItemRarity | number | undefined): string {
  if (typeof rarity === 'number') {
    const t = Math.max(0, Math.min(10, Math.floor(rarity)));
    return RARITY_TIER_COLORS[t] ?? '#c0c0c0';
  }
  return RARITY_COLORS[rarity ?? 'common'];
}

export function getRarityLabel(rarity: ItemRarity | number | undefined): string {
  if (typeof rarity === 'number') return `Tier ${rarity}`;
  return (rarity ?? 'common').replace('_', ' ');
}

// Format damage in the canonical P:S:H/D\C:B:E format
export function formatDamage(damage: GrowthWorldItem['damage']): string {
  if (!damage) return '-';
  return `${damage.piercing}:${damage.slashing}:${damage.heat}/${damage.decay}\\${damage.cold}:${damage.bashing}:${damage.energy}`;
}

// Condition label helpers — canon ruling r-2026-04-22-12 (5 levels, 0-4).
export function getConditionLabel(condition: number): string {
  switch (condition) {
    case 4: return 'Indestructible';
    case 3: return 'Undamaged';
    case 2: return 'Worn';
    case 1: return 'Broken';
    case 0: return 'Destroyed';
    default: return 'Unknown';
  }
}

export function getConditionColor(condition: number): string {
  switch (condition) {
    case 4: return '#c4a0e8';
    case 3: return '#4ade80';
    case 2: return '#ffcc78';
    case 1: return '#f59e0b';
    case 0: return '#E8585A';
    default: return '#808080';
  }
}
