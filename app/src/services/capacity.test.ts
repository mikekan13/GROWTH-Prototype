/** Capacity (Mike 2026-10-16): "I can't put a whale in my apartment." */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db } = vi.hoisted(() => ({
  db: {
    location: { findUnique: vi.fn() },
    campaignItem: { findUnique: vi.fn(), findMany: vi.fn() },
    entityRelationship: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/db', () => ({ prisma: db }));

import { assertFits, checkFit, fits, polygonArea, roomCapacityCuFt } from './capacity';

beforeEach(() => { vi.clearAllMocks(); });

describe('fits (pure)', () => {
  it('refuses over volume with the reason, over weight too', () => {
    const apt = { name: "Violet's Apartment", capacityCuFt: 5000 };
    const r = fits(apt, [{ volumeCuFt: 800 }], { name: 'Whale', volumeCuFt: 8000 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("a Whale (8000 cu ft) does not fit in Violet's Apartment (4200 cu ft left)");
    const shelf = { name: 'The shelf', capacityCuFt: 10, capacityLbs: 50 };
    expect(fits(shelf, [{ weightLbs: 45 }], { name: 'Anvil', volumeCuFt: 1, weightLbs: 100 }).reason).toMatch(/too heavy for The shelf \(5 lbs left\)/);
    expect(fits(shelf, [], { name: 'Book', volumeCuFt: 0.1, weightLbs: 1 }).ok).toBe(true);
  });
  it('unknown volume or capacity is allowed, with a warning', () => {
    expect(fits({ name: 'Box', capacityCuFt: 1 }, [], { name: 'Thing' })).toMatchObject({ ok: true, warnings: ['Thing has no volume yet — placed unchecked'] });
    expect(fits({ name: 'Box' }, [], { name: 'Thing', volumeCuFt: 99 })).toMatchObject({ ok: true, warnings: ['Box has no capacity yet — placed unchecked'] });
  });
});

describe('room capacity from the footprint', () => {
  it('area × scale² × height, default height 9 ft; no footprint → null', () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }])).toBe(50);
    // 560 × 360 units at 0.05 ft/unit = 28 × 18 ft = 504 sq ft × 9 ft
    const fp = { points: [{ x: 0, y: 0 }, { x: 560, y: 0 }, { x: 560, y: 360 }, { x: 0, y: 360 }], scale: 0.05, level: 0 };
    expect(roomCapacityCuFt({ footprint: fp })).toBeCloseTo(4536);
    expect(roomCapacityCuFt({ footprint: { ...fp, height: 10 } })).toBeCloseTo(5040);
    expect(roomCapacityCuFt({})).toBeNull();
  });
});

describe('checkFit / assertFits (DB)', () => {
  it('a room counts what sits directly in it, not the item being moved', async () => {
    const fp = { points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }], scale: 0.05, level: 0 }; // 10×10×9 = 900
    db.location.findUnique.mockResolvedValue({ name: 'Closet Room', data: JSON.stringify({ footprint: fp }) });
    db.entityRelationship.findMany.mockResolvedValue([{ sourceId: 'i_bed' }, { sourceId: 'i_self' }]);
    db.campaignItem.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
      where.id.in.map(id => ({ name: id, data: JSON.stringify({ volumeCuFt: id === 'i_bed' ? 600 : 500 }) })));
    const r = await checkFit({ kind: 'location', id: 'loc', name: 'Closet Room' }, { name: 'Dresser', volumeCuFt: 250 }, 'i_self');
    expect(r.ok).toBe(true);
    expect(r.leftCuFt).toBeCloseTo(300);
    await expect(assertFits({ kind: 'location', id: 'loc', name: 'Closet Room' }, { name: 'Piano', volumeCuFt: 400 }, 'i_self')).rejects.toThrow(/a Piano \(400 cu ft\) does not fit in Closet Room \(300 cu ft left\)/);
  });
  it('a holder with no capacity skips the content read', async () => {
    db.campaignItem.findUnique.mockResolvedValue({ name: 'Bag', data: '{}' });
    const w = await assertFits({ kind: 'item', id: 'i_bag', name: 'Bag' }, { name: 'Keys', volumeCuFt: 0.01 });
    expect(w).toEqual(['Bag has no capacity yet — placed unchecked']);
    expect(db.entityRelationship.findMany).not.toHaveBeenCalled();
  });
});
