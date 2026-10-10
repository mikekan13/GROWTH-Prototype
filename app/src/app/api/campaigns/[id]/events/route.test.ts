/**
 * GET /api/campaigns/[id]/events — perception unit 9 (per-viewer feed, PERCEPTION_FEED).
 * PRIVACY: a Trailblazer's response carries NO text of a line their character did not perceive —
 * the server builds it from the character's memory; nothing is shipped and hidden on the client.
 * Flag OFF: the response is exactly the truth record, as before.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let currentUser: { id: string; role: string } = { id: 'p1', role: 'TRAILBLAZER' };

const T = (s: number) => new Date(Date.UTC(2026, 9, 9, 12, 0, s));

const w = vi.hoisted(() => ({
  campaignEvents: [] as Array<Record<string, unknown> & { id: string; createdAt: Date; payload: string; characterId: string | null; actorUserId: string; actor: string; type: string }>,
  canon: [] as Array<{ id: string; campaignId: string; kind: string; narration: string; detail: string; actorId: string | null; sourceType: string | null; createdAt: Date; cycle: number }>,
  memories: [] as Array<{ id: string; entityId: string; truthRef: string | null; chain: string; noticed: boolean; perceivedVia: string; visibleForm: string | null; realTime: Date }>,
}));

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn(async () => ({ user: currentUser })) }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn() }));
vi.mock('@/services/history', () => ({ currentCycleOf: async () => 1 }));
vi.mock('@/ai/network', () => ({ route: vi.fn(), anthropicChatText: vi.fn(), openAiCompatChat: vi.fn(), recordAiCall: vi.fn() }));
vi.mock('@/lib/db', () => {
  type Where = Record<string, unknown>;
  const matchEvent = (e: (typeof w.campaignEvents)[number], where: Where): boolean => {
    if (where.campaignId && e.campaignId !== where.campaignId) return false;
    if (where.type && typeof where.type === 'string' && e.type !== where.type) return false;
    if (where.characterId !== undefined && e.characterId !== where.characterId) return false;
    if (where.actorUserId !== undefined && e.actorUserId !== where.actorUserId) return false;
    if (where.actor !== undefined && e.actor !== where.actor) return false;
    const pc = (where.payload as { contains?: string } | undefined)?.contains;
    if (pc && !e.payload.includes(pc)) return false;
    if (Array.isArray(where.OR) && !(where.OR as Where[]).some((o) => matchEvent(e, o))) return false;
    return true;
  };
  const prisma = {
    campaign: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'c1' ? { id: 'c1', gmUserId: 'gm', currentCycle: 1 } : null) },
    campaignMember: { findUnique: async ({ where }: { where: { campaignId_userId: { userId: string } } }) => (['p1', 'p2'].includes(where.campaignId_userId.userId) ? { id: 'm' } : null) },
    character: {
      findFirst: async ({ where }: { where: { userId?: string; id?: string; campaignId?: string } }) => {
        if (where.id) return ({ violet: { id: 'violet', userId: 'p1', entityType: 'PLAYER_CHARACTER' }, danny: { id: 'danny', userId: 'p2', entityType: 'PLAYER_CHARACTER' }, ruth: { id: 'ruth', userId: 'gm', entityType: 'NPC' } } as Record<string, unknown>)[where.id] ?? null;
        return ({ p1: { id: 'violet' }, p2: { id: 'danny' } } as Record<string, { id: string }>)[where.userId ?? ''] ?? null;
      },
      findMany: async () => [
        { id: 'violet', name: 'Violet', data: '{}', entityType: 'PLAYER_CHARACTER' },
        { id: 'danny', name: 'Danny', data: '{}', entityType: 'PLAYER_CHARACTER' },
        { id: 'ruth', name: 'Ruth', data: JSON.stringify({ _npc: { appearance: 'Tall woman in a coat' } }), entityType: 'NPC' },
      ],
    },
    campaignItem: { findMany: async () => [] },
    location: { findMany: async () => [] },
    familiarity: { findMany: async () => [{ subjectId: 'ruth', aspectKind: 'identity', score: 0.7, lastCycle: null }] },
    gameSession: { findMany: async () => [], findFirst: async () => null },
    dayaEntity: { findUnique: async ({ where }: { where: { characterId: string } }) => (where.characterId === 'violet' ? { id: 'ent-v' } : null) },
    canonEvent: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => w.canon.filter((c) => where.id.in.includes(c.id)) },
    dayaMemoryEntry: {
      findMany: async ({ where }: { where: { id?: { in: string[] }; entityId?: string; noticed?: boolean; truthRef?: unknown } }) => w.memories.filter((m) =>
        (!where.id || where.id.in.includes(m.id)) && (!where.entityId || m.entityId === where.entityId)
        && (where.noticed === undefined || m.noticed === where.noticed) && (!where.truthRef || m.truthRef !== null)),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(w.memories.find((m) => m.id === where.id)!, data),
    },
    campaignEvent: {
      findMany: async ({ where, take }: { where: Where; take?: number }) => w.campaignEvents
        .filter((e) => matchEvent(e, where))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, take ?? 1000),
    },
  };
  return { prisma };
});

const { GET } = await import('./route');
const { queryCampaignEvents } = await import('@/services/campaign-event');

const ev = (id: string, s: number, type: string, actor: string, actorUserId: string, characterId: string | null, payload: Record<string, unknown>) => ({
  id, campaignId: 'c1', sessionId: null, type, actor, actorUserId, actorName: actorUserId, characterId, characterName: characterId, payload: JSON.stringify(payload), createdAt: T(s),
});

beforeEach(() => {
  w.campaignEvents = [
    ev('e1', 1, 'game_event', 'gm', 'gm', null, { kind: 'game_event', eventType: 'declaration', description: 'Ruth opens the door.' }),
    ev('e2', 2, 'chat', 'player', 'p2', 'danny', { kind: 'chat', message: 'SECRET-PLAN the vault code is 4471' }),
    ev('e3', 3, 'game_event', 'gm', 'gm', null, { kind: 'game_event', eventType: 'declaration', description: 'Ruth whispers SECRET-WHISPER to the cat.' }),
    ev('e4', 4, 'chat', 'player', 'p1', 'violet', { kind: 'chat', message: 'I wave.' }),
    ev('e5', 0, 'game_event', 'system', 'gm', null, { kind: 'game_event', eventType: 'session_start', description: 'Session 1' }),
  ];
  w.canon = [
    { id: 'k1', campaignId: 'c1', kind: 'declaration', narration: 'Ruth opens the door.', detail: '{}', actorId: null, sourceType: 'gm', createdAt: T(1), cycle: 1 },
    { id: 'k2', campaignId: 'c1', kind: 'dialogue', narration: 'SECRET-PLAN the vault code is 4471', detail: JSON.stringify({ message: 'SECRET-PLAN the vault code is 4471' }), actorId: 'danny', sourceType: 'table', createdAt: T(2), cycle: 1 },
    { id: 'k3', campaignId: 'c1', kind: 'declaration', narration: 'Ruth whispers SECRET-WHISPER to the cat.', detail: '{}', actorId: null, sourceType: 'gm', createdAt: T(3), cycle: 1 },
    { id: 'k4', campaignId: 'c1', kind: 'dialogue', narration: 'I wave.', detail: JSON.stringify({ message: 'I wave.' }), actorId: 'violet', sourceType: 'table', createdAt: T(4), cycle: 1 },
  ];
  // Violet perceived k1; k2 never reached her (no row); k3 reached but went unnoticed; k4 is her own line.
  w.memories = [
    { id: 'm1', entityId: 'ent-v', truthRef: 'k1', chain: JSON.stringify({ truthRefs: ['k1'] }), noticed: true, perceivedVia: '["sight","hearing"]', visibleForm: null, realTime: T(5) },
    { id: 'm3', entityId: 'ent-v', truthRef: 'k3', chain: JSON.stringify({ truthRefs: ['k3'] }), noticed: false, perceivedVia: '["hearing"]', visibleForm: null, realTime: T(6) },
    { id: 'm4', entityId: 'ent-v', truthRef: 'k4', chain: JSON.stringify({ truthRefs: ['k4'] }), noticed: true, perceivedVia: '["self"]', visibleForm: null, realTime: T(7) },
  ];
});
afterEach(() => { vi.unstubAllEnvs(); });

async function get(user: { id: string; role: string }, extra = '') {
  currentUser = user;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await GET({ nextUrl: new URL(`http://x/api/campaigns/c1/events?limit=50${extra}`) } as any, { params: Promise.resolve({ id: 'c1' }) });
  return { status: res.status, body: await res.json() as { events: Array<{ id: string; type: string; payload: Record<string, unknown> }>; nextCursor: string | null; perceived?: boolean; viewAs?: string } };
}

describe('GET events — per-viewer feed (PERCEPTION_FEED)', () => {
  it('PRIVACY: a Trailblazer receives no text of a line their character did not perceive', async () => {
    vi.stubEnv('PERCEPTION_FEED', 'on');
    const { status, body } = await get({ id: 'p1', role: 'TRAILBLAZER' });
    expect(status).toBe(200);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('SECRET-PLAN');   // never reached her
    expect(raw).not.toContain('4471');
    expect(raw).not.toContain('SECRET-WHISPER'); // reached, unnoticed
    expect(body.perceived).toBe(true);
    // What she did perceive: her memory's view of it (Ruth known by name at F3).
    expect(raw).toContain('opens the door.');
    expect(body.events.some((e) => e.id.startsWith('pm-m1-'))).toBe(true);
    // Her own line, in full, once (her memory of saying it is not a second line).
    expect(body.events.filter((e) => JSON.stringify(e.payload).includes('I wave.'))).toHaveLength(1);
    // Session markers carry no diegetic text and stay.
    expect(body.events.some((e) => e.id === 'e5')).toBe(true);
    // Every other event id from the truth record is absent.
    expect(body.events.map((e) => e.id)).not.toEqual(expect.arrayContaining(['e1']));
    expect(body.events.map((e) => e.id)).not.toEqual(expect.arrayContaining(['e2']));
    expect(body.events.map((e) => e.id)).not.toEqual(expect.arrayContaining(['e3']));
  });

  it('the campaign\'s Watcher and ADMIN keep the truth record; a GODHEAD not seated here does not', async () => {
    vi.stubEnv('PERCEPTION_FEED', 'on');
    const gm = await get({ id: 'gm', role: 'WATCHER' });
    expect(JSON.stringify(gm.body)).toContain('SECRET-PLAN');
    expect(gm.body.perceived).toBeUndefined();
    const admin = await get({ id: 'mike', role: 'ADMIN' });
    expect(JSON.stringify(admin.body)).toContain('SECRET-WHISPER');
    const godhead = await get({ id: 'p2', role: 'GODHEAD' }); // a member, not the seat
    expect(godhead.body.perceived).toBe(true);
    expect(JSON.stringify(godhead.body)).not.toContain('SECRET-WHISPER');
  });

  it('flag OFF: a Trailblazer gets exactly the truth record, as before', async () => {
    vi.stubEnv('PERCEPTION_FEED', '');
    vi.stubEnv('NEXT_PUBLIC_PERCEPTION_FEED', '');
    const { body } = await get({ id: 'p1', role: 'TRAILBLAZER' });
    const direct = await queryCampaignEvents({ campaignId: 'c1', limit: 50 });
    expect(body).toEqual(JSON.parse(JSON.stringify(direct)));
    expect(body.perceived).toBeUndefined();
  });

  it('unit 10: the Watcher (and ADMIN) viewing as a character get exactly that character\'s feed', async () => {
    vi.stubEnv('PERCEPTION_FEED', 'on');
    const mine = await get({ id: 'p1', role: 'TRAILBLAZER' });
    for (const u of [{ id: 'gm', role: 'WATCHER' }, { id: 'mike', role: 'ADMIN' }]) {
      const as = await get(u, '&viewAs=violet');
      expect(as.status).toBe(200);
      expect(as.body.perceived).toBe(true);
      expect(as.body.viewAs).toBe('violet');
      expect(JSON.stringify(as.body)).not.toContain('SECRET');
      expect(as.body.events).toEqual(mine.body.events); // the same server path a Trailblazer reads
    }
  });

  it('unit 10: only the campaign\'s Watcher or ADMIN may view as another character', async () => {
    vi.stubEnv('PERCEPTION_FEED', 'on');
    const peek = await get({ id: 'p1', role: 'TRAILBLAZER' }, '&viewAs=danny');
    expect(peek.status).toBe(403);
    expect(JSON.stringify(peek.body)).not.toContain('SECRET');
    const otherWatcher = await get({ id: 'p2', role: 'WATCHER' }, '&viewAs=violet'); // a Watcher, not this campaign's
    expect(otherWatcher.status).toBe(403);
    expect((await get({ id: 'p1', role: 'TRAILBLAZER' }, '&viewAs=violet')).status).toBe(200); // one's own = the default
    expect((await get({ id: 'gm', role: 'WATCHER' }, '&viewAs=nobody')).status).toBe(404);
  });

  it('unit 10: viewing as an NPC carries no player\'s lines; flag OFF ignores viewAs', async () => {
    vi.stubEnv('PERCEPTION_FEED', 'on');
    const npc = await get({ id: 'gm', role: 'WATCHER' }, '&viewAs=ruth');
    expect(npc.status).toBe(200);
    expect(JSON.stringify(npc.body)).not.toContain('SECRET-PLAN');
    expect(JSON.stringify(npc.body)).not.toContain('I wave.');
    vi.stubEnv('PERCEPTION_FEED', '');
    vi.stubEnv('NEXT_PUBLIC_PERCEPTION_FEED', '');
    const off = await get({ id: 'gm', role: 'WATCHER' }, '&viewAs=violet');
    expect(off.body).toEqual(JSON.parse(JSON.stringify(await queryCampaignEvents({ campaignId: 'c1', limit: 50 }))));
  });

  it('NEXT_PUBLIC_PERCEPTION_FEED alone turns the server side on too (one shared switch)', async () => {
    vi.stubEnv('NEXT_PUBLIC_PERCEPTION_FEED', 'on');
    const { body } = await get({ id: 'p1', role: 'TRAILBLAZER' });
    expect(body.perceived).toBe(true);
    expect(JSON.stringify(body)).not.toContain('SECRET-PLAN');
  });
});
