import { describe, it, expect } from 'vitest';
import {
  computeFidelityLevel,
  computeNumericContent,
  computeDescriptiveContent,
  rngFor,
  sealLint,
  applyBiasToFraction,
  moodValence,
  SUBJECT_ATTUNEMENT_CAPS,
  type AffectVector,
  type BiasProfile,
  type RenderSubject,
} from './renderer-math';

const NEUTRAL_MOOD: AffectVector = { morale: 0, stress: 0, grief: 0 };
const NO_BIAS: BiasProfile = {};

describe('fidelity ladder (Ruling 12)', () => {
  it('floor(attunement*5), capped at F4 below the 0.95 F5 seal', () => {
    expect(computeFidelityLevel('self-stat', 0)).toBe(0);
    expect(computeFidelityLevel('self-stat', 0.1)).toBe(0);
    expect(computeFidelityLevel('self-stat', 0.3)).toBe(1);
    expect(computeFidelityLevel('self-stat', 0.5)).toBe(2);
    expect(computeFidelityLevel('self-stat', 0.7)).toBe(3);
    expect(computeFidelityLevel('self-stat', 0.8)).toBe(4);
    expect(computeFidelityLevel('self-stat', 0.94)).toBe(4);
  });

  it('F5 is deep-introspection endgame only (attunement >= 0.95)', () => {
    expect(computeFidelityLevel('self-stat', 0.95)).toBe(5);
    expect(computeFidelityLevel('self-stat', 1.0)).toBe(5);
    expect(computeFidelityLevel('self-stat', 0.9)).toBe(4);
  });

  it('Phase-1 basic-human self-view cap: introspection in [0.4,0.6) never exceeds F2', () => {
    expect(computeFidelityLevel('self-stat', 0.4)).toBeLessThanOrEqual(2);
    expect(computeFidelityLevel('self-stat', 0.59)).toBeLessThanOrEqual(2);
  });

  it('subject-type caps: other-entity never numerically reads past min(attunement,0.6)', () => {
    expect(computeFidelityLevel('other-entity', 1.0)).toBe(3); // floor(0.6*5)=3
    expect(computeFidelityLevel('relationship', 1.0)).toBe(2); // floor(0.5*5)=2
    expect(computeFidelityLevel('environment', 1.0)).toBe(4);  // floor(0.8*5)=4
    expect(SUBJECT_ATTUNEMENT_CAPS['other-entity']).toBe(0.6);
    expect(SUBJECT_ATTUNEMENT_CAPS.relationship).toBe(0.5);
  });
});

describe('seal lint (Ruling 13 — mechanical vocabulary must never reach prose)', () => {
  it('rejects game-mechanics vocabulary', () => {
    expect(sealLint('You take a -2 Willpower penalty.').ok).toBe(false);
    expect(sealLint('Roll a d20 against the DR.').ok).toBe(false);
    expect(sealLint('Your pool is nearly empty.').ok).toBe(false);
    expect(sealLint('Spend some KRMA.').ok).toBe(false);
    expect(sealLint('Apply the modifier.').ok).toBe(false);
    expect(sealLint('This is a tier 3 threat.').ok).toBe(false);
  });

  it('accepts plain felt-perception prose, including bare F5 attribute+number', () => {
    expect(sealLint('You feel steady, like you could keep going for hours.').ok).toBe(true);
    expect(sealLint('Willpower 14/20.').ok).toBe(true); // spec F5 example — no leading sign
    expect(sealLint("Maybe two-thirds of what you had this morning.").ok).toBe(true);
  });

  it('50 varied deterministic-template renders never trip the seal lint', () => {
    const subjects: RenderSubject[] = ['self-stat', 'possession', 'environment', 'other-entity', 'relationship'];
    const profiles: BiasProfile[] = [
      {},
      { selfRegard: 0.6 },
      { selfRegard: -0.6 },
      { optimism: 0.8, projection: 0.5 },
      { denial: 0.7, catastrophize: 0.7 },
    ];
    const moods: AffectVector[] = [
      { morale: 0, stress: 0, grief: 0 },
      { morale: -0.8, stress: 0.8, grief: 0.8 },
      { morale: 0.8, stress: 0, grief: 0 },
    ];

    let count = 0;
    let violations: string[] = [];
    for (let level = 0; level <= 5; level++) {
      for (const subject of subjects) {
        for (const bias of profiles) {
          for (const mood of moods) {
            const rng = rngFor('__TEST_ENTITY__', `sweep.${subject}.${level}`, count);
            const content = subject === 'other-entity' || subject === 'environment'
              ? computeNumericContent({ subject, subjectKey: 'pool.willpower', trueData: { current: 14, max: 20 } }, bias, mood, level, rng)
              : computeDescriptiveContent({ subject, subjectKey: 'room.door', trueData: 'the door is closed' }, bias, mood, level, rng);
            const lint = sealLint(content.prose);
            if (!lint.ok) violations.push(`[${subject} F${level}] "${content.prose}" matched "${lint.match}"`);
            count++;
            if (count >= 50) break;
          }
          if (count >= 50) break;
        }
        if (count >= 50) break;
      }
      if (count >= 50) break;
    }

    expect(count).toBeGreaterThanOrEqual(50);
    expect(violations).toEqual([]);
  });
});

describe('deterministic seeded PRNG', () => {
  it('same (entityId, subjectKey, epoch) always yields the same sequence', () => {
    const a = rngFor('char-1', 'pool.willpower', 3);
    const b = rngFor('char-1', 'pool.willpower', 3);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('a different epoch produces a different sequence', () => {
    const a = rngFor('char-1', 'pool.willpower', 3)();
    const b = rngFor('char-1', 'pool.willpower', 4)();
    expect(a).not.toBe(b);
  });

  it('10 consecutive content computations at the same epoch are numerically identical', () => {
    const trueData = { current: 14, max: 20 };
    const outputs = Array.from({ length: 10 }, () => {
      const rng = rngFor('char-1', 'pool.willpower', 7);
      return computeNumericContent({ subject: 'self-stat', subjectKey: 'pool.willpower', trueData }, { selfRegard: 0.4 }, NEUTRAL_MOOD, 3, rng);
    });
    const first = outputs[0].numericEstimate;
    for (const o of outputs) expect(o.numericEstimate).toBe(first);
  });
});

describe('acceptance §7.1 — Willpower 14/20 at F1/F2/F3 across two profiles', () => {
  const trueData = { current: 14, max: 20 }; // true fraction 0.7
  const arrogant: BiasProfile = { selfRegard: 0.6 };
  const anxious: BiasProfile = { selfRegard: -0.3 };

  it('arrogant F1 reads a top-tier ordinal bucket ("plenty")', () => {
    const rng = rngFor('e1', 'pool.willpower', 0);
    const c = computeNumericContent({ subject: 'self-stat', subjectKey: 'pool.willpower', trueData }, arrogant, NEUTRAL_MOOD, 1, rng);
    expect(c.prose.toLowerCase()).toContain('plenty');
  });

  it('arrogant F2/F3 overread: distorted fraction sits above the true fraction', () => {
    for (const level of [2, 3]) {
      const rng = rngFor('e1', 'pool.willpower', level);
      const c = computeNumericContent({ subject: 'self-stat', subjectKey: 'pool.willpower', trueData }, arrogant, NEUTRAL_MOOD, level, rng);
      expect(c.fraction).toBeGreaterThan(0.7 * 0.9); // allow noise band but stays overread-leaning
    }
  });

  it('anxious F3 underreads the true fraction', () => {
    const rng = rngFor('e2', 'pool.willpower', 3);
    const c = computeNumericContent({ subject: 'self-stat', subjectKey: 'pool.willpower', trueData }, anxious, NEUTRAL_MOOD, 3, rng);
    expect(c.fraction).toBeLessThan(0.7);
  });

  it('all six (profile x level) outputs are non-empty, seal-clean prose with no mechanics vocab', () => {
    for (const profile of [arrogant, anxious]) {
      for (const level of [1, 2, 3]) {
        const rng = rngFor('e3', 'pool.willpower', level);
        const c = computeNumericContent({ subject: 'self-stat', subjectKey: 'pool.willpower', trueData }, profile, NEUTRAL_MOOD, level, rng);
        expect(c.prose.length).toBeGreaterThan(0);
        expect(sealLint(c.prose).ok).toBe(true);
      }
    }
  });
});

describe('F5 is exact and bias-free', () => {
  it('renders true numbers verbatim regardless of bias', () => {
    const rng = rngFor('e4', 'pool.willpower', 0);
    const c = computeNumericContent(
      { subject: 'self-stat', subjectKey: 'pool.willpower', trueData: { current: 14, max: 20 } },
      { selfRegard: 0.9 },
      NEUTRAL_MOOD,
      5,
      rng,
    );
    expect(c.numericEstimate).toBe(14);
    expect(c.prose).toContain('14/20');
  });
});

describe('mood tilt colors interpretation, not the numeric content (§3)', () => {
  it('at F3+, mood does not change the underlying fraction (same seed, same profile)', () => {
    const trueData = { current: 14, max: 20 };
    const rngSad = rngFor('e5', 'pool.willpower', 1);
    const sadMood: AffectVector = { morale: -0.8, stress: 0.8, grief: 0.8 };
    const rngHappy = rngFor('e5', 'pool.willpower', 1);
    const happyMood: AffectVector = { morale: 0.8, stress: 0, grief: 0 };

    const sad = computeNumericContent({ subject: 'self-stat', subjectKey: 'pool.willpower', trueData }, NO_BIAS, sadMood, 3, rngSad);
    const happy = computeNumericContent({ subject: 'self-stat', subjectKey: 'pool.willpower', trueData }, NO_BIAS, happyMood, 3, rngHappy);

    expect(sad.numericEstimate).toBeCloseTo(happy.numericEstimate, 5);
    expect(sad.prose).not.toBe(happy.prose); // framing differs ("gone" vs "left")
  });
});

describe('projection bias (§4 + acceptance §7.6)', () => {
  it('high observer grief + projection contaminates an other-entity read and logs it', () => {
    const distortions: string[] = [];
    const griefMood: AffectVector = { morale: -0.2, stress: 0.3, grief: 0.9 };
    const biased = applyBiasToFraction(0.7, 'other-entity', { projection: 0.8 }, griefMood, distortions);
    expect(biased).toBeLessThan(0.7); // grief pulls the other-entity read down
    expect(distortions.some(d => d.startsWith('projection:'))).toBe(true);
    expect(moodValence(griefMood)).toBeLessThan(0);
  });

  it('no projection distortion fires without the bias operator set', () => {
    const distortions: string[] = [];
    applyBiasToFraction(0.7, 'other-entity', {}, { morale: -0.2, stress: 0.3, grief: 0.9 }, distortions);
    expect(distortions.some(d => d.startsWith('projection:'))).toBe(false);
  });
});
