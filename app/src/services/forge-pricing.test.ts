import { describe, it, expect } from 'vitest';
import { priceSeed, priceRootBranch, priceTrait } from './forge-pricing';

describe('forge-pricing (locked formulas, Seed_KV_Formulas.md)', () => {
  it('prices the Elven worked example components: 626 before trait grades', () => {
    // LOCKED example: d6=10, 1000yr → 500, 60 augs, 30 Freq, 13 resist → 26.
    // 626 + First-Born(+50) − Diminishing(−200) = 476 — trait grades are
    // Kai's, so the formula covers the 626.
    const { kv } = priceSeed({
      baseFateDie: 'd6',
      fatedAge: 1000,
      frequency: 30,
      baseResist: 13,
      attributes: { clout: 10, celerity: 10, constitution: 10, focus: 10, wisdom: 10, wit: 10 },
    });
    expect(kv).toBe(626);
  });

  it('includes the frequency-budget component (Human: 40 freq = 40 KV)', () => {
    const withFreq = priceSeed({ baseFateDie: 'd8', fatedAge: 80, frequency: 40, baseResist: 15, attributes: {} });
    const withoutFreq = priceSeed({ baseFateDie: 'd8', fatedAge: 80, frequency: 0, baseResist: 15, attributes: {} });
    expect(withFreq.kv - withoutFreq.kv).toBe(40);
  });

  it('clamps negative attribute values to zero (positive-only components)', () => {
    const { kv } = priceSeed({ baseFateDie: 'd4', fatedAge: 2, frequency: 0, baseResist: 0, attributes: { clout: -5, wit: 3 } });
    expect(kv).toBe(5 + 1 + 3); // fate die 5 + ceil(2*0.5) + wit 3, no −5
  });

  it('root/branch: levels + skill levels, thorn anchors negative', () => {
    const { kv } = priceRootBranch('branch', {
      attributes: { focus: 1, wisdom: 1, wit: 2 },
      skills: [{ level: 4 }, { level: 3 }, { level: 2 }],
      nectars: ['A'],
      thorns: ['B'],
    });
    expect(kv).toBe(4 + 9 + 5 - 5);
  });

  it('root breakeven rule: plain 18yo ~100 KV root has zero frequency cost', () => {
    const priced = priceRootBranch('root', {
      attributes: { clout: 50, wisdom: 50 },
      ageAdded: 18,
    });
    expect(priced.kv).toBe(100);
    expect(priced.frequencyCost).toBe(0);
  });

  it('root over breakeven pays the difference', () => {
    const priced = priceRootBranch('root', {
      attributes: { clout: 60, wisdom: 60 }, // 120 KV
      ageAdded: 18, // breakeven 100
    });
    expect(priced.frequencyCost).toBe(20);
  });

  it('magic skill levels price at 2×', () => {
    const magic = priceRootBranch('branch', { skills: [{ level: 5, isMagic: true }] });
    const plain = priceRootBranch('branch', { skills: [{ level: 5 }] });
    expect(magic.kv).toBe(10);
    expect(plain.kv).toBe(5);
  });

  it('thorn traits come out negative (liens), nectars positive', () => {
    const thorn = priceTrait('thorn', { rollModifiers: [{ flat: -1 }] });
    const nectar = priceTrait('nectar', { rollModifiers: [{ flat: 1 }] });
    expect(thorn.kv).toBe(-5);
    expect(nectar.kv).toBe(5);
  });

  it('trait with no structured modifiers returns 0 for Kai to grade', () => {
    const { kv, breakdown } = priceTrait('nectar', {});
    expect(kv).toBe(0);
    expect(breakdown[0]).toMatch(/Kai grades/);
  });
});
