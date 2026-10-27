import { describe, it, expect } from 'vitest';
import { detectActiveCheck, namedSkill, governorFor, aiEffort } from './active-check';

describe('detectActiveCheck — the deterministic floor', () => {
  it.each([
    ['Violet examines the lock.', 'inspect'],
    ['Kristopher inspects the deadbolt closely.', 'inspect'],
    ['She searches the drawer.', 'search'],
    ['He rummages through the coat pockets.', 'search'],
    ['Violet listens closely at the door.', 'listen'],
    ['Violet presses her ear to the wood.', 'listen'],
    ['Kristopher tries to force the lock.', 'attempt'],
    ['She attempts to pick it.', 'attempt'],
    ['*He looks carefully at the stain.*', 'inspect'],
  ])('%s -> %s', (text, kind) => {
    expect(detectActiveCheck(text)?.kind).toBe(kind);
  });

  it.each([
    'Kristopher knocks twice.',
    'Violet walks down the hall.',
    'She notices a smell of smoke.',
    'He hears footsteps on the stairs.',
    'Violet reads the note in her hand.',
    'He sees the light under the door.',
    'Kristopher sets the pizza down.',
    '',
  ])('does not fire on: %s', (text) => {
    expect(detectActiveCheck(text)).toBeNull();
  });

  it('perceptual kinds are flagged, an attempt is not', () => {
    expect(detectActiveCheck('She searches the drawer.')?.perceptual).toBe(true);
    expect(detectActiveCheck('He tries to lift the beam.')?.perceptual).toBe(false);
  });
});

describe('namedSkill / governorFor', () => {
  const skills = [{ name: 'Lock-picking' }, { name: 'Stealth' }, { name: 'Lore' }];
  it('finds a skill the act names; none -> null (unskilled)', () => {
    expect(namedSkill('Violet tries to open it with her lock picking.', skills)?.name).toBe('Lock-picking');
    expect(namedSkill('Kristopher tries to force the lock.', skills)).toBeNull();
  });
  it('perceiving rolls Wisdom; the provisional table covers the rest; default is willpower', () => {
    expect(governorFor('Violet listens closely', detectActiveCheck('Violet listens closely')!)).toBe('wisdom');
    expect(governorFor('Kristopher tries to force the lock', detectActiveCheck('Kristopher tries to force the lock')!)).toBe('clout');
    expect(governorFor('She tries to stay calm', detectActiveCheck('She tries to stay calm')!)).toBe('willpower');
  });
});

describe('aiEffort — the sim chooses Effort', () => {
  const pools = [{ name: 'wisdom', current: 6 }, { name: 'wit', current: 2 }];
  it('spends nothing when an average roll already beats the DR', () => {
    expect(aiEffort({ sd: 6, fdMax: 6, dr: 8, pools, ceiling: 5 })).toEqual([]);
  });
  it('wagers the gap to an average roll, biggest pool first, half a pool at most', () => {
    // need = 12 - 2 - 4 = 6, ceiling 5 -> 5; wisdom gives 3 (half of 6), wit gives 1
    expect(aiEffort({ sd: 2, fdMax: 6, dr: 12, pools, ceiling: 5 })).toEqual([{ governor: 'wisdom', amount: 3 }, { governor: 'wit', amount: 1 }]);
  });
  it('burns nothing on a check the ceiling cannot win', () => {
    expect(aiEffort({ sd: 1, fdMax: 4, dr: 30, pools, ceiling: 3 })).toEqual([]);
  });
});
