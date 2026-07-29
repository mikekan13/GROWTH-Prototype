import { describe, it, expect } from 'vitest';
import { sealLint, hasHardHit } from './seal';

describe('sealLint (canonical, HARD)', () => {
  it('flags a numeric DR pattern', () => {
    const hits = sealLint('That was a DR 14 climb.');
    expect(hasHardHit(hits)).toBe(true);
    expect(hits.some((h) => h.pattern === 'numeric-mechanics')).toBe(true);
  });

  it('flags a die-type token', () => {
    const hits = sealLint('Roll a d8 for it.');
    expect(hasHardHit(hits)).toBe(true);
  });

  it('flags a signed modifier attached to a word', () => {
    const hits = sealLint('You get +2 to grip.');
    expect(hasHardHit(hits)).toBe(true);
  });

  it('flags a pool fraction pattern', () => {
    const hits = sealLint('You have 3/10 pool left.');
    expect(hasHardHit(hits)).toBe(true);
  });

  it('flags unambiguous meta vocabulary as whole words', () => {
    for (const phrase of [
      'Roll the dice',
      'ask the game master',
      'talk to the GM',
      'that NPC over there',
      'as a player character',
      'spend some KRMA',
      'check the character sheet',
      'you take hit points',
      'that was out of character',
    ]) {
      const hits = sealLint(phrase);
      expect(hasHardHit(hits), `expected HARD hit for: "${phrase}"`).toBe(true);
    }
  });

  it('does NOT flag ordinary English that merely contains a meta substring', () => {
    // "GM" as a whole word should hit; embedded inside another word should not.
    const hits = sealLint('The gymnasium was empty.');
    expect(hasHardHit(hits)).toBe(false);
  });
});

describe('sealLint (canonical, SOFT)', () => {
  it('treats an attribute name used descriptively as SOFT, not HARD', () => {
    const hits = sealLint('My willpower is low today.');
    expect(hasHardHit(hits)).toBe(false);
    expect(hits.some((h) => h.severity === 'SOFT' && h.pattern === 'attribute-name')).toBe(true);
  });

  it('the same attribute name WITH a number is HARD (numeric rule wins)', () => {
    const hits = sealLint('willpower +2 to the roll');
    expect(hasHardHit(hits)).toBe(true);
  });

  it('suppresses SOFT reporting once a HARD hit already fired', () => {
    const hits = sealLint('Roll a d6, your willpower feels shaky.');
    expect(hits.filter((h) => h.severity === 'HARD').length).toBeGreaterThan(0);
    expect(hits.some((h) => h.severity === 'SOFT')).toBe(false);
  });
});

describe('sealLint (clean text)', () => {
  it('returns no hits for ordinary lived-experience prose', () => {
    const hits = sealLint('Her hands are steady. The room smells like rain through an open window.');
    expect(hits.length).toBe(0);
  });
});
