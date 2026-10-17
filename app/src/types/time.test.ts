/** A campaign can open mid-year on a real date (Mike 2026-10-17: "the actual campaign date should be set to october 24th 2026"). */
import { describe, it, expect } from 'vitest';
import { cycleToLocalDate, STANDARD_CALENDAR, localUnitsToCycles } from './time';

const incubator = { unitsPerMetaCycle: 1, unitName: 'year', calendar: { ...STANDARD_CALENDAR, epochYear: 2026, epochDayOfYear: 296, epochWeekday: 3 } };

describe('calendar epoch', () => {
  it('cycle 0 is Saturday 24 October 2026', () => {
    const d = cycleToLocalDate(0, incubator);
    expect(d.monthName).toBe('October');
    expect(d.day).toBe(24);
    expect(d.year).toBe(2026);
    expect(d.dayName).toBe('Saturday');
  });
  it('a week before play is Saturday 17 October; 10 weeks later rolls into 2027', () => {
    const wk = localUnitsToCycles(7, 'day', incubator);
    const before = cycleToLocalDate(-wk + 1e-9, incubator);
    expect(`${before.day} ${before.monthName}`).toBe('17 October');
    const later = cycleToLocalDate(wk * 10, incubator);
    expect(later.year).toBe(2027);
    expect(later.monthName).toBe('January');
  });
  it('a calendar without the new fields is unchanged (cycle 0 = 1st of the first month, Year 1)', () => {
    const d = cycleToLocalDate(0, { unitsPerMetaCycle: 1, unitName: 'year', calendar: STANDARD_CALENDAR });
    expect(d.formatted).toBe('1st of January, Year 1');
  });
});
