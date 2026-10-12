/** GET /api/characters/[id]/blocks service — campaign-member gate, dedupe, age/TKV/memories/vines. */
import { describe, it, expect, vi } from 'vitest';
import { ForbiddenError, NotFoundError } from '@/lib/errors';

const sheet = {
  identity: { name: 'Violet' },
  fatedAge: 80,
  attributes: {
    clout: { level: 2, current: 2 }, celerity: { level: 3, current: 3 }, constitution: { level: 5, current: 5 },
    flow: { level: 7, current: 7 }, frequency: { level: 1, current: 1 }, focus: { level: 13, current: 13 },
    willpower: { level: 11, current: 11 }, wisdom: { level: 11, current: 11 }, wit: { level: 11, current: 11 },
  },
  creation: { seed: { name: 'Human', baseFateDie: 'd6' } },
  skills: [], traits: [], grovines: [],
};

vi.mock('@/lib/db', () => ({
  prisma: {
    character: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'violet' ? { id: 'violet', userId: 'owner', campaignId: 'c1', data: JSON.stringify(sheet) } : null),
    },
    campaign: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'c1' ? { id: 'c1', gmUserId: 'gm', adultOnly: false, currentCycle: 0 } : null),
    },
    campaignMember: {
      findUnique: vi.fn(async ({ where }: { where: { campaignId_userId: { userId: string } } }) =>
        where.campaignId_userId.userId === 'p1' ? { id: 'm1', status: 'ACTIVE' } : null),
    },
    characterBlockLink: {
      findMany: vi.fn(async () => [
        { id: 'l1', forgeItemId: 'seed', localName: null, story: 's', history: '[]', createdAt: new Date('2026-10-12T12:36:00Z') },
        { id: 'l2', forgeItemId: 'rootDraft', localName: null, story: 's', history: '[]', createdAt: new Date('2026-10-12T12:34:00Z') },
        { id: 'l3', forgeItemId: 'rootLive', localName: "Rosemary's House", story: 's', history: '[]', createdAt: new Date('2026-10-12T12:35:00Z') },
        { id: 'l4', forgeItemId: 'rootLive', localName: 'dup', story: 's', history: '[]', createdAt: new Date('2026-10-12T12:35:30Z') },
      ]),
    },
    forgeItem: {
      findMany: vi.fn(async () => [
        { id: 'seed', type: 'seed', name: 'Human', status: 'published', data: '{}', karmicValue: BigInt(225) },
        { id: 'rootDraft', type: 'root', name: 'Grandparent Household [w:y0d7]', status: 'superseded', data: '{}', karmicValue: BigInt(49) },
        { id: 'rootLive', type: 'root', name: 'Grandparent Household', status: 'published', data: '{"ageAdded":18}', karmicValue: BigInt(61) },
      ]),
    },
    goal: {
      findMany: vi.fn(async () => [
        { id: 'g1', description: 'Finish the novel', status: 'ACTIVE', resistancePlan: null, resistancePrompt: 'the door', opportunities: JSON.stringify([{ description: 'a reading', status: 'OPEN' }]), authoredBy: 'ai' },
      ]),
    },
    dayaMemoryEntry: {
      aggregate: vi.fn(async () => ({ _count: { _all: 57 }, _max: { realTime: new Date('2026-10-12T12:10:39Z') } })),
    },
  },
}));

const { getCharacterSheetFacts } = await import('./character-sheet-facts');

describe('getCharacterSheetFacts — permissions', () => {
  it('owner, campaign GM, campaign member and ADMIN may read', async () => {
    for (const u of [{ id: 'owner', role: 'TRAILBLAZER' }, { id: 'gm', role: 'WATCHER' }, { id: 'p1', role: 'TRAILBLAZER' }, { id: 'mike', role: 'ADMIN' }]) {
      await expect(getCharacterSheetFacts('violet', u)).resolves.toBeTruthy();
    }
  });
  it('a stranger and another Watcher are refused; a missing character 404s', async () => {
    await expect(getCharacterSheetFacts('violet', { id: 'x', role: 'TRAILBLAZER' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getCharacterSheetFacts('violet', { id: 'x', role: 'WATCHER' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getCharacterSheetFacts('nope', { id: 'mike', role: 'ADMIN' })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('getCharacterSheetFacts — shape', () => {
  it('dedupes by forgeItemId and hides the superseded draft root', async () => {
    const f = await getCharacterSheetFacts('violet', { id: 'gm', role: 'WATCHER' });
    expect(f.blocks.map(b => `${b.kind}:${b.displayName}`)).toEqual(['seed:Human', "root:Rosemary's House"]);
    expect(f.blocks[1]).toMatchObject({ archetypeName: 'Grandparent Household', kv: 61, linkId: 'l3' });
  });
  it('age is unknown (not 0) with fated 80; TKV computed when the sheet has none; memories; vines with AI marker', async () => {
    const f = await getCharacterSheetFacts('violet', { id: 'gm', role: 'WATCHER' });
    expect(f.age).toEqual({ value: null, source: null, fatedAge: 80 });
    expect(f.tkv).toBeGreaterThan(0);
    expect(f.memories).toEqual({ count: 57, lastAt: '2026-10-12T12:10:39.000Z' });
    expect(f.vines).toEqual([{ id: 'g1', goal: 'Finish the novel', resistance: 'the door', opportunity: 'a reading', status: 'ACTIVE', authoredBy: 'ai' }]);
  });
});
