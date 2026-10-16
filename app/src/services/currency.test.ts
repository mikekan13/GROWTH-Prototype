/** Currencies (2026-10-16): stored-KRMA vehicles, many per campaign, each with its own rate. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db } = vi.hoisted(() => ({
  db: {
    campaign: { findUnique: vi.fn() },
    currency: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('@/lib/db', () => ({ prisma: db }));

import { establishCurrency, findCurrency, formatUnits, krmaForUnits, normalizeCode, unitsForKrma } from './currency';

const GM = { id: 'gm1', role: 'WATCHER' };
const JEWL = { id: 'jewl', role: 'GODHEAD' };

beforeEach(() => {
  vi.clearAllMocks();
  db.campaign.findUnique.mockResolvedValue({ gmUserId: 'gm1' });
  db.currency.findUnique.mockResolvedValue(null);
  db.currency.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'cur1', status: 'ACTIVE', ...data }));
  db.currency.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'cur1', campaignId: 'c1', code: 'USD', ...data }));
});

describe('exchange math (pure)', () => {
  it('units ↔ KRMA at the currency rate, never negative', () => {
    expect(unitsForKrma(10, 0.05)).toBe(200);
    expect(krmaForUnits(200, 0.05)).toBe(10);
    expect(unitsForKrma(-3, 0.05)).toBe(0);
    expect(() => unitsForKrma(1, 0)).toThrow(/positive/);
  });
  it('codes normalize; display uses the symbol when there is one', () => {
    expect(normalizeCode(' usd ')).toBe('USD');
    expect(formatUnits(1250, { code: 'USD', symbol: '$' })).toBe('$1,250');
    expect(formatUnits(12.5, { code: 'USD', symbol: '$' })).toBe('$12.50');
    expect(formatUnits(40, { code: 'crowns', symbol: '' })).toBe('40 crowns');
  });
});

describe('establishCurrency', () => {
  it('JEWL (GODHEAD) establishes a currency for the GM; code is uppercased', async () => {
    const r = await establishCurrency('c1', JEWL, { name: 'United States dollar', code: 'usd', symbol: '$', krmaPerUnit: 0.033, scope: 'Sacramento, 2026' });
    expect(r.created).toBe(true);
    expect(db.currency.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ code: 'USD', createdBy: 'jewl', krmaPerUnit: 0.033 }) }));
  });
  it('re-calling with the same code re-rates instead of duplicating', async () => {
    db.currency.findUnique.mockResolvedValue({ id: 'cur1', campaignId: 'c1', code: 'USD' });
    const r = await establishCurrency('c1', GM, { name: 'US dollar', code: 'USD', krmaPerUnit: 0.02 });
    expect(r.created).toBe(false);
    expect(db.currency.create).not.toHaveBeenCalled();
    expect(db.currency.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ krmaPerUnit: 0.02, status: 'ACTIVE' }) }));
  });
  it('a player cannot establish one', async () => {
    await expect(establishCurrency('c1', { id: 'p1', role: 'TRAILBLAZER' }, { name: 'x', code: 'X', krmaPerUnit: 1 })).rejects.toThrow(/Only the GM/);
  });
  it('rejects a non-positive rate at the schema', async () => {
    await expect(establishCurrency('c1', GM, { name: 'x', code: 'X', krmaPerUnit: 0 })).rejects.toThrow();
  });
});

describe('findCurrency', () => {
  it('finds by id, then by code case-insensitively', async () => {
    db.currency.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'cur1', code: 'USD' });
    const c = await findCurrency('c1', 'usd');
    expect(c?.code).toBe('USD');
    expect(db.currency.findFirst).toHaveBeenLastCalledWith({ where: { campaignId: 'c1', code: 'USD' } });
  });
});
