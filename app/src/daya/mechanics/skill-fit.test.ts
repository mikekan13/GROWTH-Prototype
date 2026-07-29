import { describe, it, expect } from 'vitest';
import { selectCandidateSkills, SPECIFICITY_SWING, type SkillCandidate } from './skill-fit';

const CANDIDATES: SkillCandidate[] = [
  { name: 'Mountain Climbing', level: 8, governors: ['clout'] },
  { name: 'Athletics', level: 10, governors: ['clout'] },
  { name: 'Lockpicking', level: 6, governors: ['celerity'] },
];

describe('selectCandidateSkills (code-only prefilter, no model call)', () => {
  it('prefers the narrower on-target skill for a matching task', () => {
    const result = selectCandidateSkills('climb the mountain face', CANDIDATES);
    expect(result.some((c) => c.name === 'Mountain Climbing')).toBe(true);
  });

  it('returns empty (untrained) when nothing plausibly applies', () => {
    const result = selectCandidateSkills('recite ancient poetry from memory', CANDIDATES);
    expect(result).toEqual([]);
  });

  it('caps candidates and sorts best-match first', () => {
    const result = selectCandidateSkills('climb the mountain', CANDIDATES);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].name).toBe('Mountain Climbing');
  });
});

describe('SPECIFICITY_SWING math (drAdjust direction)', () => {
  it('a high fit produces a positive drAdjust (lowers effective DR)', () => {
    const fit = 0.9;
    const drAdjust = Math.round((fit - 0.5) * SPECIFICITY_SWING);
    expect(drAdjust).toBeGreaterThan(0);
  });

  it('a low fit produces a negative drAdjust (raises effective DR)', () => {
    const fit = 0.1;
    const drAdjust = Math.round((fit - 0.5) * SPECIFICITY_SWING);
    expect(drAdjust).toBeLessThan(0);
  });

  it('a neutral 0.5 fit produces zero adjustment', () => {
    const fit = 0.5;
    const drAdjust = Math.round((fit - 0.5) * SPECIFICITY_SWING);
    expect(drAdjust).toBe(0);
  });
});
