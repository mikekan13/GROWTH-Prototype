import { describe, it, expect } from 'vitest';
import { computeEffort, careScalarFrom, careWeightFor, selfSkillFactorFor, EFFORT_TUNING } from './effort';

describe('careScalarFrom', () => {
  it('blends vine salience and arousal evenly', () => {
    expect(careScalarFrom({ vineSalience: 1, arousal: 0 })).toBeCloseTo(0.5, 5);
    expect(careScalarFrom({ vineSalience: 0, arousal: 1 })).toBeCloseTo(0.5, 5);
    expect(careScalarFrom({ vineSalience: 1, arousal: 1 })).toBeCloseTo(1, 5);
    expect(careScalarFrom({})).toBe(0);
  });

  it('clamps out-of-range inputs', () => {
    expect(careScalarFrom({ vineSalience: 5, arousal: -5 })).toBeCloseTo(0.5, 5);
  });
});

describe('careWeightFor / selfSkillFactorFor', () => {
  it('maps care 0..1 to careWeight 0.5..1.5 linearly', () => {
    expect(careWeightFor(0)).toBeCloseTo(0.5, 5);
    expect(careWeightFor(1)).toBeCloseTo(1.5, 5);
    expect(careWeightFor(0.5)).toBeCloseTo(1.0, 5);
  });

  it('maps believed skill level 0..20 to selfSkillFactor 0.7..1.3, floored at 0 not the middle', () => {
    expect(selfSkillFactorFor(0)).toBeCloseTo(0.7, 5);
    expect(selfSkillFactorFor(20)).toBeCloseTo(1.3, 5);
    expect(selfSkillFactorFor(10)).toBeCloseTo(1.0, 5);
  });

  it('clamps believed levels above the reference ladder top', () => {
    expect(selfSkillFactorFor(999)).toBeCloseTo(1.3, 5);
  });
});

describe('computeEffort (Ruling 10 — motivated choice, never defaults to max)', () => {
  it('high care + high believed skill + straining wagers MORE than low care + casual', () => {
    const high = computeEffort({ effortContext: 'straining', care: 1, believedSkillLevel: 20, poolCurrent: 100 });
    const low = computeEffort({ effortContext: 'casual', care: 0, believedSkillLevel: 0, poolCurrent: 100 });
    expect(high.effortPoints).toBeGreaterThan(low.effortPoints);
  });

  it('never exceeds the pool current, however much she cares/believes', () => {
    const result = computeEffort({ effortContext: 'straining', care: 1, believedSkillLevel: 20, poolCurrent: 2 });
    expect(result.effortPoints).toBeLessThanOrEqual(2);
  });

  it('never exceeds the context ceiling even with an unlimited pool', () => {
    const result = computeEffort({ effortContext: 'casual', care: 1, believedSkillLevel: 20, poolCurrent: 1000 });
    expect(result.effortPoints).toBeLessThanOrEqual(EFFORT_TUNING.ceiling.casual);
  });

  it('an overconfident BELIEVED sheet overspends relative to a timid one, all else equal', () => {
    const overconfident = computeEffort({ effortContext: 'deliberate', care: 0.5, believedSkillLevel: 18, poolCurrent: 100 });
    const timid = computeEffort({ effortContext: 'deliberate', care: 0.5, believedSkillLevel: 1, poolCurrent: 100 });
    expect(overconfident.effortPoints).toBeGreaterThan(timid.effortPoints);
  });

  it('zero care and zero pool both floor the wager at zero', () => {
    const zeroPool = computeEffort({ effortContext: 'straining', care: 1, believedSkillLevel: 20, poolCurrent: 0 });
    expect(zeroPool.effortPoints).toBe(0);
  });

  it('never wagers a negative amount', () => {
    const result = computeEffort({ effortContext: 'casual', care: 0, believedSkillLevel: 0, poolCurrent: 0 });
    expect(result.effortPoints).toBeGreaterThanOrEqual(0);
  });
});
