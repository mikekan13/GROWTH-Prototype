/** Pathfinding on the Incubator fixture: doors, archways, locked stops, corner cutting, pace. */
import { describe, it, expect } from 'vitest';
import type { Point } from '@/lib/canvas-geometry';
import { findPath, pathSeconds } from './pathfinding';
import { distToSegment, roomAt, segmentsIntersect } from './level-map';
import { CELL_UNITS } from './types';
import type { LevelMap } from './types';
import { fixture, P } from './test-fixture';

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const allInsideRooms = (map: LevelMap, pts: Point[]) => pts.every(p => roomAt(map, p) !== null);
const noSegmentCrosses = (pts: Point[], a: Point, b: Point) => pts.every((p, i) => i === 0 || !segmentsIntersect(pts[i - 1], p, a, b));

describe('findPath', () => {
  it('stops at the locked entry door on the landing side and names it', () => {
    const map = fixture({ entry: 'locked' });
    const r = findPath(map, P(-100, 800), P(200, 800));
    expect(r).not.toBeNull();
    expect(r!.blockedBy?.id).toBe('op-1');
    expect(r!.portals).toEqual([]);
    const last = r!.points[r!.points.length - 1];
    expect(last.x).toBeLessThan(0);
    expect(distToSegment(last, P(0, 600), P(0, 700))).toBeLessThanOrEqual(1.5 * CELL_UNITS);
    expect(roomAt(map, last)?.name).toBe('Fourth-floor landing');
  });

  it('walks landing → Main Room through the closed entry door', () => {
    const map = fixture({ entry: 'closed' });
    const r = findPath(map, P(-100, 800), P(200, 800));
    expect(r).not.toBeNull();
    expect(r!.blockedBy).toBeUndefined();
    expect(r!.portals.map(p => p.id)).toEqual(['op-1']);
    expect(dist(r!.points[0], P(-100, 800))).toBeLessThanOrEqual(CELL_UNITS);
    expect(dist(r!.points[r!.points.length - 1], P(200, 800))).toBeLessThanOrEqual(CELL_UNITS);
    expect(r!.feet).toBeGreaterThanOrEqual(15);
    expect(r!.feet).toBeLessThanOrEqual(21);
    expect(allInsideRooms(map, r!.points)).toBe(true);
    expect(r!.points.length).toBeLessThanOrEqual(5);
  });

  it('walks the same route through the open entry door', () => {
    const r = findPath(fixture({ entry: 'open' }), P(-100, 800), P(200, 800));
    expect(r?.portals.map(p => p.id)).toEqual(['op-1']);
    expect(r?.blockedBy).toBeUndefined();
  });

  it('walks through a locked door when told to ignore it', () => {
    const r = findPath(fixture({ entry: 'locked' }), P(-100, 800), P(200, 800), { ignorePortalIds: ['op-1'] });
    expect(r?.blockedBy).toBeUndefined();
    expect(r?.portals.map(p => p.id)).toEqual(['op-1']);
  });

  it('reaches the Bathroom through its closed door', () => {
    const map = fixture({ bathroom: 'closed' });
    const r = findPath(map, P(200, 800), P(50, 975));
    expect(r).not.toBeNull();
    expect(r!.blockedBy).toBeUndefined();
    expect(r!.portals.map(p => p.id)).toEqual(['op-2']);
    expect(roomAt(map, r!.points[r!.points.length - 1])?.name).toBe('Bathroom');
  });

  it('reaches the Kitchenette through the archway only', () => {
    const r = findPath(fixture(), P(200, 800), P(350, 675));
    expect(r?.portals.map(p => p.id)).toEqual(['op-3']);
  });

  it('never cuts the solid wall under the Kitchenette', () => {
    const map = fixture();
    const r = findPath(map, P(350, 800), P(350, 675));
    expect(r).not.toBeNull();
    expect(noSegmentCrosses(r!.points, P(300, 750), P(400, 750))).toBe(true);
    expect(r!.portals.map(p => p.id)).toEqual(['op-3']);
    expect(allInsideRooms(map, r!.points)).toBe(true);
  });

  it('routes around furniture', () => {
    const map = fixture({ items: [{ id: 'sofa', name: 'Sofa', centre: P(200, 800), mapShapeFt: { points: [P(-3, -1), P(3, -1), P(3, 1), P(-3, 1)] } }] });
    const r = findPath(map, P(200, 700), P(200, 900));
    expect(r).not.toBeNull();
    const o = map.obstacles[0].points;
    for (let i = 0; i < 4; i++) expect(noSegmentCrosses(r!.points, o[i], o[(i + 1) % 4])).toBe(true);
    expect(r!.feet).toBeGreaterThan(10);
  });

  it('returns null when an end is off the map, and a trivial path for a point to itself', () => {
    const map = fixture();
    expect(findPath(map, P(200, 800), P(1000, 1000))).toBeNull();
    const same = findPath(map, P(200, 800), P(200, 800));
    expect(same?.points).toEqual([P(200, 800)]);
    expect(same?.feet).toBe(0);
  });

  it('finishes a whole-level search quickly', () => {
    const map = fixture({ entry: 'closed', bathroom: 'closed' });
    findPath(map, P(-150, 950), P(50, 1030)); // warm the grid
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) findPath(map, P(-150, 950), P(50, 1030));
    expect((performance.now() - t0) / 5).toBeLessThan(25);
  });
});

describe('pathSeconds', () => {
  it('rounds up per pace, 0 for no distance, at least 1 otherwise', () => {
    expect(pathSeconds(0)).toBe(0);
    expect(pathSeconds(16)).toBe(4);
    expect(pathSeconds(16, 'creep')).toBe(11);
    expect(pathSeconds(16, 'hurry')).toBe(3);
    expect(pathSeconds(16, 'run')).toBe(2);
    expect(pathSeconds(1, 'run')).toBe(1);
    expect(pathSeconds(17.5, 'walk')).toBe(5);
  });
});

describe('tokens step around each other (2026-10-28)', () => {
  it('a being standing on the straight line is skirted; without `avoid` the line is straight; a doorway with someone in it still passes', async () => {
    const { fixture, P } = await import('./test-fixture');
    const { findPath } = await import('./pathfinding');
    const map = fixture({ entry: 'open' });
    const from = P(60, 700), to = P(340, 1000);
    const straight = findPath(map, from, to)!;
    expect(straight.points.length).toBe(2);
    const blocker = P(200, 850); // on the straight line
    const around = findPath(map, from, to, { avoid: [blocker] })!;
    const minDist = Math.min(...around.points.flatMap((p, i) => (i + 1 < around.points.length ? [segDist(blocker, p, around.points[i + 1])] : [])));
    expect(minDist).toBeGreaterThanOrEqual(19); // about a foot from the person (shoulder to shoulder), never through them
    expect(around.feet).toBeLessThan(straight.feet + 4); // a small detour, not a tour
    // Someone standing in the entry doorway: the walker still gets through (soft, never a wall).
    const inDoor = findPath(map, P(-100, 650), P(150, 650), { avoid: [P(5, 650)] })!;
    expect(inDoor.blockedBy).toBeUndefined();
    expect(inDoor.points[inDoor.points.length - 1]).toEqual(P(150, 650));
  });
});

function segDist(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x, dy = b.y - a.y; const L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
