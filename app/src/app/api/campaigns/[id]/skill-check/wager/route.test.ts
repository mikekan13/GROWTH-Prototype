/**
 * POST /api/campaigns/[id]/skill-check/wager — security (2026-10-09): a rejected wager (not yours, wrong
 * campaign, bad governor) must leave the pending check intact; the owner's wager still resolves it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let currentUser: { id: string; role: string } = { id: 'p1', role: 'TRAILBLAZER' };

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn(async () => ({ user: currentUser })) }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn() }));
vi.mock('@/lib/dice', () => ({ rollDie: vi.fn(() => 3) }));
vi.mock('@/services/campaign-event', () => ({ createCampaignEvent: vi.fn() }));
vi.mock('@/services/trait-modifiers', () => ({ gatherTraitModifiers: vi.fn(() => ({ totalFlat: 0, sources: [] })) }));
vi.mock('@/services/advancement', () => ({ markAttributeTrainable: vi.fn(), markSkillTrainable: vi.fn() }));
vi.mock('@/services/check-resolved', () => ({ afterCheckResolved: vi.fn(async () => {}) }));
vi.mock('@/lib/db', () => ({
  prisma: {
    character: {
      findUnique: vi.fn(async () => ({ id: 'violet', data: JSON.stringify({ attributes: { focus: { current: 4 } }, skills: [] }) })),
      update: vi.fn(async () => ({})),
    },
  },
}));

const { POST } = await import('./route');
const { storePendingCheck, getPendingCheck, removePendingCheck } = await import('@/lib/pending-checks');
const { afterCheckResolved } = await import('@/services/check-resolved');

function seed() {
  removePendingCheck('chk');
  storePendingCheck({
    id: 'chk', campaignId: 'c1', characterId: 'violet', characterName: 'Violet', targetUserId: 'p1',
    skillName: 'Lore', skillLevel: 4, isSkilled: true, attributeName: 'focus', fateDie: 'd6',
    sdDie: 'd4', sdResult: 2, dr: 5, difficultyHint: 'blue',
    availableGovernors: [{ name: 'focus', current: 4, pillar: 'spirit' }],
    maxUsefulEffort: 0, revealDR: false, requestedBy: 'gm', createdAt: Date.now(),
    timeoutHandle: setTimeout(() => {}, 0),
  });
}

async function wager(user: { id: string; role: string }, amount = 1, governor = 'focus', campaignId = 'c1') {
  currentUser = user;
  const body = { checkId: 'chk', wagers: [{ governor, amount }] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await POST({ json: async () => body } as any, { params: Promise.resolve({ id: campaignId }) });
  return res.status;
}

beforeEach(() => { seed(); vi.mocked(afterCheckResolved).mockClear(); });

describe('POST wager — a rejected wager leaves the check intact', () => {
  it('someone else\'s wager → 403, and the check is still pending for its owner', async () => {
    expect(await wager({ id: 'p2', role: 'TRAILBLAZER' })).toBe(403);
    expect(await wager({ id: 'gm', role: 'WATCHER' })).toBe(403);
    expect(getPendingCheck('chk')).toBeDefined();
    expect(afterCheckResolved).not.toHaveBeenCalled();
    // Regression: the owner can still resolve it.
    expect(await wager({ id: 'p1', role: 'TRAILBLAZER' })).toBe(200);
    expect(getPendingCheck('chk')).toBeUndefined();
    expect(afterCheckResolved).toHaveBeenCalledTimes(1);
  });

  it('the check id under another campaign → 404, check intact', async () => {
    expect(await wager({ id: 'p1', role: 'TRAILBLAZER' }, 1, 'focus', 'c2')).toBe(404);
    expect(getPendingCheck('chk')).toBeDefined();
  });

  it('a bad governor or over-wager → 400, check intact (the player can retry)', async () => {
    expect(await wager({ id: 'p1', role: 'TRAILBLAZER' }, 1, 'clout')).toBe(400);
    expect(await wager({ id: 'p1', role: 'TRAILBLAZER' }, 9)).toBe(400);
    expect(getPendingCheck('chk')).toBeDefined();
    expect(await wager({ id: 'p1', role: 'TRAILBLAZER' }, 2)).toBe(200);
  });

  it('a resolved check cannot be wagered twice → 404', async () => {
    expect(await wager({ id: 'p1', role: 'TRAILBLAZER' })).toBe(200);
    expect(await wager({ id: 'p1', role: 'TRAILBLAZER' })).toBe(404);
  });
});
