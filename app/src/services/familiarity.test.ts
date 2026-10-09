import { describe, it, expect } from 'vitest';
import { scoreToFidelity, growFamiliarity, fadeFamiliarity, FAMILIARITY_TUNING, F5_SEAL, recordExposureSchema } from './familiarity';
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
