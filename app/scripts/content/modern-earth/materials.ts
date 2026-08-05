/**
 * Modern-Earth MATERIALS — raw stock as catalog items (wave 3).
 *
 * Canon (Material_System.md #validated + Complete_Materials_Reference.md
 * #needs-review as numeric starting reference): "materials are potential,
 * items are purpose." Raw material KV < 1 PER UNIT; these entries are
 * purchasable STOCK quantities (sheet/bolt/bundle/bag), so stock KV lands
 * 1-12 while remaining the pricing FLOOR for anything crafted from them.
 * baseResist uses the canon material table values (steel 30-38, kevlar 25,
 * titanium 34, leather 17, cotton 1...) — the raw material ceiling, before
 * item-level grading/armor multipliers.
 */

import type { ItemTemplate } from './types';

const stock = (
  name: string, description: string, cls: 'Soft' | 'Hard', lbs: number,
  rarity: number, kv: number, extra: Partial<ItemTemplate> = {},
): ItemTemplate => ({
  name, description, itemType: 'misc',
  primaryMaterial: name.replace(/ \(.*\)$/, ''), materialClass: cls,
  weightLbs: lbs, rarity, kv,
  tags: ['material', 'raw-stock', 'modern'], ...extra,
});

export const MATERIALS: ItemTemplate[] = [
  // ── Construction ──
  stock('Lumber (2x4 Stack)', 'Twenty straight boards of potential.', 'Hard', 60, 1, 2, { baseResist: 10, properties: ['Flammable', 'Strong'] }),
  stock('Plywood (Sheet)', 'Four by eight feet of instant wall.', 'Hard', 50, 1, 1, { baseResist: 8, properties: ['Flammable'] }),
  stock('Concrete Mix (80lb Bag)', 'Stone in powdered, patient form.', 'Hard', 80, 1, 1, { baseResist: 25, properties: ['Strong'] }),
  stock('Bricks (Stack of 50)', 'Civilization\'s oldest pixel.', 'Hard', 250, 1, 2, { baseResist: 20, properties: ['Strong', 'Heat Resistant'] }),
  stock('Rebar (Bundle)', 'Concrete\'s hidden skeleton.', 'Hard', 100, 2, 3, { primaryMaterial: 'Steel', baseResist: 30, properties: ['Strong'] }),
  stock('Drywall (Sheet)', 'The wall you can punch through and usually shouldn\'t.', 'Hard', 55, 1, 1, { baseResist: 3, properties: ['Fragile'] }),
  stock('Insulation (Roll)', 'Itchy pink silence and warmth.', 'Soft', 30, 1, 1, { baseResist: 1, properties: ['Flammable'] }),
  stock('Window Glass (Sheet)', 'Transparency with a temper.', 'Hard', 40, 1, 1, { primaryMaterial: 'Glass', baseResist: 2, properties: ['Fragile'] }),
  stock('Asphalt Shingles (Bundle)', 'A roof, sold by the third.', 'Hard', 70, 1, 1, { baseResist: 6, properties: ['Flammable'] }),
  stock('PVC Pipe (Bundle)', 'Plumbing\'s white plastic vocabulary.', 'Hard', 25, 1, 1, { primaryMaterial: 'PVC', baseResist: 5 }),
  stock('Copper Pipe (Bundle)', 'Water\'s preferred metal highway.', 'Hard', 40, 2, 3, { primaryMaterial: 'Copper', baseResist: 12 }),
  stock('Copper Wire (Spool)', 'Electricity\'s roadbed, by the hundred feet.', 'Hard', 25, 2, 3, { primaryMaterial: 'Copper', baseResist: 12, properties: ['Flexible'] }),

  // ── Metals ──
  stock('Steel Sheet (Low Carbon)', 'The modern world\'s default answer.', 'Hard', 90, 2, 6, { primaryMaterial: 'Steel', baseResist: 35, properties: ['Strong', 'Heat Resistant', 'Electric Vulnerable'] }),
  stock('Stainless Steel (Bar Stock)', 'Steel that refuses to rust on principle.', 'Hard', 60, 3, 7, { primaryMaterial: 'Stainless Steel', baseResist: 32, properties: ['Strong', 'Heat Resistant'] }),
  stock('High-Carbon Steel (Billet)', 'Blade-grade: hard, keen, and a little proud.', 'Hard', 50, 3, 8, { primaryMaterial: 'High-Carbon Steel', baseResist: 38, properties: ['Strong', 'Sharp', 'Brittle'] }),
  stock('Aluminum Sheet', 'Strength on a diet.', 'Hard', 30, 2, 3, { primaryMaterial: 'Aluminum', baseResist: 15, properties: ['Featherlight'] }),
  stock('Titanium (Rod Stock)', 'Aerospace-grade stubbornness, priced accordingly.', 'Hard', 15, 5, 12, { primaryMaterial: 'Titanium', baseResist: 34, properties: ['Strong', 'Featherlight', 'Heat Resistant', 'Cold Resistant'] }),
  stock('Brass (Stock)', 'The friendly metal: casings, fittings, and doorknobs.', 'Hard', 40, 2, 3, { primaryMaterial: 'Brass', baseResist: 18 }),
  stock('Lead (Ingots)', 'Density, sold by the regretful armload.', 'Hard', 100, 2, 2, { primaryMaterial: 'Lead', baseResist: 10, properties: ['Blunt'] }),

  // ── Soft goods ──
  stock('Cotton (Bolt)', 'Thirty yards of everything comfortable.', 'Soft', 15, 1, 1, { baseResist: 1, properties: ['Absorbent', 'Flammable', 'Flexible'] }),
  stock('Denim (Bolt)', 'Workwear\'s native tongue.', 'Soft', 20, 1, 1, { baseResist: 2, properties: ['Flexible', 'Strong'] }),
  stock('Canvas (Roll)', 'Tents, tarps, sails, and art.', 'Soft', 25, 1, 2, { baseResist: 3, properties: ['Flexible', 'Strong'] }),
  stock('Wool (Bolt)', 'Warm even when wet; sheep knew things.', 'Soft', 15, 1, 1, { baseResist: 1, properties: ['Absorbent', 'Cold Resistant', 'Flexible'] }),
  stock('Leather (Hides)', 'Three tanned hides of durable history.', 'Soft', 30, 2, 4, { baseResist: 17, properties: ['Absorbent', 'Flexible'] }),
  stock('Nylon Webbing (Spool)', 'Straps, slings, and load-rated trust.', 'Soft', 10, 1, 2, { primaryMaterial: 'Nylon', baseResist: 5, properties: ['Strong', 'Flexible'] }),
  stock('Rubber (Sheet)', 'Grip, seal, insulate, bounce.', 'Soft', 30, 1, 2, { primaryMaterial: 'Rubber', baseResist: 6, properties: ['Flexible', 'Electric Proof'] }),
  stock('Foam Padding (Sheets)', 'The soft difference between a bruise and a break.', 'Soft', 8, 1, 1, { baseResist: 2, properties: ['Flexible', 'Flammable'] }),
  stock('Kevlar Fabric (Panel Stock)', 'Woven no-thank-you, by the square yard.', 'Soft', 8, 5, 8, { primaryMaterial: 'Kevlar', baseResist: 25, properties: ['Heat Resistant', 'Flexible', 'Protective'] }),

  // ── Modern specialty ──
  stock('Carbon Fiber (Sheet)', 'Black-woven lightness that costs like it knows it.', 'Hard', 10, 5, 10, { primaryMaterial: 'Carbon Fiber', baseResist: 28, properties: ['Strong', 'Featherlight', 'Brittle'] }),
  stock('Fiberglass Mat & Resin Kit', 'Boat hulls, car panels, and weekend ambition.', 'Hard', 20, 2, 3, { primaryMaterial: 'Fiberglass', baseResist: 12 }),
  stock('Polycarbonate (Sheet)', 'The glass that argues back.', 'Hard', 30, 3, 4, { primaryMaterial: 'Polycarbonate', baseResist: 14, properties: ['Strong'] }),
  stock('Acrylic (Sheet)', 'Clear, light, and scratchable — glass\'s cheaper cousin.', 'Hard', 25, 2, 2, { primaryMaterial: 'Acrylic', baseResist: 8, properties: ['Fragile'] }),

  // ── Raw & fuel ──
  stock('Firewood (Half Cord)', 'A winter argument, pre-split.', 'Hard', 1500, 1, 2, { baseResist: 6, properties: ['Flammable'] }),
  stock('Charcoal (Bag)', 'Concentrated campfire.', 'Hard', 20, 1, 1, { properties: ['Combustible'] }),
  stock('Sand (Bag)', 'Traction, mortar, and sandbags-in-waiting.', 'Soft', 50, 1, 1, {}),
  stock('Gravel (Bag)', 'Drainage and driveways by the scoop.', 'Hard', 50, 1, 1, {}),
  stock('Clay (Block)', 'Pottery, sculpture, and patient hands.', 'Soft', 25, 1, 1, {}),

  // ── Electronic stock ──
  stock('Circuit Components (Kit)', 'Resistors, boards, chips: a junk drawer with a future.', 'Hard', 5, 3, 4, { primaryMaterial: 'Silicon', properties: ['Fragile', 'Electric Vulnerable'] }),
  stock('Solder & Flux Kit', 'The metal glue of the information age.', 'Hard', 2, 1, 1, { primaryMaterial: 'Solder' }),
];
