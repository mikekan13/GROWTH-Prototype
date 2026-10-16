/** Life goods (2026-10-16): simulation-level stocking + the coverage checklist. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db, createItem, places, fit } = vi.hoisted(() => ({
  fit: { fn: null as null | ((place: { id: string }, b: { name?: string; volumeCuFt?: number | null }) => { ok: boolean; reason?: string; warnings: string[] }) },
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
vi.mock('./capacity', () => ({
  checkFit: async (place: { id: string }, b: { name?: string; volumeCuFt?: number | null }) => (fit.fn ? fit.fn(place, b) : { ok: true, warnings: [] }),
}));
vi.mock('./placement', () => ({
  resolvePlace: async (_c: string, ref: string) => places.get(ref.toLowerCase()) ?? null,
  enclosingLocationId: async () => 'loc_kitchen',
}));

import { coverageLine, lifeCoverage, stockGoods } from './life-goods';

let archetypes = 0;
beforeEach(() => {
  vi.clearAllMocks();
  archetypes = 0;
  fit.fn = null;
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

describe('decimal KV + capacity in stocking (Mike 2026-10-16)', () => {
  it('a new everyday archetype keeps its sub-1 KV per one (mirror rounds to 0); 1 KV or more is forged first', async () => {
    const r = await stockGoods('c1', { id: 'jewl', role: 'GODHEAD' }, {
      characterId: 'v',
      goods: [
        { archetype: 'Yellow Onion', qty: 3, into: 'Kitchenette', weightLbs: 1.5, primaryMaterial: 'Foodstuffs', value: 0.06 },
        { archetype: 'Velvet Sofa', into: 'Kitchenette', weightLbs: 120, primaryMaterial: 'Wood', value: 2 },
      ],
    });
    expect(r.created).toBe(1);
    const onion = db.forgeItem.create.mock.calls[0][0].data;
    expect(JSON.parse(onion.data).value).toBeCloseTo(0.02);
    expect(onion.karmicValue).toBe(BigInt(0));
    expect(r.items?.[0].kv).toBeCloseTo(0.06);
    expect(r.failed[0].reason).toMatch(/forged first/);
  });
  it('a holder refuses what will not fit, with the reason; the rest still lands', async () => {
    fit.fn = (_p, b) => (b.name === 'Whale' ? { ok: false, reason: "a Whale (8000 cu ft) does not fit in Violet's Apartment (4200 cu ft left)", warnings: [] } : { ok: true, warnings: ['Kitchenette has no capacity yet — placed unchecked'] });
    const r = await stockGoods('c1', { id: 'jewl', role: 'GODHEAD' }, {
      characterId: 'v',
      goods: [
        { archetype: 'Whale', into: 'Kitchenette', weightLbs: 2000, primaryMaterial: 'Flesh', volumeCuFt: 8000 },
        { archetype: 'Toothbrush', into: 'Kitchenette', weightLbs: 0.05, primaryMaterial: 'Polymer', value: 0.01 },
      ],
    });
    expect(r.created).toBe(1);
    expect(r.failed[0].reason).toBe("a Whale (8000 cu ft) does not fit in Violet's Apartment (4200 cu ft left)");
    expect(r.warnings).toContain('Kitchenette has no capacity yet — placed unchecked');
  });
  it('a kit budget is drawn per good; one that overflows fails alone', async () => {
    const { placeGoods } = await import('./life-goods');
    const budget = { left: 0.05 };
    const r = await placeGoods('c1', { id: 'jewl', role: 'GODHEAD' }, [
      { archetype: 'Egg', qty: 2, into: 'Kitchenette', weightLbs: 0.2, primaryMaterial: 'Foodstuffs', value: 0.04 },
      { archetype: 'Milk Carton', into: 'Kitchenette', weightLbs: 4, primaryMaterial: 'Foodstuffs', value: 0.03 },
    ], { ownerId: 'v', origin: () => 'test', budget, extraData: { drawnFromKit: 'i_fridge' } });
    expect(r.created).toBe(1);
    expect(budget.left).toBeCloseTo(0.01);
    expect(r.failed[0].reason).toMatch(/exceeds the kit's remaining 0.01 KV/);
    expect(createItem.mock.calls[0][3].data.drawnFromKit).toBe('i_fridge');
  });
});

describe('lifeCoverage counts kits (2026-10-16)', () => {
  it('a kit line counts clause by clause; a wardrobe kit covers every clothing area', () => {
    const cov = lifeCoverage([], ['milk, eggs, butter, cheese, yogurt, an onion, garlic, leftover pad thai', 'everyday clothes for a frugal writer in autumn: jeans, sweaters, two good dresses, worn boots']);
    const of = (label: RegExp) => cov.find(c => label.test(c.area))!;
    expect(of(/fridge/).have).toBe(8);
    expect(of(/^tops/).have).toBe(6);
    expect(of(/^socks/).have).toBe(8);
    expect(of(/pantry/).have).toBe(0);
  });
});
