/**
 * Forge content schemas — standalone module with NO server-only deps so
 * scripts (seeders, CLIs) can validate content payloads with the exact
 * gate the Forge service uses. forge.ts re-exports everything here.
 */

import { z } from 'zod';
import { ValidationError } from '@/lib/errors';
import { SKILL_GOVERNORS, MAGIC_SCHOOLS, TRAIT_CATEGORIES } from '@/types/growth';
// ── Forge Item Types ──────────────────────────────────────────────────────

export const FORGE_ITEM_TYPES = ['seed', 'root', 'branch', 'skill', 'item', 'nectar', 'blossom', 'thorn', 'spell'] as const;
export type ForgeItemType = typeof FORGE_ITEM_TYPES[number];

// ── Zod Schemas ───────────────────────────────────────────────────────────

const skillGovernorSchema = z.enum(SKILL_GOVERNORS as unknown as [string, ...string[]]);

// ── Block conditions (Mike ruling 2026-08-19) ─────────────────────────────
// "Any block can have requirements or even restrictions. These have to be
// enforced for balance sake across the meta — it can't be left up to a GM."
// Structured, binary, machine-checked at character assembly
// (services/block-conditions.ts). `requires`: ALL must hold. `restricted`:
// NONE may hold. Legacy free-text `requirements`/`seedRequirement` fields
// remain readable but are display-only.
export const blockConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('seed'), name: z.string().min(1).max(100) }),
  z.object({
    type: z.literal('block'),
    blockType: z.enum(['root', 'branch', 'nectar', 'thorn', 'blossom']).optional(),
    name: z.string().min(1).max(100),
  }),
  z.object({ type: z.literal('minAge'), years: z.number().int().min(0) }),
  // Checks POOL MAX (levels + seed augs), so "Wit 30+" is legal.
  z.object({ type: z.literal('attribute'), name: skillGovernorSchema, min: z.number().int().min(1).max(100) }),
  z.object({ type: z.literal('skill'), name: z.string().min(1).max(100), min: z.number().int().min(1).max(20) }),
  // The "almost anything" clause (Mike 2026-08-19): arbitrary prose,
  // adjudicated by JEWL against the character's actual state — NOT the GM.
  // Fails closed: unadjudicated customs block crystallization.
  z.object({ type: z.literal('custom'), text: z.string().min(1).max(300) }),
]);
export type BlockCondition = z.infer<typeof blockConditionSchema>;

const blockConditionFields = {
  requires: z.array(blockConditionSchema).max(10).optional(),
  restricted: z.array(blockConditionSchema).max(10).optional(),
};

const forgeSkillDataSchema = z.object({
  // 1-3 governors per CANON_CORE §5 (supersedes the old "as many as you
  // wish" archive text). Frequency is excluded from SKILL_GOVERNORS.
  governors: z.array(skillGovernorSchema).min(1, 'At least one governor required').max(3, 'Skills take 1-3 governors (CANON_CORE §5)'),
  description: z.string().max(500).optional(),
  ...blockConditionFields,
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
  // Condition is the FIVE-level 0-4 track (r-2026-04-22-12): 4 Indestructible,
  // 3 Undamaged (normal max), 2 Worn, 1 Broken (resist halved), 0 Destroyed.
  // Was 1-4 (audit I1) — 0 Destroyed was unrepresentable.
  condition: z.number().int().min(0).max(4).optional(),
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
  // Canon weapon shape (item-fields corrections 2026-05-14, audit I3):
  // multiple NAMED attacks, each with its own damage breakdown and a
  // REQUIRED target attribute. The single `damage` field stays as the
  // legacy read for old rows.
  attacks: z.array(z.object({
    name: z.string().max(100),
    damage: forgeDamageSchema,
    targetAttribute: z.string().max(50),
    range: z.enum(['melee', 'short', 'medium', 'long']).optional(),
    notes: z.string().max(300).optional(),
  })).max(10).optional(),
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
  ...blockConditionFields,
});

const rollModifierSchema = z.object({
  flat: z.number(),
  skillNamePattern: z.string().max(100).optional(),
  governorAttribute: z.string().max(50).optional(),
  label: z.string().max(100).optional(),
});

const forgeTraitDataSchema = z.object({
  description: z.string().max(500),
  mechanicalEffect: z.string().max(600).optional(),
  source: z.string().max(200).optional(),
  // pillar REQUIRED at authoring per r-2026-05-19-03 (drives death-engine
  // routing). Hardened 2026-08-17 (audit): new content must carry it;
  // legacy un-tagged rows in the DB are read, not re-validated.
  pillar: z.enum(['body', 'spirit', 'soul']),
  // Controlled vocabulary (ruled 2026-08-19) — free strings fragmented the
  // index (19 variants in the wild). Conditions and Et'herling's balance
  // cross-referencing depend on this being stable.
  category: z.enum(TRAIT_CATEGORIES as unknown as [string, ...string[]]).optional(),
  rollModifiers: z.array(rollModifierSchema).max(10).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  ...blockConditionFields,
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
  ...blockConditionFields,
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

// Fate die value caps the seed's nectar+thorn slot count (canon §4).
const FATE_DIE_SLOTS: Record<string, number> = { d4: 4, d6: 6, d8: 8, d12: 12, d20: 20 };

// Seed traits are ACCOUNTED-FOR line items (Mike ruling 2026-08-18): a seed's
// nectars/thorns carry their Kai grade so seedKV's ledger closes — no more
// phantom trait names with invisible KV. Bare strings remain readable for
// legacy rows; new authoring should use the object form.
const seedTraitRefSchema = z.union([
  z.string().max(100),
  z.object({
    name: z.string().min(1).max(100),
    /** Kai's grade. Nectars positive; thorns are lien MAGNITUDE (stored
     *  positive or negative — the pricer folds thorns in as negative). */
    kv: z.number().int(),
    forgeItemId: z.string().max(64).optional(),
  }),
]);

const forgeSeedDataSchema = z.object({
  description: z.string().max(2000),
  baseFateDie: z.enum(['d4', 'd6', 'd8', 'd12', 'd20']),
  frequency: z.number().int().min(0).max(200),
  fatedAge: z.number().int().min(1),
  baseResist: z.number().int().min(0).max(50),
  attributes: attributeAugmentsSchema,
  skills: z.array(z.string().max(100)).max(10).default([]),
  nectars: z.array(seedTraitRefSchema).max(10).default([]),
  thorns: z.array(seedTraitRefSchema).max(10).default([]),
  // Audit S1 (2026-08-17): the published Human carries bodyStructure but the
  // schema didn't know it — z.object strips unknown keys, so chain re-authoring
  // silently DROPPED anatomy. Current parts/vitals shape; the body-as-items
  // migration (audit S2) is a separate open question.
  bodyStructure: z.object({
    parts: z.array(z.string().max(50)).max(60),
    vitals: z.array(z.string().max(50)).max(20).default([]),
  }).optional(),
  // Audit S3: numeric grid footprint + descriptive height, no size
  // categories (r-2026-05-19-05). Optional until existing seeds backfill.
  size: z.object({
    width: z.number().int().min(1).max(20),
    length: z.number().int().min(1).max(20),
    height: z.string().max(50).optional(),
  }).optional(),
  ...blockConditionFields,
}).superRefine((data, ctx) => {
  const slots = (data.nectars?.length ?? 0) + (data.thorns?.length ?? 0);
  const cap = FATE_DIE_SLOTS[data.baseFateDie] ?? 8;
  if (slots > cap) {
    ctx.addIssue({
      code: 'custom',
      path: ['nectars'],
      message: `Nectars+thorns (${slots}) exceed the ${data.baseFateDie} trait-slot cap of ${cap}`,
    });
  }
});

const forgeRootDataSchema = z.object({
  description: z.string().max(2000),
  // Frequency COST is computed by the chain (breakeven rule,
  // r-2026-04-22-10) — authors don't guess it. Default 0.
  frequency: z.number().int().default(0),
  // ageAdded = DURATION: calendar years this block adds (Mike ruling
  // 2026-08-19: starting age = Σ ageAdded over roots+branches; seeds add
  // none). Roots run from birth, so a root's duration is the age it
  // reaches — capped 25 (max-root-age, r-2026-04-22-11).
  ageAdded: z.number().int().min(0).max(25),
  attributes: attributeLevelsSchema,
  skills: z.array(forgeSkillEntrySchema).max(20).default([]),
  nectars: z.array(z.string().max(100)).max(10).default([]),
  thorns: z.array(z.string().max(100)).max(10).default([]),
  seedRequirement: z.string().max(100).default(''),
  ...blockConditionFields,
});

const forgeBranchDataSchema = z.object({
  description: z.string().max(2000),
  frequency: z.number().int().default(0),
  // Duration in calendar years (see root comment). Kai gauge: KV/ageAdded
  // should land 3-15.
  ageAdded: z.number().int().min(0),
  attributes: attributeLevelsSchema,
  skills: z.array(forgeSkillEntrySchema).max(20).default([]),
  nectars: z.array(z.string().max(100)).max(10).default([]),
  thorns: z.array(z.string().max(100)).max(10).default([]),
  requirements: z.string().max(200).default(''),
  ...blockConditionFields,
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

