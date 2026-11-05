import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn() }));
vi.mock('@/services/character-location', () => ({ moveCharacterToLocation: vi.fn() }));
vi.mock('@/services/door-state', () => ({ writeDoorState: vi.fn() }));
vi.mock('@/services/spatial-perception', () => ({ perceiveMapChange: vi.fn(async () => undefined) }));

import { describeMove, parkSpotOutside, type MoveReport } from './being-movement';
import type { LevelMap, Portal } from '@/lib/spatial';
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

describe('walking up to a thing drawn as an obstacle (finding 73, 2026-11-05)', () => {
  it('finds a reachable square beside the counter, not inside it', async () => {
    const { reachableSpotNear } = await import('./being-movement');
    const { fixture, P } = await import('@/lib/spatial/test-fixture');
    const { insideOrOn } = await import('@/lib/spatial');
    const map = fixture({ items: [{ id: 'counter', name: 'the counter', centre: P(200, 900), mapShapeFt: { points: [P(-5, -2), P(5, -2), P(5, 2), P(-5, 2)] } }] });
    const spot = reachableSpotNear(map, map, P(200, 900), P(50, 700));
    expect(spot).not.toBeNull();
    expect(map.obstacles.some((o) => insideOrOn(spot!.point, o.points))).toBe(false);
    expect(spot!.path.points.length).toBeGreaterThan(1);
  });
  it('null when nothing around is reachable (anchor far off the map)', async () => {
    const { reachableSpotNear } = await import('./being-movement');
    const { fixture, P } = await import('@/lib/spatial/test-fixture');
    expect(reachableSpotNear(fixture(), fixture(), P(5000, 5000), P(50, 700))).toBeNull();
  });
});

// finding 68 / #41 vehicle travel, 2026-11-05
describe('where a vehicle parks at a way in', () => {
  const sq = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 400 }, { x: 0, y: 400 }];
  const map = { level: 30, rooms: [{ id: 'r', name: 'shop', points: sq, area: 160000 }], walls: [], portals: [], obstacles: [], bounds: { x: 0, y: 0, width: 400, height: 400 } } as unknown as LevelMap;
  const door = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ id: 'd', homeId: 'h', kind: 'door', a, b, name: 'the street door', between: ['shop', 'outside'] }) as Portal;
  it('lands 6 ft (120 units) outside the door, whichever way the door was drawn', () => {
    expect(parkSpotOutside(map, door({ x: 400, y: 100 }, { x: 400, y: 200 }))).toEqual({ x: 520, y: 150 });
    expect(parkSpotOutside(map, door({ x: 400, y: 200 }, { x: 400, y: 100 }))).toEqual({ x: 520, y: 150 });
    expect(parkSpotOutside(map, door({ x: 100, y: 0 }, { x: 200, y: 0 }))).toEqual({ x: 150, y: -120 });
  });
  it('the distance is a parameter', () => {
    expect(parkSpotOutside(map, door({ x: 400, y: 100 }, { x: 400, y: 200 }), null, 10)).toEqual({ x: 600, y: 150 });
  });
});
