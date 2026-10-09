/**
 * Perception hardening — PRIVACY beyond the feed (PERCEPTION_FEED). Every member-readable route that returns
 * table / canon / event text: a Trailblazer receives only what concerns their own character (or their
 * character's perceived view); the campaign's Watcher and ADMIN keep the truth; flag OFF = as before.
 *   - GET /api/changelog                                   → own characters' rows only
 *   - GET /api/campaigns/[id]/history                      → own characters' perspective entries only
 *   - GET /api/campaigns/[id]/encounters/[encounterId]     → own log lines / slot entries, no scene narration
 * (GET /events: events/route.test.ts. SSE: lib/campaign-stream.test.ts. canon / reconcile / godhead-messages
 * are Watcher-only already; sessions carries names and times only.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let currentUser: { id: string; role: string; username: string } = { id: 'p1', role: 'TRAILBLAZER', username: 'p1' };

const w = vi.hoisted(() => ({
  changes: [] as Array<Record<string, unknown> & { characterId: string; createdAt: Date }>,
  history: [] as Array<{ id: string; campaignId: string; subjectType: string; subjectId: string; summary: string; visibility: string; timestampCycle: number; realTime: Date }>,
  encounterState: '',
  ruthIdentity: null as number | null,
}));

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn(async () => ({ user: currentUser })) }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn() }));
vi.mock('@/ai/network', () => ({ route: vi.fn(), anthropicChatText: vi.fn(), openAiCompatChat: vi.fn(), recordAiCall: vi.fn() }));
vi.mock('@/lib/db', () => {
  type In = string | { in: string[] } | undefined;
  const matches = (v: string, f: In) => f === undefined || (typeof f === 'string' ? v === f : f.in.includes(v));
  const OWN: Record<string, string[]> = { p1: ['violet'], p2: ['danny'] };
  const prisma = {
    campaign: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'c1' ? { id: 'c1', gmUserId: 'gm', currentCycle: 1 } : null) },
    campaignMember: { findUnique: async ({ where }: { where: { campaignId_userId: { userId: string } } }) => (['p1', 'p2'].includes(where.campaignId_userId.userId) ? { id: 'm' } : null) },
    character: {
      findFirst: async ({ where }: { where: { userId?: string; id?: string } }) => {
        if (where.id) { const u = Object.keys(OWN).find((k) => OWN[k].includes(where.id!)); return u ? { id: where.id, userId: u, entityType: 'PLAYER_CHARACTER' } : null; }
        return OWN[where.userId ?? ''] ? { id: OWN[where.userId!][0] } : null;
      },
      findMany: async ({ where }: { where: { userId?: string; id?: { in: string[] } } }) => {
        if (where.userId) return (OWN[where.userId] ?? []).map((id) => ({ id }));
        const all: Array<Record<string, unknown> & { id: string }> = [
          ...Object.entries(OWN).flatMap(([u, ids]) => ids.map((id) => ({ id, userId: u, entityType: 'PLAYER_CHARACTER', data: '{}' }))),
          { id: 'ruth', userId: 'gm', entityType: 'NPC', data: JSON.stringify({ _npc: { appearance: 'Tall woman in a grey coat. Scar.' } }) },
        ];
        return all.filter((c) => !where.id || where.id.in.includes(c.id));
      },
    },
    changeLog: {
      findMany: async ({ where, take }: { where: { characterId?: In }; take?: number }) => w.changes
        .filter((c) => matches(c.characterId, where.characterId))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, take ?? 1000),
    },
    historyEntry: {
      findMany: async ({ where }: { where: { subjectType?: string; subjectId?: In; visibility?: string } }) => w.history.filter((h) =>
        (!where.subjectType || h.subjectType === where.subjectType) && matches(h.subjectId, where.subjectId) && (!where.visibility || h.visibility === where.visibility)),
    },
    dayaEntity: { findMany: async ({ where }: { where: { characterId: { in: string[] } } }) => where.characterId.in.map((c) => ({ id: `ent-${c}` })) },
    familiarity: {
      findMany: async ({ where }: { where: { perceiverId: { in: string[] }; subjectId: { in: string[] } } }) => [
        { perceiverId: 'ent-violet', subjectId: 'ruth', aspectKind: 'attribute:clout', score: 0.99, lastCycle: null },
        { perceiverId: 'ent-violet', subjectId: 'ruth', aspectKind: 'attribute:wit', score: 0.45, lastCycle: null },
        ...(w.ruthIdentity === null ? [] : [{ perceiverId: 'ent-violet', subjectId: 'ruth', aspectKind: 'identity', score: w.ruthIdentity, lastCycle: null }]),
      ].filter((r) => where.perceiverId.in.includes(r.perceiverId) && where.subjectId.in.includes(r.subjectId)),
    },
    encounter: {
      findUnique: async () => ({ id: 'enc1', campaignId: 'c1', name: 'Alley', status: 'ACTIVE', round: 1, state: w.encounterState, campaign: { id: 'c1', gmUserId: 'gm' } }),
    },
  };
  return { prisma };
});

const changelogRoute = await import('./changelog/route');
const historyRoute = await import('./campaigns/[id]/history/route');
const encounterRoute = await import('./campaigns/[id]/encounters/[encounterId]/route');

const T = (s: number) => new Date(Date.UTC(2026, 9, 9, 12, 0, s));
const change = (id: string, characterId: string, description: string, s: number) => ({
  id, campaignId: 'c1', characterId, characterName: characterId, groupId: null, actor: 'gm', actorUserId: 'gm', category: 'attribute',
  description, changes: '[]', source: null, revertible: false, revertedAt: null, revertedBy: null, snapshotBefore: null, createdAt: T(s),
});

beforeEach(() => {
  w.ruthIdentity = null;
  w.changes = [change('ch1', 'violet', 'Violet: Clout 3 → 2', 1), change('ch2', 'danny', 'SECRET-DANNY Frequency 4 → 1', 2)];
  w.history = [
    { id: 'h1', campaignId: 'c1', subjectType: 'character', subjectId: 'violet', summary: 'Violet arrived at the alley', visibility: 'public', timestampCycle: 1, realTime: T(1) },
    { id: 'h2', campaignId: 'c1', subjectType: 'character', subjectId: 'danny', summary: 'SECRET-DANNY left town', visibility: 'public', timestampCycle: 1, realTime: T(2) },
    { id: 'h3', campaignId: 'c1', subjectType: 'location', subjectId: 'vault', summary: 'SECRET-VAULT opened at night', visibility: 'public', timestampCycle: 1, realTime: T(3) },
  ];
  w.encounterState = JSON.stringify({
    participants: [
      { id: 'violet', name: 'Violet', side: 'party', control: 'player', pools: { body: 2, spirit: 1, soul: 1 }, gauges: { celerity: 5, frequency: 4, wisdom: 3 }, attrs: { clout: { current: 6, max: 6 } }, downed: false },
      { id: 'ruth', name: 'Ruth', side: 'hostile', control: 'gm', pools: { body: 4, spirit: 3, soul: 2 }, gauges: { celerity: 777, frequency: 4, wisdom: 3 }, skills: [{ name: 'SECRET-SKILL', level: 9, governors: ['clout'] }],
        attrs: { clout: { current: 17, max: 23 }, wit: { current: 4, max: 9 }, wisdom: { current: 31, max: 33 } }, heldItemName: 'SECRET-BLADE', heldResist: 5, downed: false },
    ],
    intentions: [], lastPlan: {},
    sceneNarration: 'SECRET-SCENE the alley is trapped',
    rounds: [{
      round: 1, downed: ['ruth'],
      slots: [{ index: 0, entries: [{ participantId: 'violet', actionIndex: 0, intentionId: 'i1', speedScore: 3, speedTrace: 'v' }, { participantId: 'ruth', actionIndex: 0, intentionId: 'i2', speedScore: 9, speedTrace: 'SECRET-TRACE' }] }],
      log: [
        { slot: 0, kind: 'action', actorId: 'violet', targetId: 'ruth', text: 'Violet swings at Ruth', narration: 'Violet swings at Ruth' },
        { slot: 0, kind: 'action', actorId: 'ruth', targetId: null, text: 'SECRET-RUTH palms a vial (roll 17)' },
        { slot: 0, kind: 'note', actorId: null, targetId: null, text: 'SECRET-NOTE DR 12' },
      ],
    }],
  });
});
afterEach(() => { vi.unstubAllEnvs(); });

const as = (id: string, role: string) => { currentUser = { id, role, username: id }; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = (url: string) => ({ nextUrl: new URL(url) }) as any;

async function changelog(q = '') {
  const res = await changelogRoute.GET(req(`http://x/api/changelog?campaignId=c1${q}`));
  return { status: res.status, raw: JSON.stringify(await res.json()) };
}
async function history(q = '') {
  const res = await historyRoute.GET(req(`http://x/api/campaigns/c1/history?x=1${q}`), { params: Promise.resolve({ id: 'c1' }) });
  return { status: res.status, raw: JSON.stringify(await res.json()) };
}
async function encounter() {
  const res = await encounterRoute.GET(req('http://x/api/campaigns/c1/encounters/enc1'), { params: Promise.resolve({ id: 'c1', encounterId: 'enc1' }) });
  return { status: res.status, raw: JSON.stringify(await res.json()) };
}

describe('PRIVACY beyond the feed (PERCEPTION_FEED on)', () => {
  beforeEach(() => { vi.stubEnv('PERCEPTION_FEED', 'on'); });

  it('changelog: a Trailblazer gets only their own character\'s rows — even when asking for another\'s', async () => {
    as('p1', 'TRAILBLAZER');
    const all = await changelog();
    expect(all.status).toBe(200);
    expect(all.raw).toContain('Clout 3');
    expect(all.raw).not.toContain('SECRET-DANNY');
    const asked = await changelog('&characterId=danny');
    expect(asked.raw).not.toContain('SECRET-DANNY');
  });

  it('history: own character perspective only — no place\'s or other being\'s history', async () => {
    as('p1', 'TRAILBLAZER');
    const all = await history();
    expect(all.raw).toContain('Violet arrived');
    expect(all.raw).not.toContain('SECRET');
    expect((await history('&subjectType=location&subjectId=vault')).raw).not.toContain('SECRET-VAULT');
    expect((await history('&subjectType=character&subjectId=danny')).raw).not.toContain('SECRET-DANNY');
  });

  it('encounter: own log lines and slot entries in full; no other actor\'s line, no GM note, no scene narration', async () => {
    as('p1', 'TRAILBLAZER');
    const { status, raw } = await encounter();
    expect(status).toBe(200);
    expect(raw).toContain('Violet swings at Ruth');
    expect(raw).not.toContain('SECRET');
  });

  it('encounter: another participant\'s pools/attributes reach a Trailblazer only as their known aspect values', async () => {
    as('p1', 'TRAILBLAZER');
    const enc = JSON.parse((await encounter()).raw).encounter;
    const [violet, ruth] = enc.state.participants;
    expect(violet.attrs.clout.current).toBe(6); // own character in full
    expect(ruth.perceived).toBe(true);
    for (const k of ['pools', 'gauges', 'attrs', 'skills', 'heldItemName']) expect(ruth[k]).toBeUndefined();
    expect(ruth.known).toEqual([
      { aspect: 'attribute:clout', label: 'Clout', value: '17/23' }, // F5 → raw
      { aspect: 'attribute:wit', label: 'Wit', value: 'well beyond most, holding up' }, // F2 → loose
    ]);
    expect(JSON.stringify(ruth)).not.toContain('777');
    expect(JSON.stringify(ruth)).not.toContain('31'); // unknown Wisdom absent
  });

  it('encounter roster: another participant is named as the Trailblazer knows them — never the real name unless known', async () => {
    as('p1', 'TRAILBLAZER');
    const ruthSeen = async () => JSON.parse((await encounter()).raw).encounter.state.participants[1];
    let ruth = await ruthSeen(); // no identity familiarity → F0
    expect(ruth.name).toBe('a figure');
    expect(JSON.stringify(ruth)).not.toContain('Ruth');
    w.ruthIdentity = 0.45; // F2 → short description from what can be seen
    ruth = await ruthSeen();
    expect(ruth.name).toBe('a tall woman in a grey coat');
    expect(JSON.stringify(ruth)).not.toContain('Ruth');
    w.ruthIdentity = 0.99; // known → the name
    expect((await ruthSeen()).name).toBe('Ruth');
    // Own character keeps its own name.
    expect(JSON.parse((await encounter()).raw).encounter.state.participants[0].name).toBe('Violet');
  });

  it('encounter roster: the Watcher and ADMIN see real names; flag OFF a Trailblazer does too (unchanged)', async () => {
    for (const [id, role] of [['gm', 'WATCHER'], ['mike', 'ADMIN']]) {
      as(id, role);
      expect(JSON.parse((await encounter()).raw).encounter.state.participants[1].name).toBe('Ruth');
    }
    vi.stubEnv('PERCEPTION_FEED', '');
    vi.stubEnv('NEXT_PUBLIC_PERCEPTION_FEED', '');
    as('p1', 'TRAILBLAZER');
    expect(JSON.parse((await encounter()).raw).encounter.state.participants[1].name).toBe('Ruth');
  });

  it('unit 10: changelog viewed as a character — Watcher gets that character\'s rows; a Trailblazer cannot ask for another\'s', async () => {
    as('gm', 'WATCHER');
    const v = await changelog('&viewAs=danny');
    expect(v.raw).toContain('SECRET-DANNY');
    expect(v.raw).not.toContain('Clout 3');
    as('p1', 'TRAILBLAZER');
    const peek = await changelog('&viewAs=danny');
    expect(peek.status).toBe(403);
    expect(peek.raw).not.toContain('SECRET-DANNY');
  });

  it('the campaign\'s Watcher and ADMIN keep the truth on every route', async () => {
    for (const [id, role] of [['gm', 'WATCHER'], ['mike', 'ADMIN']]) {
      as(id, role);
      expect((await changelog()).raw).toContain('SECRET-DANNY');
      expect((await history()).raw).toContain('SECRET-VAULT');
      expect((await encounter()).raw).toContain('SECRET-RUTH');
    }
  });
});

describe('flag OFF: every route exactly as before', () => {
  beforeEach(() => { vi.stubEnv('PERCEPTION_FEED', ''); vi.stubEnv('NEXT_PUBLIC_PERCEPTION_FEED', ''); });

  it('a Trailblazer reads the same rows as before', async () => {
    as('p1', 'TRAILBLAZER');
    expect((await changelog()).raw).toContain('SECRET-DANNY');
    const h = await history();
    expect(h.raw).toContain('SECRET-VAULT');
    expect(h.raw).toContain('SECRET-DANNY');
    const e = await encounter();
    expect(e.raw).toContain('SECRET-RUTH');
    expect(e.raw).toContain('SECRET-SCENE');
  });

  it('history: a signed-in non-member gets 403 and no rows (membership check, independent of the flag)', async () => {
    as('stranger', 'TRAILBLAZER');
    const h = await history();
    expect(h.status).toBe(403);
    expect(h.raw).not.toContain('SECRET');
    expect(h.raw).not.toContain('Violet arrived');
    as('otherwatcher', 'WATCHER');
    expect((await history()).status).toBe(403);
  });
});
