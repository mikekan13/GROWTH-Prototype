/**
 * GRO.WTH TTRPG System - TypeScript Interfaces
 * Soul/Spirit labels corrected per Jan 2026 swap
 * Google Sheets references removed
 */

// Core Attribute (8 standard attributes use this)
export interface GrowthAttribute {
  level: number;          // Base attribute level
  current: number;        // Current pool available (depletes with use)
  augmentPositive: number; // Positive augments (from nectars, equipment, etc.)
  augmentNegative: number; // Negative augments (from thorns, damage, etc.)
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

// WTH System - Meta-progression levels (1-10), slow-moving across campaigns
export interface GrowthLevels {
  wealthLevel: number;  // 1-10: Narrative purchasing power (4 = baseline 0 KV)
  techLevel: number;    // 1-10: What you can build/invent/use (4 = baseline 0 KV)
  healthLevel: number;  // 1-10: Resistance to Lady Death, fated age (10 = immortal)
  // Levels below 4 cost negative KRMA (reduce TKV)
  // Levels above 5 cost 10 KRMA per level
}

// Character Creation
export interface GrowthCreation {
  seed: {
    name?: string;
    description?: string;
    baseFateDie: FateDie;  // Determines max Nectars+Thorns
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

export type FateDie = 'd4' | 'd6' | 'd8' | 'd12' | 'd20';

// Freeform Skills System
export interface GrowthSkill {
  name: string;
  level: number;          // 1-20, determines skill die
  isCombat: boolean;
  description?: string;
  // Skill die: 1-3=flat bonus, 4-5=d4, 6-7=d6, 8-11=d8, 12-19=d12, 20=d20
}

// Magic System - Three Pillars
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
  mercy: MagicPillar;    // Flow-based magic (Spirit pillar)
  severity: MagicPillar;  // Focus-based magic (Spirit pillar)
  balance: MagicPillar;   // Combined Flow+Focus magic
}

// Nectars (permanent), Blossoms (temporary), Thorns (permanent negative)
export type TraitCategory =
  | 'combat' | 'learning' | 'magic' | 'social' | 'utility'
  | 'supernatural' | 'supertech' | 'natural';

export interface GrowthTrait {
  name: string;
  category: TraitCategory;
  description: string;
  type: 'nectar' | 'blossom' | 'thorn';
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
export type BodyPart = 'HEAD' | 'NECK' | 'TORSO' | 'RIGHTARM' | 'LEFTARM'
                     | 'RIGHTUPPERLEG' | 'LEFTUPPERLEG' | 'RIGHTLOWERLEG' | 'LEFTLOWERLEG';

export interface GrowthVitals {
  bodyParts: Record<BodyPart, number>;
  baseResist: number;
  restRate: number;
  carryLevel: number;     // Equals Clout attribute
  weightStatus: 'Fine' | 'Encumbered';
}

// Inventory
export interface GrowthItem {
  name: string;
  weightLevel: number;    // 0-10
  condition: number;      // 1-4
  techLevel: number;      // Required tech level
  description?: string;
  quantity?: number;
}

export interface GrowthInventory {
  weight: number;
  items: GrowthItem[];
}

// Fear System
export interface GrowthFear {
  name: string;
  description: string;
  resistanceLevel: number;  // 1-10
  status: 'active' | 'aligned' | 'removed';
  // Fears assigned by GM, never fully go away
  // Can be "aligned" (integrated, granting paradoxical powers)
  // Can be "removed" (extremely rare, represents reprogramming)
}

// Character Identity
export interface GrowthIdentity {
  name: string;
  age?: number;
  fatedAge?: number;      // When death saves begin
  background?: string;
  description?: string;
  image?: string;
}

// Complete Character Interface
export interface GrowthCharacter {
  identity: GrowthIdentity;
  levels: GrowthLevels;
  tkv?: number;               // Total KRMA Value
  conditions: GrowthConditions;
  attributes: GrowthAttributes;
  creation: GrowthCreation;
  skills: GrowthSkill[];
  magic: GrowthMagic;
  traits: GrowthTrait[];       // Nectars + Blossoms + Thorns combined
  grovines: GROvine[];         // Active narrative threads
  fears: GrowthFear[];
  vitals: GrowthVitals;
  inventory: GrowthInventory;
  notes: string;
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
    color: '#3EB89A',
    attributes: ['flow', 'frequency', 'focus'] as const,
  },
  soul: {
    name: 'Soul',
    alchemical: 'Mercury',
    color: '#7050A8',
    attributes: ['willpower', 'wisdom', 'wit'] as const,
  },
} as const;
