/**
 * GROWTH Tabletop RPG System - Complete TypeScript Interfaces
 * Based on sub-agent research of GROWTH Repository mechanics
 */

// Core GROWTH Attribute System (9 Attributes in 3x3 Matrix)
export interface GrowthAttribute {
  level: number;          // Base attribute level
  current: number;        // Current pool available (depletes with use)
  augmentPositive: number; // Positive augments (from equipment, nectars, etc.)
  augmentNegative: number; // Negative augments (from thorns, damage, etc.)
  // Pool Max = level + augmentPositive - augmentNegative
  // When current reaches 0, character gets negative effect + overflow to frequency
}

export interface GrowthFrequency {
  level: number;          // Base frequency level (only has level, no augments)
  current: number;        // Current frequency available
  // Frequency is special: overflow damage target + experience currency
}

export interface GrowthAttributes {
  // Body Pillar (Salt 🜔) - Physical Aspects
  clout: GrowthAttribute;        // Strength and power
  celerity: GrowthAttribute;     // Speed and agility
  constitution: GrowthAttribute; // Health and endurance

  // Soul Pillar (Sulfur 🜍) - Spiritual Aspects
  flow: GrowthAttribute;         // Mercy magic, receiving/acceptance
  frequency: GrowthFrequency;    // Special: only level + current (experience/overflow)
  focus: GrowthAttribute;        // Severity magic, giving/manifestation

  // Spirit Pillar (Mercury ☿) - Mental Aspects
  willpower: GrowthAttribute;    // Mental and emotional resilience
  wisdom: GrowthAttribute;       // Intuition and creativity
  wit: GrowthAttribute;          // Logic and analytical thinking
}

// Character Depletion States (when attributes reach 0)
export interface GrowthConditions {
  weak: boolean;        // Clout 0
  clumsy: boolean;      // Celerity 0
  exhausted: boolean;   // Constitution 0
  muted: boolean;       // Focus 0
  deathsDoor: boolean;  // Frequency 0
  deafened: boolean;    // Flow 0
  overwhelmed: boolean; // Willpower 0
  incoherent: boolean;  // Wit 0
  confused: boolean;    // Wisdom 0
}

// WTH System (Wealth-Tech-Health) - All 1-10 with 4 as baseline (0 KV)
export interface GrowthLevels {
  healthLevel: number;  // 1-10: Resistance to Lady Death, determines fated age (10 = immortal)
  wealthLevel: number;  // 1-10: Narrative purchasing power (4 = baseline 0 KV)
  techLevel: number;    // 1-10: What you can build/invent/use (4 = baseline 0 KV)
  // Format: "X - Description" e.g. "9 - Opulent"
  // Levels below 4 are worth -KRMA, reducing character TKV
}

// Character Creation System
export interface GrowthCreation {
  seed: {
    baseFateDie: 'd4' | 'd6' | 'd8' | 'd12' | 'd20'; // Determines max Nectars+Thorns
    name?: string;
    description?: string;
  };
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

// Skills System (Completely Freeform)
export interface GrowthSkill {
  name: string;           // Freeform skill name
  level: number;          // 1-20 with dice progression
  isCombat: boolean;      // Combat-specific flag
  description?: string;   // Optional description
  // Skill die auto-calculated based on level:
  // 1-3: Flat bonus (+1, +2, +3)
  // 4-5: d4, 6-7: d6, 8-11: d8, 12-19: d12, 20: d20
}

export interface GrowthSkills {
  skills: GrowthSkill[];
}

// Magic System
export type MagicSchool =
  | 'Abjuration' | 'Alteration' | 'Conjuration' | 'Dissolution' | 'Divination'
  | 'Enchantment' | 'Force' | 'Fortune' | 'Illusion' | 'Restoration';

export interface MagicPillar {
  schools: MagicSchool[];
  knownSpells: Array<{
    name: string;
    school: MagicSchool;
    description: string;
    cost?: number;
  }>;
}

export interface GrowthMagic {
  mercy: MagicPillar;   // Flow-based magic
  severity: MagicPillar; // Focus-based magic
  balance: MagicPillar;  // Combined Flow+Focus magic
}

// Nectars & Thorns System
export type NectarCategory =
  | 'combat' | 'learning' | 'magic' | 'social' | 'utility'
  | 'supernatural' | 'supertech' | 'negative' | 'natural';

export interface GrowthTrait {
  name: string;
  category: NectarCategory;
  description: string;
  isPositive: boolean; // true for Nectars, false for Thorns
}

export interface GrowthNectars {
  combat: GrowthTrait[];
  learning: GrowthTrait[];
  magic: GrowthTrait[];
  social: GrowthTrait[];
  utility: GrowthTrait[];
  supernatural: GrowthTrait[];
  supertech: GrowthTrait[];
  negative: GrowthTrait[];  // These are Thorns
  natural: GrowthTrait[];
}

// Vitals & Combat System
export type BodyPart = 'HEAD' | 'NECK' | 'TORSO' | 'RIGHTARM' | 'LEFTARM'
                     | 'RIGHTUPPERLEG' | 'LEFTUPPERLEG' | 'RIGHTLOWERLEG' | 'LEFTLOWERLEG';

export interface GrowthVitals {
  bodyParts: Record<BodyPart, number>; // Damage to each body part
  baseResist: number;    // Base damage resistance
  restRate: number;      // Recovery rate during rest
  carryLevel: number;    // Equals Clout attribute
  weightStatus: 'Fine' | 'Encumbered'; // Based on carried weight vs Clout
}

// Inventory System
export interface GrowthItem {
  name: string;
  weightLevel: number;   // 0-10 weight categories
  condition: number;     // 1-4 condition rating
  techLevel: number;     // Required tech level to use
  description?: string;
  quantity?: number;
}

export interface GrowthInventory {
  weight: number;        // Total weight carried
  items: GrowthItem[];
}

// Character Identity
export interface GrowthIdentity {
  name: string;
  age?: number;
  fatedAge?: number;     // When death saves begin (60-80% of lifespan)
  background?: string;
  description?: string;
  goals?: string[];
  image?: string;
}

// Complete GROWTH Character Interface
export interface GrowthCharacter {
  // Core Identity
  identity: GrowthIdentity;

  // Character Levels (WTH System)
  levels: GrowthLevels;

  // Attribute Depletion States
  conditions: GrowthConditions;

  // Core Attribute System (9 attributes)
  attributes: GrowthAttributes;

  // Character Creation Components
  creation: GrowthCreation;

  // Freeform Skills System
  skills: GrowthSkills;

  // Three-Pillar Magic System
  magic: GrowthMagic;

  // Nectars & Thorns (limited by Fate Die)
  nectars: GrowthNectars;

  // Combat & Health Tracking
  vitals: GrowthVitals;

  // Equipment & Inventory
  inventory: GrowthInventory;

  // Additional Notes
  notes: string;
}

// Google Sheets Named Ranges Mapping (based on sub-agent extraction)
export interface SheetsNamedRanges {
  // Character Information (13 ranges)
  CharacterName: string;
  CharacterImage: string;
  HealthLevel: string;
  TechLevel: string;
  WealthLevel: string;

  // Attributes (24 ranges) - 8 main attributes with levels/current/modifiers
  CloutLevel: string;
  currentClout: string;
  CloutMod: string;
  CelerityLevel: string;
  currentCelerity: string;
  CelerityMod: string;
  ConstitutionLevel: string;
  currentConstitution: string;
  ConstitutionMod: string;
  FlowLevel: string;
  currentFlow: string;
  FlowMod: string;
  FrequencyLevel: string;
  currentFrequency: string;
  FrequencyMod: string;
  FocusLevel: string;
  currentFocus: string;
  FocusMod: string;
  WillpowerLevel: string;
  currentWillpower: string;
  WillpowerMod: string;
  WisdomLevel: string;
  currentWisdom: string;
  WisdomMod: string;
  WitLevel: string;
  currentWit: string;
  WitMod: string;

  // Goals & Opportunities (15 ranges)
  Goal1: string;
  Goal1Key: string;
  Goal2: string;
  Goal2Key: string;
  Goal3: string;
  Goal3Key: string;
  Goal4: string;
  Goal4Key: string;
  Goal5: string;
  Goal5Key: string;
  Opportunity1: string;
  Opportunity1Key: string;
  Opportunity2: string;
  Opportunity2Key: string;
  Opportunity3: string;
  Opportunity3Key: string;
  Opportunity4: string;
  Opportunity4Key: string;
  Opportunity5: string;
  Opportunity5Key: string;

  // Combat & Vitals (9 ranges)
  HEAD: string;
  TORSO: string;
  RIGHTARM: string;
  LEFTARM: string;
  RIGHTUPPERLEG: string;
  LEFTUPPERLEG: string;
  RIGHTLOWERLEG: string;
  LEFTLOWERLEG: string;
  RestRate: string;

  // Inventory (2 ranges)
  InventoryWeight: string;
  PossessionsWeight: string;

  // Nectar Abilities (8 ranges)
  CombatNectars: string;
  LearningNectars: string;
  MagicNectars: string;
  SocialNectars: string;
  UtilityNectars: string;
  SupernaturalNectars: string;
  SuperTechNectars: string;
  NaturalNectars: string;

  // Dice Rolling (4 ranges)
  RollResult: string;
  DicePool: string;
  SelectedSkill: string;
  SkillBonus: string;
}

// Database-to-Sheets Mapping Configuration
export interface SheetsMappingConfig {
  templateId: string;
  namedRanges: SheetsNamedRanges;

  // Mapping functions for complex data transformations
  mapAttributesToRanges: (attributes: GrowthAttributes) => Record<string, any>;
  mapRangesToAttributes: (ranges: Record<string, any>) => Partial<GrowthAttributes>;
  mapSkillsToRanges: (skills: GrowthSkills) => Record<string, any>;
  mapRangesToSkills: (ranges: Record<string, any>) => Partial<GrowthSkills>;
  mapNectarsToRanges: (nectars: GrowthNectars) => Record<string, any>;
  mapRangesToNectars: (ranges: Record<string, any>) => Partial<GrowthNectars>;
}

// Validation Rules (based on GROWTH mechanics research)
export interface GrowthValidationRules {
  // Frequency must retain at least 1 after character creation
  minimumFrequency: number;

  // Nectars + Thorns cannot exceed Fate Die value
  maxNectarsAndThorns: (fateDie: string) => number;

  // Skill die progression validation
  getSkillDie: (level: number) => string;

  // Carry capacity validation
  isEncumbered: (carriedWeight: number, cloutLevel: number) => boolean;

  // Tech level restrictions
  canUseItem: (characterTechLevel: number, itemTechLevel: number) => boolean;

  // Age and death save validation
  shouldMakeDeathSaves: (currentAge: number, fatedAge: number) => boolean;
}