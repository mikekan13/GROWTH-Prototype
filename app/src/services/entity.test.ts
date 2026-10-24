/**
 * listCampaignEntities — the Tapestry → Entities list. Perf contract (2026-10-23):
 * one Campaign lookup, ONE Character read (sheet `data` is never loaded twice),
 * completion computed from those same rows. Response shape unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, NotFoundError } from '@/lib/errors';

const db = vi.hoisted(() => ({
  campaign: null as Record<string, unknown> | null,
  chars: [] as Array<Record<string, unknown>>,
  sessions: [] as Array<{ goal: string; status: string }>,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  prisma: {
    campaign: { findUnique: vi.fn(async () => db.campaign) },
    character: {
      findMany: vi.fn(async ({ where }: { where: { entityType?: { not: string } } }) =>
        db.chars.filter(c => !where.entityType || c.entityType !== where.entityType.not)),
    },
    dayaWorkSession: {
      findMany: vi.fn(async ({ where }: { where: { OR?: Array<{ goal: { contains: string } }> } }) =>
        db.sessions.filter(s => !where.OR || where.OR.some(o => s.goal.includes(o.goal.contains)))),
    },
  },
}));
// Heavy neighbours listCampaignEntities never touches.
vi.mock('./character', () => ({ assignMechanics: vi.fn() }));
vi.mock('./goal', () => ({ createGoal: vi.fn() }));
vi.mock('./godhead-admin', () => ({ createPlaceholderGodHead: vi.fn() }));
vi.mock('./krma/crystallization', () => ({ crystallizeEntity: vi.fn() }));
vi.mock('./krma/evaluator', () => ({ calculateTKV: vi.fn() }));
vi.mock('./goal-custodian', () => ({ assignGoalCustodian: vi.fn() }));
vi.mock('./godhead-dispatcher', () => ({ emit: vi.fn() }));

const { listCampaignEntities } = await import('./entity');
const { prisma } = await import('@/lib/db');
const campaignFind = prisma.campaign.findUnique as unknown as ReturnType<typeof vi.fn>;
const characterFind = prisma.character.findMany as unknown as ReturnType<typeof vi.fn>;
const sessionFind = prisma.dayaWorkSession.findMany as unknown as ReturnType<typeof vi.fn>;

const at = new Date('2026-10-17T00:00:00Z');
const sheet = (seed: string, tkv: number) => JSON.stringify({ creation: { seed: { name: seed } }, tkv });
const genesis = (name: string, id: string) => `Character genesis: ${name} [${id}] — gestate.`;

beforeEach(() => {
  campaignFind.mockClear(); characterFind.mockClear(); sessionFind.mockClear();
  db.campaign = { id: 'c1', name: 'Hello World', gmUserId: 'gm', members: [{ userId: 'p1' }] };
  db.chars = [
    { id: 'v1', name: 'Violet', entityType: 'PLAYER_CHARACTER', status: 'ACTIVE', portrait: null,
      data: sheet('Human', 408), genesisTier: null, personaLock: null, userId: 'p1',
      user: { username: 'mike' }, goals: [{ id: 'g1' }, { id: 'g2' }], createdAt: at },
    { id: 'k1', name: 'Kristopher', entityType: 'NPC', status: 'DORMANT', portrait: 'p/k.png',
      data: 'not json', genesisTier: null, personaLock: null, userId: 'gm',
      user: { username: 'gm' }, goals: [], createdAt: at },
    { id: 'gh', name: 'JEWL', entityType: 'GODHEAD', status: 'ACTIVE', portrait: null,
      data: '{}', genesisTier: null, personaLock: null, userId: 'gm',
      user: { username: 'gm' }, goals: [], createdAt: at },
  ];
  db.sessions = [{ goal: genesis('Violet', 'v1'), status: 'done' }];
});

describe('listCampaignEntities', () => {
  it('reads each character once and the campaign once; shape unchanged', async () => {
    const out = await listCampaignEntities('c1', 'p1', 'TRAILBLAZER');

    expect(campaignFind).toHaveBeenCalledTimes(1);
    expect(characterFind).toHaveBeenCalledTimes(1);
    expect(sessionFind).toHaveBeenCalledTimes(1);
    // The one Character select carries what completion needs.
    const select = characterFind.mock.calls[0][0].select;
    expect(select).toMatchObject({ id: true, name: true, data: true, portrait: true, genesisTier: true, personaLock: { select: { id: true } } });

    expect(out).toEqual([
      { id: 'v1', name: 'Violet', entityType: 'PLAYER_CHARACTER', status: 'ACTIVE', portrait: null,
        seedName: 'Human', tkv: 408, stewarding: true, stewardName: 'mike', activeGoals: 2,
        createdAt: at.toISOString(), awaitingImage: true },
      { id: 'k1', name: 'Kristopher', entityType: 'NPC', status: 'DORMANT', portrait: 'p/k.png',
        seedName: null, tkv: null, stewarding: false, stewardName: null, activeGoals: 0,
        createdAt: at.toISOString(), awaitingImage: false },
    ]);
  });

  it('hides godheads outside Prime, shows them in Prime', async () => {
    expect((await listCampaignEntities('c1', 'gm', 'WATCHER')).map(e => e.id)).toEqual(['v1', 'k1']);
    db.campaign = { ...db.campaign!, name: '__PRIME__' };
    expect((await listCampaignEntities('c1', 'gm', 'WATCHER')).map(e => e.id)).toEqual(['v1', 'k1', 'gh']);
  });

  it('access: missing campaign → NotFound; stranger → Forbidden; admin passes', async () => {
    db.campaign = null;
    await expect(listCampaignEntities('nope', 'gm', 'WATCHER')).rejects.toBeInstanceOf(NotFoundError);
    db.campaign = { id: 'c1', name: 'Hello World', gmUserId: 'gm', members: [] };
    await expect(listCampaignEntities('c1', 'stranger', 'TRAILBLAZER')).rejects.toBeInstanceOf(ForbiddenError);
    expect(characterFind).not.toHaveBeenCalled();
    await expect(listCampaignEntities('c1', 'stranger', 'ADMIN')).resolves.toHaveLength(2);
  });
});
