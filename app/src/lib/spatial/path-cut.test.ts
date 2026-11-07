import { describe, it, expect } from 'vitest';
import { cutPolyline, alongFraction } from './pathfinding';

const L = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
describe('cutPolyline / alongFraction (the movement cap, 2026-11-07)', () => {
  it('cuts a walk at a fraction of its length', () => {
    expect(cutPolyline(L, 0.25)).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }]);
    expect(cutPolyline(L, 0.75)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }]);
    expect(cutPolyline(L, 1)).toEqual(L);
    expect(cutPolyline(L, 0)).toEqual([{ x: 0, y: 0 }]);
  });
  it('places a door along the walk', () => {
    expect(alongFraction(L, { x: 10, y: 0 })).toBeCloseTo(0.5);
    expect(alongFraction(L, { x: 11, y: 8 })).toBeCloseTo(0.9);
  });
});
