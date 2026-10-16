/** Life goods (2026-10-16): simulation-level stocking + the coverage checklist. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db, createItem, places } = vi.hoisted(() => ({
  db: {
    character: { findUnique: vi.fn() },
    forgeItem: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), count: vi.fn() },
    entityRelationship: { create: vi.fn() },
  },
  createItem: vi.fn(),
  places: new Map<string, { kind: 'location' | 'item'; id: string; name: string; locationId: string | null }>(),
}));
vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('./campaign-item', () => ({ createCampaignItem: (...a: unknown[]) => createItem(...a) }));
vi.mock('./genesis-possessions', () => ({ DEED_RELATIONSHIP: 'owns' }));
vi.mock('./placement', () => ({
  resolvePlace: async (_c: string, ref: string) => places.get(ref.toLowerCase()) ?? null,
  enclosingLocationId: async () => 'loc_kitchen',
}));

import { coverageLine, lifeCoverage, stockGoods } from './life-goods';

let archetypes = 0;
beforeEach(() => {
  vi.clearAllMocks();
  archetypes = 0;
  places.clear();
  places.set('kitchenette', { kind: 'location', id: 'loc_kitchen', name: 'Kitchenette', locationId: null });
  db.character.findUnique.mockResolvedValue({ campaignId: 'c1', name: 'Violet' });
  db.forgeItem.findFirst.mockResolvedValue(null);
  db.forgeItem.count.mockImplementation(async () => archetypes);
  db.forgeItem.create.mockImplementation(async () => { archetypes++; return { id: `f${archetypes}` }; });
  createItem.mockImplementation(async (_c: string, _u: string, _r: string, input: { name: string; container?: boolean }) => {
    const id = `i_${input.name}`;
    return { id };
  });
  db.entityRelationship.create.mockResolvedValue({});
});

describe('stockGoods', () => {
  it('places a container first, then its contents inside it; mundane archetypes are 0 KV and published', async () => {
    createItem.mockImplementation(async (_c: string, _u: string, _r: string, input: { name: string }) => {
      if (input.name === 'The fridge') places.set('the fridge', { kind: 'item', id: 'i_fridge', name: 'The fridge', locationId: 'loc_kitchen' });
      return { id: input.name === 'The fridge' ? 'i_fridge' : `i_${input.name}` };
    });
    const r = await stockGoods('c1', { id: 'jewl', role: 'GODHEAD' }, {
      characterId: 'v',
      goods: [
        { archetype: 'Carton of Eggs', qty: 6, into: 'The fridge', weightLbs: 0.8, primaryMaterial: 'Foodstuffs', state: 'four left' },
        { archetype: 'Refrigerator', localName: 'The fridge', into: 'Kitchenette', weightLbs: 150, primaryMaterial: 'Steel' },
      ],
    });
    expect(r).toMatchObject({ created: 2, failed: [], containers: ['The fridge'] });
    expect(createItem.mock.calls[0][3].name).toBe('The fridge');
    const created = db.forgeItem.create.mock.calls.map(c => c[0].data);
    expect(created.every((d: { status: string; karmicValue: bigint }) => d.status === 'published' && d.karmicValue === BigInt(0))).toBe(true);
    expect(JSON.parse(created[1].data).tags).toContain('mundane');
    expect(db.entityRelationship.create).toHaveBeenCalledWith({ data: expect.objectContaining({ sourceId: 'i_Carton of Eggs', targetId: 'i_fridge', targetType: 'CAMPAIGN_ITEM', relationshipType: 'located_at' }) });
  });
  it('a draft archetype is refused, not bypassed; an unknown place fails alone', async () => {
    db.forgeItem.findFirst.mockResolvedValueOnce({ id: 'd1', data: '{}', status: 'draft' });
    const r = await stockGoods('c1', { id: 'jewl', role: 'GODHEAD' }, {
      characterId: 'v',
      goods: [
        { archetype: 'Enchanted Kettle', into: 'Kitchenette', weightLbs: 2, primaryMaterial: 'Steel' },
        { archetype: 'Toothbrush', into: 'Nowhere', weightLbs: 0.05, primaryMaterial: 'Polymer' },
      ],
    });
    expect(r.created).toBe(0);
    expect(r.failed.map(f => f.reason)).toEqual([expect.stringMatching(/draft/), expect.stringMatching(/no room or container/)]);
  });
});

describe('lifeCoverage', () => {
  it('names every gap; a stocked home reads clean', () => {
    const line = coverageLine(lifeCoverage(['Cotton T-Shirt', 'Toothbrush', 'Dry Spaghetti']));
    expect(line).toMatch(/GAPS:/);
    expect(line).toMatch(/fridge and fresh food 0\/8/);
    expect(line).toMatch(/tops \(shirts, sweaters\) 1\/6/);
  });
});

describe('everything is a container (Mike 2026-10-16)', () => {
  it('orders holders before what they hold, any depth, with no flag', async () => {
    const { orderByHolding } = await import('./life-goods');
    const g = (archetype: string, into: string, localName?: string) => ({ archetype, into, localName, weightLbs: 1, primaryMaterial: 'Ceramic' });
    const out = orderByHolding([g('Dinner Plate', 'The sink'), g('Kitchen Sink', 'Kitchenette', 'The sink'), g('Receipt', 'Her coat'), g('Wool Coat', 'The closet', 'Her coat'), g('Closet', 'Main Room', 'The closet')]);
    const idx = (n: string) => out.findIndex(x => (x.localName ?? x.archetype) === n);
    expect(idx('The sink')).toBeLessThan(idx('Dinner Plate'));
    expect(idx('The closet')).toBeLessThan(idx('Her coat'));
    expect(idx('Her coat')).toBeLessThan(idx('Receipt'));
  });
});
