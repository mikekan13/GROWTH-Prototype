/**
 * Age (Mike 2026-10-12): the age source is the DATE OF BIRTH given at
 * registration. Unknown DOB = treated as a minor; ADMIN is exempt.
 * Never log a date of birth.
 */
import { z } from 'zod';

export const ADULT_AGE = 18;
const MAX_AGE = 120;

/** Whole years between dob and now (calendar, UTC). */
export function ageInYears(dob: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

/** ≥18 by date of birth. A null DOB is never adult — unless the user is ADMIN. */
export function isAdult(
  user: { role: string; dateOfBirth?: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (user.role === 'ADMIN') return true;
  if (!user.dateOfBirth) return false;
  const dob = user.dateOfBirth instanceof Date ? user.dateOfBirth : new Date(user.dateOfBirth);
  if (Number.isNaN(dob.getTime())) return false;
  return ageInYears(dob, now) >= ADULT_AGE;
}

/** Does this user still owe us a date of birth? ADMIN never does. */
export function needsDateOfBirth(user: { role: string; dateOfBirth?: Date | string | null }): boolean {
  return user.role !== 'ADMIN' && !user.dateOfBirth;
}

/**
 * Date-of-birth input: a calendar date 'YYYY-MM-DD' (what <input type="date">
 * sends), valid, not in the future, age ≤ 120. Parses to a UTC-midnight Date.
 */
export const dateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be a date (YYYY-MM-DD)')
  .transform((s, ctx) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
      ctx.addIssue({ code: 'custom', message: 'Date of birth is not a valid date' });
      return z.NEVER;
    }
    const now = new Date();
    if (d.getTime() > now.getTime()) {
      ctx.addIssue({ code: 'custom', message: 'Date of birth cannot be in the future' });
      return z.NEVER;
    }
    if (ageInYears(d, now) > MAX_AGE) {
      ctx.addIssue({ code: 'custom', message: 'Date of birth is too far in the past' });
      return z.NEVER;
    }
    return d;
  });
