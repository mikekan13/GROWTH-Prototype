/** POST /api/campaigns/[id]/skill-check — security (2026-10-09): only the campaign's GM (or ADMIN) calls a check. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let currentUser: { id: string; role: string } = { id: 'gm', role: 'WATCHER' };

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn(async () => ({ user: currentUser })) }));
vi.mock('@/services/inspection', () => ({ commitPlanningBoardOnGmMove: vi.fn() }));
vi.mock('@/services/skill-check', async () => {
  const { z } = await import('zod');
  return {
    initiateSkillCheckSchema: z.object({ characterId: z.string(), skillName: z.string().optional(), attributeName: z.string().optional(), dr: z.number() }),
    initiateSkillCheck: vi.fn(async () => ({ checkId: 'chk', sdDie: 'd4', sdResult: 2, difficultyHint: 'blue', characterName: 'Violet', skillName: 'Lore' })),
  };
});
vi.mock('@/lib/db', () => ({
  prisma: {
    campaign: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 'c1' ? { id: 'c1', gmUserId: 'gm' } : null)) },
    campaignMember: { findUnique: vi.fn(async () => ({ id: 'm' })) },
  },
}));

const { POST } = await import('./route');
const { initiateSkillCheck } = await import('@/services/skill-check');
const { commitPlanningBoardOnGmMove } = await import('@/services/inspection');

async function post(user: { id: string; role: string }, campaignId = 'c1') {
  currentUser = user;
  const body = { characterId: 'violet', skillName: 'Lore', dr: 5 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await POST({ json: async () => body } as any, { params: Promise.resolve({ id: campaignId }) });
  return res.status;
}

beforeEach(() => { vi.mocked(initiateSkillCheck).mockClear(); vi.mocked(commitPlanningBoardOnGmMove).mockClear(); });

describe('POST skill-check — GM only', () => {
  it('the campaign GM and ADMIN start a check (and commit the planning board), as before', async () => {
    expect(await post({ id: 'gm', role: 'WATCHER' })).toBe(201);
    expect(await post({ id: 'mike', role: 'ADMIN' })).toBe(201);
    expect(initiateSkillCheck).toHaveBeenCalledTimes(2);
    expect(initiateSkillCheck).toHaveBeenCalledWith('c1', { id: 'gm', username: undefined }, expect.objectContaining({ characterId: 'violet', dr: 5 }));
    expect(commitPlanningBoardOnGmMove).toHaveBeenCalledTimes(2);
  });

  it('a member Trailblazer (even for their own character), another Watcher and a stranger get 403 — no check starts', async () => {
    expect(await post({ id: 'p1', role: 'TRAILBLAZER' })).toBe(403);
    expect(await post({ id: 'w2', role: 'WATCHER' })).toBe(403);
    expect(await post({ id: 'x', role: 'TRAILBLAZER' })).toBe(403);
    expect(initiateSkillCheck).not.toHaveBeenCalled();
    expect(commitPlanningBoardOnGmMove).not.toHaveBeenCalled();
  });

  it('unknown campaign → 404', async () => {
    expect(await post({ id: 'gm', role: 'WATCHER' }, 'nope')).toBe(404);
  });
});
