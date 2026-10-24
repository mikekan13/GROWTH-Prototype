import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/services/placement', () => ({ placeItem: vi.fn() }));
vi.mock('@/services/character-location', () => ({ moveCharacterToLocation: vi.fn() }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn() }));

import { mapFactLines, lockedDoorInTheWay, parseActEffects, type ActorMap } from './world-apply';

const apartment: ActorMap = {
  roomId: 'main', roomName: 'Main Room', home: { id: 'apt', name: "Violet's Apartment" },
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
  it('"turn the knob and push the door open" against the locked entry door is refused', () => {
    expect(lockedDoorInTheWay('Violet turns the knob and pushes the entry door open', apartment)?.id).toBe('op-1');
  });
  it('the same act with an unlocking step is let through to the adjudicator', () => {
    expect(lockedDoorInTheWay('Violet turns the deadbolt, then pulls the entry door open', apartment)).toBeNull();
  });
  it('opening the closed bathroom door is fine', () => {
    expect(lockedDoorInTheWay('she pushes the bathroom door open', apartment)).toBeNull();
  });
  it('an unnamed door: refused only when every door is locked', () => {
    expect(lockedDoorInTheWay('she opens the door', apartment)).toBeNull();
    const allLocked: ActorMap = { ...apartment, doors: apartment.doors.map((d) => ({ ...d, state: 'locked' as const })) };
    expect(lockedDoorInTheWay('she opens the door', allLocked)?.id).toBe('op-1');
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
