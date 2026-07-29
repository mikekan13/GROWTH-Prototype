import { describe, it, expect } from 'vitest';
import type { GrowthTrait } from '@/types/growth';
import {
  deriveBlockMode,
  deriveBlockStrength,
  deriveSubjectPattern,
  deriveAffectDelta,
  thornMatchesStimulus,
} from './thorns';

function thorn(overrides: Partial<GrowthTrait> = {}): GrowthTrait {
  return {
    name: 'Grief Over Her Mother',
    category: 'utility',
    description: 'The bearer cannot recall her mother\'s face without effort.',
    type: 'thorn',
    ...overrides,
  };
}

describe('deriveBlockMode (interprets the trait\'s own text, never invents)', () => {
  it('mentions of forgetting/blanking -> suppress', () => {
    expect(deriveBlockMode(thorn({ description: 'The bearer will forget the encounter entirely.' }))).toBe('suppress');
  });

  it('mentions of distortion/unreliability -> distort', () => {
    expect(deriveBlockMode(thorn({ description: 'The memory grows unreliable and warps over time.' }))).toBe('distort');
  });

  it('anything else -> affect-only', () => {
    expect(deriveBlockMode(thorn({ description: 'A deep ache whenever the topic arises.' }))).toBe('affect-only');
  });
});

describe('deriveBlockStrength', () => {
  it('scales with the trait\'s own rollModifiers magnitude', () => {
    const weak = deriveBlockStrength(thorn({ rollModifiers: [{ flat: -1 }] }));
    const strong = deriveBlockStrength(thorn({ rollModifiers: [{ flat: -8 }] }));
    expect(strong).toBeGreaterThan(weak);
  });

  it('falls back to a fixed conservative default with no rollModifiers', () => {
    expect(deriveBlockStrength(thorn())).toBeCloseTo(0.5, 5);
  });

  it('always clamps to [0.3, 1]', () => {
    const s = deriveBlockStrength(thorn({ rollModifiers: [{ flat: -999 }] }));
    expect(s).toBeLessThanOrEqual(1);
    expect(s).toBeGreaterThanOrEqual(0.3);
  });
});

describe('deriveSubjectPattern (bearer-agnostic keyword derivation)', () => {
  it('picks the longest non-stopword token from the trait name', () => {
    expect(deriveSubjectPattern(thorn({ name: 'Grief Over Her Mother' }))).toBe('mother');
  });

  it('never crashes on a name with only stopwords', () => {
    expect(() => deriveSubjectPattern(thorn({ name: 'the a of' }))).not.toThrow();
  });
});

describe('deriveAffectDelta', () => {
  it('always produces a negative valence, positive arousal (dread, not delight)', () => {
    for (const mode of ['suppress', 'distort', 'affect-only'] as const) {
      const delta = deriveAffectDelta(mode, 0.7);
      expect(delta.valence).toBeLessThan(0);
      expect(delta.arousal).toBeGreaterThan(0);
    }
  });

  it('scales with strength', () => {
    const weak = deriveAffectDelta('affect-only', 0.3);
    const strong = deriveAffectDelta('affect-only', 1);
    expect(Math.abs(strong.valence)).toBeGreaterThan(Math.abs(weak.valence));
  });
});

describe('thornMatchesStimulus (code-only deterministic detection)', () => {
  it('fires on a direct keyword match to the derived subject pattern', () => {
    const t = thorn({ name: 'Grief Over Her Mother', description: 'The bearer struggles whenever her mother comes up.' });
    expect(thornMatchesStimulus(t, 'Someone mentions your mother in passing.')).toBe(true);
  });

  it('does not fire on unrelated content', () => {
    const t = thorn({ name: 'Grief Over Her Mother', description: 'The bearer struggles whenever her mother comes up.' });
    expect(thornMatchesStimulus(t, 'A merchant haggles over the price of bread.')).toBe(false);
  });
});
