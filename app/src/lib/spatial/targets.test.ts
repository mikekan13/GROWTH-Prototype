/** Stand spots on the Incubator fixture: at a door, inside a room, beside a thing, nearest walkable. */
import { describe, it, expect } from 'vitest';
import type { Point } from '@/lib/canvas-geometry';
import { pointInPolygon } from '@/lib/canvas-geometry';
import { nearestWalkable, spotAtPortal, spotBeside, spotInRoom } from './targets';
import { roomAt, roomByName } from './level-map';
import { CELL_UNITS } from './types';
import { fixture, P } from './test-fixture';

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

describe('spotAtPortal', () => {
  it('presses against the entry door on the mover\'s own side', () => {
    const map = fixture();
    const door = map.portals.find(p => p.id === 'op-1')!;
    const inside = spotAtPortal(map, door, P(200, 800));
    expect(roomAt(map, inside)?.name).toBe('Main Room');
    expect(dist(inside, P(0, 650))).toBeLessThanOrEqual(1.5 * CELL_UNITS);
    const outside = spotAtPortal(map, door, P(-100, 800));
    expect(roomAt(map, outside)?.name).toBe('Fourth-floor landing');
    expect(dist(outside, P(0, 650))).toBeLessThanOrEqual(1.5 * CELL_UNITS);
  });
});

describe('spotInRoom', () => {
  it('keeps a mover already in the room where it stands', () => {
    const map = fixture();
    expect(spotInRoom(map, roomByName(map, 'Main Room')!, P(200, 800))).toEqual(P(200, 800));
  });
  it('lands just inside the Bathroom by its door', () => {
    const map = fixture();
    const spot = spotInRoom(map, roomByName(map, 'Bathroom')!, P(200, 800));
    expect(roomAt(map, spot)?.name).toBe('Bathroom');
    expect(dist(spot, P(100, 950))).toBeLessThanOrEqual(3 * CELL_UNITS);
  });
  it('lands just inside the Kitchenette through the archway', () => {
    const map = fixture();
    const spot = spotInRoom(map, roomByName(map, 'Kitchenette')!, P(100, 650));
    expect(roomAt(map, spot)?.name).toBe('Kitchenette');
    expect(spot.x).toBeLessThan(350);
  });
});

describe('spotBeside', () => {
  it('stands about 2.5 ft from the target on the mover\'s side', () => {
    const map = fixture();
    const spot = spotBeside(map, P(200, 800), P(50, 650));
    const d = dist(spot, P(200, 800));
    expect(d).toBeGreaterThanOrEqual(1.5 * CELL_UNITS);
    expect(d).toBeLessThanOrEqual(3.5 * CELL_UNITS);
    expect(spot.x).toBeLessThan(200);
    expect(spot.y).toBeLessThan(800);
  });
  it('steps outward until clear of a thing\'s footprint', () => {
    const map = fixture({ items: [{ id: 'table', name: 'Table', centre: P(200, 800), mapShapeFt: { points: [P(-3, -3), P(3, -3), P(3, 3), P(-3, 3)] } }] });
    const spot = spotBeside(map, P(200, 800), P(200, 700));
    expect(pointInPolygon(spot, map.obstacles[0].points)).toBe(false);
    expect(spot.y).toBeLessThan(740);
    expect(roomAt(map, spot)?.name).toBe('Main Room');
  });
});

describe('nearestWalkable', () => {
  it('snaps onto the grid inside a room and gives null far outside', () => {
    const map = fixture();
    const p = nearestWalkable(map, P(50, 650));
    expect(p).not.toBeNull();
    expect(dist(p!, P(50, 650))).toBeLessThanOrEqual(CELL_UNITS);
    expect(nearestWalkable(map, P(1000, 1000))).toBeNull();
  });
});
