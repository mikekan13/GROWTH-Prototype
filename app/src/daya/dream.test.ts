import { describe, it, expect } from 'vitest';
import {
  distortability,
  applyDrift,
  decaySalienceStep,
  rehearsalCredit,
  applyMaintenance,
  isRuminationCandidate,
  ruminationStep,
  reconsolidationHealStep,
  ruminationLockShouldBreak,
  applySuppressionDecay,
  detectCounterweights,
  buildClusters,
  selectClusters,
  type DreamMemoryRow,
  type MemoryCluster,
} from './dream';
import { DREAM_TUNING } from './dream-tuning';

function memory(overrides: Partial<DreamMemoryRow> = {}): DreamMemoryRow {
  return {
    id: 'm1',
    content: 'something happened',
    valence: 0,
    arousal: 0,
    salience: 0.3,
    entityRefs: [],
    narrativeCycle: 0,
    source: 'perception',
    classificationRaw: '{}',
    labile: false,
    ...overrides,
  };
}

describe('distortability (T0 §A1 reconsolidation age gradient)', () => {
  it('is 1 at age 0 (freshly-retrieved memories are fully malleable)', () => {
    expect(distortability(0)).toBeCloseTo(1, 5);
  });
  it('decreases monotonically with age', () => {
    const young = distortability(2);
    const old = distortability(30);
    expect(old).toBeLessThan(young);
    expect(young).toBeLessThan(1);
  });
  it('never goes negative or hits exactly zero', () => {
    expect(distortability(1000)).toBeGreaterThan(0);
  });
});

describe('applyDrift (per-tick cap + age-gradient scaling)', () => {
  it('a young memory (age 2) drifts far more than an old one (age 30) under identical raw pressure', () => {
    const rawDelta = 0.5; // exceeds the cap on its own — cap engages before age-scaling
    const young = applyDrift(0, rawDelta, 2, -1, 1);
    const old = applyDrift(0, rawDelta, 30, -1, 1);
    expect(young).toBeGreaterThan(old);
    expect(old).toBeGreaterThan(0); // still moves a little — never fully frozen
  });
  it('never exceeds perTickDriftCap in raw magnitude before age-scaling', () => {
    const noAge = applyDrift(0, 10, 0, -1, 1); // huge raw delta, age 0 (distortability=1)
    expect(noAge).toBeLessThanOrEqual(DREAM_TUNING.perTickDriftCap + 1e-9);
  });
  it('respects the clamp bounds', () => {
    expect(applyDrift(0.98, 1, 0, -1, 1)).toBeLessThanOrEqual(1);
    expect(applyDrift(0.02, -1, 0, 0, 1)).toBeGreaterThanOrEqual(0);
  });
});

describe('decaySalienceStep + rehearsalCredit + applyMaintenance (spacing, T0 §A3)', () => {
  it('decay never drops below the floor and moves toward it', () => {
    const next = decaySalienceStep(0.8);
    expect(next).toBeLessThan(0.8);
    expect(next).toBeGreaterThan(0);
  });
  it('untouched memory only decays (zero rehearsal credit)', () => {
    expect(rehearsalCredit(false, false)).toBe(0);
    expect(rehearsalCredit(false, true)).toBe(0);
  });
  it('touched-this-tick-only (spaced) gets full credit; touched-both-ticks (consecutive) gets penalized credit', () => {
    const spaced = rehearsalCredit(true, false);
    const consecutive = rehearsalCredit(true, true);
    expect(consecutive).toBeLessThan(spaced);
    expect(consecutive).toBeCloseTo(spaced * (1 - DREAM_TUNING.recentlyRehearsedPenalty), 6);
  });
  it('a memory rehearsed on consecutive ticks gains less total salience than one rehearsed on spaced ticks (same rehearsal count, same tick span)', () => {
    const start = 0.3;
    // Three-tick window, two rehearsals each: consecutive = ticks 1,2; spaced = ticks 1,3.
    let consecutive = applyMaintenance(start, true, false); // tick 1
    consecutive = applyMaintenance(consecutive, true, true); // tick 2 (touched last tick too)
    consecutive = applyMaintenance(consecutive, false, true); // tick 3 (not touched)

    let spaced = applyMaintenance(start, true, false); // tick 1
    spaced = applyMaintenance(spaced, false, false); // tick 2 (skipped)
    spaced = applyMaintenance(spaced, true, false); // tick 3 (touched, not touched last tick)

    expect(consecutive).toBeLessThan(spaced);
  });
});

describe('isRuminationCandidate + ruminationStep + reconsolidationHealStep (T0 §C trauma loop)', () => {
  it('a negative, high-arousal cluster qualifies; a mundane one does not', () => {
    expect(isRuminationCandidate({ meanValence: -0.6, meanArousal: 0.7 })).toBe(true);
    expect(isRuminationCandidate({ meanValence: 0.1, meanArousal: 0.2 })).toBe(false);
    expect(isRuminationCandidate({ meanValence: -0.6, meanArousal: 0.3 })).toBe(false); // negative but low arousal
  });
  it('ruminationStep deepens valence down, arousal up, salience up', () => {
    const stepped = ruminationStep({ valence: -0.5, arousal: 0.6, salience: 0.4 });
    expect(stepped.valence).toBeCloseTo(-0.56, 6);
    expect(stepped.arousal).toBeCloseTo(0.64, 6);
    expect(stepped.salience).toBeCloseTo(0.48, 6);
  });
  it('repeated deepening strictly worsens valence across passes (the loop, not one-shot assignment)', () => {
    let v = { valence: -0.5, arousal: 0.6, salience: 0.4 };
    const trace = [v.valence];
    for (let i = 0; i < 5; i++) {
      v = ruminationStep(v);
      trace.push(v.valence);
    }
    for (let i = 1; i < trace.length; i++) expect(trace[i]).toBeLessThan(trace[i - 1]);
  });
  it('reconsolidationHealStep moves a negative valence toward neutral without overshooting', () => {
    const healed = reconsolidationHealStep(-0.5);
    expect(healed).toBeCloseTo(-0.42, 6);
    expect(healed).toBeLessThan(0);
  });
  it('reconsolidationHealStep never crosses zero in one step from a small negative value', () => {
    expect(reconsolidationHealStep(-0.02)).toBe(0);
  });
  it('repeated healing across ticks moves a locked cluster back toward neutral', () => {
    let v = -0.8;
    for (let i = 0; i < 10; i++) v = reconsolidationHealStep(v);
    expect(v).toBeGreaterThan(-0.8);
    expect(v).toBeLessThanOrEqual(0);
  });
});

describe('ruminationLockShouldBreak (seeded, deterministic PRNG)', () => {
  it('is deterministic for the same key', () => {
    const a = ruminationLockShouldBreak('entity-1', 'anchor-1', 5);
    const b = ruminationLockShouldBreak('entity-1', 'anchor-1', 5);
    expect(a).toBe(b);
  });
  it('breaks roughly at counterweightBreakP proportion across many tick indices', () => {
    let breaks = 0;
    const N = 500;
    for (let i = 0; i < N; i++) {
      if (ruminationLockShouldBreak('entity-stat', 'anchor-stat', i)) breaks++;
    }
    const rate = breaks / N;
    expect(rate).toBeGreaterThan(DREAM_TUNING.counterweightBreakP - 0.12);
    expect(rate).toBeLessThan(DREAM_TUNING.counterweightBreakP + 0.12);
  });
});

describe('applySuppressionDecay (extinction is not erasure)', () => {
  it('erodes toward zero, never negative', () => {
    expect(applySuppressionDecay(0.05)).toBe(0);
    expect(applySuppressionDecay(1)).toBeCloseTo(1 - DREAM_TUNING.suppressionDecayPerTick, 6);
  });
});

describe('detectCounterweights (T0 §C counterweight sources)', () => {
  it('detects social_contact from a positive dialogue beat', () => {
    const found = detectCounterweights([{ source: 'dialogue', valence: 0.5 }]);
    expect(found.has('social_contact')).toBe(true);
  });
  it('detects rest_safety from a rest-tagged beat', () => {
    const found = detectCounterweights([{ source: 'perception', valence: 0, rationaleTag: 'rest, no action' }]);
    expect(found.has('rest_safety')).toBe(true);
  });
  it('detects goal_progress from a positive vine-tick summary', () => {
    const found = detectCounterweights([{ source: 'reasoning', valence: 0.3, rationaleTag: 'vine tick summary' }]);
    expect(found.has('goal_progress')).toBe(true);
  });
  it('detects positive_recall from a positive perception/dream beat', () => {
    const found = detectCounterweights([{ source: 'dream', valence: 0.4 }]);
    expect(found.has('positive_recall')).toBe(true);
  });
  it('returns empty for a mundane/negative window', () => {
    const found = detectCounterweights([{ source: 'perception', valence: -0.2 }]);
    expect(found.size).toBe(0);
  });
});

describe('buildClusters (deterministic, no model)', () => {
  it('groups memories sharing an entityRef into one cluster', () => {
    const memories = [
      memory({ id: 'a', narrativeCycle: 1, entityRefs: ['char_X'], content: 'the argument got loud' }),
      memory({ id: 'b', narrativeCycle: 2, entityRefs: ['char_X'], content: 'thinking about the fight again' }),
      memory({ id: 'c', narrativeCycle: 10, entityRefs: [], content: 'a completely unrelated quiet afternoon nap' }),
    ];
    const clusters = buildClusters(memories);
    const clusterOfA = clusters.find((c) => c.memberIds.includes('a'))!;
    expect(clusterOfA.memberIds).toEqual(expect.arrayContaining(['a', 'b']));
    expect(clusterOfA.memberIds).not.toContain('c');
  });
  it('anchor is the earliest member by narrativeCycle', () => {
    const memories = [
      memory({ id: 'a', narrativeCycle: 5, entityRefs: ['char_Y'] }),
      memory({ id: 'b', narrativeCycle: 1, entityRefs: ['char_Y'] }),
    ];
    const clusters = buildClusters(memories);
    expect(clusters[0].anchorId).toBe('b');
  });
  it('is deterministic across repeated calls on the same input', () => {
    const memories = [
      memory({ id: 'a', narrativeCycle: 1, entityRefs: ['char_Z'] }),
      memory({ id: 'b', narrativeCycle: 2, entityRefs: ['char_Z'] }),
      memory({ id: 'c', narrativeCycle: 9, content: 'totally separate mundane thing' }),
    ];
    const run1 = buildClusters(memories);
    const run2 = buildClusters(memories);
    expect(run1).toEqual(run2);
  });
});

describe('selectClusters (N = round(3*contextDepth), rumination/recency bias)', () => {
  const clusters: MemoryCluster[] = [
    { key: 'c1', anchorId: 'c1', memberIds: ['c1'], meanValence: -0.6, meanArousal: 0.7, meanSalience: 0.3, labileCount: 0 },
    { key: 'c2', anchorId: 'c2', memberIds: ['c2'], meanValence: 0.1, meanArousal: 0.2, meanSalience: 0.9, labileCount: 0 },
    { key: 'c3', anchorId: 'c3', memberIds: ['c3'], meanValence: 0.0, meanArousal: 0.1, meanSalience: 0.1, labileCount: 0 },
  ];
  it('selects zero clusters at contextDepth 0 (N rounds to 0)', () => {
    expect(selectClusters(clusters, 0, new Set())).toHaveLength(0);
  });
  it('selects up to round(3*contextDepth) clusters, full depth selects all three', () => {
    const selected = selectClusters(clusters, 1, new Set());
    expect(selected.length).toBe(3);
  });
  it('a rumination-candidate cluster outranks a comparably-salient mundane one when budget is tight', () => {
    const tight: MemoryCluster[] = [
      { key: 'r1', anchorId: 'r1', memberIds: ['r1'], meanValence: -0.6, meanArousal: 0.7, meanSalience: 0.3, labileCount: 0 },
      { key: 'r2', anchorId: 'r2', memberIds: ['r2'], meanValence: 0.1, meanArousal: 0.2, meanSalience: 0.5, labileCount: 0 },
    ];
    const selected = selectClusters(tight, 1 / 3, new Set()); // N=1
    expect(selected).toHaveLength(1);
    expect(selected[0].key).toBe('r1');
  });
});
