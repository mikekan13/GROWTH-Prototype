/** Placement (2026-10-16): the world is a top-down map; anything can hold things. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db } = vi.hoisted(() => ({
  db: {
    location: { findMany: vi.fn(), findUnique: vi.fn() },
    campaignItem: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    entityRelationship: { findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));
vi.mock('@/lib/db', () => ({ prisma: db }));

import { placeItem, renderTree, resolvePlace } from './placement';

beforeEach(() => {
  vi.clearAllMocks();
  db.location.findMany.mockResolvedValue([{ id: 'loc_home', name: "Violet's Apartment" }, { id: 'loc_kitchen', name: 'Kitchen' }]);
  db.campaignItem.findMany.mockImplementation(async ({ where }: { where: { OR?: Array<{ id?: string; name?: string }> } }) => {
    const ref = where.OR?.[0]?.id ?? '';
    const all = [
      { id: 'i_shelf', name: 'The reading corner shelf', locationId: 'loc_home' },
      { id: 'i_book', name: 'The reincarnation book', locationId: 'loc_home' },
    ];
    return all.filter(i => i.id === ref || i.name.toLowerCase() === ref.toLowerCase());
  });
  db.campaignItem.findFirst.mockResolvedValue(null);
  db.entityRelationship.findFirst.mockResolvedValue(null);
  db.entityRelationship.deleteMany.mockReturnValue({ op: 'del' });
  db.entityRelationship.create.mockReturnValue({ op: 'create' });
  db.campaignItem.update.mockReturnValue({ op: 'update' });
  db.location.findUnique.mockResolvedValue({ name: 'Kitchen' });
  db.campaignItem.findUnique.mockResolvedValue({ name: 'The reading corner shelf' });
});

describe('resolvePlace', () => {
  it('finds a room by name, then a container item by its local name', async () => {
    expect(await resolvePlace('c1', 'kitchen')).toEqual({ kind: 'location', id: 'loc_kitchen', name: 'Kitchen' });
    expect(await resolvePlace('c1', 'the reading corner shelf')).toMatchObject({ kind: 'item', id: 'i_shelf' });
    expect(await resolvePlace('c1', 'nowhere')).toBeNull();
  });
});

describe('placeItem', () => {
  it('puts a book inside the shelf: one located_at edge to the item, locationId = the enclosing room, holder cleared', async () => {
    const r = await placeItem('c1', { item: 'The reincarnation book', into: 'The reading corner shelf' });
    expect(r.into).toMatchObject({ kind: 'item', id: 'i_shelf' });
    expect(r.locationId).toBe('loc_home');
    expect(db.entityRelationship.deleteMany).toHaveBeenCalledWith({ where: { sourceId: 'i_book', relationshipType: 'located_at' } });
    expect(db.entityRelationship.create).toHaveBeenCalledWith({ data: expect.objectContaining({ sourceId: 'i_book', targetId: 'i_shelf', targetType: 'CAMPAIGN_ITEM', relationshipType: 'located_at' }) });
    expect(db.campaignItem.update).toHaveBeenCalledWith({ where: { id: 'i_book' }, data: { locationId: 'loc_home', holderId: null } });
  });
  it('puts the shelf in a room: edge to the Location', async () => {
    const r = await placeItem('c1', { item: 'i_shelf', into: 'Kitchen' });
    expect(r.into.kind).toBe('location');
    expect(db.entityRelationship.create).toHaveBeenCalledWith({ data: expect.objectContaining({ targetId: 'loc_kitchen', targetType: 'LOCATION' }) });
  });
  it('a thing cannot contain itself or its own container', async () => {
    await expect(placeItem('c1', { item: 'i_shelf', into: 'i_shelf' })).rejects.toThrow(/cannot contain itself/);
    // the shelf sits inside the book → the book may not go into the shelf
    db.entityRelationship.findFirst.mockImplementation(async ({ where }: { where: { sourceId: string } }) =>
      where.sourceId === 'i_shelf' ? { targetId: 'i_book', targetType: 'CAMPAIGN_ITEM' } : null);
    await expect(placeItem('c1', { item: 'i_book', into: 'i_shelf' })).rejects.toThrow(/cannot contain itself/);
  });
  it('refuses unknown things and places', async () => {
    await expect(placeItem('c1', { item: 'ghost', into: 'Kitchen' })).rejects.toThrow(/No item/);
    await expect(placeItem('c1', { item: 'i_book', into: 'void' })).rejects.toThrow(/No place/);
  });
});

describe('renderTree', () => {
  it('draws rooms and nested things with counts', () => {
    const lines = renderTree([
      { id: 'k', kind: 'location', name: 'Kitchen', children: [
        { id: 's', kind: 'item', name: 'Shelf', children: [{ id: 'b', kind: 'item', name: 'Book', children: [] }] },
      ] },
    ]);
    expect(lines).toEqual(['▣ Kitchen (1)', '  · Shelf (1)', '    · Book']);
  });
});
