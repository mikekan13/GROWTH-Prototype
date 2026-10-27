import { describe, it, expect } from 'vitest';
import { nameIsHers, markAddressedByName } from './name-addressed';

describe('who said whose name (HW8 run 6)', () => {
  it('finds the hearer\'s name in the words, by first name or full', () => {
    expect(nameIsHers('Violet? I have a pizza for you.', 'Violet Okafor')).toBe(true);
    expect(nameIsHers('Is Violet Okafor home?', 'Violet Okafor')).toBe(true);
    expect(nameIsHers('Violetta is not here.', 'Violet')).toBe(false);
    expect(nameIsHers('I have a pizza.', 'Violet')).toBe(false);
  });
  it('marks a line whose quoted words carry the hearer\'s own name', () => {
    expect(markAddressedByName('Kristopher: Violet? I have a pizza for you.', 'Violet'))
      .toBe('Kristopher says your name — "Violet? I have a pizza for you."');
    expect(markAddressedByName("A man's voice: Violet? Anyone home?", 'Violet')).toBe("A man's voice says your name — \"Violet? Anyone home?\"");
  });
  it('leaves narration, lines without her name, and her own line alone', () => {
    const text = 'Someone knocks twice.\nKristopher: I have a pizza.\nViolet: Violet is here.';
    expect(markAddressedByName(text, 'Violet')).toBe(text);
  });
  it('marks only the lines that carry it in a stretch', () => {
    const out = markAddressedByName('He knocks.\nKristopher: Violet?\nKristopher: Hello.', 'Violet');
    expect(out.split('\n')).toEqual(['He knocks.', 'Kristopher says your name — "Violet?"', 'Kristopher: Hello.']);
  });
});

import { unmarkAddressed } from './name-addressed';
describe('unmarkAddressed (HW8 run 7 #8) - the label does not leak into the stored memory', () => {
  it('stores what she heard', () => {
    expect(unmarkAddressed('Kristopher says your name — "hello? Violet? Pizza."')).toBe('Kristopher: "hello? Violet? Pizza."');
    expect(unmarkAddressed('The bulb hums.')).toBe('The bulb hums.');
  });
});
