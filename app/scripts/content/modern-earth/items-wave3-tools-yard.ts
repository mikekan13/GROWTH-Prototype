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
  tool('Welding Rig (MIG)', 'Joins steel with lightning; the shop\'s point of no return.', 60, 12, {
    rarity: 3, properties: ['Electric Vulnerable'],
    itemAbilities: [{ name: 'Metal Joining', description: 'Permanent steel fabrication and repair (Mechanics); cuts field-repair time in half for metal work.', kv: 6 }],
  }),
  tool('Angle Grinder', 'Sparks as a service: cuts, grinds, and liberates seized bolts.', 5, 6, {
    rarity: 2, properties: ['Sharp'],
    itemAbilities: [{ name: 'Cut Through', description: 'Defeats padlocks, chains, and light steel in a minute of loud, obvious work.', kv: 4 }],
  }),
  tool('Sledgehammer', 'Ten pounds of unappealable verdict.', 10, 12, {
    properties: ['Strong', 'Blunt'],
    damage: { bashing: 12 }, range: 'melee', targetAttribute: 'wisdom',
    itemAbilities: [{ name: 'Demolition', description: 'Walls, doors, and stuck things: forcing checks gain +2 (and everyone hears it).', kv: 2 }],
  }),
  tool('Pickaxe', 'For ground that disagrees.', 8, 10, {
    properties: ['Strong', 'Sharp'],
    damage: { piercing: 9 }, range: 'melee', targetAttribute: 'clout',
  }),
  tool('Hatchet', 'The axe\'s quick-tempered little sibling.', 2, 10, {
    properties: ['Sharp'],
    damage: { slashing: 9 }, range: 'melee', targetAttribute: 'celerity',
    tags: ['tool', 'weapon', 'outdoor', 'modern'],
  }),
  tool('Wheelbarrow', 'One wheel, two handles, three hundred pounds of maybe.', 50, 3, {
    itemAbilities: [{ name: 'Haul', description: 'Move up to 300 lbs over rough ground without encumbrance checks.', kv: 2 }],
  }),
  tool('Hand Truck', 'The mover\'s lever: appliances become negotiable.', 25, 3, {
    itemAbilities: [{ name: 'Dolly', description: 'One person moves refrigerator-class objects on hard floors.', kv: 2 }],
  }),
  tool('Portable Generator', 'Grid-in-a-box, loud about it.', 100, 10, {
    rarity: 2, properties: ['Combustible'],
    itemAbilities: [{ name: 'Field Power', description: 'Runs a household\'s essentials or a work site for a day per tank; requires fuel; announces itself to the neighborhood.', kv: 6 }],
  }),
  tool('Air Compressor', 'Pressurized convenience for nailers, tires, and dust.', 70, 5, {
    rarity: 2,
    itemAbilities: [{ name: 'Shop Air', description: 'Powers pneumatic tools; inflates anything.', kv: 2 }],
  }),
  tool('Pressure Washer', 'Water, weaponized against grime.', 50, 4, {
    rarity: 2,
    itemAbilities: [{ name: 'Blast Clean', description: 'Strips paint, mud, and evidence from hard surfaces in minutes.', kv: 2 }],
  }),
  tool('Climbing Rope (200ft)', 'Load-rated trust, coiled.', 10, 4, {
    primaryMaterial: 'Nylon', materialClass: 'Soft', properties: ['Strong', 'Flexible'],
    itemAbilities: [{ name: 'Rated Line', description: 'Supports two people; climbing checks with proper anchoring gain +2.', kv: 3 }],
    tags: ['tool', 'outdoor', 'modern'],
  }),
  tool('Harness & Carabiner Set', 'The difference between climbing and falling with commitment.', 4, 5, {
    primaryMaterial: 'Nylon', materialClass: 'Soft', properties: ['Strong'],
    itemAbilities: [{ name: 'Safety System', description: 'With rope and anchor: a failed climbing check means a catch, not a fall.', kv: 4 }],
    tags: ['tool', 'outdoor', 'modern'],
  }),
  tool('Headlamp', 'Both hands back, courtesy of the forehead.', 0.3, 3, {
    primaryMaterial: 'Polymer',
    itemAbilities: [{ name: 'Hands-Free Light', description: 'Negates darkness penalties for tasks needing both hands.', kv: 2 }],
  }),
  tool('Work Light (Tripod)', 'Floodlit honesty for night work.', 12, 2, {
    primaryMaterial: 'Steel', properties: ['Electric Vulnerable'],
  }),
  tool('Chain & Padlock (Heavy)', 'Six feet of hardened no.', 12, 4, {
    properties: ['Strong'],
    itemAbilities: [{ name: 'Secure', description: 'Defeating it takes bolt cutters, a grinder, or a DR7 lockwork check.', kv: 3 }],
  }),
  tool('Tarp (Heavy, 12x16)', 'Blue rectangle of universal contingency.', 6, 2, {
    primaryMaterial: 'Polyethylene', materialClass: 'Soft', properties: ['Flexible'],
  }),
  tool('Zip Ties (Bag of 100)', 'Single-use resolve in assorted lengths.', 1, 2, {
    primaryMaterial: 'Nylon', materialClass: 'Soft',
  }),
  tool('Moving Boxes & Tape (Bundle)', 'A household, quantized.', 15, 1, {
    primaryMaterial: 'Cardboard', materialClass: 'Soft', properties: ['Flammable'],
  }),
  tool('Storage Totes (Set of 4)', 'Stackable plastic order.', 12, 1, {
    primaryMaterial: 'Polymer',
  }),
  tool('Paint & Supplies Kit', 'Two gallons of new leaf, plus the hardware.', 30, 2, {
    itemAbilities: [{ name: 'Fresh Coat', description: 'Repaint a room in a day; alters a space\'s described character (or covers what was there).', kv: 1 }],
  }),

  // ── Yard & seasonal ──
  tool('Lawn Mower (Push)', 'The suburb\'s weekly metronome.', 60, 3, { rarity: 1, properties: ['Sharp', 'Combustible'] }),
  tool('Hedge Trimmer', 'Topiary\'s power tool; brambles\' nightmare.', 6, 6, {
    properties: ['Sharp'],
    damage: { slashing: 6 }, range: 'melee', targetAttribute: 'celerity',
  }),
  tool('Garden Kit', 'Trowel, pruners, gloves, and intent.', 8, 2, {
    itemAbilities: [{ name: 'Tended Beds', description: 'Supports Green Thumb play and food gardening at home scale.', kv: 1 }],
  }),
  tool('Garden Hose (100ft)', 'Water, delivered at argument pressure.', 12, 1, {
    primaryMaterial: 'Rubber', materialClass: 'Soft', properties: ['Flexible'],
  }),
  tool('Snow Shovel', 'Winter\'s manual undo button.', 4, 2, { primaryMaterial: 'Polymer' }),
  tool('Ice Melt (Bag)', 'Chemical diplomacy for frozen steps.', 20, 1, {
    itemType: 'consumable', materialClass: 'Soft', tags: ['consumable', 'modern'],
  }),
  tool('Tire Chains', 'Traction for roads that stopped being roads.', 15, 3, {
    itemAbilities: [{ name: 'Grip', description: 'Vehicle driving checks on snow and ice lose their weather penalty.', kv: 2 }],
  }),
  tool('Dehumidifier', 'The basement\'s quiet bodyguard.', 40, 2, { properties: ['Electric Vulnerable'] }),

  // ── Kitchen depth ──
  tool('Chef\'s Knife Set', 'Eight blades, one block, zero excuses.', 12, 5, {
    primaryMaterial: 'High-Carbon Steel', properties: ['Sharp'],
    itemAbilities: [{ name: 'Proper Steel', description: 'Cooking checks involving knife work gain +1.', kv: 2 }],
    tags: ['kitchen', 'modern'],
  }),
  tool('Stand Mixer', 'Countertop torque in enamel colors.', 25, 3, { tags: ['kitchen', 'modern'] }),
  tool('Blender', 'Smoothies, soups, and sounds.', 8, 2, { tags: ['kitchen', 'modern'] }),
  tool('Pressure Cooker', 'Time compression for dinner.', 12, 3, {
    tags: ['kitchen', 'modern'],
    itemAbilities: [{ name: 'Fast Feast', description: 'Proper meals in a fraction of the time; field-capable on any heat source.', kv: 1 }],
  }),
  tool('Propane Grill', 'The backyard\'s summer embassy.', 90, 4, {
    properties: ['Combustible'], tags: ['kitchen', 'outdoor', 'modern'],
    itemAbilities: [{ name: 'Cookout', description: 'Feeds a gathering; host checks at barbecues gain +1.', kv: 2 }],
  }),
  tool('Espresso Machine', 'Caffeination, promoted to a hobby.', 20, 4, {
    tags: ['kitchen', 'modern'],
    itemAbilities: [{ name: 'Barista Grade', description: 'The Caffeinated blossom, on demand, impressively.', kv: 2 }],
  }),
];
