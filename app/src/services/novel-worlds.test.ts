/** NOVEL WORLDS (2026-10-16): a published novel on her shelf is the doorway to a session-0 campaign. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db, grant, createCamp, consent } = vi.hoisted(() => ({
  db: {
    character: { findUnique: vi.fn() },
    campaignItem: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    campaign: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    entityRelationship: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  grant: vi.fn(),
  createCamp: vi.fn(),
  consent: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('./campaign', () => ({ createCampaign: (...a: unknown[]) => createCamp(...a) }));
vi.mock('./consent', () => ({ getUserTrainingConsent: (...a: unknown[]) => consent(...a) }));
vi.mock('./genesis-possessions', () => ({ DEED_RELATIONSHIP: 'owns', grantPossession: (...a: unknown[]) => grant(...a) }));

import { createNovelWorld, listNovelWorlds, novelWorldsBriefLine, NOVEL_ARCHETYPE } from './novel-worlds';

const GM = { id: 'mike', role: 'ADMIN' };
const VIOLET = { id: 'v', name: 'Violet', campaignId: 'home', campaign: { id: 'home', gmUserId: 'mike', networkMode: 'META' } };

beforeEach(() => {
  vi.clearAllMocks();
  db.character.findUnique.mockResolvedValue(VIOLET);
  grant.mockResolvedValue({ ok: true, itemId: 'book1', name: 'The Ashwood Crown', archetype: NOVEL_ARCHETYPE, tier: 'owned', source: 'campaign', inside: 'The reading corner shelf' });
  db.campaignItem.findUnique.mockResolvedValue({ id: 'book1', data: JSON.stringify({ weightLbs: 0.8 }) });
  db.campaign.findMany.mockResolvedValue([]);
  db.campaign.findUnique.mockResolvedValue({ aiSettings: null });
  createCamp.mockResolvedValue({ id: 'world1' });
  consent.mockResolvedValue(true);
});

describe('createNovelWorld', () => {
  it('paints the novel on her shelf, opens a session-0 world for the Watcher, and links both ways', async () => {
    const r = await createNovelWorld(GM, { authorCharacterId: 'v', title: 'The Ashwood Crown', shelfLocation: 'The reading corner shelf' });
    expect(r).toEqual({ title: 'The Ashwood Crown', itemId: 'book1', campaignId: 'world1', created: true, inside: 'The reading corner shelf' });

    const [campId, actor, g] = grant.mock.calls[0];
    expect(campId).toBe('home');
    expect(actor).toBe(GM);
    expect(g).toMatchObject({ characterId: 'v', item: 'Published Novel', tier: 'owned', localName: 'The Ashwood Crown', location: 'The reading corner shelf', allowDuplicate: true });
    expect(g.story).toMatch(/published novel «The Ashwood Crown»/);

    const [owner, role, input] = createCamp.mock.calls[0];
    expect(owner).toBe('mike');
    expect(role).toBe('ADMIN');
    expect(input).toMatchObject({ name: 'The Ashwood Crown', networkMode: 'META' });
    expect(input.description).toBe("A world of Violet's novel «The Ashwood Crown». Session 0 — nothing is written yet; the story is the Watcher's.");

    const itemData = JSON.parse(db.campaignItem.update.mock.calls[0][0].data.data);
    expect(itemData).toMatchObject({ weightLbs: 0.8, linkedCampaignId: 'world1', doorway: true });
    const ai = JSON.parse(db.campaign.update.mock.calls[0][0].data.aiSettings);
    expect(ai.sourceNovel).toEqual({ characterId: 'v', itemId: 'book1', title: 'The Ashwood Crown' });
  });

  it('is idempotent: a doorway already linked reuses its world, creates nothing', async () => {
    db.campaignItem.findUnique.mockResolvedValue({ id: 'book1', data: JSON.stringify({ linkedCampaignId: 'world1', doorway: true }) });
    db.campaign.findUnique.mockResolvedValue({ id: 'world1', aiSettings: JSON.stringify({ sourceNovel: { characterId: 'v', itemId: 'book1', title: 'The Ashwood Crown' } }) });
    const r = await createNovelWorld(GM, { authorCharacterId: 'v', title: 'The Ashwood Crown' });
    expect(r).toMatchObject({ campaignId: 'world1', created: false });
    expect(createCamp).not.toHaveBeenCalled();
    expect(db.campaignItem.update).not.toHaveBeenCalled();
  });

  it('finds the world by its sourceNovel when the item lost its link', async () => {
    db.campaign.findMany.mockResolvedValue([
      { id: 'other', aiSettings: JSON.stringify({ sourceNovel: { characterId: 'v', title: 'What the River Kept' } }) },
      { id: 'world1', aiSettings: JSON.stringify({ sourceNovel: { characterId: 'v', title: 'The Ashwood Crown' } }) },
    ]);
    const r = await createNovelWorld(GM, { authorCharacterId: 'v', title: 'The Ashwood Crown' });
    expect(r).toMatchObject({ campaignId: 'world1', created: false });
    expect(createCamp).not.toHaveBeenCalled();
  });

  it('never assumes consent: a Watcher without it gets a DISCONNECTED world', async () => {
    consent.mockResolvedValue(false);
    await createNovelWorld(GM, { authorCharacterId: 'v', title: 'The Salt and the Star' });
    expect(consent).toHaveBeenCalledWith('mike');
    expect(createCamp.mock.calls[0][2]).toMatchObject({ networkMode: 'DISCONNECTED' });
  });

  it('only her Watcher or ADMIN may open a world', async () => {
    await expect(createNovelWorld({ id: 'someone', role: 'TRAILBLAZER' }, { authorCharacterId: 'v', title: 'X' })).rejects.toThrow(/Watcher/);
    expect(grant).not.toHaveBeenCalled();
  });

  it('a failed grant creates no campaign', async () => {
    grant.mockResolvedValue({ ok: false, reason: 'No Location or container item' });
    await expect(createNovelWorld(GM, { authorCharacterId: 'v', title: 'X', shelfLocation: 'nowhere' })).rejects.toThrow(/Could not place/);
    expect(createCamp).not.toHaveBeenCalled();
  });
});

describe('listNovelWorlds / brief line', () => {
  it('lists only deeded doorway items, and renders the brief line', async () => {
    db.entityRelationship.findMany.mockResolvedValue([{ targetId: 'book1' }, { targetId: 'mug' }]);
    db.campaignItem.findMany.mockResolvedValue([
      { id: 'book1', name: 'The Ashwood Crown', data: JSON.stringify({ doorway: true, linkedCampaignId: 'world1' }) },
      { id: 'mug', name: 'Mug', data: JSON.stringify({}) },
    ]);
    expect(await listNovelWorlds('v')).toEqual([{ title: 'The Ashwood Crown', itemId: 'book1', campaignId: 'world1' }]);
    expect(await novelWorldsBriefLine('v')).toMatch(/HER NOVELS ARE WORLDS.*«The Ashwood Crown» → campaign world1 \(session 0\)/);
  });

  it('no novels → null', async () => {
    db.entityRelationship.findMany.mockResolvedValue([]);
    expect(await novelWorldsBriefLine('v')).toBeNull();
  });
});
