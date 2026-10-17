/** Skill points per pillar (Mike 2026-10-17). */
import { describe, it, expect } from 'vitest';
import { computeSkillPoints, missingSkillPoints, skillPointCost } from '@/lib/skill-points';

const attrs = {
  clout: { level: 7 }, celerity: { level: 7 }, constitution: { level: 6 }, // 20 → 6
  flow: { level: 5 }, frequency: { level: 40 }, focus: { level: 4 },       // 9 → 3 (Frequency excluded)
  willpower: { level: 3 }, wisdom: { level: 3 }, wit: { level: 2 },        // 8 → 2
};

describe('skill points', () => {
  it('pillar total = floor(levels ÷ 3); Spirit ignores Frequency', () => {
    const p = computeSkillPoints(attrs, []);
    expect(p.body.total).toBe(6);
    expect(p.spirit.total).toBe(3);
    expect(p.soul.total).toBe(2);
  });

  it('each governor commits one point in its pillar', () => {
    expect(skillPointCost(['clout', 'celerity', 'focus'])).toEqual({ body: 2, spirit: 1, soul: 0 });
    const p = computeSkillPoints(attrs, [{ governors: ['clout', 'celerity', 'focus'] }, { governors: ['wit'] }]);
    expect(p.body).toEqual({ total: 6, committed: 2, available: 4 });
    expect(p.spirit).toEqual({ total: 3, committed: 1, available: 2 });
    expect(p.soul).toEqual({ total: 2, committed: 1, available: 1 });
  });

  it('a skill needing a fully-committed pillar cannot be learned', () => {
    const p = computeSkillPoints(attrs, [{ governors: ['wit'] }, { governors: ['wisdom'] }]);
    expect(missingSkillPoints(p, ['willpower', 'clout'])).toEqual(['soul']);
    expect(missingSkillPoints(p, ['clout', 'constitution'])).toEqual([]);
  });
});
