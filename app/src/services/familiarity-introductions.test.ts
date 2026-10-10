import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  rows: new Map<string, { score: number; lastCycle: number | null; lastSource: string }>(),
  cleared: [] as unknown[], pushed: [] as string[], changes: [] as Array<Record<string, unknown>>,
  gm: true,
}));

vi.mock('@/lib/db', () => {
  const k = (w: { perceiverId_subjectId_aspectKind: { perceiverId: string; subjectId: string; aspectKind: string } }) => {
    const x = w.perceiverId_subjectId_aspectKind;
    return `${x.perceiverId}|${x.subjectId}|${x.aspectKind}`;
  };
  const familiarity = {
    findUnique: async ({ where }: { where: Parameters<typeof k>[0] }) => h.rows.get(k(where)) ?? null,
    upsert: async ({ where, create, update }: { where: Parameters<typeof k>[0]; create: { score: number; lastCycle: number; lastSource: string }; update: { score: number; lastCycle: number; lastSource: string } }) => {
      const key = k(where);
      h.rows.set(key, h.rows.has(key) ? { ...h.rows.get(key)!, ...update } : { score: create.score, lastCycle: create.lastCycle, lastSource: create.lastSource });
      return { ...where.perceiverId_subjectId_aspectKind, subjectKind: 'NPC', updatedAt: new Date(0), ...h.rows.get(key)! };
    },
    findMany: async () => [...h.rows.keys()].map((key) => key.split('|')).map(([, subjectId, aspectKind]) => ({ subjectId, aspectKind })),
  };
  const familiarityChange = { createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { h.changes.push(...data); return { count: data.length }; } };
  return {
    prisma: {
      $transaction: async (fn: (t: { familiarity: typeof familiarity; familiarityChange: typeof familiarityChange }) => Promise<unknown>) => fn({ familiarity, familiarityChange }),
      familiarity,
      dayaEntity: {
        findUnique: async () => ({ characterId: 'violet' }),
        findFirst: async ({ where }: { where: { OR: Array<{ id?: string; characterId?: string }> } }) =>
          where.OR.some((o) => o.id === 'e1' || o.characterId === 'violet') ? { id: 'e1', characterId: 'violet', character: { campaignId: 'c' } } : null,
      },
      dayaMemoryEntry: { updateMany: async (q: unknown) => { h.cleared.push(q); return { count: 2 }; } },
      character: { findFirst: async ({ where }: { where: { id: string } }) => (where.id === 'ruth' ? { entityType: 'NPC' } : null) },
      campaignItem: { findFirst: async () => null },
      location: { findFirst: async () => null },
    },
  };
});
vi.mock('@/services/history', () => ({ currentCycleOf: async () => 4 }));
vi.mock('@/services/familiarity-seed', () => ({ isGodheadBeing: async () => false, seedOnFirstContact: async () => ({ contact: 'stranger', seeded: [] }) }));
vi.mock('@/lib/perceived-feed-push', () => ({ notifyMemoryWritten: (id: string) => { h.pushed.push(id); } }));
vi.mock('@/services/campaign-access', () => ({ requireCampaignGM: async () => { if (!h.gm) throw new Error('forbidden'); } }));

import { recordIntroductions, setFamiliarityByWatcher, INTRODUCED_SCORE, INTRODUCED_SOURCE, scoreToFidelity } from './familiarity';

beforeEach(() => { h.rows.clear(); h.cleared = []; h.pushed = []; h.gm = true; h.changes = []; });

describe('recordIntroductions — raise identity to the naming level, never lower it', () => {
  it('a stranger is raised to INTRODUCED_SCORE (source introduced); the cached lines naming them are dropped and the feed nudged', async () => {
    h.rows.set('e1|ruth|identity', { score: 0.05, lastCycle: 4, lastSource: 'exposure' });
    const raised = await recordIntroductions({ campaignId: 'c', perceiverId: 'e1', perceiverCharacterId: 'violet', cycle: 4, subjects: [{ subjectId: 'ruth', subjectKind: 'NPC' }] });
    expect(raised).toEqual(['ruth']);
    expect(h.rows.get('e1|ruth|identity')).toMatchObject({ score: INTRODUCED_SCORE, lastSource: INTRODUCED_SOURCE, lastCycle: 4 });
    expect(JSON.stringify(h.cleared[0])).toContain('ruth');
    expect(JSON.stringify(h.cleared[0])).toContain('"entityId":"e1"');
    expect(h.pushed).toEqual(['e1']);
    expect(h.changes).toEqual([expect.objectContaining({ subjectId: 'ruth', aspectKind: 'identity', fromScore: 0.05, toScore: INTRODUCED_SCORE, source: INTRODUCED_SOURCE, cycle: 4 })]);
  });

  it('a name already known better is kept; nothing is invalidated', async () => {
    h.rows.set('e1|ruth|identity', { score: 0.9, lastCycle: 4, lastSource: 'inspect' });
    expect(await recordIntroductions({ campaignId: 'c', perceiverId: 'e1', perceiverCharacterId: 'violet', cycle: 4, subjects: [{ subjectId: 'ruth', subjectKind: 'NPC' }] })).toEqual([]);
    expect(h.rows.get('e1|ruth|identity')?.score).toBe(0.9);
    expect(h.cleared).toEqual([]);
    expect(h.changes).toEqual([]); // no write, no change row
  });

  it('the change row points at the memory row the name was caught in, plus the pass refs', async () => {
    await recordIntroductions({ campaignId: 'c', perceiverId: 'e1', perceiverCharacterId: 'violet', cycle: 4, subjects: [{ subjectId: 'ruth', subjectKind: 'NPC', memoryId: 'mem-7' }], refs: { canonEventId: 'ev-3' } });
    expect(h.changes).toEqual([expect.objectContaining({ subjectId: 'ruth', memoryId: 'mem-7', canonEventId: 'ev-3' })]);
  });

  it('the perceiver is never introduced to itself', async () => {
    expect(await recordIntroductions({ campaignId: 'c', perceiverId: 'e1', perceiverCharacterId: 'violet', cycle: 4, subjects: [{ subjectId: 'violet', subjectKind: 'CHARACTER' }] })).toEqual([]);
  });
});

describe('setFamiliarityByWatcher — the GM declares "they know each other"', () => {
  it('sets identity to the given F-level (by characterId), invalidates and nudges', async () => {
    const r = await setFamiliarityByWatcher('c', { id: 'u', role: 'WATCHER' }, { perceiverId: 'violet', subjectId: 'ruth', level: 3 });
    expect(r.aspectKind).toBe('identity');
    expect(scoreToFidelity(r.score)).toBe(3);
    expect(r.lastSource).toBe('watcher');
    expect(h.changes).toEqual([expect.objectContaining({ perceiverId: 'e1', subjectId: 'ruth', fromScore: null, toScore: r.score, source: 'watcher', cycle: 4 })]);
    expect(h.pushed).toEqual(['e1']);
  });

  it('refuses non-GMs, bad levels and unknown subjects', async () => {
    h.gm = false;
    await expect(setFamiliarityByWatcher('c', { id: 'u', role: 'TRAILBLAZER' }, { perceiverId: 'violet', subjectId: 'ruth', level: 3 })).rejects.toThrow();
    h.gm = true;
    await expect(setFamiliarityByWatcher('c', { id: 'u', role: 'WATCHER' }, { perceiverId: 'violet', subjectId: 'ruth', level: 9 })).rejects.toThrow();
    await expect(setFamiliarityByWatcher('c', { id: 'u', role: 'WATCHER' }, { perceiverId: 'violet', subjectId: 'nobody', level: 2 })).rejects.toThrow();
  });
});
