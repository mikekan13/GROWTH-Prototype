/** Sight on the Incubator fixture: line of sight, the visibility polygon, rooms in view. */
import { describe, it, expect } from 'vitest';
import { lineOfSight, visibilityPolygon, visibleRooms } from './sight';
import { fixture, P } from './test-fixture';

describe('lineOfSight', () => {
  it('sees through the archway and an open door, not a closed one or a wall', () => {
    expect(lineOfSight(fixture(), P(50, 650), P(350, 650))).toBe(true);
    expect(lineOfSight(fixture({ entry: 'closed' }), P(50, 650), P(-100, 650))).toBe(false);
    expect(lineOfSight(fixture({ entry: 'open' }), P(50, 650), P(-100, 650))).toBe(true);
    expect(lineOfSight(fixture({ entry: 'open' }), P(50, 850), P(-100, 850))).toBe(false);
  });
});

describe('visibilityPolygon', () => {
  it('reaches onto the landing through the open entry door, not through the closed one', () => {
    const open = visibilityPolygon(fixture({ entry: 'open' }), P(50, 650));
    expect(open.some(p => p.x < -1)).toBe(true);
    const closed = visibilityPolygon(fixture({ entry: 'closed' }), P(50, 650));
    expect(closed.some(p => p.x < -1)).toBe(false);
    expect(closed.length).toBeGreaterThan(32);
  });
  it('reaches from the Kitchenette into the Main Room through the archway and is sorted by angle', () => {
    const from = P(350, 675);
    const poly = visibilityPolygon(fixture(), from);
    expect(poly.some(p => p.x < 299)).toBe(true);
    expect(poly.every(p => p.x >= -1 && p.x <= 401 && p.y >= 599 && p.y <= 1051)).toBe(true);
    // Non-decreasing by angle; atan2's +π seam is folded onto -π (a point straight left recomputes as +π).
    const angles = poly.map(p => Math.atan2(p.y - from.y, p.x - from.x)).map(a => (a >= Math.PI - 1e-9 ? -Math.PI : a));
    for (let i = 1; i < angles.length; i++) expect(angles[i]).toBeGreaterThanOrEqual(angles[i - 1] - 1e-9);
  });
  it('is capped by maxRange', () => {
    const from = P(200, 800);
    const poly = visibilityPolygon(fixture(), from, { maxRange: 40 });
    expect(poly.every(p => Math.hypot(p.x - from.x, p.y - from.y) <= 40 + 1e-6)).toBe(true);
  });
});

describe('visibleRooms', () => {
  it('sees the Main Room and the Kitchenette from the Main Room with the doors closed', () => {
    const rooms = visibleRooms(fixture({ entry: 'closed', bathroom: 'closed' }), P(200, 800));
    expect(rooms.map(r => r.name).sort()).toEqual(['Kitchenette', 'Main Room']);
  });
  it('adds the Bathroom and the landing when their doors open', () => {
    const rooms = visibleRooms(fixture({ entry: 'open', bathroom: 'open' }), P(200, 800));
    expect(rooms.map(r => r.name).sort()).toEqual(['Bathroom', 'Fourth-floor landing', 'Kitchenette', 'Main Room']);
  });
});
