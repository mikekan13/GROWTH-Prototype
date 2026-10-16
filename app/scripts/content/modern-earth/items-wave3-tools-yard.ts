/**
 * Modern-Earth items — WAVE 3: trade tools, yard/seasonal, kitchen depth.
 */

import type { ItemTemplate } from './types';

const tool = (name: string, description: string, lbs: number, kv: number, extra: Partial<ItemTemplate> = {}): ItemTemplate => ({
  name, description, itemType: 'tool',
  primaryMaterial: 'Steel', materialClass: 'Hard',
  weightLbs: lbs, rarity: 1, kv, tags: ['tool', 'modern'], ...extra,
});

export const WAVE3_TOOLS_YARD: ItemTemplate[] = [
  // ── Trade tools ──
  tool('Welding Rig (MIG)', 'Joins steel with lightning; the shop\'s point of no return.', 60, 5.33, {
    volumeCuFt: 6, rarity: 3, properties: ['Electric Vulnerable'],
    itemAbilities: [{ name: 'Metal Joining', description: 'Permanent steel fabrication and repair (Mechanics); cuts field-repair time in half for metal work.', kv: 6 }],
  }),
  tool('Angle Grinder', 'Sparks as a service: cuts, grinds, and liberates seized bolts.', 5, 0.533, {
    volumeCuFt: 0.15, rarity: 2, properties: ['Sharp'],
    itemAbilities: [{ name: 'Cut Through', description: 'Defeats padlocks, chains, and light steel in a minute of loud, obvious work.', kv: 4 }],
  }),
  tool('Sledgehammer', 'Ten pounds of unappealable verdict.', 10, 0.333, {
    volumeCuFt: 0.3, properties: ['Strong', 'Blunt'],
    damage: { bashing: 12 }, range: 'melee', targetAttribute: 'wisdom',
    itemAbilities: [{ name: 'Demolition', description: 'Walls, doors, and stuck things: forcing checks gain +2 (and everyone hears it).', kv: 2 }],
  }),
  tool('Pickaxe', 'For ground that disagrees.', 8, 0.3, {
    volumeCuFt: 0.4, properties: ['Strong', 'Sharp'],
    damage: { piercing: 9 }, range: 'melee', targetAttribute: 'clout',
  }),
  tool('Hatchet', 'The axe\'s quick-tempered little sibling.', 2, 0.233, {
    volumeCuFt: 0.1, properties: ['Sharp'],
    damage: { slashing: 9 }, range: 'melee', targetAttribute: 'celerity',
    tags: ['tool', 'weapon', 'outdoor', 'modern'],
  }),
  tool('Wheelbarrow', 'One wheel, two handles, three hundred pounds of maybe.', 50, 0.8, {
    volumeCuFt: 8, capacityCuFt: 6, capacityLbs: 300, itemAbilities: [{ name: 'Haul', description: 'Move up to 300 lbs over rough ground without encumbrance checks.', kv: 2 }],
  }),
  tool('Hand Truck', 'The mover\'s lever: appliances become negotiable.', 25, 0.533, {
    volumeCuFt: 4, capacityCuFt: 20, capacityLbs: 600, itemAbilities: [{ name: 'Dolly', description: 'One person moves refrigerator-class objects on hard floors.', kv: 2 }],
  }),
  tool('Portable Generator', 'Grid-in-a-box, loud about it.', 100, 6, {
    volumeCuFt: 6, rarity: 2, properties: ['Combustible'],
    itemAbilities: [{ name: 'Field Power', description: 'Runs a household\'s essentials or a work site for a day per tank; requires fuel; announces itself to the neighborhood.', kv: 6 }],
  }),
  tool('Air Compressor', 'Pressurized convenience for nailers, tires, and dust.', 70, 2, {
    volumeCuFt: 4, rarity: 2,
    itemAbilities: [{ name: 'Shop Air', description: 'Powers pneumatic tools; inflates anything.', kv: 2 }],
  }),
  tool('Pressure Washer', 'Water, weaponized against grime.', 50, 2.33, {
    volumeCuFt: 5, rarity: 2,
    itemAbilities: [{ name: 'Blast Clean', description: 'Strips paint, mud, and evidence from hard surfaces in minutes.', kv: 2 }],
  }),
  tool('Climbing Rope (200ft)', 'Load-rated trust, coiled.', 10, 1.67, {
    volumeCuFt: 0.5, primaryMaterial: 'Nylon', materialClass: 'Soft', properties: ['Strong', 'Flexible'],
    itemAbilities: [{ name: 'Rated Line', description: 'Supports two people; climbing checks with proper anchoring gain +2.', kv: 3 }],
    tags: ['tool', 'outdoor', 'modern'],
  }),
  tool('Harness & Carabiner Set', 'The difference between climbing and falling with commitment.', 4, 1, {
    volumeCuFt: 0.2, primaryMaterial: 'Nylon', materialClass: 'Soft', properties: ['Strong'],
    itemAbilities: [{ name: 'Safety System', description: 'With rope and anchor: a failed climbing check means a catch, not a fall.', kv: 4 }],
    tags: ['tool', 'outdoor', 'modern'],
  }),
  tool('Headlamp', 'Both hands back, courtesy of the forehead.', 0.3, 0.233, {
    volumeCuFt: 0.01, primaryMaterial: 'Polymer',
    itemAbilities: [{ name: 'Hands-Free Light', description: 'Negates darkness penalties for tasks needing both hands.', kv: 2 }],
  }),
  tool('Work Light (Tripod)', 'Floodlit honesty for night work.', 12, 0.533, {
    volumeCuFt: 2, primaryMaterial: 'Steel', properties: ['Electric Vulnerable'],
  }),
  tool('Chain & Padlock (Heavy)', 'Six feet of hardened no.', 12, 0.6, {
    volumeCuFt: 0.3, properties: ['Strong'],
    itemAbilities: [{ name: 'Secure', description: 'Defeating it takes bolt cutters, a grinder, or a DR7 lockwork check.', kv: 3 }],
  }),
  tool('Tarp (Heavy, 12x16)', 'Blue rectangle of universal contingency.', 6, 0.267, {
    volumeCuFt: 0.4, primaryMaterial: 'Polyethylene', materialClass: 'Soft', properties: ['Flexible'],
  }),
  tool('Zip Ties (Bag of 100)', 'Single-use resolve in assorted lengths.', 1, 0.0533, {
    volumeCuFt: 0.02, primaryMaterial: 'Nylon', materialClass: 'Soft',
  }),
  tool('Moving Boxes & Tape (Bundle)', 'A household, quantized.', 15, 0.333, {
    volumeCuFt: 3, capacityCuFt: 30, capacityLbs: 400, primaryMaterial: 'Cardboard', materialClass: 'Soft', properties: ['Flammable'],
  }),
  tool('Storage Totes (Set of 4)', 'Stackable plastic order.', 12, 0.4, {
    volumeCuFt: 4, capacityCuFt: 8.8, capacityLbs: 160, primaryMaterial: 'Polymer',
  }),
  tool('Paint & Supplies Kit', 'Two gallons of new leaf, plus the hardware.', 30, 1, {
    volumeCuFt: 1.5, itemAbilities: [{ name: 'Fresh Coat', description: 'Repaint a room in a day; alters a space\'s described character (or covers what was there).', kv: 1 }],
  }),

  // ── Yard & seasonal ──
  tool('Lawn Mower (Push)', 'The suburb\'s weekly metronome.', 60, 2.33, { volumeCuFt: 12, rarity: 1, properties: ['Sharp', 'Combustible'] }),
  tool('Hedge Trimmer', 'Topiary\'s power tool; brambles\' nightmare.', 6, 0.667, {
    volumeCuFt: 0.5, properties: ['Sharp'],
    damage: { slashing: 6 }, range: 'melee', targetAttribute: 'celerity',
  }),
  tool('Garden Kit', 'Trowel, pruners, gloves, and intent.', 8, 0.533, {
    volumeCuFt: 1, itemAbilities: [{ name: 'Tended Beds', description: 'Supports Green Thumb play and food gardening at home scale.', kv: 1 }],
  }),
  tool('Garden Hose (100ft)', 'Water, delivered at argument pressure.', 12, 0.4, {
    volumeCuFt: 1, primaryMaterial: 'Rubber', materialClass: 'Soft', properties: ['Flexible'],
  }),
  tool('Snow Shovel', 'Winter\'s manual undo button.', 4, 0.2, { volumeCuFt: 1.5, primaryMaterial: 'Polymer' }),
  tool('Ice Melt (Bag)', 'Chemical diplomacy for frozen steps.', 20, 0.1, {
    volumeCuFt: 0.3, itemType: 'consumable', materialClass: 'Soft', tags: ['consumable', 'modern'],
  }),
  tool('Tire Chains', 'Traction for roads that stopped being roads.', 15, 0.533, {
    volumeCuFt: 0.3, itemAbilities: [{ name: 'Grip', description: 'Vehicle driving checks on snow and ice lose their weather penalty.', kv: 2 }],
  }),
  tool('Dehumidifier', 'The basement\'s quiet bodyguard.', 40, 1.67, { volumeCuFt: 2, properties: ['Electric Vulnerable'] }),

  // ── Kitchen depth ──
  tool('Chef\'s Knife Set', 'Eight blades, one block, zero excuses.', 12, 1.33, {
    volumeCuFt: 0.6, primaryMaterial: 'High-Carbon Steel', properties: ['Sharp'],
    itemAbilities: [{ name: 'Proper Steel', description: 'Cooking checks involving knife work gain +1.', kv: 2 }],
    tags: ['kitchen', 'modern'],
  }),
  tool('Stand Mixer', 'Countertop torque in enamel colors.', 25, 2.67, { volumeCuFt: 1.2, tags: ['kitchen', 'modern'] }),
  tool('Blender', 'Smoothies, soups, and sounds.', 8, 0.533, { volumeCuFt: 0.6, tags: ['kitchen', 'modern'] }),
  tool('Pressure Cooker', 'Time compression for dinner.', 12, 0.667, {
    volumeCuFt: 0.8, tags: ['kitchen', 'modern'],
    itemAbilities: [{ name: 'Fast Feast', description: 'Proper meals in a fraction of the time; field-capable on any heat source.', kv: 1 }],
  }),
  tool('Propane Grill', 'The backyard\'s summer embassy.', 90, 2.67, {
    volumeCuFt: 20, properties: ['Combustible'], tags: ['kitchen', 'outdoor', 'modern'],
    itemAbilities: [{ name: 'Cookout', description: 'Feeds a gathering; host checks at barbecues gain +1.', kv: 2 }],
  }),
  tool('Espresso Machine', 'Caffeination, promoted to a hobby.', 20, 3.33, {
    volumeCuFt: 1, tags: ['kitchen', 'modern'],
    itemAbilities: [{ name: 'Barista Grade', description: 'The Caffeinated blossom, on demand, impressively.', kv: 2 }],
  }),
];
