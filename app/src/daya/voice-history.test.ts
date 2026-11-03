import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
const h = vi.hoisted(() => ({ rows: [] as Array<{ payload: string; sessionId: string | null; createdAt: Date; type: string }> }));
vi.mock('@/lib/db', () => ({
  prisma: {
    campaignEvent: {
      // Honours the where-fragment the code builds: type, sessionId, createdAt.gte, payload.contains.
      findMany: vi.fn(async ({ where, take }: { where: { type: string; sessionId?: string; createdAt?: { gte: Date }; payload?: { contains: string } }; take: number }) =>
        h.rows
          .filter((r) => r.type === where.type
            && (where.sessionId === undefined || r.sessionId === where.sessionId)
            && (!where.createdAt || r.createdAt >= where.createdAt.gte)
            && (!where.payload || r.payload.includes(where.payload.contains)))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, take)),
    },
    gameSession: { findFirst: vi.fn(async () => null) },
  },
}));

import { recentVoiceOf, recentCardTextsOf } from './voice-history';

const T = (ms: number) => new Date(1_000_000 + ms);
const thought = (thought: string, sessionId: string | null, at: number) => ({ type: 'being_thought', payload: JSON.stringify({ thought, scene: `scene ${thought}` }), sessionId, createdAt: T(at) });
const decl = (text: string, sessionId: string | null, at: number) => ({ type: 'game_event', payload: JSON.stringify({ monologues: [{ actorId: 'c1', text }] }), sessionId, createdAt: T(at) });

beforeEach(() => {
  h.rows = [thought('replay', null, 10), thought('old session', 's1', 20), thought('now', 's2', 30), decl('old decl', 's1', 21), decl('now decl', 's2', 31), decl('replay decl', null, 11)];
});

describe('recentVoiceOf bound', () => {
  it('no opts = old behaviour (everything counts)', async () => {
    const out = await recentVoiceOf('camp', 'c1', 10);
    expect(out).toEqual(expect.arrayContaining(['replay', 'old session', 'now', 'old decl', 'now decl', 'replay decl']));
  });
  it('a sessionId excludes null and other-session rows, declarations too', async () => {
    const out = await recentVoiceOf('camp', 'c1', 10, { sessionId: 's2' });
    expect(out).toEqual(['now', 'now decl']);
  });
  it('since excludes older rows, declarations too', async () => {
    const out = await recentVoiceOf('camp', 'c1', 10, { since: T(25) });
    expect(out).toEqual(['now', 'now decl']);
  });
});

describe('recentCardTextsOf bound', () => {
  it('honours sessionId and since', async () => {
    expect(await recentCardTextsOf('camp', 'c1', 10, { sessionId: 's2' })).toEqual(['scene now']);
    expect(await recentCardTextsOf('camp', 'c1', 10, { since: T(15) })).toEqual(['scene now', 'scene old session']);
    expect((await recentCardTextsOf('camp', 'c1', 10)).length).toBe(3);
  });
});
