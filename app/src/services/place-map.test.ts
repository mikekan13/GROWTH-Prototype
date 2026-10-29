/** Place map: feet in the home frame → world units; where the home lands (Mike 2026-10-17). */
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('./placement-geometry', () => ({ setLocationGeometry: vi.fn(), setTokenPosition: vi.fn() }));
vi.mock('./character-location', () => ({ moveCharacterToLocation: vi.fn() }));
const { ftToWorld, homeAnchor } = await import('./place-map');

describe('place map', () => {
  it('a 5-ft square is 100 world units (one person token); points are anchored at the home corner', () => {
    expect(ftToWorld({ x: 5, y: 0 }, { x: 0, y: 0 })).toEqual({ x: 100, y: 0 });
    expect(ftToWorld({ x: 20, y: 12.5 }, { x: 1000, y: 600 })).toEqual({ x: 1400, y: 850 });
  });
  it('the home keeps its spot: its footprint corner, else its canvas anchor, else below the line while drafting', () => {
    expect(homeAnchor({ footprint: { points: [{ x: 300, y: 700 }, { x: 900, y: 700 }, { x: 900, y: 1200 }], scale: 0.05, level: 0 } }, 'PLANNING')).toEqual({ x: 300, y: 700 });
    expect(homeAnchor({ canvasX: -50, canvasY: -400 }, 'PLANNING')).toEqual({ x: -50, y: 200 });
    expect(homeAnchor({ canvasX: -50, canvasY: -400 }, 'ACTIVE')).toEqual({ x: -50, y: -400 });
  });
});

describe('openings are kept unless the whole list lands (2026-10-29)', () => {
  it('a redrawn door with no state keeps the drawn door\'s state by name; a new door is closed', async () => {
    const { carriedDoorState } = await import('./place-map');
    const existing = [{ id: 'op-1', kind: 'door' as const, a: { x: 0, y: 0 }, b: { x: 60, y: 0 }, between: ['Main Room', 'outside'], state: 'locked' as const, name: 'Entry door' }];
    expect(carriedDoorState('entry door', existing)).toBe('locked');
    expect(carriedDoorState('Front door', existing)).toBe('closed');
    expect(carriedDoorState(undefined, existing)).toBe('closed');
  });
});
