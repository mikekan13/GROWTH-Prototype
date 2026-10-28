/** Level map: rooms, cut walls, portals, passability, room lookup and step blocking on the Incubator fixture. */
import { describe, it, expect } from 'vitest';
import { crossesBlocking, portalPassability, portalsOfRoom, roomAt, roomByName, segmentsIntersect } from './level-map';
import type { Portal } from './types';
import { fixture, P } from './test-fixture';

const portal = (id: string, extra: Partial<Portal> = {}): Portal =>
  ({ id, homeId: 'home', kind: 'door', a: P(0, 0), b: P(0, 100), name: id, between: [], ...extra });

describe('buildLevelMap', () => {
  it('yields the 4 rooms (home shell excluded), smallest first, and 5 portals', () => {
    const map = fixture();
    expect(map.rooms.map(r => r.name)).toEqual(['Kitchenette', 'Bathroom', 'Fourth-floor landing', 'Main Room']);
    expect(map.rooms.map(r => r.area)).toEqual([15000, 15000, 80000, 150000]);
    expect(map.portals.map(p => p.id)).toEqual(['op-1', 'op-2', 'op-3', 'op-4', 'op-5']);
    expect(map.portals[2].name).toBe('archway between Kitchenette and Main Room');
    expect(map.bounds).toEqual({ x: -220, y: 580, width: 640, height: 490 });
  });

  it('cuts the entry door out of every x=0 wall between y 600..700 and keeps the wall below it', () => {
    const map = fixture();
    const x0 = map.walls.filter(w => w.kind === 'wall' && Math.abs(w.a.x) < 0.5 && Math.abs(w.b.x) < 0.5);
    for (const w of x0) {
      const lo = Math.min(w.a.y, w.b.y), hi = Math.max(w.a.y, w.b.y);
      expect(lo >= 699.5 || hi <= 600.5).toBe(true);
    }
    expect(x0.some(w => Math.min(w.a.y, w.b.y) <= 700.5 && Math.max(w.a.y, w.b.y) >= 899.5)).toBe(true);
    // The archway removes the whole x=300 wall between y 600..750.
    expect(map.walls.some(w => w.kind === 'wall' && Math.abs(w.a.x - 300) < 0.5 && Math.abs(w.b.x - 300) < 0.5)).toBe(false);
  });

  it('turns an item map shape into an obstacle with furniture walls', () => {
    const map = fixture({ items: [{ id: 'sofa', name: 'Sofa', centre: P(200, 800), mapShapeFt: { points: [P(-3, -1), P(3, -1), P(3, 1), P(-3, 1)] } }] });
    expect(map.obstacles).toHaveLength(1);
    expect(map.obstacles[0].points).toEqual([P(140, 780), P(260, 780), P(260, 820), P(140, 820)]);
    expect(map.walls.filter(w => w.kind === 'furniture')).toHaveLength(4);
  });
});

describe('portalPassability', () => {
  it('follows the door/window/archway table', () => {
    expect(portalPassability(portal('d', { state: 'locked' }))).toEqual({ move: false, opens: false, sight: false });
    expect(portalPassability(portal('d', { state: 'closed' }))).toEqual({ move: true, opens: true, sight: false });
    expect(portalPassability(portal('d'))).toEqual({ move: true, opens: true, sight: false });
    expect(portalPassability(portal('d', { state: 'open' }))).toEqual({ move: true, opens: false, sight: true });
    expect(portalPassability(portal('w', { kind: 'window' }))).toEqual({ move: false, opens: false, sight: true });
    expect(portalPassability(portal('a', { kind: 'archway' }))).toEqual({ move: true, opens: false, sight: true });
    expect(portalPassability(portal('o', { kind: 'opening' }))).toEqual({ move: true, opens: false, sight: true });
  });
});

describe('roomAt / roomByName / portalsOfRoom', () => {
  const map = fixture();
  it('finds the innermost room, or null outside', () => {
    expect(roomAt(map, P(50, 650))?.name).toBe('Main Room');
    expect(roomAt(map, P(-100, 800))?.name).toBe('Fourth-floor landing');
    expect(roomAt(map, P(350, 650))?.name).toBe('Kitchenette');
    expect(roomAt(map, P(50, 950))?.name).toBe('Bathroom');
    expect(roomAt(map, P(0, 650))?.name).toBe('Fourth-floor landing'); // on the shared edge: smallest room wins
    expect(roomAt(map, P(1000, 1000))).toBeNull();
  });
  it('looks rooms up by name, case-insensitive and trimmed', () => {
    expect(roomByName(map, '  main room ')?.id).toBe('main');
    expect(roomByName(map, 'KITCHENETTE')?.id).toBe('kitchen');
    expect(roomByName(map, 'Attic')).toBeNull();
  });
  it('lists the portals of a room by name or by lying on its boundary', () => {
    expect(portalsOfRoom(map, roomByName(map, 'Main Room')!).map(p => p.id)).toEqual(['op-1', 'op-2', 'op-3', 'op-4']);
    expect(portalsOfRoom(map, roomByName(map, 'Bathroom')!).map(p => p.id)).toEqual(['op-2']);
    expect(portalsOfRoom(map, roomByName(map, 'Fourth-floor landing')!).map(p => p.id)).toEqual(['op-1', 'op-5']);
  });
});

describe('segmentsIntersect', () => {
  it('detects proper crossings, touching, collinear overlap, and rejects disjoint segments', () => {
    expect(segmentsIntersect(P(0, 0), P(10, 10), P(0, 10), P(10, 0))).toBe(true);
    expect(segmentsIntersect(P(0, 0), P(10, 0), P(5, 0), P(5, 5))).toBe(true); // touching
    expect(segmentsIntersect(P(0, 0), P(10, 0), P(5, 0), P(15, 0))).toBe(true); // collinear overlap
    expect(segmentsIntersect(P(0, 0), P(10, 0), P(11, 0), P(20, 0))).toBe(false); // collinear, disjoint
    expect(segmentsIntersect(P(0, 0), P(10, 0), P(0, 5), P(10, 5))).toBe(false); // parallel
    expect(segmentsIntersect(P(0, 0), P(10, 0), P(5, 1), P(5, 5))).toBe(false); // 1 unit shy, beyond tolerance
    expect(segmentsIntersect(P(0, 0), P(10, 0), P(5, 0.3), P(5, 5))).toBe(true); // within tolerance
  });
});

describe('crossesBlocking', () => {
  it('blocks a locked entry door, opens a closed one, passes an open one', () => {
    const locked = crossesBlocking(fixture({ entry: 'locked' }), P(50, 650), P(-50, 650), 'move');
    expect(locked.blocked).toBe(true);
    expect(locked.portal?.id).toBe('op-1');
    const closed = crossesBlocking(fixture({ entry: 'closed' }), P(50, 650), P(-50, 650), 'move');
    expect(closed.blocked).toBe(false);
    expect(closed.opens?.map(p => p.id)).toEqual(['op-1']);
    const open = crossesBlocking(fixture({ entry: 'open' }), P(50, 650), P(-50, 650), 'move');
    expect(open.blocked).toBe(false);
    expect(open.opens).toEqual([]);
  });
  it('blocks a solid wall with no portal and a step running along a wall', () => {
    const map = fixture();
    expect(crossesBlocking(map, P(50, 800), P(-50, 800), 'move')).toEqual({ blocked: true });
    expect(crossesBlocking(map, P(0, 750), P(0, 850), 'move')).toEqual({ blocked: true });
  });
  it('passes sight through the archway, blocks it through a closed door, passes it through an open one', () => {
    expect(crossesBlocking(fixture(), P(200, 650), P(350, 650), 'sight').blocked).toBe(false);
    expect(crossesBlocking(fixture({ bathroom: 'closed' }), P(200, 950), P(50, 950), 'sight').blocked).toBe(true);
    expect(crossesBlocking(fixture({ bathroom: 'open' }), P(200, 950), P(50, 950), 'sight').blocked).toBe(false);
  });
  it('passes sight but blocks movement through the window', () => {
    const map = fixture();
    expect(crossesBlocking(map, P(200, 1000), P(200, 1100), 'sight').blocked).toBe(false);
    const move = crossesBlocking(map, P(200, 1000), P(200, 1100), 'move');
    expect(move.blocked).toBe(true);
    expect(move.portal?.id).toBe('op-4');
  });
  it('furniture blocks movement, not sight', () => {
    const map = fixture({ items: [{ id: 'sofa', name: 'Sofa', centre: P(200, 800), mapShapeFt: { points: [P(-3, -1), P(3, -1), P(3, 1), P(-3, 1)] } }] });
    expect(crossesBlocking(map, P(200, 700), P(200, 900), 'move').blocked).toBe(true);
    expect(crossesBlocking(map, P(200, 700), P(200, 900), 'sight').blocked).toBe(false);
  });
  it('does not block a step whose endpoint sits on a portal', () => {
    const map = fixture({ entry: 'locked' });
    expect(crossesBlocking(map, P(0, 650), P(30, 650), 'move').blocked).toBe(false);
  });
});
