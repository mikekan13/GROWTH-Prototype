/** Holder kits (Mike 2026-10-16): quantum contents — a KV budget + one line, drawn when observed. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db, place, holder } = vi.hoisted(() => ({
  db: {
    campaignItem: { findUnique: vi.fn(), update: vi.fn() },
    entityRelationship: { findFirst: vi.fn() },
  },
  place: vi.fn(),
  holder: { data: {} as Record<string, unknown> },
}));
vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('./genesis-possessions', () => ({ DEED_RELATIONSHIP: 'owns' }));
vi.mock('./life-goods', async () => {
  const { z } = await import('zod');
  const goodSchema = z.object({ archetype: z.string(), into: z.string(), weightLbs: z.number(), primaryMaterial: z.string(), value: z.number().optional(), worn: z.boolean().optional() });
  return { goodSchema, placeGoods: (...a: unknown[]) => place(...a) };
});

import { drawFromHolderKit, kitRemaining, stockKit } from './kits';

beforeEach(() => {
  vi.clearAllMocks();
  holder.data = { capacityCuFt: 18 };
  db.campaignItem.findUnique.mockImplementation(async () => ({ id: 'i_fridge', name: 'The fridge', campaignId: 'c1', status: 'ACTIVE', holderId: null, data: JSON.stringify(holder.data) }));
  db.campaignItem.update.mockImplementation(async ({ data }: { data: { data: string } }) => { holder.data = JSON.parse(data.data); return {}; });
  db.entityRelationship.findFirst.mockResolvedValue({ sourceId: 'violet' });
});

describe('stockKit', () => {
  it('writes the kit on the holder; a re-stock keeps what was drawn and cannot drop below it', async () => {
    const r = await stockKit('c1', 'i_fridge', { kvBudget: 1.2, contents: 'milk, six eggs, leftover pad thai, ketchup' });
    expect(r.kit).toEqual({ kvBudget: 1.2, contents: 'milk, six eggs, leftover pad thai, ketchup', spentKv: 0, resolvedItemIds: [] });
    expect(holder.data.capacityCuFt).toBe(18);
    holder.data = { kit: { kvBudget: 1.2, contents: 'x', spentKv: 0.5, resolvedItemIds: ['a'] } };
    await expect(stockKit('c1', 'i_fridge', { kvBudget: 0.4, contents: 'y' })).rejects.toThrow(/cannot drop below/);
    const again = await stockKit('c1', 'i_fridge', { kvBudget: 2, contents: 'y' });
    expect(again.kit.resolvedItemIds).toEqual(['a']);
    expect(again.remainingKv).toBe(1.5);
  });
  it('refuses another campaign\'s item', async () => {
    db.campaignItem.findUnique.mockResolvedValueOnce({ id: 'x', name: 'X', campaignId: 'c2', status: 'ACTIVE', holderId: null, data: '{}' });
    await expect(stockKit('c1', 'x', { kvBudget: 1, contents: 'z' })).rejects.toThrow(/not found/);
  });
});

describe('drawFromHolderKit', () => {
  it('crystallizes goods INTO the holder against the remaining budget, deeded to the owner, recorded on the kit', async () => {
    holder.data = { kit: { kvBudget: 1.2, contents: 'milk, eggs', spentKv: 0.2, resolvedItemIds: [] } };
    place.mockResolvedValue({ created: 1, archetypesCreated: 1, failed: [{ archetype: 'Caviar', reason: 'exceeds' }], containers: [], items: [{ id: 'i_eggs', name: 'Egg', kv: 0.12 }] });
    const r = await drawFromHolderKit('c1', 'i_fridge', [
      { archetype: 'Egg', weightLbs: 0.6, primaryMaterial: 'Foodstuffs', value: 0.12 },
      { archetype: 'Caviar', weightLbs: 0.1, primaryMaterial: 'Foodstuffs', value: 0.9, into: 'The fridge' },
    ], { id: 'jewl', role: 'GODHEAD' });
    const [, , goods, opts] = place.mock.calls[0];
    expect(goods[0].into).toBe('i_fridge');
    expect(goods[1].into).toBe('The fridge');
    expect(opts).toMatchObject({ ownerId: 'violet', extraData: { drawnFromKit: 'i_fridge' }, budget: { left: 1 } });
    expect(r.kit.spentKv).toBeCloseTo(0.32);
    expect(r.kit.resolvedItemIds).toEqual(['i_eggs']);
    expect(r.remainingKv).toBeCloseTo(0.88);
    expect((holder.data.kit as { resolvedItemIds: string[] }).resolvedItemIds).toEqual(['i_eggs']);
  });
  it('a holder with no kit refuses', async () => {
    await expect(drawFromHolderKit('c1', 'i_fridge', [{ archetype: 'Egg', weightLbs: 0.1, primaryMaterial: 'Foodstuffs' }], { id: 'j', role: 'GODHEAD' })).rejects.toThrow(/no kit/);
  });
  it('kitRemaining never goes negative', () => {
    expect(kitRemaining({ kvBudget: 1, spentKv: 3 })).toBe(0);
  });
});
