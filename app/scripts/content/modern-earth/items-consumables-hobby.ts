/**
 * Modern-Earth items — WAVE 2: consumables, food, meds, sports, hobby,
 * instruments. Consumables carry their use economy in the ability text.
 */

import type { ItemTemplate } from './types';

const consumable = (name: string, description: string, lbs: number, kv: number, extra: Partial<ItemTemplate> = {}): ItemTemplate => ({
  name, description, itemType: 'consumable',
  primaryMaterial: 'Mixed Goods', materialClass: 'Soft',
  weightLbs: lbs, rarity: 1, kv, tags: ['consumable', 'modern'], ...extra,
});
const gear = (name: string, description: string, lbs: number, kv: number, extra: Partial<ItemTemplate> = {}): ItemTemplate => ({
  name, description, itemType: 'misc',
  primaryMaterial: 'Polymer', materialClass: 'Hard',
  weightLbs: lbs, rarity: 1, kv, tags: ['hobby', 'modern'], ...extra,
});

export const CONSUMABLE_HOBBY_ITEMS: ItemTemplate[] = [
  // ── Food & drink ──
  consumable('Week of Groceries', 'Bags of ordinary abundance: produce, staples, and one impulse dessert.', 40, 1, {
    volumeCuFt: 4, itemAbilities: [{ name: 'Fed Household', description: 'Feeds four people for a week; enables proper meals (and meal-based counterplay).', kv: 1 }],
  }),
  consumable('Canned Goods (Case)', 'Twenty-four cans of shelf-stable insurance.', 24, 0.2, {
    volumeCuFt: 0.6, primaryMaterial: 'Steel', materialClass: 'Hard',
    itemAbilities: [{ name: 'Keeps Forever', description: 'Feeds one person two weeks; ignores spoilage.', kv: 1 }],
  }),
  consumable('Bottled Water (Case)', 'Twenty-four units of the only non-negotiable.', 26, 0.04, { volumeCuFt: 0.5 }),
  consumable('MRE', 'A complete military meal plus chemistry-set heater. Flavor: technically.', 1.5, 0.08, {
    volumeCuFt: 0.05, itemAbilities: [{ name: 'Field Ration', description: 'One full hot meal anywhere, no fire, no prep.', kv: 1 }],
  }),
  consumable('Energy Bars (Box)', 'Twelve dense rectangles of keep-going.', 1.5, 0.133, { volumeCuFt: 0.04 }),
  consumable('Instant Ramen (Case)', 'Twelve bricks of budget survival, rated in exam seasons.', 3, 0.1, { volumeCuFt: 0.8 }),
  consumable('Coffee Beans (Bag)', 'Two pounds of morning, whole-bean.', 2, 0.167, {
    volumeCuFt: 0.08, itemAbilities: [{ name: 'Brew Stock', description: 'Supplies the Caffeinated blossom for a household for two weeks.', kv: 1 }],
  }),
  consumable('Whiskey (Bottle)', 'Amber diplomacy; also flammable.', 2.5, 0.233, {
    volumeCuFt: 0.04, primaryMaterial: 'Glass', materialClass: 'Hard', properties: ['Flammable', 'Fragile'],
    tags: ['consumable', 'modern', 'mature'],
  }),
  consumable('Cigarettes (Pack)', 'Twenty small negotiations with later.', 0.1, 0.06, {
    volumeCuFt: 0.003, tags: ['consumable', 'modern', 'mature'],
  }),

  // ── Meds & counterplay consumables ──
  consumable('OTC Painkillers', 'A bottle of manageable afternoons.', 0.2, 0.0667, {
    volumeCuFt: 0.005, itemAbilities: [{ name: 'Take the Edge Off', description: 'Suppresses one minor pain penalty (−1 tier) for a scene. ~20 doses.', kv: 2 }],
  }),
  consumable('Antihistamines', 'The trees\' agenda, chemically vetoed. (Counterplay: Seasonal Allergies.)', 0.1, 0.1, {
    volumeCuFt: 0.004, itemAbilities: [{ name: 'Clear Head', description: 'Suppresses Seasonal Allergies for a full day. ~14 doses.', kv: 2 }],
  }),
  consumable('Sleeping Pills (Prescription)', 'Sleep, underwritten. Handle with respect.', 0.1, 0.2, {
    volumeCuFt: 0.003, rarity: 3, tags: ['consumable', 'medical', 'modern', 'mature'],
    itemAbilities: [{ name: 'Forced Rest', description: 'Guarantees a full night\'s sleep (Chronic Insomnia included); user is groggy (−1) for the first scene after waking. ~10 doses.', kv: 3 }],
  }),
  consumable('Multivitamins', 'A bottle of good intentions, clinically modest.', 0.3, 0.08, { volumeCuFt: 0.006 }),
  consumable('Batteries (Assorted Pack)', 'AA through 9V: portable electricity in denominations.', 1.5, 0.167, {
    volumeCuFt: 0.03, primaryMaterial: 'Steel', materialClass: 'Hard',
  }),
  consumable('Candles (Box)', 'Twelve hours of soft light per stick, blackout-rated.', 2, 0.1, { volumeCuFt: 0.1, properties: ['Flammable'] }),
  consumable('Propane Canister', 'Sixteen ounces of camp-stove endurance.', 1.8, 0.04, {
    volumeCuFt: 0.04, primaryMaterial: 'Steel', materialClass: 'Hard', properties: ['Combustible'],
  }),

  // ── Sports & fitness ──
  gear('Basketball', 'The driveway\'s oldest argument-settler.', 1.4, 0.2, { volumeCuFt: 0.27, primaryMaterial: 'Rubber', materialClass: 'Soft' }),
  gear('Soccer Ball', 'The world\'s most multilingual object.', 1, 0.167, { volumeCuFt: 0.19, primaryMaterial: 'Synthetic Leather', materialClass: 'Soft' }),
  gear('Tennis Racket', 'Strung precision with a sweet spot.', 0.7, 0.533, { volumeCuFt: 0.15, primaryMaterial: 'Graphite' }),
  gear('Golf Club Set', 'Fourteen specialized ways to be humbled.', 30, 4, { volumeCuFt: 5, primaryMaterial: 'Steel', subordinateMaterials: ['Graphite'] }),
  gear('Yoga Mat', 'Six feet of intentional floor.', 2.5, 0.2, { volumeCuFt: 0.2, primaryMaterial: 'Foam Padding', materialClass: 'Soft' }),
  gear('Adjustable Dumbbell', 'One dumbbell for one hand: five to fifty pounds of optional difficulty.', 50, 1.33, {
    volumeCuFt: 0.8, primaryMaterial: 'Steel',
    itemAbilities: [{ name: 'Home Gym', description: 'Supports strength training between sessions (trainable-mechanic flavor).', kv: 1 }],
  }),
  gear('Boxing Glove', 'One padded glove for one fist.', 1, 0.2, {
    volumeCuFt: 0.08, primaryMaterial: 'Leather', materialClass: 'Soft',
  }),
  gear('Heavy Bag', 'An argument you can have alone.', 80, 1, {
    volumeCuFt: 4.3, primaryMaterial: 'Leather', materialClass: 'Soft',
    itemAbilities: [{ name: 'Sparring Setup', description: 'Supports Unarmed Combat practice; training montages welcome.', kv: 1 }],
  }),
  gear('Jump Rope', 'Cardio in a coil.', 0.5, 0.1, { volumeCuFt: 0.01, primaryMaterial: 'Nylon', materialClass: 'Soft' }),

  // ── Instruments ──
  gear('Acoustic Guitar', 'Six strings and everywhere is a stage.', 4.5, 2, {
    volumeCuFt: 2, primaryMaterial: 'Spruce', subordinateMaterials: ['Steel'],
    itemAbilities: [{ name: 'Play Anywhere', description: 'Enables Music Performance without power or setup.', kv: 2 }],
  }),
  gear('Electric Guitar & Amp', 'Volume as a personality trait.', 40, 4.67, {
    volumeCuFt: 3, primaryMaterial: 'Alder', subordinateMaterials: ['Steel'], properties: ['Electric Vulnerable'],
    itemAbilities: [{ name: 'Loud', description: 'Fills a venue; Crowd Energy blossom becomes reachable at shows.', kv: 2 }],
  }),
  gear('Digital Keyboard (61-key)', 'A whole band in headphone mode.', 12, 1.33, {
    volumeCuFt: 1.4, primaryMaterial: 'Polymer', properties: ['Electric Vulnerable'],
  }),
  gear('Drum Kit', 'Neighbors\' least favorite furniture.', 100, 4.67, {
    volumeCuFt: 40, primaryMaterial: 'Maple', subordinateMaterials: ['Steel'],
  }),
  gear('Violin', 'Four strings between screech and soul; the distance is called practice.', 1, 2, {
    volumeCuFt: 0.5, primaryMaterial: 'Spruce', properties: ['Fragile'],
  }),

  // ── Games & pastimes ──
  gear('Deck of Cards', 'Fifty-two pieces of infinite games.', 0.2, 0.0333, { volumeCuFt: 0.004, primaryMaterial: 'Paper', materialClass: 'Soft', properties: ['Flammable'] }),
  gear('Poker Set', 'Chips, cards, and a case that means business.', 6, 0.4, {
    volumeCuFt: 0.2, itemAbilities: [{ name: 'Table Stakes', description: 'Hosts a proper game night; social scenes at the table flow naturally.', kv: 1 }],
  }),
  gear('Board Game Shelf', 'A curated library of rainy afternoons.', 25, 1.67, { volumeCuFt: 10, capacityCuFt: 6, capacityLbs: 100 }),

  // ── Outdoor extras ──
  gear('48qt Cooler', 'Cold logistics for tailgates and long hauls.', 10, 0.333, {
    volumeCuFt: 3.6, capacityCuFt: 1.6, capacityLbs: 60, itemAbilities: [{ name: 'Cold Chain', description: 'Keeps perishables (and insulin) cold for two days on ice.', kv: 2 }],
  }),
  gear('Camping Chair', 'A folding throne for the fire\'s edge.', 5, 0.2, { volumeCuFt: 0.5, primaryMaterial: 'Nylon', materialClass: 'Soft' }),
  gear('Fishing Rod & Tackle', 'Patience, with equipment.', 5, 0.8, {
    volumeCuFt: 0.5, primaryMaterial: 'Graphite',
    itemAbilities: [{ name: 'Provider', description: 'Enables fishing for food near water (Survival or Animal Handling).', kv: 2 }],
  }),
];
