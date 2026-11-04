/**
 * THE COFFEE SHOP ON BROADWAY (2026-11-04): the place for the third test — Kristopher and Violet's coffee date,
 * agreed on the phone in session 6 ("Tomorrow? Meet you at the coffee shop off Broadway? When the rain starts?" /
 * "So coffee tomorrow at the store on Broadway?" / "Yes tomorrow I will have coffee with you.").
 * One room on its own level (30), drawn 28 × 44 ft; goods made of parts through the same engine JEWL uses.
 * Michael can redraw it with JEWL; this is the plain, honest version so the scene has a floor.
 *   cd app && node --env-file=.env --env-file=.env.local --import tsx ../tmp/build-coffee-shop.ts
 */
import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';
import { createLocation } from '../app/src/services/location';
import { placeGoods, type Good } from '../app/src/services/life-goods';
import { drawPlaceMap } from '../app/src/services/place-map';

const C = 'cms5z4j6z0000zg48z5vzl2jn';
const GM = 'cmrep1oh300002g48ue1bn5rg';
const NAME = 'the coffee shop on Broadway';
const LEVEL = 30;

const bound = (name: string, count = 1, primaryMaterial?: string) => ({ name, count, bound: true, ...(primaryMaterial ? { primaryMaterial } : {}) });

function goods(): Good[] {
  const g: Good[] = [
    { archetype: 'Service Counter', localName: 'the counter', into: NAME, itemType: 'misc', weightLbs: 400, value: 0.9, volumeCuFt: 60, capacityCuFt: 30, capacityLbs: 400, primaryMaterial: 'Wood', condition: 3,
      state: 'wiped down, a ring of dried milk by the register', parts: [bound('laminate counter top', 1, 'Laminate'), bound('cabinet carcass', 1, 'Plywood'), bound('shelf', 3, 'Plywood'), bound('cabinet door', 2, 'Plywood')] },
    { archetype: 'Cash Register', localName: 'the till', into: 'the counter', itemType: 'misc', weightLbs: 12, value: 0.6, volumeCuFt: 1.2, capacityCuFt: 0.3, capacityLbs: 5, primaryMaterial: 'Polymer', condition: 3,
      parts: [bound('cash drawer', 1, 'Steel'), bound('keypad', 1, 'Polymer'), bound('receipt printer', 1, 'Polymer'), { name: 'receipt roll', count: 1, primaryMaterial: 'Paper' }] },
    { archetype: 'Till Cash', localName: 'the till float', into: 'the till', itemType: 'misc', weightLbs: 0.1, value: 0.2, volumeCuFt: 0.05, primaryMaterial: 'Paper', condition: 3,
      parts: [{ name: 'twenty-dollar bill', count: 3, faceValue: 20 }, { name: 'ten-dollar bill', count: 6, faceValue: 10 }, { name: 'five-dollar bill', count: 8, faceValue: 5 }, { name: 'one-dollar bill', count: 25, faceValue: 1 }] },
    { archetype: 'Espresso Machine', localName: 'the espresso machine', into: 'the counter', itemType: 'misc', weightLbs: 70, value: 0.95, volumeCuFt: 4, primaryMaterial: 'Steel', condition: 3,
      state: 'on, warm, hissing now and then', parts: [bound('boiler', 1, 'Steel'), bound('group head', 2, 'Brass'), { name: 'portafilter', count: 2, primaryMaterial: 'Steel' }, bound('steam wand', 2, 'Steel'), bound('drip tray', 1, 'Steel')] },
    { archetype: 'Coffee Grinder', localName: 'the grinder', into: 'the counter', itemType: 'misc', weightLbs: 20, value: 0.5, volumeCuFt: 1, capacityCuFt: 0.1, capacityLbs: 3, primaryMaterial: 'Steel', condition: 3,
      parts: [bound('burr set', 1, 'Steel'), bound('bean hopper', 1, 'Polymer'), bound('motor', 1, 'Steel')] },
    { archetype: 'Coffee Beans', localName: 'beans in the hopper', into: 'the grinder', qty: 1, itemType: 'misc', weightLbs: 2, value: 0.1, volumeCuFt: 0.08, primaryMaterial: 'Foodstuffs', condition: 3, state: 'about two pounds, medium roast' },
    { archetype: 'Pastry Case', localName: 'the pastry case', into: 'the counter', itemType: 'misc', weightLbs: 120, value: 0.8, volumeCuFt: 12, capacityCuFt: 8, capacityLbs: 40, primaryMaterial: 'Glass', condition: 3,
      parts: [bound('glass pane', 4, 'Glass'), bound('steel frame', 1, 'Steel'), bound('shelf', 2, 'Glass'), bound('sliding door', 2, 'Glass')] },
    { archetype: 'Croissant', into: 'the pastry case', qty: 6, itemType: 'misc', weightLbs: 0.8, value: 0.05, volumeCuFt: 0.3, primaryMaterial: 'Foodstuffs', condition: 3, state: 'this morning\'s, going soft by evening' },
    { archetype: 'Blueberry Scone', into: 'the pastry case', qty: 8, itemType: 'misc', weightLbs: 1.5, value: 0.05, volumeCuFt: 0.3, primaryMaterial: 'Foodstuffs', condition: 3 },
    { archetype: 'Mug Shelf', localName: 'the mug shelf', into: NAME, itemType: 'misc', weightLbs: 30, value: 0.3, volumeCuFt: 6, capacityCuFt: 5, capacityLbs: 80, primaryMaterial: 'Wood', condition: 3,
      parts: [bound('plank', 3, 'Pine'), bound('bracket', 6, 'Steel')] },
    { archetype: 'Ceramic Mug', localName: 'the house mugs', into: 'the mug shelf', qty: 24, itemType: 'misc', weightLbs: 18, value: 0.3, volumeCuFt: 1.2, primaryMaterial: 'Ceramic', condition: 3, state: 'white, chipped here and there' },
    { archetype: 'Menu Board', localName: 'the menu board', into: NAME, itemType: 'misc', weightLbs: 15, value: 0.2, volumeCuFt: 1, primaryMaterial: 'Wood', condition: 3,
      state: 'chalk: drip, americano, latte, cappuccino, tea, hot chocolate; pastries', parts: [bound('chalkboard', 1, 'Slate'), bound('frame', 1, 'Pine')] },
    { archetype: 'Window Bench', localName: 'the window bench', into: NAME, itemType: 'misc', weightLbs: 60, value: 0.4, volumeCuFt: 12, capacityLbs: 600, primaryMaterial: 'Wood', condition: 2,
      state: 'cushion flattened at both ends', parts: [bound('bench seat', 1, 'Oak'), bound('leg', 4, 'Oak'), { name: 'seat cushion', count: 1, primaryMaterial: 'Cotton' }] },
  ];
  for (let i = 1; i <= 5; i++) {
    const t = ['first', 'second', 'third', 'fourth', 'fifth'][i - 1];
    g.push({ archetype: 'Cafe Table', localName: `the ${t} table`, into: NAME, itemType: 'misc', weightLbs: 35, value: 0.3, volumeCuFt: 4, capacityCuFt: 2, capacityLbs: 60, primaryMaterial: 'Wood', condition: 3,
      parts: [bound('round table top', 1, 'Oak'), bound('pedestal', 1, 'Steel'), bound('base', 1, 'Steel')] });
    g.push({ archetype: 'Sugar Caddy', localName: `sugar caddy on the ${t} table`, into: `the ${t} table`, itemType: 'misc', weightLbs: 1, value: 0.05, volumeCuFt: 0.05, primaryMaterial: 'Steel', condition: 3,
      parts: [{ name: 'sugar packet', count: 20, primaryMaterial: 'Paper' }, { name: 'napkin', count: 30, primaryMaterial: 'Paper' }] });
    for (const side of ['near', 'far']) {
      g.push({ archetype: 'Cafe Chair', localName: `${side} chair at the ${t} table`, into: NAME, itemType: 'misc', weightLbs: 12, value: 0.15, volumeCuFt: 3, capacityLbs: 300, primaryMaterial: 'Wood', condition: 3,
        parts: [bound('seat', 1, 'Oak'), bound('back', 1, 'Oak'), bound('leg', 4, 'Oak')] });
    }
  }
  return g;
}

async function main() {
  const exists = await prisma.location.findFirst({ where: { campaignId: C, name: NAME } });
  if (exists) throw new Error(`${NAME} already exists (${exists.id})`);
  const loc = await createLocation(C, GM, 'ADMIN', {
    name: NAME, type: 'point_of_interest',
    description: 'A narrow coffee shop on Broadway, a few blocks from Chess Pizza: one long room, the counter down the left side, five small round tables, a bench under the street window. Open late. The kind of place that is never full and never empty.',
    data: {
      tags: ['commercial', 'coffee-shop', 'public'],
      spec: {
        structure: 'Single long room, 28 × 44 ft, street door and two big windows on the Broadway wall; counter along the left wall with the espresso machine, grinder, till and pastry case; menu board above it; mug shelf behind; five round tables with two chairs each down the right side and the middle; a bench under the front window.',
        surfaces: 'Floor: old hex tile, cracked near the door. Walls: cream paint, framed local prints. Counter: laminate, worn to the wood at the till.',
        focalPoint: 'The espresso machine — steel, warm, hissing now and then.',
        lighting: { primary: 'Pendant bulbs over the tables, strip light over the counter', behavior: 'Warm and low in the evening; the street comes in through the windows', colorTemperature: '2700K', effect: 'Pools of light, dim between the tables' },
        zones: [
          { name: 'Counter', description: 'Till, espresso machine, grinder, pastry case. Orders are taken and made here.' },
          { name: 'Window bench', description: 'Under the front window, facing the room. The seat people take when they are waiting for someone.' },
          { name: 'Tables', description: 'Five round two-tops. The one at the back is the quiet one.' },
        ],
        sounds: 'The machine hissing, cups on saucers, the door bell when someone comes in, traffic through the glass.',
        smells: 'Coffee, warm milk, sugar.',
      },
    },
  } as any);
  console.log('location', loc.id);

  const result = await placeGoods(C, { id: GM, role: 'ADMIN' }, goods(), { ownerId: null, origin: (g) => `the coffee shop on Broadway, as it stands (prep for the coffee date, 2026-11-04): ${g.localName ?? g.archetype}` });
  console.log(`goods: created ${result.created}, archetypes ${result.archetypesCreated}, failed ${result.failed.length}`);
  for (const f of result.failed) console.log('  FAILED', f.archetype, '-', f.reason);
  if (result.warnings?.length) console.log('  warnings', result.warnings.slice(0, 5).join(' | '));

  // The map: 28 ft wide (x) × 44 ft deep (y); Broadway along the top wall (y = 0); counter down the left wall.
  const tables = [[16, 10], [23, 10], [16, 20], [23, 20], [20, 32]];
  const tokens: Array<{ thing: string; atFt: { x: number; y: number }; sizeFt?: { w: number; d: number }; rotation?: number }> = [
    { thing: 'the counter', atFt: { x: 4, y: 20 }, sizeFt: { w: 3, d: 24 } },
    { thing: 'the mug shelf', atFt: { x: 0.75, y: 14 }, sizeFt: { w: 1, d: 6 } },
    { thing: 'the menu board', atFt: { x: 0.5, y: 22 }, sizeFt: { w: 0.5, d: 6 } },
    { thing: 'the window bench', atFt: { x: 19, y: 1.5 }, sizeFt: { w: 10, d: 1.5 } },
  ];
  tables.forEach(([x, y], i) => {
    const t = ['first', 'second', 'third', 'fourth', 'fifth'][i];
    tokens.push({ thing: `the ${t} table`, atFt: { x, y }, sizeFt: { w: 2.5, d: 2.5 } });
    tokens.push({ thing: `near chair at the ${t} table`, atFt: { x, y: y - 2.5 }, sizeFt: { w: 1.6, d: 1.6 } });
    tokens.push({ thing: `far chair at the ${t} table`, atFt: { x, y: y + 2.5 }, sizeFt: { w: 1.6, d: 1.6 } });
  });
  const report = await drawPlaceMap(C, { userId: GM, role: 'ADMIN' }, {
    home: NAME, level: LEVEL, ceilingFt: 11,
    outlineFt: [{ x: 0, y: 0 }, { x: 28, y: 0 }, { x: 28, y: 44 }, { x: 0, y: 44 }],
    rooms: [],
    tokens,
    openings: [
      { kind: 'door', fromFt: { x: 9, y: 0 }, toFt: { x: 12, y: 0 }, between: [NAME, 'outside'], state: 'closed', name: 'the street door' },
      { kind: 'window', fromFt: { x: 14, y: 0 }, toFt: { x: 19, y: 0 }, between: [NAME, 'outside'], name: 'front window, left' },
      { kind: 'window', fromFt: { x: 21, y: 0 }, toFt: { x: 26, y: 0 }, between: [NAME, 'outside'], name: 'front window, right' },
      { kind: 'door', fromFt: { x: 20, y: 44 }, toFt: { x: 23, y: 44 }, between: [NAME, 'outside'], state: 'locked', name: 'the back door' },
    ],
  });
  console.log(`map: rooms ${report.rooms.length}, placed ${report.placed.length}, openings ${report.openings ?? 0}, errors ${report.errors.length}`);
  for (const e of report.errors) console.log('  MAP ERROR', e);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
