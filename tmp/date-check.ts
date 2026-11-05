import { cycleToLocalDate, STANDARD_CALENDAR } from '../app/src/types/time';
const ts = { unitsPerMetaCycle: 1, unitName: 'year', calendar: { ...STANDARD_CALENDAR, epochYear: 2026, epochDayOfYear: 289, epochWeekday: 3 } };
for (const c of [0, 0.0015, 0.0022, 0.0022 + 7 / 365]) { const d = cycleToLocalDate(c, ts); console.log(c, d.dayName, d.formatted, `${d.hour}:00`); }
