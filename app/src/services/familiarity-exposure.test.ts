import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ rows: new Map<string, { score: number; lastCycle: number | null; lastSource: string }>(), txCount: 0 }));

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
      },
    },
  };
  return { prisma: { $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => { h.txCount++; return fn(tx); } } };
});
vi.mock('@/services/history', () => ({ currentCycleOf: async () => 9 }));

import { recordExposureBatch, growFamiliarity, EXPOSURE_BATCH_CAP, PASSIVE_ASPECTS } from './familiarity';

beforeEach(() => { h.rows.clear(); h.txCount = 0; });

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
