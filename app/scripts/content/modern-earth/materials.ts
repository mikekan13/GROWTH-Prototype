/**
 * Modern-Earth MATERIALS — raw stock as catalog items (wave 3).
 *
 * Canon (Material_System.md #validated + Complete_Materials_Reference.md
 * #needs-review as numeric starting reference): "materials are potential,
 * items are purpose." Raw material KV < 1 PER UNIT; these entries are
 * purchasable STOCK quantities (sheet/bolt/bundle/bag). REGRADED 2026-10-16
 * (KV = price, couch anchor ~$150/KV): stock KV is the quantity's retail
 * price (a concrete bag 0.04, titanium rod 5), the pricing FLOOR for anything
 * crafted from them.
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
  stock('Lumber (2x4 Stack)', 'Twenty straight boards of potential.', 'Hard', 60, 1, 0.6, { volumeCuFt: 6, baseResist: 10, properties: ['Flammable', 'Strong'] }),
  stock('Plywood (Sheet)', 'Four by eight feet of instant wall.', 'Hard', 50, 1, 0.333, { volumeCuFt: 2, baseResist: 8, properties: ['Flammable'] }),
  // Masonry re-graded to physics 2026-08-19 (Mike): material resist = the
  // SUBSTANCE (a lone brick snaps under a hammer); the wall's toughness is
  // deployed-mass FORM FACTOR carried at ITEM level (see buildings.ts —
  // Foundation & Frame baseResist 20, Unit Shell 15). Old values 25/20
  // priced the wall into the bag/stack. Derivation: docs/material-physics.md.
  stock('Concrete Mix (80lb Bag)', 'Stone in powdered, patient form.', 'Hard', 80, 1, 0.04, { volumeCuFt: 0.6, baseResist: 6, properties: ['Strong'] }),
  stock('Bricks (Stack of 50)', 'Civilization\'s oldest pixel.', 'Hard', 250, 1, 0.233, { volumeCuFt: 1.9, baseResist: 4, properties: ['Strong', 'Heat Resistant'] }),
  stock('Rebar (Bundle)', 'Concrete\'s hidden skeleton.', 'Hard', 100, 2, 0.6, { volumeCuFt: 1.5, primaryMaterial: 'Steel', baseResist: 30, properties: ['Strong'] }),
  stock('Drywall (Sheet)', 'The wall you can punch through and usually shouldn\'t.', 'Hard', 55, 1, 0.1, { volumeCuFt: 1.33, baseResist: 3, properties: ['Fragile'] }),
  stock('Insulation (Roll)', 'Itchy pink silence and warmth.', 'Soft', 30, 1, 0.267, { volumeCuFt: 5, baseResist: 1, properties: ['Flammable'] }),
  stock('Window Glass (Sheet)', 'Transparency with a temper.', 'Hard', 40, 1, 0.667, { volumeCuFt: 0.25, primaryMaterial: 'Glass', baseResist: 2, properties: ['Fragile'] }),
  stock('Asphalt Shingles (Bundle)', 'A roof, sold by the third.', 'Hard', 70, 1, 0.267, { volumeCuFt: 1.1, baseResist: 6, properties: ['Flammable'] }),
  stock('PVC Pipe (Bundle)', 'Plumbing\'s white plastic vocabulary.', 'Hard', 25, 1, 0.533, { volumeCuFt: 1.5, primaryMaterial: 'PVC', baseResist: 5 }),
  stock('Copper Pipe (Bundle)', 'Water\'s preferred metal highway.', 'Hard', 40, 2, 3.33, { volumeCuFt: 1.5, primaryMaterial: 'Copper', baseResist: 12 }),
  stock('Copper Wire (Spool)', 'Electricity\'s roadbed, by the hundred feet.', 'Hard', 25, 2, 1, { volumeCuFt: 0.4, primaryMaterial: 'Copper', baseResist: 12, properties: ['Flexible'] }),

  // ── Metals ──
  stock('Steel Sheet (Low Carbon)', 'The modern world\'s default answer.', 'Hard', 90, 2, 1, { volumeCuFt: 0.5, primaryMaterial: 'Steel', baseResist: 35, properties: ['Strong', 'Heat Resistant', 'Electric Vulnerable'] }),
  stock('Stainless Steel (Bar Stock)', 'Steel that refuses to rust on principle.', 'Hard', 60, 3, 2, { volumeCuFt: 0.3, primaryMaterial: 'Stainless Steel', baseResist: 32, properties: ['Strong', 'Heat Resistant'] }),
  stock('High-Carbon Steel (Billet)', 'Blade-grade: hard, keen, and a little proud.', 'Hard', 50, 3, 1.67, { volumeCuFt: 0.15, primaryMaterial: 'High-Carbon Steel', baseResist: 38, properties: ['Strong', 'Sharp', 'Brittle'] }),
  stock('Aluminum Sheet', 'Strength on a diet.', 'Hard', 30, 2, 1.67, { volumeCuFt: 0.5, primaryMaterial: 'Aluminum', baseResist: 15, properties: ['Featherlight'] }),
  stock('Titanium (Rod Stock)', 'Aerospace-grade stubbornness, priced accordingly.', 'Hard', 15, 5, 5, { volumeCuFt: 0.06, primaryMaterial: 'Titanium', baseResist: 34, properties: ['Strong', 'Featherlight', 'Heat Resistant', 'Cold Resistant'] }),
  stock('Brass (Stock)', 'The friendly metal: casings, fittings, and doorknobs.', 'Hard', 40, 2, 2.67, { volumeCuFt: 0.12, primaryMaterial: 'Brass', baseResist: 18 }),
  stock('Lead (Ingots)', 'Density, sold by the regretful armload.', 'Hard', 100, 2, 2, { volumeCuFt: 0.15, primaryMaterial: 'Lead', baseResist: 10, properties: ['Blunt'] }),

  // ── Soft goods ──
  stock('Cotton (Bolt)', 'Thirty yards of everything comfortable.', 'Soft', 15, 1, 0.8, { volumeCuFt: 1, baseResist: 1, properties: ['Absorbent', 'Flammable', 'Flexible'] }),
  stock('Denim (Bolt)', 'Workwear\'s native tongue.', 'Soft', 20, 1, 1.33, { volumeCuFt: 1.2, baseResist: 2, properties: ['Flexible', 'Strong'] }),
  stock('Canvas (Roll)', 'Tents, tarps, sails, and art.', 'Soft', 25, 1, 1, { volumeCuFt: 1.2, baseResist: 3, properties: ['Flexible', 'Strong'] }),
  stock('Wool (Bolt)', 'Warm even when wet; sheep knew things.', 'Soft', 15, 1, 2.67, { volumeCuFt: 1.2, baseResist: 1, properties: ['Absorbent', 'Cold Resistant', 'Flexible'] }),
  stock('Leather (Hides)', 'Three tanned hides of durable history.', 'Soft', 30, 2, 5, { volumeCuFt: 3, baseResist: 17, properties: ['Absorbent', 'Flexible'] }),
  stock('Nylon Webbing (Spool)', 'Straps, slings, and load-rated trust.', 'Soft', 10, 1, 0.4, { volumeCuFt: 0.3, primaryMaterial: 'Nylon', baseResist: 5, properties: ['Strong', 'Flexible'] }),
  stock('Rubber (Sheet)', 'Grip, seal, insulate, bounce.', 'Soft', 30, 1, 0.8, { volumeCuFt: 0.4, primaryMaterial: 'Rubber', baseResist: 6, properties: ['Flexible', 'Electric Proof'] }),
  stock('Foam Padding (Sheets)', 'The soft difference between a bruise and a break.', 'Soft', 8, 1, 0.533, { volumeCuFt: 8, baseResist: 2, properties: ['Flexible', 'Flammable'] }),
  stock('Kevlar Fabric (Panel Stock)', 'Woven no-thank-you, by the square yard.', 'Soft', 8, 5, 5.33, { volumeCuFt: 0.5, primaryMaterial: 'Kevlar', baseResist: 25, properties: ['Heat Resistant', 'Flexible', 'Protective'] }),

  // ── Modern specialty ──
  stock('Carbon Fiber (Sheet)', 'Black-woven lightness that costs like it knows it.', 'Hard', 10, 5, 4, { volumeCuFt: 0.3, primaryMaterial: 'Carbon Fiber', baseResist: 28, properties: ['Strong', 'Featherlight', 'Brittle'] }),
  stock('Fiberglass Mat & Resin Kit', 'Boat hulls, car panels, and weekend ambition.', 'Hard', 20, 2, 0.667, { volumeCuFt: 1, primaryMaterial: 'Fiberglass', baseResist: 12 }),
  stock('Polycarbonate (Sheet)', 'The glass that argues back.', 'Hard', 30, 3, 2.33, { volumeCuFt: 0.5, primaryMaterial: 'Polycarbonate', baseResist: 14, properties: ['Strong'] }),
  stock('Acrylic (Sheet)', 'Clear, light, and scratchable — glass\'s cheaper cousin.', 'Hard', 25, 2, 1.67, { volumeCuFt: 0.4, primaryMaterial: 'Acrylic', baseResist: 8, properties: ['Fragile'] }),

  // ── Raw & fuel ──
  stock('Firewood (Half Cord)', 'A winter argument, pre-split.', 'Hard', 1500, 1, 1.33, { volumeCuFt: 64, baseResist: 6, properties: ['Flammable'] }),
  stock('Charcoal (Bag)', 'Concentrated campfire.', 'Hard', 20, 1, 0.133, { volumeCuFt: 1, properties: ['Combustible'] }),
  stock('Sand (Bag)', 'Traction, mortar, and sandbags-in-waiting.', 'Soft', 50, 1, 0.04, { volumeCuFt: 0.5 }),
  stock('Gravel (Bag)', 'Drainage and driveways by the scoop.', 'Hard', 50, 1, 0.04, { volumeCuFt: 0.5 }),
  stock('Clay (Block)', 'Pottery, sculpture, and patient hands.', 'Soft', 25, 1, 0.2, { volumeCuFt: 0.25 }),

  // ── Electronic stock ──
  stock('Circuit Components (Kit)', 'Resistors, boards, chips: a junk drawer with a future.', 'Hard', 5, 3, 0.333, { volumeCuFt: 0.1, primaryMaterial: 'Silicon', properties: ['Fragile', 'Electric Vulnerable'] }),
  stock('Solder & Flux Kit', 'The metal glue of the information age.', 'Hard', 2, 1, 0.167, { volumeCuFt: 0.02, primaryMaterial: 'Solder' }),

  // ── Coverage completions (every item material must exist as stock) ──
  stock('Polymer (Resin Stock)', 'Pellets and sheet of the plastic age; half the modern world is this.', 'Hard', 20, 1, 1, { volumeCuFt: 0.3, primaryMaterial: 'Polymer' }),
  stock('Cast Iron (Stock)', 'Heavy, brittle-hearted, heat-loving metal of skillets and stoves.', 'Hard', 60, 2, 1.6, { volumeCuFt: 0.15, primaryMaterial: 'Cast Iron', baseResist: 28, properties: ['Strong', 'Heat Proof', 'Brittle'] }),
  stock('Hardwood (Board Stock)', 'Oak, maple, walnut, hickory: the woods furniture and tool handles trust.', 'Hard', 45, 2, 1, { volumeCuFt: 1, primaryMaterial: 'Hardwood', baseResist: 12, properties: ['Strong', 'Flammable'] }),
  stock('Polyester (Bolt)', 'The tireless synthetic: athletic wear, luggage, upholstery.', 'Soft', 15, 1, 0.533, { volumeCuFt: 1, primaryMaterial: 'Polyester', baseResist: 2, properties: ['Flexible'] }),
  stock('Paper (Ream & Board)', 'Sheets and cardstock; civilization\'s cheapest memory.', 'Soft', 10, 1, 0.167, { volumeCuFt: 0.2, primaryMaterial: 'Paper', properties: ['Flammable', 'Absorbent'] }),
  stock('Down (Fill Stock)', 'Loft in a bag: the warmth-to-weight champion.', 'Soft', 3, 2, 1.2, { volumeCuFt: 2, primaryMaterial: 'Down', properties: ['Cold Resistant', 'Flammable'] }),
  stock('Foodstuffs (Pantry Staples)', 'Flour, oil, salt, beans: the raw material of every meal.', 'Soft', 30, 1, 0.4, { volumeCuFt: 1.5, primaryMaterial: 'Foodstuffs' }),
];

/**
 * Alias map: item material names → the canonical stock material that
 * covers them. Wood species collapse to Hardwood; plastic variants to
 * Polymer; composites to Carbon Fiber. The seeder validates every item's
 * materials against MATERIALS ∪ these keys — an unknown material fails
 * the seed loudly (Mike ruling 2026-08-05: every item's materials must
 * already exist as generated stock).
 */
export const MATERIAL_ALIASES: Record<string, string> = {
  'Wood': 'Hardwood',
  'Log Timber': 'Hardwood',
  'Hickory': 'Hardwood',
  'Walnut': 'Hardwood',
  'Maple': 'Hardwood',
  'Alder': 'Hardwood',
  'Spruce': 'Hardwood',
  'Oak': 'Hardwood',
  'Fabric': 'Cotton',
  'Synthetic Leather': 'Polyester',
  'Polyethylene': 'Polymer',
  'Graphite': 'Carbon Fiber',
  'Concrete': 'Concrete Mix',
  'Brick': 'Bricks',
  'Asphalt Shingle': 'Asphalt Shingles',
  'Mixed Goods': 'Foodstuffs',
  'Glass': 'Window Glass',
  'Cardboard': 'Paper',
};
