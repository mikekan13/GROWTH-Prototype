import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn() }));
vi.mock('@/services/spatial-world', () => ({ stampBeingPoint: vi.fn() }));

import { isVehicle, decideRide } from './being-inside';

// finding 68 / #41 vehicle travel, 2026-11-05
describe('what a vehicle is (data, not words)', () => {
  it('the tag wins, any case', () => {
    expect(isVehicle({ tags: ['Vehicle', 'car'] })).toBe(true);
    expect(isVehicle({ tags: ['bed'] })).toBe(false);
  });
  it('an ability that carries people or cargo makes one', () => {
    expect(isVehicle({ itemAbilities: [{ name: 'Road Travel', description: 'Carries 5 people and cargo at highway speed (Driving to operate)' }] })).toBe(true);
    expect(isVehicle({ itemAbilities: [{ name: 'Flame Tongue', description: 'burns' }] })).toBe(false);
  });
  it('junk is no vehicle', () => {
    expect(isVehicle(null)).toBe(false);
    expect(isVehicle('x')).toBe(false);
    expect(isVehicle({})).toBe(false);
  });
});

describe('drive, get out, or walk', () => {
  const car = { isVehicle: true }, bed = { isVehicle: false };
  it('inside a vehicle and the target is another place: the car drives', () => {
    expect(decideRide({ inside: car, targetKind: 'location' })).toBe('drive');
  });
  it('inside a vehicle and a walk within the level: get out first', () => {
    for (const k of ['room', 'thing', 'portal', 'being', 'point'] as const) expect(decideRide({ inside: car, targetKind: k })).toBe('get-out');
  });
  it('inside a bed walking anywhere: get out', () => {
    expect(decideRide({ inside: bed, targetKind: 'room' })).toBe('get-out');
    expect(decideRide({ inside: bed, targetKind: 'location' })).toBe('get-out');
  });
  it('the target is what you are inside: stay; not inside: walk', () => {
    expect(decideRide({ inside: car, targetKind: 'thing', targetIsContainer: true })).toBe('stay');
    expect(decideRide({ inside: null, targetKind: 'location' })).toBe('walk');
  });
});
