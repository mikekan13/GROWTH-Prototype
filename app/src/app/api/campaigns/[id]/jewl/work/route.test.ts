/** GET JEWL's work screen payload — the campaign's GM or ADMIN only (2026-10-12). */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let currentUser: { id: string; role: string } | null = { id: 'gm', role: 'WATCHER' };
const sessionsQuery = vi.fn(async () => [] as unknown[]);

vi.mock('@/lib/auth', async () => {
  const { AuthError } = await import('@/lib/errors');
  return {
    requireAuth: vi.fn(async () => {
      if (!currentUser) throw new AuthError();
      return { user: currentUser };
    }),
  };
});
vi.mock('@/lib/db', () => ({
  prisma: {
    campaign: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'c1' ? { id: 'c1', gmUserId: 'gm' } : null),
    },
    dayaWorkSession: { findMany: (...a: unknown[]) => sessionsQuery(...(a as [])) },
    reconciliation: { findMany: vi.fn(async () => []) },
  },
}));

const { GET } = await import('./route');

function get(campaignId: string) {
  const req = new Request(`http://x/api/campaigns/${campaignId}/jewl/work`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return GET(req as any, { params: Promise.resolve({ id: campaignId }) });
}

describe('GET /api/campaigns/[id]/jewl/work', () => {
  beforeEach(() => { sessionsQuery.mockClear(); });

  it('the campaign GM and ADMIN get the payload (idle: no sessions, nothing needs you)', async () => {
    for (const u of [{ id: 'gm', role: 'WATCHER' }, { id: 'mike', role: 'ADMIN' }]) {
      currentUser = u;
      const res = await get('c1');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ sessions: [], needsYou: [], recentLog: [], cycling: false });
    }
    expect(sessionsQuery).toHaveBeenCalledTimes(2);
  });

  it('a player, another Watcher and a stranger get 403 and nothing is read', async () => {
    for (const u of [{ id: 'p1', role: 'TRAILBLAZER' }, { id: 'w2', role: 'WATCHER' }]) {
      currentUser = u;
      expect((await get('c1')).status).toBe(403);
    }
    currentUser = null;
    expect((await get('c1')).status).toBe(401);
    expect(sessionsQuery).not.toHaveBeenCalled();
  });

  it('an unknown campaign is 404', async () => {
    currentUser = { id: 'gm', role: 'WATCHER' };
    expect((await get('nope')).status).toBe(404);
  });
});
