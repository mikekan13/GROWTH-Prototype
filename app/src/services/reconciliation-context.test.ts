import { describe, it, expect } from 'vitest';
import { itemLine, memoryKeys, touchingMemories, familiarityLines, answeredLines } from './reconciliation-context';

describe('what JEWL sees of the world', () => {
  it('prints the text written on a thing', () => {
    const line = itemLine('Chess Pizza receipt', JSON.stringify({ text: 'CUSTOMER: VIOLET\nTOTAL 14.50', description: 'a thermal receipt' }));
    expect(line).toContain('CUSTOMER: VIOLET');
    expect(line).toContain('a thermal receipt');
  });
  it('survives bad or empty data and truncates long text', () => {
    expect(itemLine('Key', 'not json')).toBe('Key');
    expect(itemLine('Note', JSON.stringify({ text: 'x'.repeat(2000) })).length).toBeLessThan(700);
  });
  it('finds the memories that touch the line by capitalised names', () => {
    const keys = memoryKeys('Kristopher speaks through the door: "Violet? I have a pizza here for you"', ['Violet']);
    expect(keys).toContain('violet');
    const hits = touchingMemories(['the receipt always reading the same first name: Violet', 'rain on the window'], keys);
    expect(hits).toEqual(['the receipt always reading the same first name: Violet']);
  });
  it('caps memories and clips them', () => {
    const many = Array.from({ length: 20 }, () => `Violet ${'y'.repeat(400)}`);
    const hits = touchingMemories(many, ['violet']);
    expect(hits).toHaveLength(8);
    expect(hits[0].length).toBeLessThanOrEqual(241);
  });
  it('summarises familiarity and the Watcher\'s earlier answers', () => {
    expect(familiarityLines([
      { perceiver: 'Kristopher', subject: 'Violet', aspectKind: 'identity', score: 0.7 },
      { perceiver: 'Kristopher', subject: 'Violet', aspectKind: 'appearance', score: 0.7 },
    ])).toEqual(['Kristopher knows Violet: identity 0.7, appearance 0.7']);
    expect(answeredLines([{ message: 'a', answer: null }, { message: 'He holds the receipt', answer: 'It says CUSTOMER: VIOLET' }])).toHaveLength(1);
  });
});

import { doorStateLines } from './reconciliation-context';
describe('doorStateLines (HW8 run 7 #1c)', () => {
  it('states the door open since she opened it, for JEWL to check narration against', () => {
    const lines = doorStateLines([{ name: 'entry_door', between: ['landing', 'apartment'], state: 'open' }, { name: 'entry_door', between: ['landing', 'apartment'], state: 'open' }], ['Violet: She turns the deadbolt and then the knob.']);
    expect(lines).toEqual(['the entry door (between landing and apartment) is OPEN', 'recently: Violet: She turns the deadbolt and then the knob.']);
  });
});
