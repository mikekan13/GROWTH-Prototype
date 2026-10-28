import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn() }));
vi.mock('@/services/character-location', () => ({ moveCharacterToLocation: vi.fn() }));
vi.mock('@/services/door-state', () => ({ writeDoorState: vi.fn() }));
vi.mock('@/services/time', () => ({ advanceClockBySim: vi.fn() }));

import { describeMove, type MoveReport } from './being-movement';
import { polygonCentroid } from './spatial-world';

const base: MoveReport = { ok: true, label: 'Entry door', from: { x: 150, y: 950 }, to: { x: 25, y: 645 }, feet: 16.5, seconds: 5, fromRoom: 'Main Room', toRoom: 'Main Room', opened: [], path: [] };

describe('a walk in one sentence', () => {
  it('names the distance and the target; a room change is said', () => {
    expect(describeMove('Violet', base)).toBe('Violet walks 16.5 ft to Entry door.');
    expect(describeMove('Violet', { ...base, toRoom: 'Bathroom', label: 'Bathroom' })).toBe('Violet walks 16.5 ft into Bathroom to Bathroom.');
  });
  it('doors opened on the way and a locked stop are said', () => {
    expect(describeMove('Violet', { ...base, opened: ['Bathroom door'] })).toBe('Violet walks 16.5 ft to Entry door, opens the Bathroom door.');
    expect(describeMove('Kristopher', { ...base, stoppedBy: 'Entry door', label: 'Violet' })).toBe('Kristopher walks 16.5 ft to Violet, stops at the Entry door (locked).');
  });
  it('no distance = already there; a refusal says why', () => {
    expect(describeMove('Violet', { ...base, feet: 0 })).toBe('Violet is already at Entry door.');
    expect(describeMove('Kristopher', { ...base, ok: false, reason: 'the Entry door is locked' })).toBe('Kristopher does not move: the Entry door is locked.');
  });
});

describe('polygon centroid', () => {
  it('a square\'s centre; an L-shape leans into its mass', () => {
    expect(polygonCentroid([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }])).toEqual({ x: 50, y: 50 });
    const l = polygonCentroid([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 200 }, { x: 0, y: 200 }]);
    expect(l.x).toBeGreaterThan(50); expect(l.x).toBeLessThan(100); expect(l.y).toBeGreaterThan(50); expect(l.y).toBeLessThan(100);
  });
});
