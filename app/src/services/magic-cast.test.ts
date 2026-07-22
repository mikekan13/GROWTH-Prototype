import { describe, it, expect } from 'vitest';
import { createDefaultCharacter } from '@/lib/defaults';
import type { GrowthCharacter, GrowthSkill } from '@/types/growth';
import {
  computeCastPlan,
  resolveCast,
  getSchoolLevel,
  CastError,
} from './magic-cast';

const DR = 50; // system-engagement threshold used across these tests

function fixture(): GrowthCharacter {
  const c = createDefaultCharacter('Cast Test');
  c.magic = {
    mercy: { schools: [], knownSpells: [], skillLevels: { Restoration: 6 } }, // d6
    severity: { schools: [], knownSpells: [], skillLevels: { Force: 4, Alteration: 2 } }, // d4, +2
    balance: { schools: [], knownSpells: [], skillLevels: {} },
  };
  const skill: GrowthSkill = { name: 'Blacksmithing', level: 8, governors: ['clout'] }; // d8
  c.skills = [skill];
  return c;
}

describe('magic-cast — wild/woven resolution (r-2026-07-22-01)', () => {
  it('reads a school level from the right pillar', () => {
    const c = fixture();
    expect(getSchoolLevel(c, 'Restoration')).toBe(6);
    expect(getSchoolLevel(c, 'Force')).toBe(4);
    expect(getSchoolLevel(c, 'Illusion')).toBe(0); // unset
  });

  it('multi-school cast uses the WEAKEST involved school die', () => {
    const c = fixture();
    // Force (lvl 4 → d4) vs Alteration (lvl 2 → flat +2): weakest = Alteration
    const plan = computeCastPlan(c, { schools: ['Force', 'Alteration'], method: 'wild', dr: 20 }, DR);
    expect(plan.weakestSchool).toBe('Alteration');
    expect(plan.weakestLevel).toBe(2);
    expect(plan.schoolDie).toBe('+2');
    expect(plan.schoolDieSides).toBe(0);
    expect(plan.schoolFlat).toBe(2);
  });

  it('wild cast: FD + school die + mana vs DR; success on meet', () => {
    const c = fixture();
    const plan = computeCastPlan(c, { schools: ['Restoration'], method: 'wild', dr: 12, manaSpent: 2 }, DR);
    // Restoration lvl 6 → d6. Fate 4 + school 6 + mana 2 = 12 vs DR 12 → meet = success.
    const res = resolveCast(plan, { fateDieResult: 4, schoolDieResult: 6 });
    expect(res.total).toBe(12);
    expect(res.success).toBe(true);
    expect(res.monkeyPaw).toBe(false);
    expect(res.schoolToMarkTrainable).toBeNull();
  });

  it('wild cast failure → Monkey Paw + marks the weakest school trainable', () => {
    const c = fixture();
    const plan = computeCastPlan(c, { schools: ['Force', 'Alteration'], method: 'wild', dr: 20 }, DR);
    // weakest = Alteration (+2). Fate 3 + flat 2 = 5 vs DR 20 → fail.
    const res = resolveCast(plan, { fateDieResult: 3 });
    expect(res.success).toBe(false);
    expect(res.monkeyPaw).toBe(true);
    expect(res.schoolToMarkTrainable).toBe('Alteration');
  });

  it('woven cast adds the associated skill die and never Monkey-Paws', () => {
    const c = fixture();
    const plan = computeCastPlan(
      c,
      { schools: ['Restoration'], method: 'woven', dr: 25, associatedSkillName: 'blacksmithing' },
      DR,
    );
    expect(plan.associatedDie).toBe('d8'); // Blacksmithing lvl 8
    // Fate 5 + school(d6) 6 + associated(d8) 8 = 19 vs DR 25 → fail, but woven.
    const res = resolveCast(plan, { fateDieResult: 5, schoolDieResult: 6, associatedDieResult: 8 });
    expect(res.total).toBe(19);
    expect(res.success).toBe(false);
    expect(res.monkeyPaw).toBe(false);             // woven never monkey-paws
    expect(res.schoolToMarkTrainable).toBeNull();  // woven never marks trainable
  });

  it('flags system review at/above the configured DR threshold', () => {
    const c = fixture();
    const under = computeCastPlan(c, { schools: ['Restoration'], method: 'wild', dr: 49 }, DR);
    const at = computeCastPlan(c, { schools: ['Restoration'], method: 'wild', dr: 50 }, DR);
    expect(under.requiresSystemReview).toBe(false);
    expect(at.requiresSystemReview).toBe(true);
  });

  it('rejects a woven cast with no associated skill, and an empty school list', () => {
    const c = fixture();
    expect(() => computeCastPlan(c, { schools: ['Force'], method: 'woven', dr: 10 }, DR)).toThrow(CastError);
    expect(() => computeCastPlan(c, { schools: [], method: 'wild', dr: 10 }, DR)).toThrow(CastError);
  });
});
