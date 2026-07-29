import { describe, it, expect } from 'vitest';
import {
  RECALL_TUNING,
  stemmedJaccard,
  computeRelevance,
  computeRecency,
  computeMoodCongruence,
  wisdomThreshold,
  wisdomBudget,
  witImmediateProbability,
  witPasses,
  seededRandom01,
  scoreCandidate,
  localSealLint,
  poolNorm,
  type ParsedMemory,
} from './recall';

describe('stemmedJaccard (relevance keyword overlap)', () => {
  it('is 1 for identical strings', () => {
    expect(stemmedJaccard('the mug is warm', 'the mug is warm')).toBeCloseTo(1, 5);
  });
  it('is 0 for disjoint strings', () => {
    expect(stemmedJaccard('kettle boils', 'window latch stuck')).toBe(0);
  });
  it('matches across simple inflection (stemming)', () => {
    // "mugs" stems to "mug" and should overlap with an unstemmed "mug"
    const j = stemmedJaccard('the mugs were on the counter', 'a mug sat there');
    expect(j).toBeGreaterThan(0);
  });
});

describe('computeRelevance', () => {
  it('scales keyword overlap into the 0..0.6 band and adds refs/thread bonuses', () => {
    const base = computeRelevance('tell me about the letter', [], 'letter letter letter letter', []);
    expect(base).toBeGreaterThan(0);
    expect(base).toBeLessThanOrEqual(0.6);

    const withRefs = computeRelevance('tell me about the letter', ['char_A'], 'a letter', ['char_A']);
    const withoutRefs = computeRelevance('tell me about the letter', ['char_A'], 'a letter', []);
    expect(withRefs - withoutRefs).toBeCloseTo(0.3, 5);

    const withThread = computeRelevance('x', [], 'y', [], true);
    const withoutThread = computeRelevance('x', [], 'y', [], false);
    expect(withThread - withoutThread).toBeCloseTo(0.1, 5);
  });

  it('never exceeds 1', () => {
    const r = computeRelevance('letter letter letter', ['a', 'b'], 'letter letter letter', ['a'], true);
    expect(r).toBeLessThanOrEqual(1);
  });
});

describe('computeRecency (power-law decay, salience resists it)', () => {
  it('is 1 at zero delta', () => {
    expect(computeRecency(0, 0.5)).toBeCloseTo(1, 5);
  });
  it('decays monotonically with age', () => {
    const near = computeRecency(1, 0.2);
    const far = computeRecency(20, 0.2);
    expect(far).toBeLessThan(near);
    expect(far).toBeGreaterThan(0); // never hits zero — the system never forgets
  });
  it('high salience resists decay relative to low salience at the same age', () => {
    const lowSal = computeRecency(10, 0.0);
    const highSal = computeRecency(10, 1.0);
    expect(highSal).toBeGreaterThan(lowSal);
  });
});

describe('computeMoodCongruence', () => {
  it('is more positive for a mood-congruent (same-sign) memory than an incongruent one', () => {
    const happyMood = { morale: 0.8, stress: 0, grief: 0 };
    const positiveMemory = { valence: 0.7, arousal: 0.5 };
    const negativeMemory = { valence: -0.7, arousal: 0.5 };
    expect(computeMoodCongruence(happyMood, positiveMemory)).toBeGreaterThan(
      computeMoodCongruence(happyMood, negativeMemory),
    );
  });

  it('positive-mood gain is stronger than negative-mood gain at equal magnitude (T0 asymmetry)', () => {
    const posMood = { morale: 0.9, stress: 0, grief: 0 };
    const negMood = { morale: 0, stress: 0, grief: 0.9 };
    const memMatchingPos = { valence: 1, arousal: 1 };
    const memMatchingNeg = { valence: -1, arousal: 1 };
    const posCongruence = computeMoodCongruence(posMood, memMatchingPos);
    const negCongruence = computeMoodCongruence(negMood, memMatchingNeg);
    expect(posCongruence).toBeGreaterThan(negCongruence);
  });

  it('mood-repair pulls toward positive memories under mild negative mood', () => {
    const sadMood = { morale: -0.5, stress: 0.1, grief: 0 };
    const positiveMemory = { valence: 0.6, arousal: 0.3 };
    const withRepair = computeMoodCongruence(sadMood, positiveMemory, false);
    const withoutRepairAvailable = computeMoodCongruence(sadMood, positiveMemory, true); // rumination lock disables repair
    expect(withRepair).toBeGreaterThan(withoutRepairAvailable);
  });

  it('stays within [-0.5, 0.5]', () => {
    const extreme = computeMoodCongruence({ morale: 1, stress: 1, grief: 0 }, { valence: 1, arousal: 1 });
    expect(extreme).toBeLessThanOrEqual(0.5);
    expect(extreme).toBeGreaterThanOrEqual(-0.5);
  });
});

describe('poolNorm + Wisdom gate (breadth)', () => {
  it('higher Wisdom yields a lower (easier) threshold', () => {
    expect(wisdomThreshold(40)).toBeLessThan(wisdomThreshold(10));
  });
  it('higher Wisdom yields a larger or equal budget', () => {
    expect(wisdomBudget(40, 40)).toBeGreaterThanOrEqual(wisdomBudget(10, 10));
  });
  it('a drained current pool narrows the budget relative to a full one at the same max', () => {
    expect(wisdomBudget(40, 10)).toBeLessThanOrEqual(wisdomBudget(40, 40));
  });
  it('poolNorm clamps at the calibration cap', () => {
    expect(poolNorm(1000)).toBe(RECALL_TUNING.wisdomNormCap);
    expect(poolNorm(0)).toBe(0);
  });
});

describe('Wit gate (speed) — deterministic seeded PRNG', () => {
  it('higher Wit yields a higher immediate-surfacing probability', () => {
    expect(witImmediateProbability(40)).toBeGreaterThan(witImmediateProbability(0));
  });
  it('is deterministic for the same (entity, memory, cycle)', () => {
    const a = witPasses('ent1', 'mem1', 5, 20);
    const b = witPasses('ent1', 'mem1', 5, 20);
    expect(a).toBe(b);
  });
  it('seededRandom01 is stable and in [0, 1)', () => {
    const v = seededRandom01('some-seed-key');
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
    expect(seededRandom01('some-seed-key')).toBe(v);
  });
});

describe('scoreCandidate (pure, no DB)', () => {
  const baseMemory: ParsedMemory = {
    id: 'm1',
    content: 'the argument in the kitchen left everyone shaken',
    valence: -0.7,
    arousal: 0.7,
    salience: 0.6,
    entityRefs: ['char_A'],
    narrativeCycle: 0,
  };

  it('suppress-mode Thorn blocks drive score to -Infinity', () => {
    const scored = scoreCandidate(baseMemory, 'the argument', [], { morale: 0, stress: 0, grief: 0 }, 1, [
      { subjectPattern: 'argument', mode: 'suppress', strength: 1 },
    ]);
    expect(scored.score).toBe(-Infinity);
    expect(scored.thornMatch?.mode).toBe('suppress');
  });

  it('affect-only Thorn blocks also drive score to -Infinity (never surfaces)', () => {
    const scored = scoreCandidate(baseMemory, 'the argument', [], { morale: 0, stress: 0, grief: 0 }, 1, [
      { subjectPattern: 'argument', mode: 'affect-only', strength: 1 },
    ]);
    expect(scored.score).toBe(-Infinity);
  });

  it('distort-mode Thorn blocks do NOT drive score to -Infinity (it still surfaces, just distorted)', () => {
    const scored = scoreCandidate(baseMemory, 'the argument', [], { morale: 0, stress: 0, grief: 0 }, 1, [
      { subjectPattern: 'argument', mode: 'distort', strength: 1 },
    ]);
    expect(Number.isFinite(scored.score)).toBe(true);
  });

  it('a zero-strength Thorn block is inert', () => {
    const scored = scoreCandidate(baseMemory, 'the argument', [], { morale: 0, stress: 0, grief: 0 }, 1, [
      { subjectPattern: 'argument', mode: 'suppress', strength: 0 },
    ]);
    expect(scored.thornMatch).toBeNull();
    expect(Number.isFinite(scored.score)).toBe(true);
  });

  it('an unrelated Thorn pattern does not match', () => {
    const scored = scoreCandidate(baseMemory, 'the argument', [], { morale: 0, stress: 0, grief: 0 }, 1, [
      { subjectPattern: 'the accident', mode: 'suppress', strength: 1 },
    ]);
    expect(scored.thornMatch).toBeNull();
  });
});

describe('localSealLint', () => {
  it('flags obvious mechanical vocabulary', () => {
    expect(localSealLint('roll a d20 against DR 12')).toBe(false);
    expect(localSealLint('your character sheet says KRMA 40')).toBe(false);
  });
  it('passes ordinary experiential prose', () => {
    expect(localSealLint('The mug is warm in my grip. Simple thing, solid thing.')).toBe(true);
  });
});
