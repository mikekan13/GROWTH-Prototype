import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/daya/world-ledger', () => ({ currentFacts: vi.fn(), supersede: vi.fn(), establishFact: vi.fn() }));

import { roomFrame, placementSentence, speaksForThing, rewritePlacement, nearestSide, cornersOf } from './thing-facts';

// Violet's main room in world units (20 units = 1 ft): 20 × 22.5 ft with the kitchenette cut from the top-right
// (x 15–20, y 0–7.5) and the bathroom from the bottom-left (x 0–5, y 15–22.5). Window on the bottom wall, entry top-left.
const ft = (x: number, y: number) => ({ x: x * 20, y: y * 20 });
const MAIN = { id: 'main', name: 'Main Room', points: [ft(0, 0), ft(15, 0), ft(15, 7.5), ft(20, 7.5), ft(20, 22.5), ft(5, 22.5), ft(5, 15), ft(0, 15)] };
const BATH = { id: 'bath', name: 'Bathroom', points: [ft(0, 15), ft(5, 15), ft(5, 22.5), ft(0, 22.5)] };
const KITCH = { id: 'kitch', name: 'Kitchenette', points: [ft(15, 0), ft(20, 0), ft(20, 7.5), ft(15, 7.5)] };
const OTHERS = [BATH, KITCH];
const PORTALS = [
  { name: 'Entry door', kind: 'door', a: ft(0, 2), b: ft(0, 5), between: ['Main Room', 'Fourth-floor landing'] },
  { name: 'Bathroom door', kind: 'door', a: ft(5, 16), b: ft(5, 19), between: ['Bathroom', 'Main Room'] },
  { name: 'Kitchenette opening', kind: 'archway', a: ft(15, 3), b: ft(15, 6), between: ['Kitchenette', 'Main Room'] },
  { name: 'Street window', kind: 'window', a: ft(8, 22.5), b: ft(12, 22.5), between: ['Main Room', 'outside'] },
];

describe('the room frame is read off the map', () => {
  it('front = the window wall; left/right as seen from the rear (Violet: front S, left W)', () => {
    expect(roomFrame(MAIN, PORTALS)).toEqual({ front: 'S', rear: 'N', left: 'W', right: 'E' });
  });
  it('no window: front is opposite the door; no door: front is S', () => {
    expect(roomFrame(MAIN, [PORTALS[0]])).toEqual({ front: 'E', rear: 'W', left: 'N', right: 'S' });
    expect(roomFrame(MAIN, [])).toEqual({ front: 'S', rear: 'N', left: 'W', right: 'E' });
  });
  it('nearestSide', () => {
    expect(nearestSide(ft(10, 22), MAIN)).toBe('S');
    expect(nearestSide(ft(0.5, 10), MAIN)).toBe('W');
  });
});

describe('the placement sentence is derived from where the thing stands', () => {
  it('the desk under the window: front wall, under the window, middle third', () => {
    const corners = cornersOf(ft(10, 21.5), { points: [{ x: -2, y: -1 }, { x: 2, y: -1 }, { x: 2, y: 1 }, { x: -2, y: 1 }] });
    expect(placementSentence('The desk under the window', MAIN, PORTALS, { at: ft(10, 21.5), corners }, OTHERS))
      .toBe('The desk under the window stands in the Main Room, in the middle third, against the front wall, under the Street window.');
  });
  it('the couch in the left third: its nearest wall is the bathroom alcove, named by the room beyond it', () => {
    const corners = cornersOf(ft(4, 11), { points: [{ x: -1.5, y: -3.5 }, { x: 1.5, y: -3.5 }, { x: 1.5, y: 3.5 }, { x: -1.5, y: 3.5 }] });
    expect(placementSentence('The green couch', MAIN, PORTALS, { at: ft(4, 11), corners }, OTHERS))
      .toBe('The green couch stands in the Main Room, in the left third, against the Bathroom wall, 1.5 ft from the Bathroom door.');
    const higher = cornersOf(ft(4, 9), { points: [{ x: -1.5, y: -3.5 }, { x: 1.5, y: -3.5 }, { x: 1.5, y: 3.5 }, { x: -1.5, y: 3.5 }] });
    expect(placementSentence('The green couch', MAIN, PORTALS, { at: ft(4, 9), corners: higher }, OTHERS))
      .toBe('The green couch stands in the Main Room, in the left third, 2.5 ft from the left wall, 2.5 ft from the Entry door.');
  });
  it('a point thing by a door, next to an alcove wall', () => {
    expect(placementSentence('The laundry basket', MAIN, PORTALS, { at: ft(7, 17) }, OTHERS))
      .toBe('The laundry basket stands in the Main Room, in the middle third, 2 ft from the Bathroom wall, 2 ft from the Bathroom door.');
  });
});

describe('which facts speak for a thing, and how they are rewritten', () => {
  it('matches by subject key or by name in the text', () => {
    expect(speaksForThing('couch', 'The green couch anchors the left third of the room, facing the window.', 'The green couch')).toBe(true);
    expect(speaksForThing('desk_area', 'The desk under the window stands against the front wall. On it: her writing machine.', 'The desk under the window')).toBe(true);
    expect(speaksForThing('bathroom_shelf', 'The bathroom shelf is mounted on the wall above the sink.', 'The green couch')).toBe(false);
    expect(speaksForThing('entry_door', 'Entry door at the rear-left corner, locked.', 'The green couch')).toBe(false);
    expect(speaksForThing('main_room.green_couch.rust_blanket', 'The rust blanket is in Main Room, inside The green couch.', 'The green couch')).toBe(false);
    expect(speaksForThing('main_room.sound', 'Two-note floor creak on the path between the couch and the bathroom door.', 'The green couch')).toBe(false);
  });
  it('replaces the placement sentences and keeps what sits on the thing', () => {
    const out = rewritePlacement(
      'The desk under the window stands against the front wall. On it: the writing machine (laptop, lid open), the desk lamp (off, rear-right). The desk chair is pulled up to it.',
      'The desk under the window stands in the Main Room, in the middle third, against the front wall, under the Street window.',
    );
    expect(out).toBe('The desk under the window stands in the Main Room, in the middle third, against the front wall, under the Street window. On it: the writing machine (laptop, lid open), the desk lamp (off, rear-right).');
  });
  it('a pure placement fact becomes the derived sentence alone, and facing is dropped', () => {
    expect(rewritePlacement('The green couch anchors the left third of the room, facing the window. The rust blanket is draped over the right arm.', 'The green couch stands in the Main Room, in the left third, 2.5 ft from the left wall.'))
      .toBe('The green couch stands in the Main Room, in the left third, 2.5 ft from the left wall. The rust blanket is draped over the right arm.');
  });
});
