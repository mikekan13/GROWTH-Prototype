/** POST start/end session — the campaign's GM or ADMIN only (2026-10-08). */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let currentUser: { id: string; role: string } = { id: 'gm', role: 'WATCHER' };

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(async () => ({ user: currentUser })),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    campaign: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'c1' ? { id: 'c1', gmUserId: 'gm' } : null),
    },
    campaignMember: {
      findUnique: vi.fn(async ({ where }: { where: { campaignId_userId: { userId: string } } }) =>
        where.campaignId_userId.userId === 'p1' ? { id: 'm1' } : null),
    },
  },
}));
const startSession = vi.fn(async () => ({ id: 's1', number: 1 }));
const endSession = vi.fn(async () => ({ id: 's1', number: 1 }));
vi.mock('@/services/campaign-event', () => ({
  startSession: (...a: unknown[]) => startSession(...(a as [])),
  endSession: (...a: unknown[]) => endSession(...(a as [])),
  listSessions: vi.fn(async () => []),
  getActiveSession: vi.fn(async () => null),
}));

const { POST } = await import('./route');

function post(campaignId: string, action: 'start' | 'end') {
  const req = new Request(`http://x/api/campaigns/${campaignId}/sessions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return POST(req as any, { params: Promise.resolve({ id: campaignId }) });
}

describe('POST /api/campaigns/[id]/sessions', () => {
  beforeEach(() => { startSession.mockClear(); endSession.mockClear(); });

  it('the GM and ADMIN can start and end', async () => {
    currentUser = { id: 'gm', role: 'WATCHER' };
    expect((await post('c1', 'start')).status).toBe(201);
    expect((await post('c1', 'end')).status).toBe(200);
    currentUser = { id: 'mike', role: 'ADMIN' };
    expect((await post('c1', 'start')).status).toBe(201);
    expect(startSession).toHaveBeenCalledTimes(2);
  });

  it('a member, another Watcher and a stranger get 403 and nothing happens', async () => {
    for (const u of [{ id: 'p1', role: 'TRAILBLAZER' }, { id: 'w2', role: 'WATCHER' }, { id: 'x', role: 'TRAILBLAZER' }]) {
      currentUser = u;
      expect((await post('c1', 'start')).status).toBe(403);
      expect((await post('c1', 'end')).status).toBe(403);
    }
    expect(startSession).not.toHaveBeenCalled();
    expect(endSession).not.toHaveBeenCalled();
  });

  it('a missing campaign is 404', async () => {
    currentUser = { id: 'mike', role: 'ADMIN' };
    expect((await post('nope', 'start')).status).toBe(404);
    expect(startSession).not.toHaveBeenCalled();
  });
});
