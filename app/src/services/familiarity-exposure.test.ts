import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ rows: new Map<string, { score: number; lastCycle: number | null; lastSource: string }>(), txCount: 0, seedCalls: [] as string[], changes: [] as Array<Record<string, unknown>> }));

vi.mock('@/lib/db', () => {
  const k = (w: { perceiverId_subjectId_aspectKind: { perceiverId: string; subjectId: string; aspectKind: string } }) => {
    const x = w.perceiverId_subjectId_aspectKind;
    return `${x.perceiverId}|${x.subjectId}|${x.aspectKind}`;
  };
  const tx = {
    familiarity: {
      findUnique: async ({ where }: { where: Parameters<typeof k>[0] }) => h.rows.get(k(where)) ?? null,
      upsert: async ({ where, create, update }: { where: Parameters<typeof k>[0]; create: { score: number; lastCycle: number; lastSource: string }; update: { score: number; lastCycle: number; lastSource: string } }) => {
        const key = k(where);
        h.rows.set(key, h.rows.has(key) ? { ...h.rows.get(key)!, ...update } : { score: create.score, lastCycle: create.lastCycle, lastSource: create.lastSource });
        return { ...where.perceiverId_subjectId_aspectKind, subjectKind: 'ITEM', updatedAt: new Date(0), ...h.rows.get(key)! };
      },
    },
    familiarityChange: { createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { h.changes.push(...data); return { count: data.length }; } },
  };
  return {
    prisma: {
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => { h.txCount++; return fn(tx); },
      familiarity: {
        findMany: async ({ where }: { where: { perceiverId: string; subjectId: { in: string[] }; aspectKind: { in: string[] } } }) =>
          [...h.rows.keys()].map((key) => key.split('|')).filter(([p, s, a]) => p === where.perceiverId && where.subjectId.in.includes(s) && where.aspectKind.in.includes(a)).map(([, subjectId, aspectKind]) => ({ subjectId, aspectKind })),
      },
      dayaEntity: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'e1' ? { characterId: 'violet' } : null) },
    },
  };
});
vi.mock('@/services/history', () => ({ currentCycleOf: async () => 9 }));
// The unit-4 seeder, stubbed: 'knife' is owned (seeds 0.7), anything else is a stranger. Records call order.
vi.mock('@/services/familiarity-seed', () => ({
  isGodheadBeing: async () => false,
  seedOnFirstContact: async (i: { perceiverId: string; perceiverCharacterId: string; subjectId: string }) => {
    h.seedCalls.push(`${i.perceiverCharacterId}:${i.subjectId}`);
    if (i.subjectId !== 'knife') return { contact: 'stranger', seeded: [] };
    for (const a of ['identity', 'appearance']) {
      const key = `${i.perceiverId}|knife|${a}`;
      if (!h.rows.has(key)) h.rows.set(key, { score: 0.7, lastCycle: 9, lastSource: 'seed' });
    }
    return { contact: 'owned', seeded: ['identity', 'appearance'] };
  },
}));

import { recordExposure, recordExposureBatch, growFamiliarity, EXPOSURE_BATCH_CAP, PASSIVE_ASPECTS } from './familiarity';

beforeEach(() => { h.rows.clear(); h.txCount = 0; h.seedCalls.length = 0; h.changes.length = 0; });

describe('first contact is seeded BEFORE exposure is counted', () => {
  it('batch: a new owned item grows from its seed, not from zero; strangers still start at zero', async () => {
    await recordExposureBatch({ campaignId: 'c', perceiverId: 'e1', perceiverCharacterId: 'violet', cycle: 9, subjects: [{ subjectId: 'knife', subjectKind: 'ITEM', source: 'own' }, { subjectId: 'ruth', subjectKind: 'NPC', source: 'exposure' }] });
    expect(h.seedCalls).toEqual(['violet:knife', 'violet:ruth']);
    expect(h.rows.get('e1|knife|identity')).toMatchObject({ score: growFamiliarity(0.7, 'own'), lastCycle: 9, lastSource: 'own' });
    expect(h.rows.get('e1|ruth|identity')?.score).toBeCloseTo(growFamiliarity(0, 'exposure'));
  });

  it('batch: subjects already met are not re-seeded', async () => {
    h.rows.set('e1|ruth|identity', { score: 0.3, lastCycle: 9, lastSource: 'exposure' });
    h.rows.set('e1|ruth|appearance', { score: 0.3, lastCycle: 9, lastSource: 'exposure' });
    await recordExposureBatch({ campaignId: 'c', perceiverId: 'e1', perceiverCharacterId: 'violet', cycle: 9, subjects: [{ subjectId: 'ruth', subjectKind: 'NPC', source: 'exposure' }] });
    expect(h.seedCalls).toEqual([]);
  });

  it('single recordExposure looks the character up and seeds a new row first; seed writes never re-seed', async () => {
    const r = await recordExposure({ campaignId: 'c', perceiverId: 'e1', subjectId: 'knife', subjectKind: 'ITEM', aspectKind: 'identity', source: 'use', cycle: 9 });
    expect(h.seedCalls).toEqual(['violet:knife']);
    expect(h.rows.get('e1|knife|identity')?.score).toBeCloseTo(growFamiliarity(0.7, 'use'));
    expect(r.lastSource).toBe('use');
    await recordExposure({ campaignId: 'c', perceiverId: 'e1', subjectId: 'cup', subjectKind: 'ITEM', aspectKind: 'identity', source: 'seed', score: 0.2, cycle: 9 });
    expect(h.seedCalls).toEqual(['violet:knife']);
  });
});

describe('recordExposureBatch — one transaction per being per pass', () => {
  it('grows the passive aspects of each noticed subject once; own items as own; skips the perceiver itself', async () => {
    const n = await recordExposureBatch({
      campaignId: 'c', perceiverId: 'e1', perceiverCharacterId: 'violet', cycle: 3,
      subjects: [
        { subjectId: 'ruth', subjectKind: 'NPC', source: 'exposure' },
        { subjectId: 'ruth', subjectKind: 'NPC', source: 'exposure' }, // duplicate folds
        { subjectId: 'violet', subjectKind: 'CHARACTER', source: 'exposure' }, // self
        { subjectId: 'knife', subjectKind: 'ITEM', source: 'own' },
      ],
    });
    expect(h.txCount).toBe(1);
    expect(n).toBe(2 * PASSIVE_ASPECTS.length);
    expect(h.rows.get('e1|ruth|identity')).toEqual({ score: growFamiliarity(0, 'exposure'), lastCycle: 3, lastSource: 'exposure' });
    expect(h.rows.get('e1|knife|appearance')?.lastSource).toBe('own');
    expect(h.rows.has('e1|violet|identity')).toBe(false);
  });

  it('is bounded and writes nothing for nothing', async () => {
    expect(await recordExposureBatch({ campaignId: 'c', perceiverId: 'e1', subjects: [] })).toBe(0);
    expect(h.txCount).toBe(0);
    const many = Array.from({ length: 100 }, (_, i) => ({ subjectId: `s${i}`, subjectKind: 'ITEM' as const, source: 'exposure' as const }));
    expect(await recordExposureBatch({ campaignId: 'c', perceiverId: 'e1', subjects: many })).toBe(EXPOSURE_BATCH_CAP);
    expect(h.rows.size).toBe(EXPOSURE_BATCH_CAP);
    expect([...h.rows.values()][0].lastCycle).toBe(9); // the campaign clock when no cycle is passed
  });
});

describe('the change record — every write appends one row (append-only)', () => {
  it('batch: one change row per write, from the stored prior to the new score, in the same transaction', async () => {
    h.rows.set('e1|ruth|identity', { score: 0.3, lastCycle: 2, lastSource: 'exposure' });
    h.rows.set('e1|ruth|appearance', { score: 0.3, lastCycle: 2, lastSource: 'exposure' });
    await recordExposureBatch({ campaignId: 'c', perceiverId: 'e1', perceiverCharacterId: 'violet', cycle: 9, subjects: [{ subjectId: 'ruth', subjectKind: 'NPC', source: 'exposure' }], refs: { canonEventId: 'ev1' } });
    expect(h.txCount).toBe(1);
    expect(h.changes).toHaveLength(PASSIVE_ASPECTS.length);
    expect(h.changes[0]).toMatchObject({ campaignId: 'c', perceiverId: 'e1', subjectId: 'ruth', subjectKind: 'NPC', aspectKind: 'identity', fromScore: 0.3, fromCycle: 2, toScore: h.rows.get('e1|ruth|identity')!.score, source: 'exposure', cycle: 9, canonEventId: 'ev1', memoryId: null, checkId: null });
  });

  it('single write: first contact records fromScore null; a second write records the first as its from', async () => {
    await recordExposure({ campaignId: 'c', perceiverId: 'e1', subjectId: 'cup', subjectKind: 'ITEM', aspectKind: 'identity', source: 'seed', score: 0.2, cycle: 9 });
    await recordExposure({ campaignId: 'c', perceiverId: 'e1', subjectId: 'cup', subjectKind: 'ITEM', aspectKind: 'identity', source: 'inspect', cycle: 9, refs: { checkId: 'chk1' } });
    expect(h.changes.map((c) => [c.source, c.fromScore, c.toScore, c.checkId])).toEqual([
      ['seed', null, 0.2, null],
      ['inspect', 0.2, growFamiliarity(0.2, 'inspect'), 'chk1'],
    ]);
  });
});
