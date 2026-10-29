import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/services/placement', () => ({ placeItem: vi.fn() }));
vi.mock('@/services/character-location', () => ({ moveCharacterToLocation: vi.fn() }));
vi.mock('@/services/being-movement', () => ({ resolveMoveRef: vi.fn(async () => null), moveBeing: vi.fn(), describeMove: vi.fn() }));
vi.mock('@/services/spatial-perception', () => ({ perceiveMapChange: vi.fn(async () => undefined) }));
vi.mock('@/services/spatial-world', () => ({ loadWorldLevel: vi.fn(async () => { throw new Error('no map'); }), levelOfLocation: vi.fn(async () => null), thingStanding: vi.fn(async () => null) }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn() }));

import { mapFactLines, lockedDoorInTheWay, parseActEffects, passageGraph, routeBetween, passageInWords, whereaboutsLines, type ActorMap } from './world-apply';

const apartment: ActorMap = {
  roomId: 'main', roomName: 'Main Room', home: { id: 'apt', name: "Violet's Apartment" }, homeRooms: ['Main Room', 'Bathroom', 'Kitchenette'],
  doors: [
    { id: 'op-1', name: 'Entry door', between: ['Main Room', 'Fourth-floor landing'], state: 'locked', homeId: 'apt' },
    { id: 'op-2', name: 'Bathroom door', between: ['Bathroom', 'Main Room'], state: 'closed', homeId: 'apt' },
  ],
};

describe('the map as facts', () => {
  it('names the room, the home and every door with its state', () => {
    expect(mapFactLines(apartment)).toEqual([
      "[map] standing in: Main Room (part of Violet's Apartment)",
      '[map] door "Entry door" between Main Room and Fourth-floor landing: LOCKED',
      '[map] door "Bathroom door" between Bathroom and Main Room: CLOSED',
    ]);
  });
  it('nowhere on the map → no lines', () => {
    expect(mapFactLines(null)).toEqual([]);
  });
});

describe('a locked door stops the act before any model is asked (hello world 2026-10-17)', () => {
  // A LOCK IS WORKED FROM THE INSIDE (HW10 2026-10-29): from inside her own apartment the deadbolt is under her hand —
  // "pushes the entry door open" unlocks it on the way. From the landing (another home, or none) it is locked.
  const landing: ActorMap = { roomId: 'landing', roomName: 'Fourth-floor landing', home: { id: 'bldg', name: 'The building' }, homeRooms: ['Fourth-floor landing'], doors: apartment.doors };
  it('"turn the knob and push the door open" from INSIDE is hers: not blocked', () => {
    expect(lockedDoorInTheWay('Violet turns the knob and pushes the entry door open', apartment)).toBeNull();
  });
  it('the same act from the landing is refused — the lock is on her side, not his', () => {
    expect(lockedDoorInTheWay('Kristopher turns the knob and pushes the entry door open', landing)?.id).toBe('op-1');
  });
  it('the home\'s rooms unknown (a hand-built map): the old law, locked is locked', () => {
    expect(lockedDoorInTheWay('Violet turns the knob and pushes the entry door open', { ...apartment, homeRooms: undefined })?.id).toBe('op-1');
  });
  it('the same act with an unlocking step is let through to the adjudicator', () => {
    expect(lockedDoorInTheWay('Violet turns the deadbolt, then pulls the entry door open', apartment)).toBeNull();
  });
  it('opening the closed bathroom door is fine', () => {
    expect(lockedDoorInTheWay('she pushes the bathroom door open', apartment)).toBeNull();
  });
  it('an unnamed door: refused only when every door is locked against her', () => {
    expect(lockedDoorInTheWay('she opens the door', apartment)).toBeNull();
    const allLocked: ActorMap = { ...apartment, doors: apartment.doors.map((d) => ({ ...d, state: 'locked' as const })) };
    // The entry is hers from inside; the bathroom's lock is not — one door is still open to her, so nothing blocks.
    expect(lockedDoorInTheWay('she opens the door', allLocked)).toBeNull();
    // From the landing with only the locked entry: blocked.
    expect(lockedDoorInTheWay('he opens the door', { ...landing, doors: [apartment.doors[0]] })?.id).toBe('op-1');
  });
  it('an act that is not about a door is never blocked', () => {
    expect(lockedDoorInTheWay('she presses her forehead to the fridge', { ...apartment, doors: apartment.doors.map((d) => ({ ...d, state: 'locked' as const })) })).toBeNull();
  });
  it('a landing with no doors blocks nothing', () => {
    expect(lockedDoorInTheWay('he knocks on the door', { ...apartment, doors: [] })).toBeNull();
  });
});

describe('reading the adjudicator\'s effects', () => {
  it('keeps the well-formed ones and drops the rest', () => {
    expect(parseActEffects([
      { op: 'door', door: 'Entry door', state: 'OPEN' },
      { op: 'give', item: 'pizza box', to: 'Violet' },
      { op: 'take', item: '' },
      { op: 'put', item: 'receipt', into: 'counter' },
      { op: 'move', to: 'Kitchenette' },
      { op: 'teleport', to: 'Mars' },
      'nonsense',
    ])).toEqual([
      { op: 'door', door: 'Entry door', state: 'open' },
      { op: 'give', item: 'pizza box', to: 'Violet' },
      { op: 'put', item: 'receipt', into: 'counter' },
      { op: 'move', to: 'Kitchenette' },
    ]);
    expect(parseActEffects(undefined)).toEqual([]);
  });
});

describe('who is where (HW4 2026-10-24: a five held out through a locked door)', () => {
  const openings = [
    { id: 'op-1', kind: 'door', between: ['Main Room', 'Fourth-floor landing'], state: 'locked' as const, name: 'Entry door' },
    { id: 'op-2', kind: 'door', between: ['Bathroom', 'Main Room'], state: 'closed' as const, name: 'Bathroom door' },
    { id: 'op-3', kind: 'archway', between: ['Kitchenette', 'Main Room'], name: 'Kitchenette opening' },
    { id: 'op-4', kind: 'window', between: ['Main Room', 'outside'], name: 'Street window' },
    { id: 'op-5', kind: 'opening', between: ['Fourth-floor landing', 'stairs down'], name: 'Stair down' },
  ];
  const graph = passageGraph(openings);
  it('windows are not passages', () => {
    expect(graph.map((e) => e.name)).toEqual(['Entry door', 'Bathroom door', 'Kitchenette opening', 'Stair down']);
  });
  it('from the kitchenette to the landing: the archway, then the locked entry door', () => {
    const route = routeBetween(graph, 'Kitchenette', 'Fourth-floor landing');
    expect(route?.map(passageInWords)).toEqual(['Kitchenette opening (open archway)', 'Entry door (locked)']);
  });
  it('same room → empty route; unreachable → null', () => {
    expect(routeBetween(graph, 'Main Room', 'main room')).toEqual([]);
    expect(routeBetween(graph, 'Kitchenette', 'Roof')).toBeNull();
  });
  it('the lines say who is here and who is out of reach', () => {
    const lines = whereaboutsLines('Kitchenette', [
      { id: 'k', name: 'Kristopher', roomName: 'Fourth-floor landing', route: routeBetween(graph, 'Kitchenette', 'Fourth-floor landing') },
      { id: 'r', name: 'Rosemary', roomName: 'Kitchenette', route: [] },
      { id: 'x', name: 'Nobody', roomName: null, route: null },
    ]);
    expect(lines[0]).toBe('Kristopher: in Fourth-floor landing, beyond Kitchenette opening (open archway) then Entry door (locked) — out of sight and out of reach from here.');
    expect(lines[1]).toBe('Rosemary: HERE, in Kitchenette with the actor.');
    expect(lines[2]).toBe('Nobody: nowhere on the map — not here.');
  });
});

describe('a sound effect (HW9, 2026-10-29)', () => {
  it('parses {op:"sound", at, text} and caps the text', async () => {
    const { parseActEffects } = await import('./world-apply');
    expect(parseActEffects([{ op: 'sound', at: "Violet's phone", text: "Violet's phone rings in her pocket." }])).toEqual([{ op: 'sound', at: "Violet's phone", text: "Violet's phone rings in her pocket." }]);
    expect(parseActEffects([{ op: 'sound', at: 'x' }])).toEqual([]);
  });
});
