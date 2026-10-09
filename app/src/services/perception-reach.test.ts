import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// declareCanon's witness loop with the reach pass OFF (parity) and ON (gating).
const h = vi.hoisted(() => ({
  writes: [] as Array<Record<string, unknown>>,
  unnoticed: [] as Array<Record<string, unknown>>,
  judge: vi.fn(),
  exposures: vi.fn(async () => {}),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    campaign: { findUnique: async () => ({ gmUserId: 'gm', currentCycle: 4 }) },
    goal: { findMany: async () => [] },
    canonEvent: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'ev1', ...data }) },
    dayaEntity: { findMany: async () => [{ id: 'e-violet', characterId: 'violet' }, { id: 'e-danny', characterId: 'danny' }, { id: 'e-ruth', characterId: 'ruth' }] },
  },
}));
vi.mock('@/services/vine-memory', () => ({ recordVineEntriesSafe: () => {} }));
vi.mock('@/services/campaign-event', () => ({ createCampaignEvent: async () => ({ id: 'ce', createdAt: new Date(0), sessionId: null }) }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: () => {} }));
vi.mock('@/daya/perceive', () => ({ perceive: async (_c: string, _k: string, s: string) => ({ prose: `mirrored: ${s}`, fidelityLevel: 3, distortions: [], locationId: null, truthLines: 0, observer: {} }) }));
vi.mock('@/daya/memory', () => ({ writeMemoryEntry: async (p: Record<string, unknown>) => { h.writes.push(p); return { id: `m${h.writes.length}` }; } }));
vi.mock('@/services/perception-reach', async () => {
  const actual = await vi.importActual<typeof import('@/sim/senses/reach')>('@/sim/senses/reach');
  return {
    perceptionReachOn: actual.perceptionReachOn,
    judgeCanonReach: h.judge,
    writeUnnoticed: async (a: Record<string, unknown>) => { h.unnoticed.push(a); return { id: 'u1' }; },
    memoryFieldsOf: (v: { noticed: boolean; via: string[]; salience: number }, source: string) => ({ noticed: v.noticed, perceivedVia: v.via, ...(source === 'model' ? { salience: v.salience } : {}) }),
    recordNoticedExposures: h.exposures,
    addRefs: (m: Map<string, unknown>, id: string, r: unknown) => m.set(id, r),
  };
});

import { declareCanon } from './canon';
import { visibleToRecall } from '@/daya/recall';

const actor = { userId: 'gm', username: 'Mike', role: 'ADMIN' };
const prev = process.env.PERCEPTION_REACH;

beforeEach(() => { h.writes.length = 0; h.unnoticed.length = 0; h.judge.mockReset(); h.exposures.mockClear(); delete process.env.PERCEPTION_REACH; });
afterEach(() => { if (prev === undefined) delete process.env.PERCEPTION_REACH; else process.env.PERCEPTION_REACH = prev; });

describe('declareCanon witnesses — PERCEPTION_REACH off = exactly as before', () => {
  it('every witness gets its row, no reach call, no new fields, no exposure', async () => {
    const r = await declareCanon('c1', actor, { narration: 'The lights go out.' });
    expect(h.judge).not.toHaveBeenCalled();
    expect(h.exposures).not.toHaveBeenCalled();
    expect(r.memoryIds).toHaveLength(3);
    for (const w of h.writes) {
      expect(w).not.toHaveProperty('noticed');
      expect(w).not.toHaveProperty('perceivedVia');
      expect(w.salience).toBe(0.5);
      expect(w.content).toBe('mirrored: The lights go out.');
    }
  });
});

describe('declareCanon witnesses — PERCEPTION_REACH on', () => {
  it('not reached → no row; unnoticed → noticed=false row; noticed → senses + world-sim salience; one exposure pass', async () => {
    process.env.PERCEPTION_REACH = 'on';
    h.judge.mockResolvedValue({
      source: 'model', ms: 5, beings: [],
      verdicts: new Map([
        ['violet', { beingId: 'violet', reaches: true, via: ['sight'], noticed: true, salience: 0.7 }],
        ['danny', { beingId: 'danny', reaches: true, via: ['hearing'], noticed: false, salience: 0.1 }],
        ['ruth', { beingId: 'ruth', reaches: false, via: [], noticed: false, salience: 0 }],
      ]),
    });
    const r = await declareCanon('c1', actor, { narration: 'Ruth pockets the key.', actorId: 'ruth' });
    expect(h.judge).toHaveBeenCalledTimes(1);
    expect(h.judge.mock.calls[0][2]).toEqual(['violet', 'danny', 'ruth']);
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]).toMatchObject({ entityId: 'e-violet', noticed: true, perceivedVia: ['sight'], salience: 0.7, truthRef: 'ev1' });
    expect(h.unnoticed).toHaveLength(1);
    expect(h.unnoticed[0]).toMatchObject({ entityId: 'e-danny', truthRef: 'ev1', cycle: 4 });
    expect(r.memoryIds).toEqual(['m1', 'u1']);
    expect(h.exposures).toHaveBeenCalledTimes(1);
    const refs = (h.exposures.mock.calls[0] as unknown as [string, number, Map<string, unknown>])[2];
    expect([...refs.keys()]).toEqual(['violet']); // only the being that noticed
  });

  it('stub verdicts keep the old fixed salience', async () => {
    process.env.PERCEPTION_REACH = 'on';
    h.judge.mockResolvedValue({ source: 'fallback', ms: 4000, beings: [], verdicts: new Map([['violet', { beingId: 'violet', reaches: true, via: ['sight'], noticed: true, salience: 0.5 }]]) });
    await declareCanon('c1', actor, { narration: 'x', witnessIds: ['violet'] });
    expect(h.writes[0]).toMatchObject({ salience: 0.5, noticed: true, perceivedVia: ['sight'] });
  });
});

describe('recall surfacing', () => {
  it('drops sensed-but-unnoticed rows unless an explicit look asks; rows without the column count as noticed', () => {
    const rows = [{ id: 'a', noticed: true }, { id: 'b', noticed: false }, { id: 'c' }];
    expect(visibleToRecall(rows, false).map((r) => r.id)).toEqual(['a', 'c']);
    expect(visibleToRecall(rows, true).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});
