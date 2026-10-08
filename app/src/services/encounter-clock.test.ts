import { describe, it, expect, vi, beforeEach } from 'vitest';

const flushSimClock = vi.fn(async (..._a: unknown[]) => null);
let status = 'ACTIVE';

vi.mock('@/lib/db', () => ({
  prisma: {
    encounter: {
      findUnique: vi.fn(async () => ({ id: 'e1', campaignId: 'c1', name: 'Ambush', status, round: 3, state: '{}', campaign: { id: 'c1', gmUserId: 'gm' } })),
      update: vi.fn(async ({ data }: { data: { status: string } }) => { status = data.status; return {}; }),
    },
  },
}));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn() }));
vi.mock('@/services/campaign-event', () => ({ createCampaignEvent: vi.fn(async () => ({ id: 'ev', createdAt: new Date(), sessionId: null })) }));
vi.mock('@/services/time', () => ({
  advanceClockBySim: vi.fn(),
  getClock: vi.fn(),
  flushSimClock: (...a: unknown[]) => flushSimClock(...a),
}));

import { setEncounterStatus, type EncounterActor } from './encounter';

const GM: EncounterActor = { userId: 'gm', username: 'gm', role: 'WATCHER' };

beforeEach(() => { flushSimClock.mockClear(); status = 'ACTIVE'; });

describe('encounter end flushes the simulation clock (ruling 2026-10-07)', () => {
  it('resolving the encounter writes its pending seconds as one line', async () => {
    await setEncounterStatus('e1', GM, 'RESOLVED').catch(() => { /* view reload is not mocked */ });
    expect(flushSimClock).toHaveBeenCalledWith('c1');
  });
  it('pausing flushes too; starting does not', async () => {
    await setEncounterStatus('e1', GM, 'PAUSED').catch(() => {});
    expect(flushSimClock).toHaveBeenCalledTimes(1);
    flushSimClock.mockClear();
    status = 'PAUSED';
    await setEncounterStatus('e1', GM, 'ACTIVE').catch(() => {});
    expect(flushSimClock).not.toHaveBeenCalled();
  });
});
