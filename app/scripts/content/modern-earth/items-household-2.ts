/**
 * Modern-Earth items — WAVE 2: furniture, appliances, home tech, clothing.
 * Mundane KV 1-4 by design; abilities only where an item genuinely changes
 * play. Real lbs throughout.
 */

import type { ItemTemplate } from './types';

const soft = (name: string, description: string, lbs: number, kv: number, extra: Partial<ItemTemplate> = {}): ItemTemplate => ({
  name, description, itemType: 'misc',
  primaryMaterial: 'Fabric', materialClass: 'Soft',
  weightLbs: lbs, rarity: 1, kv, tags: ['household', 'modern'], ...extra,
});
const hard = (name: string, description: string, lbs: number, kv: number, extra: Partial<ItemTemplate> = {}): ItemTemplate => ({
  name, description, itemType: 'misc',
  primaryMaterial: 'Wood', materialClass: 'Hard',
  weightLbs: lbs, rarity: 1, kv, tags: ['household', 'modern'], ...extra,
});

export const HOUSEHOLD_ITEMS_2: ItemTemplate[] = [
  // ── Furniture ──
  hard('Queen Bed', 'Frame, mattress, and the eight hours everything else depends on.', 130, 3, {
    itemAbilities: [{ name: 'Proper Sleep', description: 'Full rests taken here count as safe and comfortable.', kv: 2 }],
  }),
  soft('Three-Seat Couch', 'The living room\'s gravitational center; naps happen here whether planned or not.', 120, 2, {
    subordinateMaterials: ['Wood'],
  }),
  hard('Dining Table & Chairs', 'Four seats, one surface, ten thousand conversations.', 110, 2),
  hard('Writing Desk', 'A flat surface with drawers and opinions about posture.', 60, 2),
  hard('Office Chair', 'Adjustable, wheeled, and slowly molding to one specific spine.', 35, 2, { subordinateMaterials: ['Foam Padding'] }),
  hard('Bookshelf', 'Five shelves of who the owner is, arranged spine-out.', 70, 2),
  hard('Dresser', 'Six drawers of clothing taxonomy.', 90, 1),
  hard('Nightstand', 'Lamp, glass of water, phone, and the book being slowly not-read.', 25, 1),
  hard('Floor Lamp', 'Warm light for the corner the ceiling fixture forgot.', 12, 1, { primaryMaterial: 'Steel' }),

  // ── Appliances ──
  hard('Washer & Dryer Set', 'The laundromat, retired.', 300, 3, {
    primaryMaterial: 'Steel',
    itemAbilities: [{ name: 'Clean Clothes', description: 'The household never suffers presentation penalties for want of laundry.', kv: 1 }],
  }),
  hard('Dishwasher', 'Argument-ending kitchen automation.', 80, 2, { primaryMaterial: 'Steel' }),
  hard('Chest Freezer', 'A month of food, held in suspended animation.', 100, 2, {
    primaryMaterial: 'Steel',
    itemAbilities: [{ name: 'Deep Storage', description: 'Stores bulk perishables for months.', kv: 1 }],
  }),
  hard('Window AC Unit', 'August, negotiated down to tolerable.', 45, 2, { primaryMaterial: 'Steel', properties: ['Electric Vulnerable'] }),
  hard('Space Heater', 'A small sun with a tip-over switch.', 8, 1, { primaryMaterial: 'Steel', properties: ['Electric Vulnerable'] }),
  hard('Box Fan', 'White noise and moving air, twenty dollars of summer.', 7, 1, { primaryMaterial: 'Polymer' }),
  hard('Vacuum Cleaner', 'The floor\'s weekly reckoning.', 15, 1, { primaryMaterial: 'Polymer' }),
  hard('Sewing Machine', 'Repairs, alterations, and the occasional ambitious costume.', 15, 2, {
    primaryMaterial: 'Steel',
    itemAbilities: [{ name: 'Tailor\'s Bench', description: 'Clothing repair and alteration without checks; costume/disguise construction +1.', kv: 2 }],
  }),

  // ── Home tech ──
  hard('55" Smart TV', 'The hearth, updated.', 35, 3, { primaryMaterial: 'Glass', subordinateMaterials: ['Polymer'], properties: ['Fragile', 'Electric Vulnerable'] }),
  hard('Game Console', 'A dedicated portal to elsewhere.', 9, 3, { primaryMaterial: 'Polymer', properties: ['Electric Vulnerable'] }),
  hard('Bluetooth Speaker', 'Room-filling sound from a soda-can footprint.', 1.5, 2, { primaryMaterial: 'Polymer' }),
  hard('Wireless Earbuds', 'Private soundtrack; polite isolation. (Counterplay: Misophonia triggers.)', 0.1, 3, {
    primaryMaterial: 'Polymer', properties: ['Fragile'],
    itemAbilities: [{ name: 'Noise Isolation', description: 'Blocks ambient triggers and distractions; wearer takes −1 to hearing-based awareness.', kv: 2 }],
  }),
  hard('Desktop PC & Monitor', 'More capable than the laptop, less willing to travel.', 30, 3, {
    primaryMaterial: 'Steel', subordinateMaterials: ['Glass'], properties: ['Electric Vulnerable'],
    itemAbilities: [{ name: 'Workstation', description: 'Full Programming/Research capability at home; long tasks run overnight.', kv: 6 }],
    tags: ['electronics', 'modern'],
  }),
  hard('Wi-Fi Router', 'The household\'s invisible utility; its reboot is a sacred rite.', 1, 1, { primaryMaterial: 'Polymer', tags: ['electronics', 'modern'] }),
  hard('Home Security Camera Set', 'Four eyes that never blink, feeding the phone.', 3, 3, {
    primaryMaterial: 'Polymer', tags: ['electronics', 'modern'],
    itemAbilities: [{ name: 'Watchful', description: 'Movement at the covered property is recorded; the owner reviews any scene\'s comings and goings after the fact.', kv: 5 }],
  }),
  hard('Video Doorbell', 'The peephole, evolved and archived.', 0.5, 2, {
    primaryMaterial: 'Polymer', tags: ['electronics', 'modern'],
    itemAbilities: [{ name: 'Front Door Log', description: 'Every approach to the door is recorded and pushed to the phone.', kv: 3 }],
  }),
  hard('Inkjet Printer', 'Prints documents and tests patience, in that order.', 12, 1, { primaryMaterial: 'Polymer', tags: ['office', 'modern'] }),

  // ── Clothing ──
  soft('Hoodie', 'Portable comfort with a hood-shaped privacy setting.', 1.5, 1, { itemType: 'armor', primaryMaterial: 'Cotton', armorCategory: 'Clothing', baseResist: 1, tags: ['clothing', 'modern'] }),
  soft('Athletic Wear Set', 'Clothes that mean business about sweat.', 1.5, 1, { itemType: 'armor', primaryMaterial: 'Polyester', armorCategory: 'Clothing', tags: ['clothing', 'modern'] }),
  soft('Rain Jacket', 'A personal roof.', 1, 1, { itemType: 'armor', primaryMaterial: 'Nylon', armorCategory: 'Clothing', properties: ['Absorbent'], tags: ['clothing', 'modern'] }),
  soft('Hiking Boots', 'Ankle-armored miles.', 3.5, 2, { itemType: 'armor', primaryMaterial: 'Leather', armorCategory: 'Clothing', baseResist: 2, tags: ['clothing', 'modern'] }),
  soft('Dress Shoes', 'Leather diplomacy.', 2.5, 1, { itemType: 'armor', primaryMaterial: 'Leather', armorCategory: 'Clothing', tags: ['clothing', 'modern'] }),
  soft('Winter Gloves & Hat', 'Extremity insurance.', 0.8, 1, { primaryMaterial: 'Wool', properties: ['Cold Resistant'], tags: ['clothing', 'modern'] }),
  hard('Sunglasses', 'Glare management and plausible mystique.', 0.1, 1, { itemType: 'accessory', primaryMaterial: 'Polycarbonate', properties: ['Fragile'], tags: ['clothing', 'modern'] }),
  soft('Baseball Cap', 'Shade, team allegiance, and camera-angle management.', 0.2, 1, { itemType: 'accessory', primaryMaterial: 'Cotton', tags: ['clothing', 'modern'] }),
  soft('High-Vis Vest', 'The universal costume of belonging on a worksite.', 0.4, 1, {
    itemType: 'armor', primaryMaterial: 'Polyester', armorCategory: 'Clothing', tags: ['clothing', 'modern'],
    itemAbilities: [{ name: 'Looks Official', description: '+2 to blend-in checks anywhere workers are expected.', kv: 3 }],
  }),
  soft('Lab Coat', 'Authority, starched.', 1, 1, {
    itemType: 'armor', primaryMaterial: 'Cotton', armorCategory: 'Clothing', tags: ['clothing', 'modern'],
    itemAbilities: [{ name: 'Looks Clinical', description: '+2 to blend-in checks in medical or laboratory settings.', kv: 3 }],
  }),
  soft('Scrubs', 'Hospital camouflage, machine-washable.', 0.8, 1, {
    itemType: 'armor', primaryMaterial: 'Polyester', armorCategory: 'Clothing', tags: ['clothing', 'modern'],
    itemAbilities: [{ name: 'Looks Medical', description: '+2 to blend-in checks in healthcare settings.', kv: 3 }],
  }),
  soft('Mechanic\'s Coveralls', 'One garment, every stain a work history.', 2.5, 1, {
    itemType: 'armor', primaryMaterial: 'Cotton', armorCategory: 'Clothing', baseResist: 2, tags: ['clothing', 'modern'],
  }),
  soft('Chef\'s Whites', 'The kitchen\'s dress uniform; burns optional, inevitable.', 1.5, 1, {
    itemType: 'armor', primaryMaterial: 'Cotton', armorCategory: 'Clothing', properties: ['Heat Resistant'], tags: ['clothing', 'modern'],
  }),
];
