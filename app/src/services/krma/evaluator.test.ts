import { describe, it, expect } from 'vitest';
import { calculateTKV, calculateDeathSplit, splitSkillShares } from './evaluator';
import type { GrowthCharacter } from '@/types/growth';

/**
 * Pure-function tests for the KRMA evaluator: TKV composition (INV-22/25) and
 * the death-split routing (INV-35..38). KV_PER_ATTRIBUTE_LEVEL = 1, so an
 * attribute's KV equals its level, which makes the expected values hand-computable.
 */

type AttrKey =
  | 'clout' | 'celerity' | 'constitution'
  | 'flow' | 'frequency' | 'focus'
  | 'willpower' | 'wisdom' | 'wit';

function makeCharacter(opts: {
  levels?: Partial<Record<AttrKey, number>>;
  baseResist?: number;
  baseFateDie?: string;
  fatedAge?: number;
} = {}): GrowthCharacter {
  const L = opts.levels ?? {};
  const attr = (k: AttrKey) => ({ level: L[k] ?? 0, current: L[k] ?? 0, augmentPositive: 0, augmentNegative: 0 });
  return {
    attributes: {
      clout: attr('clout'), celerity: attr('celerity'), constitution: attr('constitution'),
      flow: attr('flow'), frequency: attr('frequency'), focus: attr('focus'),
      willpower: attr('willpower'), wisdom: attr('wisdom'), wit: attr('wit'),
    },
    skills: [],
    traits: [],
    magic: { mercy: { skillLevels: {} }, severity: { skillLevels: {} }, balance: { skillLevels: {} } },
    vitals: { baseResist: opts.baseResist ?? 0 },
    creation: { seed: { baseFateDie: opts.baseFateDie ?? 'd8' }, fatedAge: opts.fatedAge ?? 0 },
  } as unknown as GrowthCharacter;
}

describe('calculateTKV — component sums (INV-22/25)', () => {
  // clout 3 + willpower 2 (attrs, KV=level) + baseResist 4×2=8 + Fate Die d8=20
  // + Fated Age ceil(80×0.5)=40  ->  3 + 2 + 8 + 20 + 40 = 73
  const char = makeCharacter({ levels: { clout: 3, willpower: 2 }, baseResist: 4, baseFateDie: 'd8', fatedAge: 80 });
  const tkv = calculateTKV(char);

  it('sums all locked components to the hand-computed total', () => {
    expect(tkv.total).toBe(73);
  });
  it('Fate Die KV: d8 = 20 (INV-25)', () => {
    expect(tkv.fateDie.kv).toBe(20);
  });
  it('Fated Age KV: ceil(80 × 0.5) = 40', () => {
    expect(tkv.fatedAge.kv).toBe(40);
  });
  it('Body resist KV: 4 × 2 = 8', () => {
    expect(tkv.bodyResist.total).toBe(8);
  });
});

describe('calculateDeathSplit — KRMA routing (corrected canon 2026-07-13)', () => {
  // clout 10 (body) · willpower 10 (soul) · flow 8 (spirit, kept) · frequency 10
  const char = makeCharacter({ levels: { clout: 10, willpower: 10, flow: 8, frequency: 10 } });
  const tkv = calculateTKV(char);
  const m = calculateDeathSplit(char, tkv);

  it('GM gets all Body (10) + half of Soul, floored (5) = 15', () => {
    expect(m.toCampaign).toBe(15);
  });

  it('Lady Death gets ONLY Frequency (10) — nothing from Soul', () => {
    expect(m.toLadyDeath).toBe(10);
  });

  it('Spirit Flow (8) is retained on the ghost — never transferred', () => {
    expect(m.toPlayer).toBe(0); // transformation model: nothing goes "to player"
    const flow = m.components.find(c => c.source === 'attribute:flow');
    expect(flow?.destination).toBe('kept');
    expect(flow?.kv).toBe(8);
  });

  it('Soul keeps the MAJORITY on the ghost (ceil ½ = 5)', () => {
    const willKept = m.components.find(c => c.source === 'attribute:willpower' && c.destination === 'kept');
    expect(willKept?.kv).toBe(5);
    // ...and the floored half that left went to GM, not Lady Death.
    const willGone = m.components.find(c => c.source === 'attribute:willpower' && c.destination === 'campaign');
    expect(willGone?.kv).toBe(5);
  });

  it('everything balances: GM + Lady Death + kept = total on the character', () => {
    const kept = m.components.filter(c => c.destination === 'kept').reduce((s, c) => s + c.kv, 0);
    // clout 10 + willpower 10 + flow 8 + frequency 10 = 38
    expect(m.toCampaign + m.toLadyDeath + kept).toBe(38);
    // Regression guard: Soul's lost half must NOT be routed to Lady Death.
    expect(m.toLadyDeath).toBe(10);
  });
});

describe('splitSkillShares — multi-governor skills (Mike examples 2026-07-13)', () => {
  it('lvl 14, Clout(Body)+Wisdom(Soul): GM 10, ghost keeps 4', () => {
    const shares = splitSkillShares(14, ['clout', 'wisdom']);
    const toGM = shares.reduce((s, x) => s + x.toGM, 0);
    const kept = shares.reduce((s, x) => s + x.kept, 0);
    expect(toGM).toBe(10); // body 7 + soul floor(7/2)=3
    expect(kept).toBe(4); // soul ceil(7/2)=4; body keeps 0
  });

  it('lvl 13, Body+Soul: uneven split favors the Spirit package (soul gets 7)', () => {
    const shares = splitSkillShares(13, ['clout', 'wisdom']);
    const soul = shares.find(s => s.pillar === 'soul')!;
    const body = shares.find(s => s.pillar === 'body')!;
    expect(soul.share).toBe(7); // extra level goes to the higher-retention (soul) share
    expect(body.share).toBe(6);
    expect(shares.reduce((s, x) => s + x.toGM, 0)).toBe(9); // body 6 + soul 3
    expect(shares.reduce((s, x) => s + x.kept, 0)).toBe(4); // soul ceil(7/2)
  });

  it('pure Spirit-governed skill is fully retained', () => {
    const shares = splitSkillShares(10, ['flow']);
    expect(shares[0].kept).toBe(10);
    expect(shares[0].toGM).toBe(0);
  });

  it('pure Body-governed skill is fully stripped to GM', () => {
    const shares = splitSkillShares(10, ['clout']);
    expect(shares[0].toGM).toBe(10);
    expect(shares[0].kept).toBe(0);
  });
});
