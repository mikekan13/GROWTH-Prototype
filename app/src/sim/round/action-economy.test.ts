import { describe, it, expect } from 'vitest';
import { actionPools, governorTier, poolMax, speedGauges, skillUsableFromPillar } from './action-economy';
import type { GrowthAttributes } from '@/types/growth';

function attr(level: number, pos = 0, neg = 0) {
  return { level, current: level, augmentPositive: pos, augmentNegative: neg };
}

function attrs(o: Partial<Record<keyof GrowthAttributes, number>>): GrowthAttributes {
  return {
    clout: attr(o.clout ?? 0), celerity: attr(o.celerity ?? 0), constitution: attr(o.constitution ?? 0),
    flow: attr(o.flow ?? 0), frequency: { level: o.frequency ?? 0, current: o.frequency ?? 0 }, focus: attr(o.focus ?? 0),
    willpower: attr(o.willpower ?? 0), wisdom: attr(o.wisdom ?? 0), wit: attr(o.wit ?? 0),
  };
}

describe('action pools', () => {
  // Divisor 75 since Mike's ruling of 2026-10-29 (was 25): a ~30-average human has one action a pillar.
  it('canon: 225 body = 3, Frequency excluded from Spirit, min 1', () => {
    const pools = actionPools({ attributes: attrs({ clout: 75, celerity: 75, constitution: 75, flow: 30, focus: 30, frequency: 500, willpower: 4, wisdom: 4, wit: 4 }) });
    expect(pools).toEqual({ body: 3, spirit: 1, soul: 1 });
  });
  it("Mike's example (scaled to /75): 1b2s1s vs 2b2s1s", () => {
    const a = actionPools({ attributes: attrs({ clout: 24, celerity: 24, constitution: 24, flow: 75, focus: 75, willpower: 5, wisdom: 5, wit: 5 }) });
    const b = actionPools({ attributes: attrs({ clout: 60, celerity: 60, constitution: 30, flow: 75, focus: 75, willpower: 5, wisdom: 5, wit: 5 }) });
    expect(a).toEqual({ body: 1, spirit: 2, soul: 1 });
    expect(b).toEqual({ body: 2, spirit: 2, soul: 1 });
  });
  it('ActionMod adds to every pillar', () => {
    expect(actionPools({ attributes: attrs({}) }, 1)).toEqual({ body: 2, spirit: 2, soul: 2 });
  });
});

describe('speed gauges', () => {
  it('uses max pool (level + aug) for Celerity/Wisdom and level for Frequency', () => {
    const a = attrs({ celerity: 10, wisdom: 10, frequency: 33 });
    a.celerity = attr(10, 5, 2);
    expect(poolMax(a.celerity)).toBe(13);
    expect(speedGauges({ attributes: a })).toEqual({ celerity: 13, frequency: 33, wisdom: 10 });
  });
});

describe('governor tiers (Mike 09-04)', () => {
  it('Wisdom only = 1, Wisdom+Celerity = 2, Celerity only = 3, other mixes slower with more governors', () => {
    expect(governorTier(['wisdom'])).toBe(1);
    expect(governorTier(['wisdom', 'celerity'])).toBe(2);
    expect(governorTier(['celerity'])).toBe(3);
    expect(governorTier(['clout'])).toBe(4);
    expect(governorTier(['clout', 'wit'])).toBe(5);
    // Archery example: Celerity, Focus, Flow, Wisdom → slower than Wisdom-only
    expect(governorTier(['celerity', 'focus', 'flow', 'wisdom'])).toBeGreaterThan(governorTier(['wisdom']));
  });
  it('a skill can be triggered from any participating pillar', () => {
    const archery = { name: 'Archery', level: 6, governors: ['celerity', 'focus', 'flow', 'wisdom'] as const };
    expect(skillUsableFromPillar({ ...archery, governors: [...archery.governors] }, 'spirit')).toBe(true);
    expect(skillUsableFromPillar({ ...archery, governors: [...archery.governors] }, 'soul')).toBe(true);
    expect(skillUsableFromPillar({ name: 'x', level: 1, governors: ['clout'] }, 'soul')).toBe(false);
  });
});
