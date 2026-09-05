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

// ── Maturity flags (Mike rulings 2026-08-04 + 2026-08-19) ────────────────
// Audience control = flags, never content avoidance. Metadata today
// (display + honest authoring); tomorrow the signal for BOTH campaign
// audience filtering AND the model router (mature-flagged generation
// routes to the local lane; cloud does the unflagged heavy lifting).
// Controlled vocabulary — extend by ruling only.
export const MATURITY_FLAGS = [
  'mental-health', 'violence', 'substance', 'trauma', 'illness-detail',
] as const;
const maturityFlagsField = {
  maturityFlags: z.array(z.enum(MATURITY_FLAGS)).max(5).optional(),
};

const forgeSkillDataSchema = z.object({
  // 1-3 governors per CANON_CORE §5 (supersedes the old "as many as you
  // wish" archive text). Frequency is excluded from SKILL_GOVERNORS.
  governors: z.array(skillGovernorSchema).min(1, 'At least one governor required').max(3, 'Skills take 1-3 governors (CANON_CORE §5)'),
  description: z.string().max(500).optional(),
  ...blockConditionFields,
  ...maturityFlagsField,
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
  // Item sub-type (weapon, armor, etc.). 'kit' = a possession with a KV
  // budget drawn down on plausible demand (r-2026-08-24-16 — Mike marks it
  // controversial but fun-chosen; plausibility gate + finite budget are the
  // mitigations; ontology-consistent with crystallization).
  itemType: z.enum(['weapon', 'armor', 'accessory', 'consumable', 'tool', 'artifact', 'prima_materia', 'kit', 'misc']).optional(),
  /** REQUIRED when itemType='kit': the finite draw-down pool. Anything
   *  plausibly in the kit and needed is pulled FROM this budget on demand —
   *  never pre-itemized. */
  kvBudget: z.number().int().min(1).max(500).optional(),
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
  ...maturityFlagsField,
});

// Tangible, TABLE-TRACKABLE time units only — there is no "scene" in
// GROWTH, and no one counts fictional minutes at a table (Mike,
// 2026-08-26). Sub-hour states exist only in encounter mode, where the
// unit is ROUNDS (1 round = 6 seconds, Combat_Grid_System.md); outside
// encounters, short-lived states are phrased as conditions ("while exits
// remain unassessed"), not clock time.
const effectDurationSchema = z.object({
  amount: z.number().positive(),
  unit: z.enum(['rounds', 'hours', 'days', 'cycles']),
});

const rollModifierSchema = z.object({
  flat: z.number(),
  skillNamePattern: z.string().max(100).optional(),
  governorAttribute: z.string().max(50).optional(),
  /** Pillar-breadth target: applies to every roll governed by any of the
   *  pillar's attributes ("+2 to Body-pillar checks"). Stock-catalog
   *  compliance pass 2026-08-26 — most stock mechanics need this or
   *  allChecks; per-attribute targeting alone couldn't express them. */
  pillar: z.enum(['body', 'spirit', 'soul']).optional(),
  /** Universal target ("−1 to all checks"). Mutually exclusive with
   *  governorAttribute/pillar. */
  allChecks: z.boolean().optional(),
  label: z.string().max(100).optional(),
  // Lexicon scope (Mike ruling 2026-08-24): "raw" = attribute checks only;
  // "governed" = every roll whose skill has this governor. Ambiguous prose
  // is a defect — structured entries say which they mean.
  scope: z.enum(['raw', 'governed']).optional(),
  /** Timed window measured from the moment the condition became true
   *  (e.g. −2 Wit-governed for 3 rounds after entering; rounds only tick
   *  in encounter mode). Still lazily evaluable — anchor time comes from
   *  the adjudicated condition. Before 2026-08-26 this field wasn't in
   *  the schema: Zod stripped it silently while the raw stored JSON kept
   *  it, so drafts could carry durations the system never saw. */
  duration: effectDurationSchema.optional(),
});

// ── Structured trait effects (Mike rulings 2026-08-24, #5/#9) ─────────────
// One effect, one entry — no effect may exist only in prose. Two kinds:
// persistent (condition-gated modifiers, evaluated lazily at roll time —
// no state) and triggered (fires on an adjudicated trigger; the aftermath
// spawns a BLOSSOM template and/or a condition with a tangible duration).
export const traitEffectSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('persistent'),
    name: z.string().min(1).max(60),
    /** State check evaluated at roll time (e.g. "in a space the bearer has
     *  not personally secured"). No ongoing tracking. */
    condition: z.string().max(200).optional(),
    modifiers: z.array(rollModifierSchema).min(1).max(5),
  }),
  z.object({
    kind: z.literal('triggered'),
    name: z.string().min(1).max(60),
    /** Adjudicated by JEWL/GM against real state — binary, trackable. */
    trigger: z.string().min(1).max(300),
    /** Gate check in Lexicon phrasing, e.g. "raw Willpower check DR 6". */
    check: z.string().max(200).optional(),
    /** Name of the blossom (forge blossom template) the firing spawns —
     *  blossom pricing is INTERNAL (ruled 2026-08-25): its KV is reflected
     *  in THIS trait's grade, never bought standalone. */
    spawnsBlossom: z.string().max(100).optional(),
    appliesCondition: z.string().max(100).optional(),
    /** Tangible time only — there is no "scene" in GROWTH. */
    duration: effectDurationSchema.optional(),
  }),
]);
export type TraitEffect = z.infer<typeof traitEffectSchema>;

// Author-declared KV for effects the formula cannot price (dice-adds,
// checks, information grants). Kai grades from the rationale — never leave
// a valuable trait at 0 (Mike review 2026-08-25).
const declaredKvFields = {
  declaredKv: z.number().int().optional(),
  declaredKvRationale: z.string().max(300).optional(),
};

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
  /** Structured effects (rulings 2026-08-24 #5/#9): preferred over prose
   *  mechanicalEffect + loose rollModifiers for NEW authoring. */
  effects: z.array(traitEffectSchema).max(6).optional(),
  ...declaredKvFields,
  tags: z.array(z.string().max(50)).max(20).optional(),
  // Blossom expiry (Mike ruling 2026-08-21): blossoms are THE
  // temporary-effects system — blessings, colds, intoxication — and "they
  // can't be held forever." Expiry is TIME (1 cycle = 1 earth year
  // baseline) or a TRIGGER condition (prose, adjudicated at the JEWL
  // layer). REQUIRED for new blossoms (enforced in validateForgeData);
  // meaningless on nectars/thorns.
  expiry: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('time'),
      amount: z.number().positive(),
      unit: z.enum(['rounds', 'hours', 'days', 'cycles']),
    }),
    z.object({ kind: z.literal('trigger'), text: z.string().min(1).max(300) }),
  ]).optional(),
  ...blockConditionFields,
  ...maturityFlagsField,
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
  ...maturityFlagsField,
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
  // Governors on block skill grants (JEWL's 2026-08-25 addition, approved):
  // feeds the DR sim + allocatable-grant constraints. 1-3 per CANON_CORE §5.
  governors: z.array(skillGovernorSchema).max(3).optional(),
});

// ── Block grants (Mike rulings 2026-08-24/25, #13/#15/#16) ────────────────
// Blocks can grant the BIG things that belong to those years. Possessions
// are crystallization stubs ("boxes") JEWL unpacks on the canvas when play
// needs them; kits carry a KV budget that plausible contents draw down
// from; allocatable skills are player-choice levels under a governor or
// domain constraint (choice recorded on the block-instance at attach).
const blockGrantFields = {
  possessions: z.array(z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(300),
    kv: z.number().int().min(0),
    /** Unpack hint for the canvas build (own traits, inventory, layout). */
    unpackNote: z.string().max(200).optional(),
  })).max(5).optional(),
  kits: z.array(z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(300),
    /** Draw-down budget: plausible, needed contents are pulled FROM this —
     *  never pre-itemized (ruled 2026-08-25; plausibility gate applies). */
    kvBudget: z.number().int().min(1).max(100),
  })).max(3).optional(),
  allocatableSkills: z.array(z.object({
    levels: z.number().int().min(1).max(5),
    constraint: z.object({
      governor: skillGovernorSchema.optional(),
      /** Generalized field, e.g. "arts", "narrative-craft" — membership is
       *  semantic adjudication (loose skill naming is by design). */
      domain: z.string().max(60).optional(),
    }).refine(c => c.governor || c.domain, {
      message: 'Allocatable grant needs a governor or domain constraint',
    }),
  })).max(5).optional(),
};

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
  ...maturityFlagsField,
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
  ...blockGrantFields,
  ...blockConditionFields,
  ...maturityFlagsField,
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
  ...blockGrantFields,
  ...blockConditionFields,
  ...maturityFlagsField,
});

// Data schema depends on type
export function validateForgeData(type: string, data: unknown) {
  switch (type) {
    case 'seed': return forgeSeedDataSchema.parse(data);
    case 'root': return forgeRootDataSchema.parse(data);
    case 'branch': return forgeBranchDataSchema.parse(data);
    case 'skill': return forgeSkillDataSchema.parse(data);
    case 'item': {
      const parsed = forgeItemDataSchema.parse(data);
      if (parsed.itemType === 'kit' && typeof parsed.kvBudget !== 'number') {
        throw new ValidationError(
          "Kits require a kvBudget (r-2026-08-24-16) — the finite pool draws are pulled from.",
        );
      }
      return parsed;
    }
    case 'nectar':
    case 'thorn': return forgeTraitDataSchema.parse(data);
    case 'blossom': {
      const parsed = forgeTraitDataSchema.parse(data);
      if (!parsed.expiry) {
        throw new ValidationError(
          'Blossoms are temporary by law (ruled 2026-08-21) — expiry is required: {kind:"time", amount, unit} or {kind:"trigger", text}.',
        );
      }
      return parsed;
    }
    case 'spell': return forgeSpellDataSchema.parse(data);
    default: throw new ValidationError(`Unknown forge item type: ${type}`);
  }
}

