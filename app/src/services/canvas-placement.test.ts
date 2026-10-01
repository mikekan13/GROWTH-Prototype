import { describe, it, expect } from 'vitest';
import { placeNear, CARD } from './canvas-placement';

describe('placeNear — a free spot beside the anchor, never on top of anything', () => {
  it('takes the anchor when it is free', () => {
    expect(placeNear({ x: 100, y: 100 }, CARD.location, [])).toEqual({ x: 100, y: 100 });
  });
  it('steps right when the anchor is occupied, then keeps stepping', () => {
    const occ = [{ x: 100, y: 100, ...CARD.location }];
    const p = placeNear({ x: 100, y: 100 }, CARD.location, occ);
    expect(p.y).toBe(100);
    expect(p.x).toBeGreaterThan(100 + CARD.location.w);
    const p2 = placeNear({ x: 100, y: 100 }, CARD.location, [...occ, { ...p, ...CARD.location }]);
    expect(p2).not.toEqual(p);
    expect([p2.x, p2.y]).not.toEqual([100, 100]);
  });
  it('is deterministic', () => {
    const occ = [{ x: 0, y: 0, ...CARD.character }, { x: 600, y: 0, ...CARD.character }];
    expect(placeNear({ x: 0, y: 0 }, CARD.character, occ)).toEqual(placeNear({ x: 0, y: 0 }, CARD.character, occ));
  });
});
