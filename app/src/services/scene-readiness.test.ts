import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/services/location', () => ({ updateLocationStatus: vi.fn() }));

import { describeReadiness, SceneNotReadyError, type SceneReadiness } from './scene-readiness';

const base: SceneReadiness = { ready: false, places: [], characters: [], itemsInScene: 0, seats: [] };

describe('play only above the line (Mike 2026-10-17)', () => {
  it('names the fluid places', () => {
    expect(describeReadiness({ ...base, places: [{ id: 'a', name: "Violet's Apartment", status: 'PLANNING' }, { id: 'b', name: 'Fourth-floor landing', status: 'PLANNING' }] }))
      .toBe("The scene is not crystallized — 2 places are still below the line: Violet's Apartment, Fourth-floor landing.");
  });
  it('names the draft characters too', () => {
    expect(describeReadiness({ ...base, places: [{ id: 'a', name: 'Landing', status: 'PLANNING' }], characters: [{ id: 'k', name: 'Kristopher', status: 'DRAFT' }] }))
      .toBe('The scene is not crystallized — a place is still below the line: Landing; a character is still a draft: Kristopher.');
  });
  it('a ready scene says so', () => {
    expect(describeReadiness({ ...base, ready: true })).toBe('The scene is crystallized.');
  });
  it('the error is a 409 carrying the list', () => {
    const r = { ...base, places: [{ id: 'a', name: 'Landing', status: 'PLANNING' }] };
    const err = new SceneNotReadyError(r);
    expect(err.status).toBe(409);
    expect(err.readiness).toBe(r);
    expect(err.message).toContain('Landing');
  });
});
