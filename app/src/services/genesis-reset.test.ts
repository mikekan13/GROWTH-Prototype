/** Reset the completion stages (2026-10-16): strip the old genesis's products, keep the person. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db } = vi.hoisted(() => ({
  db: {
    character: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    entityRelationship: { findMany: vi.fn(), deleteMany: vi.fn(async () => ({ count: 0 })), count: vi.fn(async () => 0) },
    campaignItem: { findMany: vi.fn(), deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => ({ count: where.id.in.length })) },
    location: { deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => ({ count: where.id.in.length })) },
    worldFact: { deleteMany: vi.fn(async () => ({ count: 3 })) },
    goal: { deleteMany: vi.fn(async () => ({ count: 2 })) },
  },
}));
vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('./campaign-access', () => ({ requireCampaignGM: vi.fn(async () => ({ id: 'c1', gmUserId: 'gm' })) }));
vi.mock('./genesis-possessions', () => ({ DEED_RELATIONSHIP: 'owns' }));

import { factPrefix, paintedFor, resetCompletionStages } from './genesis-reset';

beforeEach(() => {
  vi.clearAllMocks();
  db.character.findUnique.mockResolvedValue({ id: 'v', name: 'Violet Marsh', campaignId: 'c1', data: JSON.stringify({ _genesisStages: { WORLD: 'x' }, wealth: { holdings: [] }, identity: { age: 25 } }) });
  db.entityRelationship.findMany
    .mockResolvedValueOnce([{ id: 'd1', targetId: 'i_deed' }]) // deeds
    .mockResolvedValueOnce([{ id: 'p1', targetId: 'loc_home' }]) // place edges
    .mockResolvedValueOnce([{ sourceId: 'loc_room' }]); // rooms of the home
  db.campaignItem.findMany.mockResolvedValue([
    { id: 'i_held', history: '[]', holderId: 'v' },
    { id: 'i_deed', history: '[]', holderId: null },
    { id: 'i_orphan', history: '[{"kind":"origin","text":"genesis: pulled from stock \\"Laptop\\", painted for Violet Marsh"}]', holderId: null },
    { id: 'i_other', history: '[{"kind":"origin","text":"painted for Ruth"}]', holderId: null },
  ]);
  db.character.findMany.mockResolvedValue([{ id: 'npc1', name: 'Rosemary' }]);
  db.character.update.mockResolvedValue({});
});

describe('pure helpers', () => {
  it('fact prefix is her first name; paintedFor reads the origin line', () => {
    expect(factPrefix('Violet Marsh')).toBe('violet');
    expect(paintedFor('[{"kind":"origin","text":"genesis: …, painted for Violet Marsh"}]', 'Violet Marsh')).toBe(true);
    expect(paintedFor('[{"kind":"origin","text":"painted for Ruth"}]', 'Violet Marsh')).toBe(false);
    expect(paintedFor('nope', 'Violet Marsh')).toBe(false);
  });
});

describe('resetCompletionStages', () => {
  it('removes her items (held, deeded, painted-for-her orphans), her places when hers alone, facts, goals; retires seeds; clears stamps + wealth', async () => {
    const r = await resetCompletionStages('v', { id: 'gm', role: 'WATCHER' });
    expect(r.items).toBe(3);
    expect(db.campaignItem.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['i_held', 'i_deed', 'i_orphan'] } } });
    expect(r.placeEdges).toBe(1);
    expect(r.locations).toBe(2); // the home + its room
    expect(db.location.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['loc_home', 'loc_room'] }, campaignId: 'c1' } });
    expect(r.worldFacts).toBe(3);
    expect(db.worldFact.deleteMany).toHaveBeenCalledWith({ where: { campaignId: 'c1', subjectKey: { startsWith: 'violet' } } });
    expect(r.goals).toBe(2);
    expect(r.npcSeedsRetired).toBe(1);
    expect(db.character.update).toHaveBeenCalledWith({ where: { id: 'npc1' }, data: { status: 'RETIRED', seededFromId: null, name: 'Rosemary (old genesis)' } });
    const sheet = JSON.parse(db.character.update.mock.calls.at(-1)![0].data.data);
    expect(sheet._genesisStages).toBeUndefined();
    expect(sheet.wealth).toBeUndefined();
    expect(sheet.identity.age).toBe(25);
  });

  it('keeps a Location another character is linked to', async () => {
    db.entityRelationship.count.mockResolvedValueOnce(1);
    const r = await resetCompletionStages('v', { id: 'gm', role: 'WATCHER' });
    expect(r.locations).toBe(0);
    expect(db.location.deleteMany).not.toHaveBeenCalled();
  });
});
