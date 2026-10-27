import { describe, it, expect } from 'vitest';
import { actInThirdPerson, worldChangeSentences } from './act-card';

describe('actInThirdPerson (HW8 run 7 item 1a)', () => {
  it('turns Violet\'s answer into her third-person act', () => {
    expect(actInThirdPerson('Violet', 'female', '*I turn the deadbolt, the metal catching with a small, final click, and then the knob.*'))
      .toBe('She turns the deadbolt, the metal catching with a small, final click, and then the knob.');
  });
  it('handles my / me and a name-less act', () => {
    expect(actInThirdPerson('Violet', 'f', 'I press my ear to the wood')).toBe('She presses her ear to the wood.');
    expect(actInThirdPerson('Violet', 'f', 'steps back from the door')).toBe('Violet steps back from the door.');
  });
});

describe('worldChangeSentences (item 1b)', () => {
  it('says the door the act opened', () => {
    expect(worldChangeSentences(['door "entry_door" → open'])).toEqual(['The entry door stands open.']);
    expect(worldChangeSentences(['door "entry_door" already open', 'Violet now holds "bill"'])).toEqual([]);
  });
});
