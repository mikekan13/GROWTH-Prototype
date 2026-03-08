import type { GrowthCharacter } from '@/types/growth';

export function createDefaultCharacter(name: string): GrowthCharacter {
  return {
    identity: {
      name,
    },
    levels: {
      wealthLevel: 4,
      techLevel: 4,
      healthLevel: 4,
    },
    conditions: {
      weak: false,
      clumsy: false,
      exhausted: false,
      deafened: false,
      deathsDoor: false,
      muted: false,
      overwhelmed: false,
      confused: false,
      incoherent: false,
    },
    attributes: {
      clout: { level: 1, current: 1, augmentPositive: 0, augmentNegative: 0 },
      celerity: { level: 1, current: 1, augmentPositive: 0, augmentNegative: 0 },
      constitution: { level: 1, current: 1, augmentPositive: 0, augmentNegative: 0 },
      flow: { level: 1, current: 1, augmentPositive: 0, augmentNegative: 0 },
      frequency: { level: 1, current: 1 },
      focus: { level: 1, current: 1, augmentPositive: 0, augmentNegative: 0 },
      willpower: { level: 1, current: 1, augmentPositive: 0, augmentNegative: 0 },
      wisdom: { level: 1, current: 1, augmentPositive: 0, augmentNegative: 0 },
      wit: { level: 1, current: 1, augmentPositive: 0, augmentNegative: 0 },
    },
    creation: {
      seed: {
        baseFateDie: 'd6',
      },
    },
    skills: [],
    magic: {
      mercy: { schools: [], knownSpells: [] },
      severity: { schools: [], knownSpells: [] },
      balance: { schools: [], knownSpells: [] },
    },
    traits: [],
    grovines: [],
    fears: [],
    vitals: {
      bodyParts: {
        HEAD: 0, NECK: 0, TORSO: 0,
        RIGHTARM: 0, LEFTARM: 0,
        RIGHTUPPERLEG: 0, LEFTUPPERLEG: 0,
        RIGHTLOWERLEG: 0, LEFTLOWERLEG: 0,
      },
      baseResist: 0,
      restRate: 1,
      carryLevel: 1,
      weightStatus: 'Fine',
    },
    inventory: {
      weight: 0,
      items: [],
    },
    backstory: {},
    harvests: [],
    notes: '',
  };
}
