/**
 * Forge content schemas — standalone module with NO server-only deps so
 * scripts (seeders, CLIs) can validate content payloads with the exact
 * gate the Forge service uses. forge.ts re-exports everything here.
 */

import { z } from 'zod';
import { ValidationError } from '@/lib/errors';
import { SKILL_GOVERNORS, MAGIC_SCHOOLS } from '@/types/growth';
// ── Forge Item Types ──────────────────────────────────────────────────────

export const FORGE_ITEM_TYPES = ['seed', 'root', 'branch', 'skill', 'item', 'nectar', 'blossom', 'thorn', 'spell'] as const;
export type ForgeItemType = typeof FORGE_ITEM_TYPES[number];

// ── Zod Schemas ───────────────────────────────────────────────────────────

const skillGovernorSchema = z.enum(SKILL_GOVERNORS as unknown as [string, ...string[]]);

const forgeSkillDataSchema = z.object({
  governors: z.array(skillGovernorSchema).min(1, 'At least one governor required'),
  description: z.string().max(500).optional(),
});

const forgeDamageSchema = z.object({
  piercing: z.number().min(0).default(0),
  slashing: z.number().min(0).default(0),
  heat: z.number().min(0).default(0),
  decay: z.number().min(0).default(0),
  cold: z.number().min(0).default(0),
  bashing: z.number().min(0).default(0),
  energy: z.number().min(0).default(0),
}).optional();

const forgePrimaMateriaSchema = z.object({
  school: z.string().max(100),
  level: z.number().int().min(1).max(10),
  stable: z.boolean(),
  charges: z.number().int().min(0).optional(),
}).optional();

const itemAbilitySchema = z.object({
  name: z.string().max(100),
  description: z.string().max(500),
  mechanicalEffect: z.string().max(300).optional(),
  kv: z.number().optional(),
});

const forgeItemDataSchema = z.object({
  // Core properties
  description: z.string().max(500).optional(),
  material: z.string().max(100).optional(),
  weightLevel: z.number().int().min(0).max(10).optional(),
  condition: z.number().int().min(1).max(4).optional(),
  // Rarity canon is 1-10 (Material_System.md); old 6-bucket enum kept for back-compat.
  rarity: z.union([
    z.enum(['common', 'uncommon', 'rare', 'very_rare', 'legendary', 'artifact']),
    z.number().int().min(1).max(10),
  ]).optional(),
  value: z.number().min(0).optional(),
  notes: z.string().max(1000).optional(),
  // Item sub-type (weapon, armor, etc.)
  itemType: z.enum(['weapon', 'armor', 'accessory', 'consumable', 'tool', 'artifact', 'prima_materia', 'misc']).optional(),
  // Canonical GrowthWorldItem fields (item-fields canon 2026-05-14)
  primaryMaterial: z.string().max(100).optional(),
  subordinateMaterials: z.array(z.string().max(100)).max(10).optional(),
  materialClass: z.enum(['Soft', 'Hard']).optional(),
  baseResist: z.number().min(0).max(50).optional(),
  weightLbs: z.number().min(0).optional(),
  quality: z.number().int().min(1).max(10).optional(),
  itemAbilities: z.array(itemAbilitySchema).max(20).optional(),
  shots: z.number().int().min(0).optional(),
  reload: z.string().max(100).optional(),
  damageScaling: z.union([z.boolean(), z.string().max(100)]).optional(),
  armorCategory: z.enum(['Clothing', 'Light', 'Heavy']).optional(),
  // Multi-component possessions (vehicles/buildings): nested component
  // items via the body-comp contains chain. Kept loose — components are
  // full item payloads validated at instantiation, not authoring.
  contains: z.array(z.record(z.string(), z.unknown())).max(40).optional(),
  // Weapon fields
  damage: forgeDamageSchema,
  range: z.enum(['melee', 'short', 'medium', 'long']).optional(),
  weaponProperties: z.array(z.string().max(100)).max(20).optional(),
  targetAttribute: z.string().max(50).optional(),
  // Armor fields
  armorLayer: z.enum(['clothing', 'lightArmor', 'heavyArmor']).optional(),
  resistance: z.number().min(0).optional(),
  coveredParts: z.array(z.string().max(50)).max(20).optional(),
  // Material modifiers
  materialModifiers: z.array(z.string().max(100)).max(20).optional(),
  // Prima Materia
  primaMateria: forgePrimaMateriaSchema,
  // Tags
  tags: z.array(z.string().max(50)).max(20).optional(),
  // Legacy field
  properties: z.array(z.string().max(100)).max(20).optional(),
});

const rollModifierSchema = z.object({
  flat: z.number(),
  skillNamePattern: z.string().max(100).optional(),
  governorAttribute: z.string().max(50).optional(),
  label: z.string().max(100).optional(),
});

const forgeTraitDataSchema = z.object({
  description: z.string().max(500),
  mechanicalEffect: z.string().max(300).optional(),
  source: z.string().max(200).optional(),
  // Canon trait fields (GrowthTrait parity; pillar required at authoring
  // per r-2026-05-19-03 — optional here for legacy rows, default 'spirit').
  pillar: z.enum(['body', 'spirit', 'soul']).optional(),
  category: z.string().max(100).optional(),
  rollModifiers: z.array(rollModifierSchema).max(10).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

// Woven spell (r-2026-07-22-01 #4/#5, schema signed off r-2026-07-23-01).
// Mechanics fields are OPTIONAL here because a PlayerRequest starts as pure
// intent (player → GM → godhead chain fills DR/mana); learnSpell enforces
// completeness before a spell can reach a character's knownSpells.
const magicSchoolSchema = z.enum(Object.keys(MAGIC_SCHOOLS) as [string, ...string[]]);

const spellDrBreakdownSchema = z.object({
  base: z.number().int().min(1),
  targets: z.number().int().min(0).optional(),
  size: z.number().int().min(0).optional(),
  duration: z.number().int().min(0).optional(),
  range: z.number().int().min(0).optional(),
  schools: z.number().int().min(0).optional(),
  total: z.number().int().min(1),
}).refine(
  (d) => d.total === d.base + (d.targets ?? 0) + (d.size ?? 0) + (d.duration ?? 0)
    + (d.range ?? 0) + (d.schools ?? 0),
  { message: 'DR is additive: total must equal the sum of its parts' },
);

export const forgeSpellDataSchema = z.object({
  description: z.string().min(1).max(2000),
  school: magicSchoolSchema,
  schools: z.array(magicSchoolSchema).max(10).optional(),
  castingMethod: z.literal('weaving').default('weaving'),
  dr: spellDrBreakdownSchema.optional(),
  manaCost: z.number().int().min(0).optional(),
  /** KRMA value of the spell (r-2026-07-23-04) — priced by the godhead chain
   *  at authoring; required (with dr + manaCost) before the spell can be taught. */
  kv: z.number().int().min(0).optional(),
  failureConditions: z.string().max(1000).optional(),
  persistentEffects: z.array(z.object({
    kind: z.enum(['trait', 'item', 'other']),
    description: z.string().max(500),
  })).max(10).optional(),
});

// Root/Branch attribute schema — starting levels (not augments)
const attributeLevelsSchema = z.object({
  clout: z.number().int().min(0).max(20).default(0),
  celerity: z.number().int().min(0).max(20).default(0),
  constitution: z.number().int().min(0).max(20).default(0),
  focus: z.number().int().min(0).max(20).default(0),
  flow: z.number().int().min(0).max(20).default(0),
  willpower: z.number().int().min(0).max(20).default(0),
  wisdom: z.number().int().min(0).max(20).default(0),
  wit: z.number().int().min(0).max(20).default(0),
});

// Seed augment schema — augments added to attributes
const attributeAugmentsSchema = z.object({
  clout: z.number().int().min(0).max(30).default(0),
  celerity: z.number().int().min(0).max(30).default(0),
  constitution: z.number().int().min(0).max(30).default(0),
  focus: z.number().int().min(0).max(30).default(0),
  flow: z.number().int().min(0).max(30).default(0),
  willpower: z.number().int().min(0).max(30).default(0),
  wisdom: z.number().int().min(0).max(30).default(0),
  wit: z.number().int().min(0).max(30).default(0),
});

const forgeSkillEntrySchema = z.object({
  name: z.string().min(1).max(100),
  level: z.number().int().min(1).max(20),
});

const forgeSeedDataSchema = z.object({
  description: z.string().max(2000),
  baseFateDie: z.enum(['d4', 'd6', 'd8', 'd12', 'd20']),
  frequency: z.number().int().min(0).max(200),
  fatedAge: z.number().int().min(1),
  baseResist: z.number().int().min(0).max(50),
  attributes: attributeAugmentsSchema,
  skills: z.array(z.string().max(100)).max(10).default([]),
  nectars: z.array(z.string().max(100)).max(10).default([]),
  thorns: z.array(z.string().max(100)).max(10).default([]),
});

const forgeRootDataSchema = z.object({
  description: z.string().max(2000),
  frequency: z.number().int(),
  ageAdded: z.number().int().min(0),
  attributes: attributeLevelsSchema,
  skills: z.array(forgeSkillEntrySchema).max(20).default([]),
  nectars: z.array(z.string().max(100)).max(10).default([]),
  thorns: z.array(z.string().max(100)).max(10).default([]),
  seedRequirement: z.string().max(100).default(''),
});

const forgeBranchDataSchema = z.object({
  description: z.string().max(2000),
  frequency: z.number().int(),
  ageAdded: z.number().int().min(0),
  attributes: attributeLevelsSchema,
  skills: z.array(forgeSkillEntrySchema).max(20).default([]),
  nectars: z.array(z.string().max(100)).max(10).default([]),
  thorns: z.array(z.string().max(100)).max(10).default([]),
  requirements: z.string().max(200).default(''),
});

// Data schema depends on type
export function validateForgeData(type: string, data: unknown) {
  switch (type) {
    case 'seed': return forgeSeedDataSchema.parse(data);
    case 'root': return forgeRootDataSchema.parse(data);
    case 'branch': return forgeBranchDataSchema.parse(data);
    case 'skill': return forgeSkillDataSchema.parse(data);
    case 'item': return forgeItemDataSchema.parse(data);
    case 'nectar':
    case 'blossom':
    case 'thorn': return forgeTraitDataSchema.parse(data);
    case 'spell': return forgeSpellDataSchema.parse(data);
    default: throw new ValidationError(`Unknown forge item type: ${type}`);
  }
}

