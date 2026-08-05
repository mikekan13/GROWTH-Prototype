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
  med('Forearm Crutches', 'Mobility with attitude and better ergonomics.', 3, 4, {
    primaryMaterial: 'Aluminum',
    itemAbilities: [{ name: 'Mobility Aid', description: 'Restores walking movement with an injured or weak leg (half pace, hands occupied).', kv: 3 }],
  }),
  med('Cane', 'Support, reach, and in practiced hands, a point well made.', 1, 5, {
    primaryMaterial: 'Hardwood',
    damage: { bashing: 5 }, range: 'melee', targetAttribute: 'wisdom',
    itemAbilities: [{ name: 'Steady', description: 'Negates minor gait penalties; doubles as a respectable walking stick.', kv: 2 }],
  }),
  med('Walker (Wheeled)', 'Four points of contact with dignity intact.', 6, 3, {
    primaryMaterial: 'Aluminum',
    itemAbilities: [{ name: 'Stable Frame', description: 'Safe slow movement plus a built-in seat for rests anywhere.', kv: 2 }],
  }),
  med('Glucometer', 'The daily number, in five seconds. (Counterplay support: Type 1 Diabetes.)', 0.3, 4, {
    itemAbilities: [{ name: 'Know the Number', description: 'Managing Type 1 Diabetes never fails for lack of information; dosing checks (if ever rolled) gain +2.', kv: 3 }],
  }),
  med('Digital Thermometer', 'Fever, quantified.', 0.1, 1),
  med('Blood Pressure Monitor', 'The heart\'s report card, home edition.', 2, 2, {
    itemAbilities: [{ name: 'Early Warning', description: 'Heart Condition bearers get one free pre-exertion self-check per session (know before the DR7 roll).', kv: 2 }],
  }),
  med('AED (Defibrillator)', 'The box on the wall that argues with death itself.', 7, 15, {
    rarity: 4,
    itemAbilities: [{ name: 'Shock Protocol', description: 'Once per scene, +3 to a First Aid check on a character at Death\'s Door from cardiac causes; usable by the untrained (it talks you through it).', kv: 10 }],
  }),
  med('Portable Oxygen Kit', 'Bottled altitude adjustment.', 8, 8, {
    primaryMaterial: 'Aluminum', properties: ['Combustible'],
    itemAbilities: [{ name: 'Supplemental O2', description: 'Clears breathing-related penalties (smoke, thin air, Asthma flares) for one person-hour per bottle.', kv: 5 }],
  }),
  med('Nitrile Gloves (Box)', 'One hundred small barriers between you and everything.', 1, 1, { itemType: 'consumable', materialClass: 'Soft', tags: ['medical', 'consumable', 'modern'] }),
  med('N95 Masks (Box)', 'Twenty filtered breaths of caution.', 0.5, 2, {
    itemType: 'consumable', materialClass: 'Soft', tags: ['medical', 'consumable', 'modern'],
    itemAbilities: [{ name: 'Filtered', description: 'Negates airborne-particulate penalties (dust, smoke, spores) while worn.', kv: 1 }],
  }),
  med('Suture Kit', 'Thread for the body\'s torn seams.', 0.5, 4, {
    rarity: 3,
    itemAbilities: [{ name: 'Close the Wound', description: 'First Aid on lacerations gains +2 and the result holds without hospital follow-up.', kv: 3 }],
  }),

  // ── Security ──
  misc('Home Safe (Fireproof)', 'A hundred pounds of not-today.', 100, 8, {
    primaryMaterial: 'Steel', baseResist: 20, properties: ['Strong', 'Heat Proof'], rarity: 2,
    itemAbilities: [{ name: 'Secure Storage', description: 'Contents survive fire and casual theft; opening it uninvited needs DR9 lockwork or serious tools and time.', kv: 5 }],
  }),
  misc('Deadbolt Kit', 'The door\'s spine upgrade.', 3, 3, {
    primaryMaterial: 'Steel', properties: ['Strong'],
    itemAbilities: [{ name: 'Hard Entry', description: 'Forced entry through this door becomes loud, slow, or skilled (+2 to the door\'s resistance).', kv: 2 }],
  }),
  misc('Padlock (Hardened)', 'A pocket-sized boundary.', 0.5, 2, { primaryMaterial: 'Steel', properties: ['Strong'] }),
  misc('Lockpick Set (Professional)', 'Tension, feedback, patience: doors reconsidered.', 0.5, 10, {
    primaryMaterial: 'Steel', rarity: 5, tags: ['restricted', 'modern'],
    itemAbilities: [{ name: 'Bypass', description: 'Enables lockwork attempts on pin-tumbler locks; such checks gain +2.', kv: 8 }],
  }),

  // ── Comms ──
  misc('CB Radio', 'The highway\'s party line.', 5, 4, {
    tags: ['electronics', 'modern'],
    itemAbilities: [{ name: 'Open Channel', description: 'Vehicle-to-vehicle comms and road intel within miles; no network needed.', kv: 3 }],
  }),
  misc('Police Scanner', 'The city\'s other broadcast schedule.', 2, 6, {
    rarity: 3, tags: ['electronics', 'modern'],
    itemAbilities: [{ name: 'Listening In', description: 'Hear dispatch traffic: one scene of early warning whenever responders are en route (GM discretion on encrypted systems).', kv: 5 }],
  }),
  misc('Megaphone', 'Opinion, amplified to crowd scale.', 2, 3, {
    itemAbilities: [{ name: 'Carry the Voice', description: 'Address a crowd or a barricade at distance; crowd-direction checks gain +1.', kv: 2 }],
  }),
  misc('Air Horn', 'One hundred twenty decibels of immediate agenda.', 0.5, 1, { itemType: 'consumable', tags: ['consumable', 'modern'] }),
  misc('Emergency Whistle', 'A mile of HELP in half an ounce.', 0.05, 1, { primaryMaterial: 'Aluminum' }),

  // ── Bags & storage ──
  misc('Luggage Set', 'Three nested cases of elsewhere.', 18, 2, { materialClass: 'Soft', primaryMaterial: 'Polyester' }),
  misc('Messenger Bag', 'The urban sidekick: laptop, notebook, everything.', 2, 2, {
    materialClass: 'Soft', primaryMaterial: 'Canvas',
    itemAbilities: [{ name: 'Organized Carry', description: 'Daily-carry gear is always at hand — no rummaging delay in a tense moment.', kv: 1 }],
  }),
  misc('Duffel Bag (Large)', 'Sixty liters of no-questions-asked.', 3, 1, { materialClass: 'Soft', primaryMaterial: 'Nylon' }),
  misc('Filing Cabinet', 'Four drawers of institutional memory.', 60, 2, { primaryMaterial: 'Steel', tags: ['office', 'modern'] }),
  misc('Paper Shredder', 'The document\'s final editor.', 10, 2, {
    tags: ['office', 'modern'],
    itemAbilities: [{ name: 'Gone', description: 'Documents fed here are unrecoverable by ordinary means.', kv: 1 }],
  }),

  // ── Light transport & ranged ──
  misc('E-Scooter', 'Twenty urban miles per charge, standing up.', 30, 8, {
    primaryMaterial: 'Aluminum', rarity: 2, tags: ['transport', 'modern'],
    itemAbilities: [{ name: 'Zip', description: 'Triple walking pace on pavement; folds to carry; 20-mile charge.', kv: 6 }],
  }),
  misc('Air Rifle', 'Pellets, precision, and plausible backyard legality.', 6, 10, {
    itemType: 'weapon', primaryMaterial: 'Steel', rarity: 2, tags: ['weapon', 'sport', 'modern'],
    damage: { piercing: 8 }, range: 'medium', targetAttribute: 'clout', shots: 1, reload: 'break-barrel (1 action)',
  }),
  misc('Slingshot', 'Y-shaped delinquency, surprisingly serious.', 0.5, 5, {
    itemType: 'weapon', primaryMaterial: 'Steel', tags: ['weapon', 'sport', 'modern'],
    damage: { bashing: 4 }, range: 'short', targetAttribute: 'wisdom',
  }),
];
