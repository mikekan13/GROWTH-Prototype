/**
 * Modern-Earth buildings — MULTI-COMPONENT POSSESSIONS (Mike ruling
 * 2026-08-04: "Vehicles and buildings are multi component. Those are
 * considered possessions not items").
 *
 * Same structure as vehicles: top-level possession w/ specs + abilities,
 * structural components via the contains chain. THE LOCATION SEAM: a
 * building instantiated into play should ALSO exist as (or link to) a
 * Location for spatial/canvas purposes — the possession is the OWNERSHIP
 * object (possessions are links, not containment), the Location is the
 * space. Instantiation-time wiring = future work; flagged in the library
 * report.
 *
 * KV graded whole-possession; components at kv 0 (no double-charge).
 * Location KRMA reserve (ambient mass) is a separate campaign-side cost —
 * these KVs price the OWNED STRUCTURE only.
 */

import type { ItemTemplate } from './types';

function part(name: string, description: string, opts: Partial<ItemTemplate> = {}): ItemTemplate {
  return {
    name, description, itemType: 'misc',
    primaryMaterial: 'Lumber', materialClass: 'Hard',
    weightLbs: 0, rarity: 1, kv: 0, tags: ['component'],
    ...opts,
  };
}

export const BUILDINGS: ItemTemplate[] = [
  {
    name: 'Suburban House', itemType: 'misc',
    description: 'Three bedrooms, a yard, a mortgage\'s worth of ordinary sanctuary. The default dream, load-bearing walls included.',
    primaryMaterial: 'Lumber', subordinateMaterials: ['Concrete', 'Asphalt Shingle'], materialClass: 'Hard',
    weightLbs: 0, rarity: 4, baseResist: 18, properties: ['Strong'],
    itemAbilities: [
      { name: 'Home', description: 'Full rests for a household; safe storage; a fixed address with everything that means.', kv: 30 },
      { name: 'Utilities', description: 'Power, water, heat, connectivity — modern life\'s substrate, on tap.', kv: 12 },
      { name: 'Lockable', description: 'Secured entry; forced entry is loud, slow, or skilled.', kv: 8 },
      { name: 'Yard', description: 'Outdoor private space: gardens, dogs, projects, barbecues.', kv: 5 },
    ],
    kv: 160,
    tags: ['possession', 'building', 'multi-component', 'modern'],
    contains: [
      part('Foundation & Frame', 'The vital bones: lose these, lose the house.', { primaryMaterial: 'Concrete', baseResist: 20 }),
      part('Roof', 'Weather\'s first and last argument.', { primaryMaterial: 'Asphalt Shingle', baseResist: 10 }),
      part('Electrical System', 'Copper veins behind the drywall.', { primaryMaterial: 'Copper', baseResist: 4, properties: ['Electric Vulnerable'] }),
      part('Plumbing', 'Water in, water out, and the valve everyone should know about.', { primaryMaterial: 'Copper', baseResist: 4 }),
      part('HVAC', 'The seasons, domesticated.', { primaryMaterial: 'Steel', baseResist: 5 }),
      part('Doors & Locks', 'The threshold and its permissions.', { baseResist: 8 }),
      part('Windows', 'Light in, eyes out, weakest points marked in glass.', { primaryMaterial: 'Glass', baseResist: 2, properties: ['Fragile'] }),
    ],
  },
  {
    name: 'City Apartment (Unit)', itemType: 'misc',
    description: 'One bedroom on the fourth floor: compact, defensible, and five minutes from everything.',
    primaryMaterial: 'Concrete', subordinateMaterials: ['Drywall'], materialClass: 'Hard',
    weightLbs: 0, rarity: 3, baseResist: 15,
    itemAbilities: [
      { name: 'Home Base', description: 'Full rests; safe storage; a door that locks in a building with neighbors close enough to hear trouble.', kv: 22 },
      { name: 'Utilities', description: 'Power, water, heat, internet — bundled into the rent\'s quiet miracle.', kv: 10 },
    ],
    kv: 80,
    tags: ['possession', 'building', 'multi-component', 'modern'],
    contains: [
      part('Unit Shell', 'The vital envelope: walls, floor, ceiling — yours to the paint line.', { primaryMaterial: 'Concrete', baseResist: 15 }),
      part('Electrical & Fixtures', 'Breaker panel and every outlet\'s secret map.', { primaryMaterial: 'Copper', baseResist: 3, properties: ['Electric Vulnerable'] }),
      part('Plumbing (Unit)', 'Shared risers, private taps.', { primaryMaterial: 'Copper', baseResist: 3 }),
      part('Entry Door & Deadbolt', 'The unit\'s one true chokepoint.', { baseResist: 8 }),
      part('Windows (4th Floor)', 'A view, a fire-escape clause, and a climb nobody casual attempts.', { primaryMaterial: 'Glass', baseResist: 2, properties: ['Fragile'] }),
    ],
  },
  {
    name: 'Detached Garage Workshop', itemType: 'misc',
    description: 'Two bays, a workbench, pegboard walls: where broken things come to be argued back to life.',
    primaryMaterial: 'Lumber', subordinateMaterials: ['Concrete'], materialClass: 'Hard',
    weightLbs: 0, rarity: 3, baseResist: 12,
    itemAbilities: [
      { name: 'Work Space', description: 'Mechanics/Carpentry/Electronics checks done here with proper tools gain +1; projects can be left mid-state safely.', kv: 12 },
      { name: 'Vehicle Bay', description: 'Sheltered, powered space to store and work on two vehicles.', kv: 8 },
    ],
    kv: 45,
    tags: ['possession', 'building', 'multi-component', 'modern'],
    contains: [
      part('Structure & Slab', 'The vital shell over a bombproof floor.', { primaryMaterial: 'Concrete', baseResist: 14 }),
      part('Garage Door & Opener', 'The rolling wall with the clicker everyone loses.', { primaryMaterial: 'Steel', baseResist: 8 }),
      part('Workbench & Storage', 'The bench, the vise, and forty years of jars.', { baseResist: 6 }),
      part('Electrical (220V)', 'Enough amps for the serious tools.', { primaryMaterial: 'Copper', baseResist: 3, properties: ['Electric Vulnerable'] }),
    ],
  },
  {
    name: 'Corner Store', itemType: 'misc',
    description: 'A stocked neighborhood storefront: register up front, stockroom in back, regulars on schedule.',
    primaryMaterial: 'Brick', subordinateMaterials: ['Glass'], materialClass: 'Hard',
    weightLbs: 0, rarity: 5, baseResist: 16,
    itemAbilities: [
      { name: 'Stocked Storefront', description: 'A working retail floor: everyday goods on hand, a public-facing reason to exist, and everyone in the neighborhood eventually walks in.', kv: 25 },
      { name: 'Stockroom', description: 'Bulk storage with a loading door; inventory is a resource and a hiding place.', kv: 8 },
      { name: 'Security Shutter', description: 'After-hours steel; smash-and-grab becomes cut-and-pry.', kv: 5 },
    ],
    kv: 120,
    tags: ['possession', 'building', 'multi-component', 'modern'],
    contains: [
      part('Structure', 'The vital brick shell, pre-war and proud of it.', { primaryMaterial: 'Brick', baseResist: 16 }),
      part('Storefront & Register', 'Glass, counter, till, and the bell above the door.', { primaryMaterial: 'Glass', baseResist: 3, properties: ['Fragile'] }),
      part('Stockroom & Loading Door', 'Where the store keeps its depth.', { baseResist: 8 }),
      part('Electrical & Refrigeration', 'The hum that keeps the coolers honest.', { primaryMaterial: 'Copper', baseResist: 4, properties: ['Electric Vulnerable'] }),
      part('Security Shutter', 'The nightly steel curtain.', { primaryMaterial: 'Steel', baseResist: 10 }),
    ],
  },
  {
    name: 'Rural Cabin', itemType: 'misc',
    description: 'One room, a wood stove, a well, and a silence you can hear your own thoughts in. Off the grid on purpose.',
    primaryMaterial: 'Log Timber', materialClass: 'Hard',
    weightLbs: 0, rarity: 4, baseResist: 14, properties: ['Strong', 'Flammable'],
    itemAbilities: [
      { name: 'Off-Grid Shelter', description: 'Full rests with zero utility dependence; wood heat, well water, oil light.', kv: 18 },
      { name: 'Remote', description: 'Hard to find, harder to surveil: checks to locate occupants take −3.', kv: 8 },
    ],
    kv: 60,
    tags: ['possession', 'building', 'multi-component', 'modern'],
    contains: [
      part('Log Structure', 'The vital shell, notched by hand, standing by stubbornness.', { primaryMaterial: 'Log Timber', baseResist: 14, properties: ['Flammable'] }),
      part('Wood Stove & Chimney', 'Iron heart; heat, cooking, and the smell of home.', { primaryMaterial: 'Cast Iron', baseResist: 10, properties: ['Heat Proof'] }),
      part('Well & Hand Pump', 'Water that owes nothing to any city.', { primaryMaterial: 'Steel', baseResist: 6 }),
      part('Woodshed (Stocked)', 'A winter\'s worth of split argument against the cold.', { primaryMaterial: 'Lumber', baseResist: 4, properties: ['Flammable'] }),
    ],
  },
];
