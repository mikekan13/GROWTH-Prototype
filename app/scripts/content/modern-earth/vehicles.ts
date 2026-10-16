/**
 * Modern-Earth vehicles — MULTI-COMPONENT POSSESSIONS (Mike ruling
 * 2026-08-04): "Vehicles and buildings are multi component. Those are
 * considered possessions not items... sort of like a folder with specs and
 * then components inside the folder with inner pieces."
 *
 * Structure: top-level item = the possession (specs + abilities), with
 * components nested via the body-composition `contains` chain (the existing
 * substrate for container hierarchies). Damage cascades outer→inner per the
 * body-comp rules; disabling a vital component (engine) stops the vehicle.
 * The dedicated possession-folder UI treatment is future work — this data
 * shape is ready for it.
 *
 * KV: graded whole-possession (components contribute, listed at kv 0 —
 * the possession's total carries the price; pricing components separately
 * would double-charge).
 */

import type { ItemTemplate } from './types';

function component(name: string, description: string, opts: Partial<ItemTemplate> = {}): ItemTemplate {
  return {
    name, description,
    itemType: 'misc',
    primaryMaterial: 'Steel', materialClass: 'Hard',
    weightLbs: 0, rarity: 1, kv: 0,
    tags: ['component'],
    ...opts,
  };
}

const wheels = (n: number, lbs: number, extra: Partial<ItemTemplate> = {}) => component(`Wheels & Tires (${n})`, 'Where the machine meets the road.', { primaryMaterial: 'Rubber', subordinateMaterials: ['Steel'], materialClass: 'Soft', weightLbs: lbs, baseResist: 4, ...extra });
const battery = (extra: Partial<ItemTemplate> = {}) => component('Battery', 'Stored ignition; famously mortal in winter.', { weightLbs: 40, baseResist: 3, properties: ['Electric Vulnerable'], ...extra });

export const VEHICLES: ItemTemplate[] = [
  {
    name: 'Compact Sedan', itemType: 'misc',
    description: 'Four doors, forty miles per gallon, and a cabin that has hosted a thousand conversations. The world\'s default car.',
    primaryMaterial: 'Steel', subordinateMaterials: ['Glass', 'Rubber'], materialClass: 'Hard',
    weightLbs: 3000, rarity: 2, baseResist: 12, properties: ['Strong'],
    itemAbilities: [
      { name: 'Road Travel', description: 'Carries 5 people and cargo at highway speed (Driving to operate).', kv: 25 },
      { name: 'Shelter', description: 'Lockable cover from weather; uncomfortable but real sleep for two.', kv: 5 },
    ],
    kv: 167, volumeCuFt: 410, capacityCuFt: 111, capacityLbs: 900,
    tags: ['possession', 'vehicle', 'multi-component', 'modern'],
    contains: [
      component('Engine (I4)', 'The vital heart: no engine, no vehicle.', { volumeCuFt: 12, weightLbs: 350, baseResist: 8 }),
      battery({ volumeCuFt: 0.4 }),
      component('Fuel Tank', 'Twelve gallons of range.', { volumeCuFt: 3, weightLbs: 90, baseResist: 4, properties: ['Combustible'] }),
      wheels(4, 190, { volumeCuFt: 14 }),
      component('Cabin & Controls', 'Seats, wheel, pedals, dash — the interface.', { volumeCuFt: 100, capacityCuFt: 95, capacityLbs: 600, subordinateMaterials: ['Fabric'], weightLbs: 400, baseResist: 5 }),
      component('Trunk', 'Sixteen cubic feet of plausible deniability.', { volumeCuFt: 17, capacityCuFt: 16, capacityLbs: 300, weightLbs: 60, baseResist: 5 }),
    ],
  },
  {
    name: 'Full-Size Pickup', itemType: 'misc',
    description: 'A tool that happens to be a vehicle. Hauls, tows, and shrugs off roads that end.',
    primaryMaterial: 'Steel', subordinateMaterials: ['Glass', 'Rubber'], materialClass: 'Hard',
    weightLbs: 5000, rarity: 3, baseResist: 15, properties: ['Strong'],
    itemAbilities: [
      { name: 'Haul & Tow', description: 'Carries 3 (6 crew cab), beds 1,500 lbs, tows 8,000. Off-road capable (Driving).', kv: 32 },
      { name: 'Work Rig', description: 'Powers tools from the bed; counts as an anchor point for winching.', kv: 6 },
    ],
    kv: 333, volumeCuFt: 840, capacityCuFt: 208, capacityLbs: 2100,
    tags: ['possession', 'vehicle', 'multi-component', 'modern'],
    contains: [
      component('Engine (V8)', 'The vital heart, sized for stubborn loads.', { volumeCuFt: 22, weightLbs: 550, baseResist: 10 }),
      battery({ volumeCuFt: 0.4 }),
      component('Fuel Tank', 'Twenty-six gallons of keep-going.', { volumeCuFt: 5, weightLbs: 170, baseResist: 5, properties: ['Combustible'] }),
      wheels(4, 280, { volumeCuFt: 24 }),
      component('Cabin & Controls', 'Bench seats and a dashboard dusted in job site.', { volumeCuFt: 140, capacityCuFt: 130, capacityLbs: 600, subordinateMaterials: ['Fabric'], weightLbs: 450, baseResist: 6 }),
      component('Truck Bed', 'Eight feet of open cargo argument-settler.', { volumeCuFt: 82, capacityCuFt: 78, capacityLbs: 1500, weightLbs: 350, baseResist: 8 }),
    ],
  },
  {
    name: 'Minivan', itemType: 'misc',
    description: 'Sliding doors, seven seats, infinite cargo permutations, zero pretension. The unsung hero of logistics.',
    primaryMaterial: 'Steel', subordinateMaterials: ['Glass', 'Rubber'], materialClass: 'Hard',
    weightLbs: 4400, rarity: 2, baseResist: 12, properties: ['Strong'],
    itemAbilities: [
      { name: 'People Mover', description: 'Carries 7 with gear, or 2 with a small apartment\'s worth of cargo (seats fold flat).', kv: 28 },
      { name: 'Camp Ready', description: 'Flat-folded interior sleeps two adults in genuine comfort.', kv: 5 },
    ],
    kv: 267, volumeCuFt: 650, capacityCuFt: 173, capacityLbs: 1300,
    tags: ['possession', 'vehicle', 'multi-component', 'modern'],
    contains: [
      component('Engine (V6)', 'The vital heart, tuned for patience.', { volumeCuFt: 16, weightLbs: 450, baseResist: 8 }),
      battery({ volumeCuFt: 0.4 }),
      component('Fuel Tank', 'Twenty gallons.', { volumeCuFt: 4, weightLbs: 130, baseResist: 4, properties: ['Combustible'] }),
      wheels(4, 210, { volumeCuFt: 16 }),
      component('Cabin & Controls', 'Cupholders beyond counting.', { volumeCuFt: 150, capacityCuFt: 140, capacityLbs: 900, subordinateMaterials: ['Fabric'], weightLbs: 500, baseResist: 5 }),
      component('Cargo Bay', 'The seats vanish; the volume remains.', { volumeCuFt: 35, capacityCuFt: 33, capacityLbs: 400, weightLbs: 100, baseResist: 5 }),
    ],
  },
  {
    name: 'Motorcycle (Standard)', itemType: 'misc',
    description: 'Two wheels, one engine, no apologies. Traffic is a suggestion; weather is a relationship.',
    primaryMaterial: 'Steel', subordinateMaterials: ['Aluminum', 'Rubber'], materialClass: 'Hard',
    weightLbs: 450, rarity: 3, baseResist: 8, properties: ['Strong'],
    itemAbilities: [
      { name: 'Split & Sprint', description: 'Carries 2 at highway speed; ignores car-scale congestion; +2 on urban chase checks (Driving).', kv: 22 },
      { name: 'Exposed', description: 'The rider IS the crumple zone: crashes deal full damage to the rider (gear mitigates).', kv: -6 },
    ],
    kv: 53.3, volumeCuFt: 60, capacityCuFt: 1, capacityLbs: 400,
    tags: ['possession', 'vehicle', 'multi-component', 'modern'],
    contains: [
      component('Engine (Twin)', 'The vital heart between the rider\'s knees.', { volumeCuFt: 4, weightLbs: 160, baseResist: 6 }),
      battery({ volumeCuFt: 0.4 }),
      component('Fuel Tank', 'Four gallons, worn like a belt buckle.', { volumeCuFt: 1, weightLbs: 30, baseResist: 3, properties: ['Combustible'] }),
      wheels(2, 60, { volumeCuFt: 6 }),
      component('Controls & Saddle', 'Bars, levers, seat: the whole interface, weather included.', { volumeCuFt: 4, capacityCuFt: 1, capacityLbs: 400, subordinateMaterials: ['Leather'], weightLbs: 40, baseResist: 3 }),
    ],
  },
  {
    name: 'Mountain Bike', itemType: 'misc',
    description: 'Twenty-one gears of self-propelled freedom. Runs on breakfast.',
    primaryMaterial: 'Aluminum', subordinateMaterials: ['Rubber'], materialClass: 'Hard',
    weightLbs: 30, rarity: 1, baseResist: 4, properties: ['Strong'],
    itemAbilities: [
      { name: 'Pedal Power', description: 'Triple walking pace on roads and trails; silent; never needs fuel (Athletics for hard riding).', kv: 8 },
    ],
    kv: 5.33, volumeCuFt: 15,
    tags: ['possession', 'vehicle', 'multi-component', 'modern'],
    contains: [
      component('Frame & Drivetrain', 'The vital heart is the rider; this is everything else.', { volumeCuFt: 10, primaryMaterial: 'Aluminum', weightLbs: 22, baseResist: 4 }),
      wheels(2, 8, { volumeCuFt: 5 }),
    ],
  },
  {
    name: 'Box Truck (16ft)', itemType: 'misc',
    description: 'A room with an engine. Moves households, bands, and occasionally alibis.',
    primaryMaterial: 'Steel', subordinateMaterials: ['Aluminum', 'Rubber'], materialClass: 'Hard',
    weightLbs: 12500, rarity: 4, baseResist: 16, properties: ['Strong'],
    itemAbilities: [
      { name: 'Bulk Haul', description: 'Carries 3 up front and ~5,000 lbs / 800 cubic feet in the box (Driving; wide turns are canon).', kv: 35 },
      { name: 'Rolling Room', description: 'The box is standing-height shelter, lockable, power-connectable.', kv: 8 },
    ],
    kv: 467, volumeCuFt: 2100, capacityCuFt: 880, capacityLbs: 5600,
    tags: ['possession', 'vehicle', 'multi-component', 'modern'],
    contains: [
      component('Engine (Diesel)', 'The vital heart, rated in decades.', { volumeCuFt: 35, weightLbs: 700, baseResist: 10 }),
      battery({ volumeCuFt: 0.4 }),
      component('Fuel Tank', 'Thirty-three gallons of diesel patience.', { volumeCuFt: 7, weightLbs: 230, baseResist: 5, properties: ['Combustible'] }),
      wheels(6, 420, { volumeCuFt: 42 }),
      component('Cab & Controls', 'Two seats, one radio, a million miles of stories.', { volumeCuFt: 120, capacityCuFt: 80, capacityLbs: 600, subordinateMaterials: ['Fabric'], weightLbs: 500, baseResist: 6 }),
      component('Cargo Box', 'Sixteen feet of empty, waiting to matter.', { volumeCuFt: 960, capacityCuFt: 800, capacityLbs: 5000, primaryMaterial: 'Aluminum', weightLbs: 1500, baseResist: 8 }),
    ],
  },
];
