/**
 * POST /api/campaigns/[id]/events — security (2026-10-09): members only; the campaign's GM/ADMIN posts for
 * any character as 'gm'; anyone else posts as 'player' and only for their OWN character (name from the record).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let currentUser: { id: string; role: string } = { id: 'gm', role: 'WATCHER' };

const created = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn(async () => ({ user: currentUser })) }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn() }));
vi.mock('@/services/perceived-feed', () => ({ feedViewerFor: vi.fn(), queryPerceivedFeed: vi.fn(), viewAsViewer: vi.fn() }));
vi.mock('@/services/inspection', () => ({ postInspectFromChat: vi.fn() }));
vi.mock('@/services/campaign-event', () => ({
  queryCampaignEvents: vi.fn(),
  createCampaignEvent: vi.fn(async (input: Record<string, unknown>) => {
    created.calls.push(input);
    return { id: 'new', type: input.type, createdAt: new Date(0), sessionId: null };
  }),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    campaign: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 'c1' ? { id: 'c1', gmUserId: 'gm' } : null)) },
    campaignMember: {
      findUnique: vi.fn(async ({ where }: { where: { campaignId_userId: { userId: string } } }) =>
        (['p1', 'p2'].includes(where.campaignId_userId.userId) ? { id: 'm' } : null)),
    },
    character: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
        violet: { id: 'violet', name: 'Violet', userId: 'p1', campaignId: 'c1' },
        danny: { id: 'danny', name: 'Danny', userId: 'p2', campaignId: 'c1' },
        ruth: { id: 'ruth', name: 'Ruth', userId: 'gm', campaignId: 'c1' },
        elsewhere: { id: 'elsewhere', name: 'Elsewhere', userId: 'p1', campaignId: 'c2' },
      } as Record<string, unknown>)[where.id] ?? null),
    },
  },
}));

const { POST } = await import('./route');
const { postInspectFromChat } = await import('@/services/inspection');

async function post(user: { id: string; role: string }, body: Record<string, unknown>) {
  currentUser = user;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await POST({ json: async () => body } as any, { params: Promise.resolve({ id: 'c1' }) });
  return { status: res.status, body: await res.json() };
}
const chat = (characterId?: string, characterName?: string) => ({
  type: 'chat', characterId, characterName, payload: { kind: 'chat', message: 'hello' },
});

beforeEach(() => { created.calls = []; vi.mocked(postInspectFromChat).mockClear(); });

describe('POST events — who may post', () => {
  it('a stranger (even a Watcher) is 403 and nothing is written', async () => {
    expect((await post({ id: 'x', role: 'WATCHER' }, chat())).status).toBe(403);
    expect((await post({ id: 'x', role: 'TRAILBLAZER' }, chat('violet'))).status).toBe(403);
    expect(created.calls).toHaveLength(0);
  });

  it('a Trailblazer may not post for another character, or their own in another campaign', async () => {
    expect((await post({ id: 'p1', role: 'TRAILBLAZER' }, chat('danny', 'Danny'))).status).toBe(403);
    expect((await post({ id: 'p1', role: 'TRAILBLAZER' }, chat('ruth', 'Ruth'))).status).toBe(403);
    expect((await post({ id: 'p1', role: 'TRAILBLAZER' }, chat('elsewhere'))).status).toBe(403);
    expect((await post({ id: 'p1', role: 'TRAILBLAZER' }, chat('nobody'))).status).toBe(403);
    expect(created.calls).toHaveLength(0);
  });

  it('a Trailblazer posts for their own character as player; the name comes from the record', async () => {
    const r = await post({ id: 'p1', role: 'TRAILBLAZER' }, chat('violet', 'Not Violet'));
    expect(r.status).toBe(201);
    expect(created.calls[0]).toMatchObject({ actor: 'player', characterId: 'violet', characterName: 'Violet' });
    expect(postInspectFromChat).toHaveBeenCalledWith('c1', expect.objectContaining({ id: 'p1' }), 'violet', 'hello');
  });

  it('a Trailblazer may post a characterless line (commands) but cannot attach a name to it', async () => {
    const r = await post({ id: 'p1', role: 'TRAILBLAZER' }, { type: 'command', characterName: 'Ruth', payload: { kind: 'command', input: '/x', result: 'y', success: false } });
    expect(r.status).toBe(201);
    expect(created.calls[0]).toMatchObject({ actor: 'player', characterId: undefined, characterName: undefined });
  });

  it('a Watcher of ANOTHER campaign who is a member here posts as a player, not the GM', async () => {
    expect((await post({ id: 'p2', role: 'WATCHER' }, chat('violet'))).status).toBe(403);
    const r = await post({ id: 'p2', role: 'WATCHER' }, chat('danny'));
    expect(r.status).toBe(201);
    expect(created.calls[0]).toMatchObject({ actor: 'player', characterId: 'danny' });
  });

  it('the campaign GM and ADMIN post for any character, as before', async () => {
    for (const u of [{ id: 'gm', role: 'WATCHER' }, { id: 'mike', role: 'ADMIN' }]) {
      created.calls = [];
      const r = await post(u, chat('danny', 'Danny (as told)'));
      expect(r.status).toBe(201);
      expect(created.calls[0]).toMatchObject({ actor: 'gm', characterId: 'danny', characterName: 'Danny (as told)' });
    }
  });

  it('unknown campaign → 404', async () => {
    currentUser = { id: 'gm', role: 'WATCHER' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST({ json: async () => chat() } as any, { params: Promise.resolve({ id: 'nope' }) });
    expect(res.status).toBe(404);
  });
});
