import type { GrowthCharacter } from '@/types/growth';

export function createDefaultCharacter(name: string): GrowthCharacter {
  return {
    identity: {
      name,
      physicalDescription: {},
    },
    fatedAge: 80,  // Default human lifespan
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
        HEAD: 0, TORSO: 0,
        RIGHT_UPPER_ARM: 0, RIGHT_LOWER_ARM: 0,
        LEFT_UPPER_ARM: 0, LEFT_LOWER_ARM: 0,
        RIGHT_UPPER_LEG: 0, RIGHT_LOWER_LEG: 0,
        LEFT_UPPER_LEG: 0, LEFT_LOWER_LEG: 0,
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
