import { describe, it, expect } from 'vitest';
import { generateClampConstraints, buildClampPromptText, skillBandFor } from './clamp';

describe('skillBandFor (Ruling 8b band ladder)', () => {
  it('maps skill levels to bands: 0 untrained, 1-5 novice, 6-11 competent, 12-19 expert, 20 master', () => {
    expect(skillBandFor(0)).toBe('untrained');
    expect(skillBandFor(1)).toBe('novice');
    expect(skillBandFor(5)).toBe('novice');
    expect(skillBandFor(6)).toBe('competent');
    expect(skillBandFor(11)).toBe('competent');
    expect(skillBandFor(12)).toBe('expert');
    expect(skillBandFor(19)).toBe('expert');
    expect(skillBandFor(20)).toBe('master');
  });
});

describe('generateClampConstraints (Stage A)', () => {
  it('produces different constraint objects for untrained / competent / master', () => {
    const untrained = generateClampConstraints('medicine', 0);
    const competent = generateClampConstraints('medicine', 8);
    const master = generateClampConstraints('medicine', 20);

    expect(untrained.skillBand).toBe('untrained');
    expect(competent.skillBand).toBe('competent');
    expect(master.skillBand).toBe('master');

    expect(untrained.doesNotKnow).not.toEqual(competent.doesNotKnow);
    expect(competent.doesNotKnow).not.toEqual(master.doesNotKnow);
    expect(untrained.vocabulary).not.toBe(competent.vocabulary);
    expect(competent.vocabulary).not.toBe(master.vocabulary);
    expect(untrained.errorModes).not.toEqual(master.errorModes);
  });

  it('is pure: same (domain, skillLevel) always yields the same constraints', () => {
    const a = generateClampConstraints('mechanical', 9);
    const b = generateClampConstraints('mechanical', 9);
    expect(a).toEqual(b);
  });

  it('falls back to the general table for an unknown domain instead of throwing', () => {
    expect(() => generateClampConstraints('not-a-real-domain', 10)).not.toThrow();
    const fallback = generateClampConstraints('not-a-real-domain', 10);
    expect(fallback.skillBand).toBe('competent');
    expect(fallback.doesNotKnow.length).toBeGreaterThan(0);
  });

  it('falls back to the general table when domain is omitted', () => {
    const constraints = generateClampConstraints(undefined, 3);
    expect(constraints.skillBand).toBe('novice');
  });

  it('seeds at least six named everyday domains beyond the general fallback', async () => {
    const { CLAMP_DOMAINS } = await import('./clamp-tables');
    expect(Object.keys(CLAMP_DOMAINS).length).toBeGreaterThanOrEqual(6);
  });
});

describe('buildClampPromptText (positive-identity phrasing)', () => {
  const bands = [0, 3, 8, 15, 20];

  it('never uses instructed-sandbagging phrasing ("pretend", "act as if worse")', () => {
    for (const skill of bands) {
      const constraints = generateClampConstraints('law', skill);
      const text = buildClampPromptText(constraints, 'law');
      expect(text.toLowerCase()).not.toMatch(/pretend/);
      expect(text.toLowerCase()).not.toMatch(/act as if.*(worse|dumber|less)/);
    }
  });

  it('phrases the constraint positively — "you know X the way a ___ does"', () => {
    const constraints = generateClampConstraints('medicine', 3);
    const text = buildClampPromptText(constraints, 'medicine');
    expect(text).toMatch(/you know .* the way/i);
  });

  it('includes the doesNotKnow, vocabulary, and eraBounds content', () => {
    const constraints = generateClampConstraints('science', 14);
    const text = buildClampPromptText(constraints, 'science');
    for (const term of constraints.doesNotKnow) {
      expect(text).toContain(term);
    }
    expect(text).toContain(constraints.eraBounds);
  });
});
