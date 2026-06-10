/**
 * Time system types — rulings 2026-06-08 (design) + r-2026-06-09-06
 * (full customizable calendar at initial release).
 *
 * Core model:
 *  - Each campaign is a pocket universe with its own clock, stored in
 *    META CYCLES (`Campaign.currentCycle`). Meta cycles are the universal
 *    abstract scale — a translation ruler, not a master clock.
 *    Convention: 1 meta cycle ≈ 1 standard year.
 *  - A Timescale converts meta cycles ↔ the campaign's presented time and
 *    carries the full calendar (months/weeks/holidays).
 *  - Locations may override the campaign default timescale via
 *    `data.timescaleId`; resolution walks the located_at chain upward.
 *  - Fated age is stored in META cycles on the character (top-level
 *    `fatedAge`); a character's age = currentCycle − birthCycle.
 */

/** One month in a custom calendar. */
export interface CalendarMonth {
  name: string;
  days: number;
}

/** A fixed-date holiday / observance. */
export interface CalendarHoliday {
  name: string;
  /** 1-based month index into months[]. */
  month: number;
  /** 1-based day within the month. */
  day: number;
  description?: string;
}

export interface CalendarSeason {
  name: string;
  /** 1-based month the season begins. */
  startMonth: number;
}

export interface CalendarMoon {
  name: string;
  /** Full cycle length in local days. */
  periodDays: number;
}

/**
 * The full customizable calendar a GM presents time through.
 * All fields beyond months are optional flavor; months drive date math.
 */
export interface CalendarSpec {
  months: CalendarMonth[];
  /** Names of week days, cycle repeats — length defines week length. */
  dayNames?: string[];
  hoursPerDay?: number; // default 24
  /** Year numbering: localized year shown = epochYear + elapsed local years. */
  epochYear?: number;   // default 1
  /** Label appended to the year, e.g. "AC", "of the Third Age". */
  epochLabel?: string;
  holidays?: CalendarHoliday[];
  seasons?: CalendarSeason[];
  moons?: CalendarMoon[];
}

export interface TimescaleRecord {
  id: string;
  campaignId: string;
  name: string;
  unitName: string;
  unitsPerMetaCycle: number;
  calendar: CalendarSpec | null;
}

/** A fully rendered local date. */
export interface LocalDate {
  year: number;          // epoch-adjusted local year
  monthIndex: number;    // 0-based into months[]
  monthName: string;
  day: number;           // 1-based
  dayName?: string;      // from dayNames cycle, if defined
  hour?: number;         // 0..hoursPerDay-1
  /** "13th of Bramblefall, Year 2354 AC" */
  formatted: string;
  /** Holidays falling on this date. */
  holidays: CalendarHoliday[];
}

/** Dual-age display payload (local + meta). */
export interface DualAge {
  cycles: number;          // meta cycles
  localAmount: number;     // in the resolved timescale's base unit
  localUnitName: string;   // "year", "turning", ...
  /** "23 Tiberoak years (12 meta cycles)" */
  formatted: string;
}

/** Default Earth-like calendar used by the auto-created "Standard
 *  Reckoning" timescale. GMs customize from here. */
export const STANDARD_CALENDAR: CalendarSpec = {
  months: [
    { name: 'January', days: 31 }, { name: 'February', days: 28 },
    { name: 'March', days: 31 }, { name: 'April', days: 30 },
    { name: 'May', days: 31 }, { name: 'June', days: 30 },
    { name: 'July', days: 31 }, { name: 'August', days: 31 },
    { name: 'September', days: 30 }, { name: 'October', days: 31 },
    { name: 'November', days: 30 }, { name: 'December', days: 31 },
  ],
  dayNames: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  hoursPerDay: 24,
  epochYear: 1,
};

/** Seconds in one meta cycle, for combat-round (6 s) contribution math.
 *  1 cycle ≈ 1 standard year (Julian). */
export const SECONDS_PER_META_CYCLE = 31_557_600;

/** Total local days in one local year of a calendar. */
export function daysPerLocalYear(cal: CalendarSpec): number {
  return cal.months.reduce((s, m) => s + m.days, 0);
}

/**
 * Convert the campaign clock (meta cycles) to a local calendar date.
 * `unitsPerMetaCycle` local years pass per meta cycle.
 */
export function cycleToLocalDate(
  currentCycle: number,
  ts: { unitsPerMetaCycle: number; calendar: CalendarSpec | null; unitName: string },
): LocalDate {
  const cal = ts.calendar ?? STANDARD_CALENDAR;
  const localYearsFloat = currentCycle * ts.unitsPerMetaCycle;
  const yearsWhole = Math.floor(localYearsFloat);
  const yearFrac = localYearsFloat - yearsWhole;

  const totalDays = daysPerLocalYear(cal);
  const dayOfYearFloat = yearFrac * totalDays;
  let dayOfYear = Math.floor(dayOfYearFloat); // 0-based
  const hoursPerDay = cal.hoursPerDay ?? 24;
  const hour = Math.floor((dayOfYearFloat - dayOfYear) * hoursPerDay);

  let monthIndex = 0;
  for (const m of cal.months) {
    if (dayOfYear < m.days) break;
    dayOfYear -= m.days;
    monthIndex++;
  }
  // Guard: degenerate calendars (0 months) fall back to standard
  if (!cal.months[monthIndex]) {
    return cycleToLocalDate(currentCycle, { ...ts, calendar: STANDARD_CALENDAR });
  }

  const day = dayOfYear + 1;
  const year = (cal.epochYear ?? 1) + yearsWhole;
  // Week-day = total elapsed local days since epoch, cycled through dayNames.
  const elapsedDays = yearsWhole * totalDays + Math.floor(yearFrac * totalDays);
  const dayName = cal.dayNames?.length
    ? cal.dayNames[((elapsedDays % cal.dayNames.length) + cal.dayNames.length) % cal.dayNames.length]
    : undefined;

  const holidays = (cal.holidays ?? []).filter(h => h.month === monthIndex + 1 && h.day === day);
  const ord = ordinal(day);
  const formatted = `${ord} of ${cal.months[monthIndex].name}, Year ${year}${cal.epochLabel ? ` ${cal.epochLabel}` : ''}`;

  return { year, monthIndex, monthName: cal.months[monthIndex].name, day, dayName, hour, formatted, holidays };
}

/** Convert an amount of local units (years/days/hours) to meta cycles. */
export function localUnitsToCycles(
  amount: number,
  unit: 'year' | 'month' | 'day' | 'hour' | 'round',
  ts: { unitsPerMetaCycle: number; calendar: CalendarSpec | null },
): number {
  const cal = ts.calendar ?? STANDARD_CALENDAR;
  const cyclesPerLocalYear = 1 / ts.unitsPerMetaCycle;
  switch (unit) {
    case 'year': return amount * cyclesPerLocalYear;
    case 'month': {
      const avgMonthDays = daysPerLocalYear(cal) / cal.months.length;
      return amount * (avgMonthDays / daysPerLocalYear(cal)) * cyclesPerLocalYear;
    }
    case 'day': return (amount / daysPerLocalYear(cal)) * cyclesPerLocalYear;
    case 'hour': return (amount / ((cal.hoursPerDay ?? 24) * daysPerLocalYear(cal))) * cyclesPerLocalYear;
    case 'round': return (amount * 6) / SECONDS_PER_META_CYCLE; // combat: 6 s per round
  }
}

/** Dual-age render: meta cycles + resolved local timescale. */
export function dualAge(
  ageCycles: number,
  ts: { unitsPerMetaCycle: number; unitName: string },
): DualAge {
  const localAmount = ageCycles * ts.unitsPerMetaCycle;
  const localRounded = Math.floor(localAmount);
  const cyclesRounded = Math.floor(ageCycles);
  const plural = (n: number, u: string) => `${n} ${u}${n === 1 ? '' : 's'}`;
  return {
    cycles: ageCycles,
    localAmount,
    localUnitName: ts.unitName,
    formatted: `${plural(localRounded, ts.unitName)} (${plural(cyclesRounded, 'meta cycle')})`,
  };
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
