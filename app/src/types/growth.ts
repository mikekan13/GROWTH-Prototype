/**
 * GRO.WTH TTRPG System - TypeScript Interfaces
 * Soul/Spirit labels corrected per Jan 2026 swap
 * Google Sheets references removed
 */

// Individual source of an attribute augment (trait, item, condition, etc.)
export interface AugmentSource {
  name: string;           // Display name (e.g. "Iron Gauntlets", "Warrior's Nectar")
  value: number;          // +/- modifier value
  sourceType: 'nectar' | 'blossom' | 'thorn' | 'item' | 'condition' | 'effect' | 'other';
  sourceId?: string;      // Reference to the trait/item entity
  description?: string;   // Flavor text or mechanical explanation
  stats?: Record<string, string | number>; // Extra info for nested tooltip (weight, condition, etc.)
}

// Core Attribute (8 standard attributes use this)
export interface GrowthAttribute {
  level: number;          // Base attribute level
  current: number;        // Current pool available (depletes with use)
  augmentPositive: number; // Positive augments (from nectars, equipment, etc.)
  augmentNegative: number; // Negative augments (from thorns, damage, etc.)
  augmentSources?: AugmentSource[]; // Itemized breakdown of augment sources
  // Pool Max = level + augmentPositive - augmentNegative
  // When current reaches 0, character gets condition + overflow to frequency
}

// Frequency is special - only level + current, no augments
export interface GrowthFrequency {
  level: number;
  current: number;
  // Overflow damage target + experience currency
}

export interface GrowthAttributes {
  // Body Pillar (Salt) - Physical
  clout: GrowthAttribute;        // Strength and power
  celerity: GrowthAttribute;     // Speed and agility
  constitution: GrowthAttribute; // Health and endurance

  // Spirit Pillar (Sulfur) - Spiritual/Recognition - BLUE
  flow: GrowthAttribute;         // Mercy magic, receiving/acceptance
  frequency: GrowthFrequency;    // Special: experience/overflow target
  focus: GrowthAttribute;        // Severity magic, giving/manifestation

  // Soul Pillar (Mercury) - Mental/Will - PURPLE
  willpower: GrowthAttribute;    // Mental and emotional resilience
  wisdom: GrowthAttribute;       // Intuition and creativity
  wit: GrowthAttribute;          // Logic and analytical thinking
}

// Conditions triggered when attributes hit 0
export interface GrowthConditions {
  // Body
  weak: boolean;        // Clout 0
  clumsy: boolean;      // Celerity 0
  exhausted: boolean;   // Constitution 0
  // Spirit
  deafened: boolean;    // Flow 0
  deathsDoor: boolean;  // Frequency 0
  muted: boolean;       // Focus 0
  // Soul
  overwhelmed: boolean; // Willpower 0
  confused: boolean;    // Wisdom 0
  incoherent: boolean;  // Wit 0
}

// Character Creation
export interface GrowthCreation {
  seed: {
    name?: string;
    description?: string;
    baseFateDie: FateDie;  // Determines max Nectars+Thorns
    // Per-attribute aug contributions from the seed (canonical source — flows
    // through recomputeAugments). Set by applyCreationGrants.
    augments?: {
      clout?: number; celerity?: number; constitution?: number;
      focus?: number; flow?: number;
      willpower?: number; wisdom?: number; wit?: number;
    };
  };
  // Lifespan from the assigned seed (years) — drives TKV's fatedAge component.
  fatedAge?: number;
  // ForgeItem ID for the assigned seed, used for re-applying grants and audit trail.
  seedForgeItemId?: string;
  root?: {
    name: string;
    description: string;
    gmCreated: boolean;
  };
  branches?: Array<{
    name: string;
    description: string;
    gmCreated: boolean;
    order: number;
  }>;
}

export type FateDie = 'd4' | 'd6' | 'd8' | 'd12' | 'd20';

// Seed — starting template for entity creation
// 48 canonical seeds parsed from Character Creation Examples.csv
export interface GrowthSeed {
  name: string;
  description: string;
  baseFateDie: FateDie;
  frequency: number;           // Starting frequency level
  fatedAge: number;            // Natural lifespan in years (e.g., Human ~80, Elf ~500)
  baseResist: number;          // Base body resistance
  attributes: {
    clout: number;
    celerity: number;
    constitution: number;
    focus: number;
    flow: number;
    willpower: number;
    wisdom: number;
    wit: number;
  };
  skills: string[];            // Starting skill names
  nectars: string[];           // Starting nectar names
  thorns: string[];            // Starting thorn names
  seedKV: number;              // Total Seed KRMA Value
  bodyStructure: SeedBodyStructure;  // Physical body parts and vital areas
}

// Attribute names that can govern skills (all except Frequency)
export type SkillGovernor =
  | 'clout' | 'celerity' | 'constitution'
  | 'flow' | 'focus'
  | 'willpower' | 'wisdom' | 'wit';

export const SKILL_GOVERNORS: SkillGovernor[] = [
  'clout', 'celerity', 'constitution',
  'flow', 'focus',
  'willpower', 'wisdom', 'wit',
];

// Freeform Skills System — name defines context, no predefined categories
export interface GrowthSkill {
  name: string;
  level: number;            // 1-20, determines skill die
  governors: SkillGovernor[]; // At least one required — which attributes govern this skill
  description?: string;     // Clarifies intent for GM/AI interpretation
  forgeItemId?: string;     // Reference to campaign ForgeItem (if created via Forge)
  // Skill die: 1-3=flat bonus, 4-5=d4, 6-7=d6, 8-11=d8, 12-19=d12, 20=d20
  // Modifiers come from external sources (gear, nectars, buffs) — not stored on skill
}

// Magic System - Three Pillars
export type MagicSchool =
  | 'Abjuration' | 'Alteration' | 'Conjuration' | 'Dissolution' | 'Divination'
  | 'Enchantment' | 'Force' | 'Fortune' | 'Illusion' | 'Restoration';

export interface GrowthSpell {
  name: string;
  school: MagicSchool;
  description: string;
  cost?: number;        // Mana/effort cost
  strength?: number;    // 1-10 spell strength
  castingMethod?: 'weaving' | 'wild';
}

export interface WovenSpell {
  name: string;
  schools: MagicSchool[];   // Combined schools
  description: string;
  cost?: number;
  strength?: number;
  components?: string;      // Special requirements
}

export interface MagicPillar {
  schools: MagicSchool[];
  knownSpells: GrowthSpell[];
  skillLevels?: Partial<Record<MagicSchool, number>>; // Skill level per school
}

export interface GrowthMagic {
  mercy: MagicPillar;    // Flow-based magic (Spirit pillar)
  severity: MagicPillar;  // Focus-based magic (Spirit pillar)
  balance: MagicPillar;   // Combined Flow+Focus magic
  wovenSpells?: WovenSpell[];  // Spells combining multiple schools
  mana?: {
    current: number;
    max: number;
  };
}

// Nectars (permanent), Blossoms (temporary), Thorns (permanent negative)
export type TraitCategory =
  | 'combat' | 'learning' | 'magic' | 'social' | 'utility'
  | 'supernatural' | 'supertech' | 'natural';

export type TraitPillar = 'body' | 'spirit' | 'soul';

/**
 * Structured roll modifier carried by a trait. Optional — when present,
 * the skill-check pipeline (services/trait-modifiers.ts) sums matching
 * modifiers into the roll total automatically.
 *
 * Empty `skillNamePattern` + empty `governorAttribute` = applies to all rolls.
 * Otherwise the modifier only fires when the rolled check matches the pattern
 * (case-insensitive substring) AND/OR uses the named governor.
 */
export interface RollModifier {
  flat: number;                  // +N to roll total (negative for penalties)
  skillNamePattern?: string;     // substring match (case-insensitive) on skill name
  governorAttribute?: string;    // require this governor attribute on the rolled check
  label?: string;                // optional human-friendly source label for UI
}

export interface GrowthTrait {
  name: string;
  category: TraitCategory;
  description: string;
  type: 'nectar' | 'blossom' | 'thorn';
  /**
   * Optional structured roll modifiers. The runtime sums applicable ones
   * during skill checks. Keep simple: flat bonuses keyed by skill/governor.
   * Complex effects (resource generation, conditional triggers) belong in
   * Kai-authored mechanical effects with their own handler hooks.
   */
  rollModifiers?: RollModifier[];
  /**
   * Required pillar tag (locked Mike 2026-05-19). Determines death-engine
   * routing: body → stripped to GM; soul → halved to Lady Death;
   * spirit → kept. Ternary so future logic can distinguish Spirit from Soul
   * without re-tagging the catalog. Optional only on legacy un-tagged
   * records — new authoring requires it, and the death engine defaults
   * missing-pillar traits to 'spirit' (the safe-kept bucket).
   */
  pillar?: TraitPillar;
  source?: string;          // Where it came from (GRO.vine name, Godhead, etc.)
  mechanicalEffect?: string; // E.g. "+1 GRO.vine capacity", "+2 Restoration"
  // nectar = permanent positive (from completing GRO.vines)
  // blossom = temporary buff (bestowed by Godheads during play)
  // thorn = permanent negative (from failed GRO.vines, death)
}

// GRO.vine - Character narrative thread
export interface GROvine {
  id: string;
  goal: string;         // G - What the character is pursuing
  resistance: string;   // R - What opposes the character
  opportunity: string;  // O - What the character can act on
  status: 'active' | 'completed' | 'failed';
  reward?: {
    type: 'nectar' | 'krma';  // Player can decline nectar for raw KRMA (with tax)
    description?: string;
  };
}

// Combat - Body Parts and Vitals
// Body parts are seed-defined — this is the human baseline
// Other seeds may have different parts (e.g. TAIL, WINGS, extra limbs)
export type BodyPart = string;

// Human body parts as constants
export const HUMAN_BODY_PARTS = [
  'HEAD', 'TORSO',
  'LEFT_UPPER_ARM', 'LEFT_LOWER_ARM',
  'RIGHT_UPPER_ARM', 'RIGHT_LOWER_ARM',
  'LEFT_UPPER_LEG', 'LEFT_LOWER_LEG',
  'RIGHT_UPPER_LEG', 'RIGHT_LOWER_LEG',
] as const;

// Seed body structure — defines what physical parts a species has
export interface SeedBodyStructure {
  parts: string[];            // All body parts for this seed
  vitals: string[];           // Parts that trigger death if destroyed
  descriptors?: Record<string, string>;  // Optional per-part flavor (e.g. "HEAD": "elongated cranium")
}

// Equipment Layer System
export type ArmorLayer = 'body' | 'clothing' | 'lightArmor' | 'heavyArmor';

export interface EquipmentSlot {
  name: string;
  layer: ArmorLayer;
  material?: string;
  resistance: number;       // Protection value
  condition: number;        // 1-4 (Destroyed, Broken, Worn, Undamaged)
  weight?: number;
  properties?: string[];
  coveredParts?: BodyPart[];  // Which body parts this covers
}

export interface GrowthEquipment {
  body: EquipmentSlot[];       // Skin-level (natural armor, tattoos, etc.)
  clothing: EquipmentSlot[];   // Up to 3 layers, half base resist, no mobility penalty
  lightArmor: EquipmentSlot[]; // 1 layer, full base resist, no mobility penalty
  heavyArmor: EquipmentSlot[]; // 1 layer, 1.5x base resist, -1 Celerity
}

export interface GrowthVitals {
  bodyParts: Record<BodyPart, number>;
  baseResist: number;
  restRate: number;
  carryLevel: number;     // Equals Clout attribute
  weightStatus: 'Fine' | 'Encumbered';
  equipment?: GrowthEquipment;
}

// Inventory
export interface GrowthItem {
  name: string;
  weightLevel: number;    // 0-10
  condition: number;      // 1-4
  // Items no longer gated by tech level — campaign setting determines available technology
  description?: string;
  quantity?: number;
}

export interface GrowthInventory {
  weight: number;
  items: GrowthItem[];
}

// Harvest System (Seasonal Turns)
export interface GrowthHarvest {
  id: string;
  name: string;
  description: string;
  activity: string;         // What the character did
  duration?: string;        // How long (e.g. "3 months", "1 year")
  rewards?: Array<{
    type: 'attribute' | 'skill' | 'equipment' | 'wealth' | 'tech' | 'nectar' | 'other';
    description: string;
  }>;
  cost?: string;            // What it cost (aging, resources, etc.)
  status: 'planned' | 'active' | 'completed';
}

// Physical Description — body-part-driven, shaped by seed's bodyStructure
export interface PhysicalDescription {
  // Overall body traits
  gender?: string;              // Male, Female, Non-binary, or freetext
  height?: number;              // Height in inches, constrained by seed min/max
  build?: string;
  skinTone?: string;            // Selected from seed-specific options
  // Per-body-part descriptions keyed by part name (HEAD, TORSO, LEFT_UPPER_ARM, etc.)
  bodyParts?: Record<string, BodyPartDescription>;
}

// Description for a single body part
export interface BodyPartDescription {
  description?: string;         // Free-text for this part ("muscular, scarred")
  // HEAD-specific structured fields
  faceShape?: string;
  eyeShape?: string;
  eyeColor?: string;
  facialHair?: string;
  hairColor?: string;
  hairLength?: string;
  hairTexture?: string;          // Natural texture: straight, wavy, curly, coily
  hairStyle?: string;            // How it's worn: braided, ponytail, loose, pinned up
  // Presentation (can change with story)
  cosmetics?: string;            // Makeup style, war paint, face paint
  hygiene?: string;              // General upkeep: pristine, well-kept, rugged, unkempt, feral
}

// Character Identity
export interface GrowthIdentity {
  name: string;
  age?: number;
  fatedAge?: number;      // When death saves begin
  background?: string;
  description?: string;
  image?: string;
  physicalDescription?: PhysicalDescription;
  // Style fields (portrait pipeline / character creator)
  styleColors?: { primary: string; secondary: string; tertiary: string }; // hex codes — secondary drives underwear color
  styleAesthetics?: string[];     // up to 2 aesthetic descriptors — drives underwear style
  /**
   * Creature size (locked Mike 2026-05-19).
   * - `width` × `length` = grid footprint in 5ft squares (e.g. 1×1 humanoid, 2×3 horse).
   * - `height` is descriptive, used by the Terminal for contextual rulings
   *   (doorways, ceilings, reach narrative). No fixed unit — game-context (feet/meters/abstract).
   * Open-ended scaling — supports planet-scale entities. Effects reference these
   * values numerically in their own text. See lib/creature-size.ts for helpers.
   */
  size?: CreatureSize;
}

/** Asymmetric grid footprint + descriptive height. */
export interface CreatureSize {
  width: number;
  length: number;
  height?: number;
}

// Backstory
export interface GrowthBackstory {
  description?: string;     // Physical/visual description
  backstory?: string;       // Narrative backstory
  personalityTraits?: string[];
  notes?: string;           // GM/player session notes
}

// Complete Character Interface
export interface GrowthCharacter {
  identity: GrowthIdentity;
  fatedAge: number;            // Natural lifespan from seed (years)
  tkv?: number;               // Total KRMA Value
  conditions: GrowthConditions;
  attributes: GrowthAttributes;
  creation: GrowthCreation;
  skills: GrowthSkill[];
  magic: GrowthMagic;
  traits: GrowthTrait[];       // Nectars + Blossoms + Thorns combined
  grovines: GROvine[];         // Active narrative threads
  vitals: GrowthVitals;
  inventory: GrowthInventory;
  backstory: GrowthBackstory;
  harvests: GrowthHarvest[];
  notes: string;
  /**
   * Body anatomy — the nested container tree of body parts (locked Mike 2026-05-19).
   * Items are the universal primitive; body parts are items with `isBodyPart: true`.
   * See `lib/body-damage.ts` for the cascade engine, `HUMAN_BASELINE_ANATOMY` for
   * the default. Each seed declares its own anatomy from scratch (no inheritance);
   * legacy characters created before this field default to the Human baseline.
   *
   * Typed loosely as `unknown` here to avoid a circular type dependency with the
   * item module — consumers cast to `GrowthWorldItem` from `@/types/item` after
   * importing.
   */
  bodyAnatomy?: unknown;
}

// User roles
export type UserRole = 'TRAILBLAZER' | 'WATCHER' | 'GODHEAD' | 'ADMIN';

// Pillar constants for UI
export const PILLARS = {
  body: {
    name: 'Body',
    alchemical: 'Salt',
    color: '#E8585A',
    attributes: ['clout', 'celerity', 'constitution'] as const,
  },
  spirit: {
    name: 'Spirit',
    alchemical: 'Sulfur',
    color: '#7050A8',
    attributes: ['flow', 'frequency', 'focus'] as const,
  },
  soul: {
    name: 'Soul',
    alchemical: 'Mercury',
    color: '#3E78C0',
    attributes: ['willpower', 'wisdom', 'wit'] as const,
  },
} as const;

// Magic school metadata for UI
export const MAGIC_SCHOOLS: Record<MagicSchool, {
  pillar: 'mercy' | 'severity' | 'balance';
  governingAttribute: string;
  primaMateria: string;
  description: string;
  resistedBy?: string;
}> = {
  // Mercy (Flow-based)
  Fortune: { pillar: 'mercy', governingAttribute: 'Flow', primaMateria: 'Lead', description: 'Manipulation of luck, buffing, augmenting abilities' },
  Restoration: { pillar: 'mercy', governingAttribute: 'Flow', primaMateria: 'Tin', description: 'Power to mend, heal, and grow' },
  Enchantment: { pillar: 'mercy', governingAttribute: 'Flow', primaMateria: 'Copper', description: 'The power over minds', resistedBy: 'Wit' },
  // Severity (Focus-based)
  Force: { pillar: 'severity', governingAttribute: 'Focus', primaMateria: 'Iron', description: 'Power to manipulate energy and cause damage', resistedBy: 'Celerity' },
  Alteration: { pillar: 'severity', governingAttribute: 'Focus', primaMateria: 'Uranium', description: 'Manipulation of matter; changing things physically', resistedBy: 'Constitution' },
  Conjuration: { pillar: 'severity', governingAttribute: 'Focus', primaMateria: 'Mercury', description: 'Summoning beings, objects, and creating portals', resistedBy: 'Willpower' },
  // Balance (Flow + Focus)
  Divination: { pillar: 'balance', governingAttribute: 'Flow + Focus', primaMateria: 'Neptunium', description: 'Read minds, scry, manipulate time', resistedBy: 'Willpower' },
  Dissolution: { pillar: 'balance', governingAttribute: 'Flow + Focus', primaMateria: 'Plutonium', description: 'Power over life and death', resistedBy: 'Constitution' },
  Abjuration: { pillar: 'balance', governingAttribute: 'Flow + Focus', primaMateria: 'Gold', description: 'Defensive magic: wards, shields, counterspells' },
  Illusion: { pillar: 'balance', governingAttribute: 'Flow + Focus', primaMateria: 'Silver', description: 'Deception magic manipulating appearance of reality', resistedBy: 'Wit' },
};

// Skill die progression helper
export function getSkillDie(level: number): string {
  if (level <= 0) return '-';
  if (level <= 3) return `+${level}`;
  if (level <= 5) return 'd4';
  if (level <= 7) return 'd6';
  if (level <= 11) return 'd8';
  if (level <= 19) return 'd12';
  return 'd20';
}

// Skill level label helper
export function getSkillRank(level: number): string {
  if (level <= 0) return 'Untrained';
  if (level <= 3) return 'Novice';
  if (level <= 5) return 'Decoder';
  if (level <= 7) return 'Competent';
  if (level <= 9) return 'Professional';
  if (level <= 11) return 'Expert';
  if (level <= 19) return 'Master';
  return 'Godlike';
}
