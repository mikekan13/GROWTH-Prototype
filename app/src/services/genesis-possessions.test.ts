/** POSSESSIONS stage (2026-10-12): catalog-first pull + paint, new items via the Forge, the deed edge, three tiers. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db, pull, createItem } = vi.hoisted(() => ({
  db: {
    character: { findUnique: vi.fn() },
    forgeItem: { findFirst: vi.fn(), findUnique: vi.fn() },
    campaignItem: { findFirst: vi.fn(), delete: vi.fn() },
    entityRelationship: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    location: { findMany: vi.fn() },
  },
  pull: vi.fn(),
  createItem: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('./forge', () => ({ pullFromGlobalCatalog: (...a: unknown[]) => pull(...a) }));
vi.mock('./campaign-item', () => ({ createCampaignItem: (...a: unknown[]) => createItem(...a) }));

import { grantPossession, DEED_RELATIONSHIP } from './genesis-possessions';

const ACTOR = { id: 'jewl', role: 'GODHEAD' };
const KNIFE = { id: 'copy1', name: 'Silver Butter Knife', type: 'item', status: 'published', data: JSON.stringify({ itemType: 'tool', weightLbs: 0.1, description: 'A silver butter knife.' }) };

beforeEach(() => {
  vi.clearAllMocks();
  db.character.findUnique.mockResolvedValue({ campaignId: 'c1', name: 'Violet', data: JSON.stringify({}) });
  db.campaignItem.findFirst.mockResolvedValue(null);
  db.entityRelationship.findFirst.mockResolvedValue(null);
  db.entityRelationship.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: `e_${data.relationshipType}`, ...data }));
  createItem.mockImplementation(async (_c: string, _u: string, _r: string, input: Record<string, unknown>) => ({ id: 'item1', ...input }));
  db.location.findMany.mockResolvedValue([{ id: 'loc1', name: "Violet's Apartment" }]);
});

describe('catalog first: pull stock + paint the instance', () => {
  it('pulls the stock archetype free and paints her instance (local name, story, origin)', async () => {
    db.forgeItem.findFirst
      .mockResolvedValueOnce(null) // not in the campaign
      .mockResolvedValueOnce({ id: 'stock1' }); // stock
    pull.mockResolvedValue({ id: 'copy1' });
    db.forgeItem.findUnique.mockResolvedValue(KNIFE);
    const r = await grantPossession('c1', ACTOR, {
      characterId: 'v', item: 'Silver Butter Knife', tier: 'carried', localName: "Rosemary's keepsake", story: 'Her grandmother\'s, from the drawer by the stove.',
    });
    expect(pull).toHaveBeenCalledWith('stock1', 'c1', 'jewl', 'GODHEAD');
    expect(r).toMatchObject({ ok: true, name: "Rosemary's keepsake", archetype: 'Silver Butter Knife', source: 'stock', tier: 'carried' });
    const input = createItem.mock.calls[0][3];
    expect(input).toMatchObject({ name: "Rosemary's keepsake", holderId: 'v', sourceForgeItemId: 'copy1', story: expect.stringContaining('grandmother') });
    expect(input.data).toMatchObject({ weightLbs: 0.1, itemType: 'tool' });
    expect(input.origin).toMatch(/pulled from stock "Silver Butter Knife"/);
    expect(db.entityRelationship.create).not.toHaveBeenCalled(); // carried = held, not a deed
  });

  it('a thing no archetype fits goes to the Forge as an archetype — never invented here', async () => {
    db.forgeItem.findFirst.mockResolvedValue(null);
    const r = await grantPossession('c1', ACTOR, { characterId: 'v', item: 'Rosemary\'s Lamp', tier: 'owned', story: 's' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/propose_forge_blueprint type "item"/);
    expect(createItem).not.toHaveBeenCalled();
    expect(pull).not.toHaveBeenCalled();
  });

  it('a draft awaiting the GM is not granted yet', async () => {
    db.forgeItem.findFirst.mockResolvedValueOnce({ ...KNIFE, id: 'd1', status: 'draft' });
    const r = await grantPossession('c1', ACTOR, { characterId: 'v', item: 'd1', tier: 'carried', story: 's', weightLbs: 1 });
    expect(r).toMatchObject({ ok: false, blueprintId: 'd1' });
  });
});

describe('tiers', () => {
  it('owned = the deed: an owns edge character → item, plus located_at for where it is', async () => {
    db.forgeItem.findFirst.mockResolvedValueOnce({ ...KNIFE, id: 'desk', name: 'Writing Desk', data: '{}' });
    const r = await grantPossession('c1', ACTOR, { characterId: 'v', item: 'Writing Desk', tier: 'owned', story: 'Bought used.', location: "Violet's Apartment" });
    expect(r).toMatchObject({ ok: true, tier: 'owned', deedId: `e_${DEED_RELATIONSHIP}` });
    expect(createItem.mock.calls[0][3]).toMatchObject({ holderId: null, locationId: 'loc1' });
    const edges = db.entityRelationship.create.mock.calls.map((c: Array<{ data: Record<string, unknown> }>) => c[0].data);
    expect(edges).toContainEqual(expect.objectContaining({ sourceId: 'v', sourceType: 'CHARACTER', targetId: 'item1', targetType: 'CAMPAIGN_ITEM', relationshipType: 'owns' }));
    expect(edges).toContainEqual(expect.objectContaining({ sourceId: 'item1', targetId: 'loc1', relationshipType: 'located_at' }));
  });

  it('equipped needs a region of HER anatomy', async () => {
    db.forgeItem.findFirst.mockResolvedValue({ ...KNIFE, name: 'Wool Cardigan' });
    await expect(grantPossession('c1', ACTOR, { characterId: 'v', item: 'Wool Cardigan', tier: 'equipped', slot: 'Tail', story: 's' }))
      .rejects.toThrow(/body regions/);
  });

  it('weight is real lbs — required for what she carries when the archetype has none', async () => {
    db.forgeItem.findFirst.mockResolvedValue({ ...KNIFE, data: '{}' });
    await expect(grantPossession('c1', ACTOR, { characterId: 'v', item: 'Silver Butter Knife', tier: 'carried', story: 's' }))
      .rejects.toThrow(/weightLbs in real pounds/);
  });
});

describe('drop_possession (2026-10-16): JEWL takes back his own grant', () => {
  it('removes a thing she holds, by her local name, with its edges', async () => {
    db.entityRelationship.findMany.mockResolvedValue([]);
    db.entityRelationship.deleteMany.mockResolvedValue({ count: 1 });
    db.campaignItem.findFirst.mockResolvedValueOnce({ id: 'it2', name: 'Her phone' });
    db.campaignItem.delete.mockResolvedValue({});
    const { dropPossession } = await import('./genesis-possessions');
    const r = await dropPossession('c1', ACTOR, { characterId: 'v', item: 'Her phone', reason: 'granted twice' });
    expect(r).toEqual({ ok: true, itemId: 'it2', name: 'Her phone' });
    expect(db.campaignItem.delete).toHaveBeenCalledWith({ where: { id: 'it2' } });
    expect(db.entityRelationship.deleteMany).toHaveBeenCalled();
  });
  it('refuses a thing that is not hers', async () => {
    db.entityRelationship.findMany.mockResolvedValue([]);
    db.campaignItem.findFirst.mockResolvedValueOnce(null);
    const { dropPossession } = await import('./genesis-possessions');
    const r = await dropPossession('c1', ACTOR, { characterId: 'v', item: 'Ruth\'s phone', reason: 'x' });
    expect(r.ok).toBe(false);
  });
});
