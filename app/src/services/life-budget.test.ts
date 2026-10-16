/** The life budget (2026-10-16): Σ accumulated wealth − things − cash. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db, links } = vi.hoisted(() => ({
  db: {
    character: { findUnique: vi.fn() },
    entityRelationship: { findMany: vi.fn() },
    campaignItem: { findMany: vi.fn() },
    forgeItem: { findMany: vi.fn(async (): Promise<Array<{ id: string; karmicValue: bigint }>> => []) },
    currency: { findMany: vi.fn() },
  },
  links: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('./genesis-sheet-sync', () => ({ liveBlockLinks: (...a: unknown[]) => links(...a) }));
vi.mock('./genesis-possessions', () => ({ DEED_RELATIONSHIP: 'owns' }));

import { budgetLine, fromNamedGrant, itemKv, lifeBudget, sumAccumulatedWealth } from './life-budget';

const block = (type: string, name: string, data: Record<string, unknown>, localName: string | null = null) =>
  ({ id: `l_${name}`, forgeItemId: `f_${name}`, localName, story: '', ageAdded: null, createdAt: new Date(), block: { id: `f_${name}`, type, name, status: 'published', data: JSON.stringify(data) } });

beforeEach(() => {
  vi.clearAllMocks();
  db.character.findUnique.mockResolvedValue({ campaignId: 'c1', data: JSON.stringify({ wealth: { holdings: [{ currencyId: 'cur1', code: 'USD', amount: 400 }] } }) });
  db.entityRelationship.findMany.mockResolvedValue([{ targetId: 'i_deed' }]);
  db.campaignItem.findMany.mockResolvedValue([
    { id: 'i_held', name: 'Smartphone', data: JSON.stringify({ value: 6 }), history: '[]', sourceForgeItemId: null },
    // Paint said 400 (a price); the archetype's grade (80) is what counts.
    { id: 'i_deed', name: 'City Apartment (Unit)', data: JSON.stringify({ value: 400 }), history: '[{"kind":"origin","text":"genesis: pulled from stock"}]', sourceForgeItemId: 'f_apt' },
    { id: 'i_grant', name: 'Sewing Box', data: JSON.stringify({ value: 4 }), history: '[{"kind":"origin","text":"block grant: Grandparent Household"}]', sourceForgeItemId: null },
  ]);
  db.forgeItem.findMany.mockResolvedValue([{ id: 'f_apt', karmicValue: BigInt(80) }]);
  db.currency.findMany.mockResolvedValue([{ id: 'cur1', krmaPerUnit: 0.05 }]);
  links.mockResolvedValue([
    block('seed', 'Human', { fatedAge: 80 }),
    block('root', 'Grandparent Household', { accumulatedWealth: 60 }, 'Rosemary\'s house'),
    block('branch', 'Years of Solitary Craft', { accumulatedWealth: 45 }),
    block('branch', 'Violated Trust', {}),
  ]);
});

describe('pure parts', () => {
  it('sums accumulated wealth over roots + branches only, by local name', () => {
    const s = sumAccumulatedWealth([
      block('seed', 'Human', { accumulatedWealth: 999 }),
      block('root', 'R', { accumulatedWealth: 60 }, 'home'),
      block('branch', 'B', { accumulatedWealth: -5 }),
      block('branch', 'B2', {}),
    ]);
    expect(s).toEqual([
      { block: 'home', type: 'root', accumulatedWealth: 60 },
      { block: 'B', type: 'branch', accumulatedWealth: 0 },
      { block: 'B2', type: 'branch', accumulatedWealth: 0 },
    ]);
  });
  it('item KV reads value, then kv, never negative', () => {
    expect(itemKv({ value: 7 })).toBe(7);
    expect(itemKv({ kv: 3 })).toBe(3);
    expect(itemKv({ value: -2 })).toBe(0);
    expect(itemKv({})).toBe(0);
  });
  it('named block grants are recognised from the origin line', () => {
    expect(fromNamedGrant('[{"kind":"origin","text":"block grant: Grandparent Household"}]')).toBe(true);
    expect(fromNamedGrant('[{"kind":"origin","text":"genesis: pulled from stock"}]')).toBe(false);
    expect(fromNamedGrant('not json')).toBe(false);
  });
  it('the line says OVER when the remainder is negative', () => {
    expect(budgetLine({ budgetKv: 10, spentKv: 20, cashKv: 0, remainingKv: -10, sources: [], items: [] })).toMatch(/OVER/);
    expect(budgetLine({ budgetKv: 100, spentKv: 20, cashKv: 10, remainingKv: 70, sources: [], items: [] })).toMatch(/70 KV left/);
  });
});

describe('lifeBudget', () => {
  it('budget − held/deeded things (not named grants) − cash at the rate', async () => {
    const b = await lifeBudget('v');
    expect(b.budgetKv).toBe(105);
    expect(b.items.map(i => i.name)).toEqual(['Smartphone', 'City Apartment (Unit)']);
    expect(b.spentKv).toBe(86);
    expect(b.cashKv).toBeCloseTo(20);
    expect(b.remainingKv).toBeCloseTo(-1);
    expect(b.line).toMatch(/OVER/);
    expect(db.campaignItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: [{ holderId: 'v' }, { id: { in: ['i_deed'] } }] }),
    }));
  });
});

describe('decimals + kits (Mike 2026-10-16)', () => {
  it('sub-1 KV sums in decimals; a kit counts once at its budget; things drawn from it are not counted again', async () => {
    db.campaignItem.findMany.mockResolvedValue([
      { id: 'i_onion', name: 'Onion', data: JSON.stringify({ quantity: 3 }), history: '[]', sourceForgeItemId: 'f_onion' },
      { id: 'i_fridge', name: 'The fridge', data: JSON.stringify({ kit: { kvBudget: 1.25, contents: 'milk, eggs', spentKv: 0.12, resolvedItemIds: ['i_egg'] } }), history: '[]', sourceForgeItemId: 'f_fridge' },
      { id: 'i_egg', name: 'Egg', data: JSON.stringify({ quantity: 6, drawnFromKit: 'i_fridge' }), history: '[]', sourceForgeItemId: 'f_onion' },
    ]);
    db.forgeItem.findMany.mockResolvedValue([
      { id: 'f_onion', karmicValue: BigInt(0), data: JSON.stringify({ value: 0.02 }) },
      { id: 'f_fridge', karmicValue: BigInt(4), data: JSON.stringify({ value: 4 }) },
    ] as never);
    const b = await lifeBudget('v');
    expect(b.items.map(i => i.name)).toEqual(['Onion', 'The fridge', 'The fridge (kit: milk, eggs)']);
    expect(b.spentKv).toBeCloseTo(0.06 + 4 + 1.25);
    expect(b.line).toMatch(/5\.31 KV in things/);
  });
});
