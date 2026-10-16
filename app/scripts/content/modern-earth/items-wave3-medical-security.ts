/**
 * Modern-Earth items — WAVE 3: medical depth, security, comms, bags,
 * light transport. More thorn counterplay (Glucometer, mobility aids).
 */

import type { ItemTemplate } from './types';

const med = (name: string, description: string, lbs: number, kv: number, extra: Partial<ItemTemplate> = {}): ItemTemplate => ({
  name, description, itemType: 'tool',
  primaryMaterial: 'Polymer', materialClass: 'Hard',
  weightLbs: lbs, rarity: 2, kv, tags: ['medical', 'modern'], ...extra,
});
const misc = (name: string, description: string, lbs: number, kv: number, extra: Partial<ItemTemplate> = {}): ItemTemplate => ({
  name, description, itemType: 'misc',
  primaryMaterial: 'Polymer', materialClass: 'Hard',
  weightLbs: lbs, rarity: 1, kv, tags: ['modern'], ...extra,
});

export const WAVE3_MEDICAL_SECURITY: ItemTemplate[] = [
  // ── Medical depth ──
  med('Forearm Crutch', 'One cuffed crutch for one arm: mobility with attitude and better ergonomics.', 1.5, 0.267, {
    volumeCuFt: 0.15, primaryMaterial: 'Aluminum',
    itemAbilities: [{ name: 'Mobility Aid', description: 'Used with its mate, restores walking movement with an injured or weak leg (half pace, hands occupied); one alone steadies a limp.', kv: 2 }],
  }),
  med('Cane', 'Support, reach, and in practiced hands, a point well made.', 1, 0.167, {
    volumeCuFt: 0.05, primaryMaterial: 'Hardwood',
    damage: { bashing: 5 }, range: 'melee', targetAttribute: 'wisdom',
    itemAbilities: [{ name: 'Steady', description: 'Negates minor gait penalties; doubles as a respectable walking stick.', kv: 2 }],
  }),
  med('Walker (Wheeled)', 'Four points of contact with dignity intact.', 6, 0.667, {
    volumeCuFt: 4, capacityCuFt: 0.5, capacityLbs: 10, primaryMaterial: 'Aluminum',
    itemAbilities: [{ name: 'Stable Frame', description: 'Safe slow movement plus a built-in seat for rests anywhere.', kv: 2 }],
  }),
  med('Glucometer', 'The daily number, in five seconds. (Counterplay support: Type 1 Diabetes.)', 0.3, 0.267, {
    volumeCuFt: 0.005, itemAbilities: [{ name: 'Know the Number', description: 'Managing Type 1 Diabetes never fails for lack of information; dosing checks (if ever rolled) gain +2.', kv: 3 }],
  }),
  med('Digital Thermometer', 'Fever, quantified.', 0.1, 0.08, { volumeCuFt: 0.001 }),
  med('Blood Pressure Monitor', 'The heart\'s report card, home edition.', 2, 0.333, {
    volumeCuFt: 0.1, itemAbilities: [{ name: 'Early Warning', description: 'Heart Condition bearers get one free pre-exertion self-check per session (know before the DR7 roll).', kv: 2 }],
  }),
  med('AED (Defibrillator)', 'The box on the wall that argues with death itself.', 7, 10, {
    volumeCuFt: 0.3, rarity: 4,
    itemAbilities: [{ name: 'Shock Protocol', description: 'Once per scene, +3 to a First Aid check on a character at Death\'s Door from cardiac causes; usable by the untrained (it talks you through it).', kv: 10 }],
  }),
  med('Portable Oxygen Kit', 'Bottled altitude adjustment.', 8, 2.67, {
    volumeCuFt: 0.6, primaryMaterial: 'Aluminum', properties: ['Combustible'],
    itemAbilities: [{ name: 'Supplemental O2', description: 'Clears breathing-related penalties (smoke, thin air, Asthma flares) for one person-hour per bottle.', kv: 5 }],
  }),
  med('Nitrile Gloves (Box)', 'One hundred small barriers between you and everything.', 1, 0.08, { volumeCuFt: 0.06, itemType: 'consumable', materialClass: 'Soft', tags: ['medical', 'consumable', 'modern'] }),
  med('N95 Masks (Box)', 'Twenty filtered breaths of caution.', 0.5, 0.167, {
    volumeCuFt: 0.1, itemType: 'consumable', materialClass: 'Soft', tags: ['medical', 'consumable', 'modern'],
    itemAbilities: [{ name: 'Filtered', description: 'Negates airborne-particulate penalties (dust, smoke, spores) while worn.', kv: 1 }],
  }),
  med('Suture Kit', 'Thread for the body\'s torn seams.', 0.5, 0.2, {
    volumeCuFt: 0.02, rarity: 3,
    itemAbilities: [{ name: 'Close the Wound', description: 'First Aid on lacerations gains +2 and the result holds without hospital follow-up.', kv: 3 }],
  }),

  // ── Security ──
  misc('Home Safe (Fireproof)', 'A hundred pounds of not-today.', 100, 2, {
    volumeCuFt: 3, capacityCuFt: 1.2, capacityLbs: 100, primaryMaterial: 'Steel', baseResist: 20, properties: ['Strong', 'Heat Proof'], rarity: 2,
    itemAbilities: [{ name: 'Secure Storage', description: 'Contents survive fire and casual theft; opening it uninvited needs DR9 lockwork or serious tools and time.', kv: 5 }],
  }),
  misc('Deadbolt Kit', 'The door\'s spine upgrade.', 3, 0.267, {
    volumeCuFt: 0.02, primaryMaterial: 'Steel', properties: ['Strong'],
    itemAbilities: [{ name: 'Hard Entry', description: 'Forced entry through this door becomes loud, slow, or skilled (+2 to the door\'s resistance).', kv: 2 }],
  }),
  misc('Padlock (Hardened)', 'A pocket-sized boundary.', 0.5, 0.167, { volumeCuFt: 0.005, primaryMaterial: 'Steel', properties: ['Strong'] }),
  misc('Lockpick Set (Professional)', 'Tension, feedback, patience: doors reconsidered.', 0.5, 0.667, {
    volumeCuFt: 0.01, primaryMaterial: 'Steel', rarity: 5, tags: ['restricted', 'modern'],
    itemAbilities: [{ name: 'Bypass', description: 'Enables lockwork attempts on pin-tumbler locks; such checks gain +2.', kv: 8 }],
  }),

  // ── Comms ──
  misc('CB Radio', 'The highway\'s party line.', 5, 1, {
    volumeCuFt: 0.15, tags: ['electronics', 'modern'],
    itemAbilities: [{ name: 'Open Channel', description: 'Vehicle-to-vehicle comms and road intel within miles; no network needed.', kv: 3 }],
  }),
  misc('Police Scanner', 'The city\'s other broadcast schedule.', 2, 1.67, {
    volumeCuFt: 0.05, rarity: 3, tags: ['electronics', 'modern'],
    itemAbilities: [{ name: 'Listening In', description: 'Hear dispatch traffic: one scene of early warning whenever responders are en route (GM discretion on encrypted systems).', kv: 5 }],
  }),
  misc('Megaphone', 'Opinion, amplified to crowd scale.', 2, 0.4, {
    volumeCuFt: 0.3, itemAbilities: [{ name: 'Carry the Voice', description: 'Address a crowd or a barricade at distance; crowd-direction checks gain +1.', kv: 2 }],
  }),
  misc('Air Horn', 'One hundred twenty decibels of immediate agenda.', 0.5, 0.1, { volumeCuFt: 0.03, itemType: 'consumable', tags: ['consumable', 'modern'] }),
  misc('Emergency Whistle', 'A mile of HELP in half an ounce.', 0.05, 0.0333, { volumeCuFt: 0.0005, primaryMaterial: 'Aluminum' }),

  // ── Bags & storage ──
  misc('Luggage Set', 'Three nested cases of elsewhere.', 18, 2, { volumeCuFt: 4.5, capacityCuFt: 5, capacityLbs: 100, materialClass: 'Soft', primaryMaterial: 'Polyester' }),
  misc('Messenger Bag', 'The urban sidekick: laptop, notebook, everything.', 2, 0.533, {
    volumeCuFt: 0.3, capacityCuFt: 0.6, capacityLbs: 20, materialClass: 'Soft', primaryMaterial: 'Canvas',
    itemAbilities: [{ name: 'Organized Carry', description: 'Daily-carry gear is always at hand — no rummaging delay in a tense moment.', kv: 1 }],
  }),
  misc('Duffel Bag (Large)', 'Sixty liters of no-questions-asked.', 3, 0.4, { volumeCuFt: 0.3, capacityCuFt: 2.1, capacityLbs: 50, materialClass: 'Soft', primaryMaterial: 'Nylon' }),
  misc('Filing Cabinet', 'Four drawers of institutional memory.', 60, 1, { volumeCuFt: 11, capacityCuFt: 8, capacityLbs: 200, primaryMaterial: 'Steel', tags: ['office', 'modern'] }),
  misc('Paper Shredder', 'The document\'s final editor.', 10, 0.533, {
    volumeCuFt: 1, tags: ['office', 'modern'],
    itemAbilities: [{ name: 'Gone', description: 'Documents fed here are unrecoverable by ordinary means.', kv: 1 }],
  }),

  // ── Light transport & ranged ──
  misc('E-Scooter', 'Twenty urban miles per charge, standing up.', 30, 3.33, {
    volumeCuFt: 5, primaryMaterial: 'Aluminum', rarity: 2, tags: ['transport', 'modern'],
    itemAbilities: [{ name: 'Zip', description: 'Triple walking pace on pavement; folds to carry; 20-mile charge.', kv: 6 }],
  }),
  misc('Air Rifle', 'Pellets, precision, and plausible backyard legality.', 6, 1.33, {
    volumeCuFt: 0.5, itemType: 'weapon', primaryMaterial: 'Steel', rarity: 2, tags: ['weapon', 'sport', 'modern'],
    damage: { piercing: 8 }, range: 'medium', targetAttribute: 'clout', shots: 1, reload: 'break-barrel (1 action)',
  }),
  misc('Slingshot', 'Y-shaped delinquency, surprisingly serious.', 0.5, 0.133, {
    volumeCuFt: 0.02, itemType: 'weapon', primaryMaterial: 'Steel', tags: ['weapon', 'sport', 'modern'],
    damage: { bashing: 4 }, range: 'short', targetAttribute: 'wisdom',
  }),
];
