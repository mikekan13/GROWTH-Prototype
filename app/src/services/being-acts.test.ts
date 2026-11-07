import { describe, it, expect } from 'vitest';
import { creditReading, wordsPerRound, wordCount, ORDINARY_WORDS_PER_SOUL_ACTION } from './being-acts';

const q = [{ id: 'a', words: 10 }, { id: 'b', words: 20 }, { id: 'c', words: 5 }];

describe('creditReading (the time law, 2026-11-07)', () => {
  it('reads oldest first and finishes only whole messages', () => {
    const p = creditReading(q, 0, 25);
    expect(p.done).toBe(25);
    expect(p.finished).toEqual([{ id: 'a', atWords: 10 }]);
  });
  it('carries over: the next credit finishes the one in progress at its own word', () => {
    const p = creditReading(q, 25, 100);
    expect(p.finished).toEqual([{ id: 'b', atWords: 30 }, { id: 'c', atWords: 35 }]);
    expect(p.done).toBe(35);
  });
  it('a credit of nothing finishes nothing', () => {
    expect(creditReading(q, 10, 0)).toEqual({ finished: [], done: 10 });
  });
});

describe('wordsPerRound: attributes scale speed through the action count only', () => {
  const sheet = (w: number) => ({ attributes: { willpower: { level: w }, wisdom: { level: w }, wit: { level: w } } }) as never;
  it('an ordinary reader (one Soul action) reads the ordinary yield per round', () => {
    expect(wordsPerRound(sheet(30))).toBe(ORDINARY_WORDS_PER_SOUL_ACTION);
  });
  it('a Wit-1000-class mind has many Soul actions and reads that many times more', () => {
    expect(wordsPerRound(sheet(1000))).toBe(40 * ORDINARY_WORDS_PER_SOUL_ACTION);
  });
  it('counts words', () => { expect(wordCount("I'm getting a london fog.")).toBe(5); });
});
