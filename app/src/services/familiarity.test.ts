import { describe, it, expect } from 'vitest';
import { scoreToFidelity, growFamiliarity, fadeFamiliarity, familiarityAt, FAMILIARITY_TUNING, F5_SEAL, recordExposureSchema, witFadeFactor, witMaxFromSheet, impressionAfter, writeFamiliarity } from './familiarity';
import { computeFidelityLevel } from '@/daya/renderer-math';
import { computeRecency } from '@/daya/recall';

describe('scoreToFidelity', () => {
  it('matches the mirror ladder (uncapped subject) across 0..1', () => {
    for (let i = 0; i <= 100; i++) {
      const s = i / 100;
      expect(scoreToFidelity(s)).toBe(computeFidelityLevel('self-stat', s));
    }
  });

  it('seals F5 at 0.95, not 0.8', () => {
    expect(scoreToFidelity(0.8)).toBe(4);
    expect(scoreToFidelity(0.949)).toBe(4);
    expect(scoreToFidelity(F5_SEAL)).toBe(5);
    expect(scoreToFidelity(-1)).toBe(0);
    expect(scoreToFidelity(2)).toBe(5);
  });
});

describe('growFamiliarity', () => {
  it('has diminishing returns per exposure', () => {
    const a = growFamiliarity(0, 'use');
    const b = growFamiliarity(a, 'use');
    const c = growFamiliarity(0.9, 'use');
    expect(a).toBeGreaterThan(0);
    expect(b - a).toBeLessThan(a);
    expect(c - 0.9).toBeLessThan(a);
  });

  it('orders the sources: glance < use < own < inspect', () => {
    const g = (src: 'exposure' | 'use' | 'own' | 'inspect') => growFamiliarity(0.2, src);
    expect(g('exposure')).toBeLessThan(g('use'));
    expect(g('use')).toBeLessThan(g('own'));
    expect(g('own')).toBeLessThan(g('inspect'));
  });

  it('compounds `times` exactly like repeated single exposures', () => {
    let s = 0.1;
    for (let i = 0; i < 7; i++) s = growFamiliarity(s, 'own');
    expect(growFamiliarity(0.1, 'own', 7)).toBeCloseTo(s, 10);
  });

  it('takes long exposure to reach F5 and never exceeds 1', () => {
    const toSeal = (src: 'exposure' | 'inspect') => Math.ceil(Math.log(1 - F5_SEAL) / Math.log(1 - FAMILIARITY_TUNING.step[src]));
    expect(toSeal('exposure')).toBeGreaterThan(200);
    expect(toSeal('inspect')).toBeGreaterThan(5);
    expect(scoreToFidelity(growFamiliarity(0, 'exposure', toSeal('exposure') - 1))).toBe(4);
    expect(scoreToFidelity(growFamiliarity(0, 'exposure', toSeal('exposure')))).toBe(5);
    expect(growFamiliarity(0.99, 'inspect', 1000)).toBeLessThanOrEqual(1);
  });
});

describe('fadeFamiliarity', () => {
  it('is the memory power-law shape (no elapsed time = no fade)', () => {
    expect(fadeFamiliarity(0.4, 0)).toBe(0.4);
    // depth 0 → exactly the memory curve at salience 0
    expect(fadeFamiliarity(1e-9, 10) / 1e-9).toBeCloseTo(computeRecency(10, 0), 5);
  });

  it('deeper familiarity fades slower (as a fraction kept)', () => {
    const kept = (s: number) => fadeFamiliarity(s, 50) / s;
    expect(kept(0.2)).toBeLessThan(kept(0.5));
    expect(kept(0.5)).toBeLessThan(kept(0.8));
  });

  it('never fades at the F5 seal — survives lifetimes', () => {
    expect(fadeFamiliarity(F5_SEAL, 1e9)).toBe(F5_SEAL);
    expect(fadeFamiliarity(1, 1e9)).toBe(1);
    expect(scoreToFidelity(fadeFamiliarity(0.93, 1000))).toBe(4);
  });

  it('is monotone non-increasing in elapsed time', () => {
    let last = 0.6;
    for (const t of [1, 5, 20, 100, 1000]) {
      const v = fadeFamiliarity(0.6, t);
      expect(v).toBeLessThanOrEqual(last);
      last = v;
    }
  });
});

describe('familiarityAt (per-row fade from lastCycle)', () => {
  it('fades by the cycles since the stamp, in the memory cycle unit', () => {
    expect(familiarityAt({ score: 0.5, lastCycle: 10 }, 10)).toBe(0.5);
    expect(familiarityAt({ score: 0.5, lastCycle: 10 }, 60)).toBeCloseTo(fadeFamiliarity(0.5, 50), 12);
  });
  it('leaves unstamped rows unfaded and sealed rows whole', () => {
    expect(familiarityAt({ score: 0.5, lastCycle: null }, 1e6)).toBe(0.5);
    expect(familiarityAt({ score: 1, lastCycle: 0 }, 1e6)).toBe(1);
  });
});

describe('recordExposureSchema', () => {
  const base = { campaignId: 'c', perceiverId: 'p', subjectId: 's', subjectKind: 'ITEM' as const, aspectKind: 'damage' };
  it('requires score for seed and refuses it otherwise', () => {
    expect(recordExposureSchema.safeParse({ ...base, source: 'seed' }).success).toBe(false);
    expect(recordExposureSchema.safeParse({ ...base, source: 'seed', score: 1 }).success).toBe(true);
    expect(recordExposureSchema.safeParse({ ...base, source: 'use', score: 0.5 }).success).toBe(false);
    expect(recordExposureSchema.safeParse({ ...base, source: 'use' }).success).toBe(true);
  });
  it('rejects unknown subject kinds and sources', () => {
    expect(recordExposureSchema.safeParse({ ...base, subjectKind: 'THING', source: 'use' }).success).toBe(false);
    expect(recordExposureSchema.safeParse({ ...base, source: 'smell' }).success).toBe(false);
  });
});

describe('WIT = RETENTION (Mike 2026-10-09: higher Wit, higher retention)', () => {
  it('the reference Wit leaves the curve as it was; higher Wit fades slower, lower faster', () => {
    expect(witFadeFactor(FAMILIARITY_TUNING.referenceWit)).toBeCloseTo(1, 10);
    expect(witFadeFactor(30)).toBeLessThan(witFadeFactor(20));
    expect(witFadeFactor(20)).toBeLessThan(1);
    expect(witFadeFactor(2)).toBeGreaterThan(1);
    expect(fadeFamiliarity(0.7, 10)).toBe(fadeFamiliarity(0.7, 10, FAMILIARITY_TUNING.referenceWit));
    const sharp = fadeFamiliarity(0.7, 10, 30), dull = fadeFamiliarity(0.7, 10, 3);
    expect(sharp).toBeGreaterThan(fadeFamiliarity(0.7, 10));
    expect(dull).toBeLessThan(fadeFamiliarity(0.7, 10));
  });

  it('applies through familiarityAt; the F5 seal (Godheads) never fades whatever the Wit', () => {
    expect(familiarityAt({ score: 0.6, lastCycle: 0 }, 8, 40)).toBeGreaterThan(familiarityAt({ score: 0.6, lastCycle: 0 }, 8, 1));
    expect(fadeFamiliarity(1, 1e6, 0)).toBe(1);
    expect(fadeFamiliarity(F5_SEAL, 1e6, 0)).toBe(F5_SEAL);
  });

  it('reads Wit off the sheet the way recall does (level + aug+ - aug-; none -> 10)', () => {
    expect(witMaxFromSheet({ attributes: { wit: { level: 12, augmentPositive: 3, augmentNegative: 1 } } })).toBe(14);
    expect(witMaxFromSheet({ attributes: { wit: { level: 7 } } })).toBe(7);
    expect(witMaxFromSheet(null)).toBe(10);
    expect(witMaxFromSheet({ attributes: {} })).toBe(10);
  });
});

describe('wrong impressions: set, kept, FIXED by a correct perception at sufficient fidelity', () => {
  it('impressionAfter: explicit wins; a non-wrong write to >= F3 fixes; below F3 or another wrong keeps it; an unread prior leaves it alone', () => {
    const prior = { score: 0.1, lastCycle: 1, impression: 'gold' };
    expect(impressionAfter({ prior, score: 0.1, source: 'wrong', impression: 'brass' })).toBe('brass');
    expect(impressionAfter({ prior, score: 0.65, source: 'inspect' })).toBeNull(); // F3 → fixed
    expect(impressionAfter({ prior, score: 0.45, source: 'use' })).toBe('gold'); // F2 → still believed
    expect(impressionAfter({ prior, score: 0.9, source: 'wrong' })).toBe('gold');
    expect(impressionAfter({ prior: { score: 0.1, lastCycle: 1 }, score: 0.9, source: 'inspect' })).toBeUndefined();
    expect(impressionAfter({ prior: null, score: 0.9, source: 'inspect' })).toBeNull();
  });

  it('writeFamiliarity records the fix on the change row (gold → null) and clears the row', async () => {
    const rows: Record<string, unknown>[] = []; const changes: Record<string, unknown>[] = [];
    const tx = {
      familiarity: { upsert: async (q: { create: Record<string, unknown>; update: Record<string, unknown> }) => { rows.push(q.update); return { perceiverId: 'e', subjectId: 's', subjectKind: 'ITEM', aspectKind: 'material', score: 0.7, lastSource: 'inspect', lastCycle: 2, impression: (q.update.impression as string | null) ?? null, updatedAt: new Date(0) }; } },
      familiarityChange: { createMany: async (q: { data: Record<string, unknown>[] }) => { changes.push(...q.data); return { count: q.data.length }; } },
    } as unknown as Parameters<typeof writeFamiliarity>[0];
    const [rec] = await writeFamiliarity(tx, [{ campaignId: 'c', perceiverId: 'e', subjectId: 's', subjectKind: 'ITEM', aspectKind: 'material', score: 0.7, source: 'inspect', cycle: 2, prior: { score: 0.1, lastCycle: 1, impression: 'gold' } }]);
    expect(rec.impression).toBeNull();
    expect(rows[0]).toMatchObject({ impression: null });
    expect(changes[0]).toMatchObject({ fromImpression: 'gold', toImpression: null, source: 'inspect' });
  });
});
