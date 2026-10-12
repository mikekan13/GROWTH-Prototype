/** Age + DOB validation + maturity vocab (Mike 2026-10-12). */
import { describe, it, expect } from 'vitest';
import { isAdult, ageInYears, dateOfBirthSchema, needsDateOfBirth } from '@/lib/age';
import { MATURITY_FLAGS, maturityFlagLabel } from '@/lib/maturity-flags';
import { validateForgeData } from '@/services/forge-schemas';
import { registerSchema } from '@/services/auth';

const NOW = new Date('2026-10-12T12:00:00.000Z');
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('isAdult', () => {
  it('17 years 364 days is a minor; 18 years to the day is an adult', () => {
    expect(isAdult({ role: 'TRAILBLAZER', dateOfBirth: d('2008-10-13') }, NOW)).toBe(false);
    expect(isAdult({ role: 'TRAILBLAZER', dateOfBirth: d('2008-10-12') }, NOW)).toBe(true);
    expect(ageInYears(d('2008-10-13'), NOW)).toBe(17);
  });
  it('a leap-day birth turns 18 on Mar 1 in a common year', () => {
    expect(isAdult({ role: 'TRAILBLAZER', dateOfBirth: d('2008-02-29') }, new Date('2026-02-28T12:00:00Z'))).toBe(false);
    expect(isAdult({ role: 'TRAILBLAZER', dateOfBirth: d('2008-02-29') }, new Date('2026-03-01T12:00:00Z'))).toBe(true);
  });
  it('unknown DOB = minor for everyone but ADMIN', () => {
    expect(isAdult({ role: 'TRAILBLAZER', dateOfBirth: null }, NOW)).toBe(false);
    expect(isAdult({ role: 'WATCHER', dateOfBirth: null }, NOW)).toBe(false);
    expect(isAdult({ role: 'ADMIN', dateOfBirth: null }, NOW)).toBe(true);
    expect(needsDateOfBirth({ role: 'ADMIN', dateOfBirth: null })).toBe(false);
    expect(needsDateOfBirth({ role: 'TRAILBLAZER', dateOfBirth: null })).toBe(true);
    expect(needsDateOfBirth({ role: 'TRAILBLAZER', dateOfBirth: d('1990-01-01') })).toBe(false);
  });
});

describe('dateOfBirthSchema', () => {
  it('accepts a real past date', () => {
    expect(dateOfBirthSchema.parse('1990-05-17').toISOString()).toBe('1990-05-17T00:00:00.000Z');
  });
  it('rejects garbage, impossible dates, the future and age > 120', () => {
    expect(dateOfBirthSchema.safeParse('not a date').success).toBe(false);
    expect(dateOfBirthSchema.safeParse('2001-02-30').success).toBe(false);
    expect(dateOfBirthSchema.safeParse('2999-01-01').success).toBe(false);
    expect(dateOfBirthSchema.safeParse('1850-01-01').success).toBe(false);
  });
  it('registration requires a date of birth', () => {
    const base = { username: 'newbie', email: 'n@example.com', password: 'longenough' };
    expect(registerSchema.safeParse(base).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, dateOfBirth: '2000-01-01' }).success).toBe(true);
  });
});

describe('maturityFlags vocab', () => {
  it('includes sexual alongside the 2026-08-19 flags', () => {
    expect(MATURITY_FLAGS).toEqual(['mental-health', 'violence', 'substance', 'trauma', 'illness-detail', 'sexual']);
    expect(maturityFlagLabel('sexual')).toContain('18+');
  });
  it('forge schemas accept sexual and still reject unknown flags', () => {
    const ok = validateForgeData('nectar', { description: 'x', pillar: 'soul', maturityFlags: ['sexual', 'violence'] }) as { maturityFlags?: string[] };
    expect(ok.maturityFlags).toEqual(['sexual', 'violence']);
    expect(() => validateForgeData('nectar', { description: 'x', pillar: 'soul', maturityFlags: ['lewd'] })).toThrow();
  });
});
