import { describe, it, expect } from 'vitest';
import { statedDurationSeconds, plausibleActSeconds, lineDuration, PLAUSIBLE_CAP_SECONDS } from './stated-duration';

describe('time the GM states (Mike 2026-10-24: "if the GM says 2 hours go by then that should be tracked")', () => {
  it('reads spans with a passing verb', () => {
    expect(statedDurationSeconds('Two hours pass. The hallway is quiet.')).toBe(7200);
    expect(statedDurationSeconds('2 hours go by.')).toBe(7200);
    expect(statedDurationSeconds('An hour later the knocking starts again.')).toBe(3600);
    expect(statedDurationSeconds('After twenty minutes she gives up.')).toBe(1200);
    expect(statedDurationSeconds('Seven weeks pass.')).toBe(7 * 7 * 86400);
    expect(statedDurationSeconds('Half an hour later.')).toBe(1800);
  });
  it('a wait "for 30 seconds" is a stated span (HW8 run 6); a quoted "for a minute" is not', () => {
    expect(statedDurationSeconds('Kristopher waits in the hallway for 30 seconds and then knocks again.')).toBe(30);
    expect(statedDurationSeconds('He waits for two minutes, then tries the handle.')).toBe(120);
    expect(statedDurationSeconds('"Wait for 30 seconds," she says.')).toBeNull();
    expect(lineDuration('gm-line', 'Kristopher waits in the hallway for 30 seconds and then knocks.')).toEqual({ seconds: 30, source: 'stated' });
  });
  it('reads parts of the day against the local hour', () => {
    expect(statedDurationSeconds('The next morning, light through the blinds.', { localHour: 22 })).toBe(9 * 3600);
    expect(statedDurationSeconds('Later that night she still has not opened the door.', { localHour: 15 })).toBe(4 * 3600);
    expect(statedDurationSeconds('Later that night…', { localHour: 22 })).toBe(2 * 3600);
  });
  it('a bare "a minute" in speech is not a jump', () => {
    expect(statedDurationSeconds('"Give me a minute," she says.')).toBeNull();
    expect(statedDurationSeconds('He knocks on the door again.')).toBeNull();
    expect(statedDurationSeconds('Kristopher stands at the door dumfounded.... "Ma\'am... you didn\'t pay!"')).toBeNull();
  });
});

describe("the sim's own estimate when nothing is stated", () => {
  it('speech runs at talking pace', () => {
    expect(plausibleActSeconds('being-speech', "I'm coming.")).toBe(3);
    expect(plausibleActSeconds('being-speech', 'Please ma\'am I will get in trouble or have to pay for it myself')).toBe(8);
  });
  it('a knock is seconds, a walk is about a minute, a search is minutes', () => {
    expect(plausibleActSeconds('being-act', 'Knocks on the door again')).toBeLessThan(10);
    expect(plausibleActSeconds('being-act', 'walks to the kitchen and leans on the counter')).toBeGreaterThanOrEqual(45);
    expect(plausibleActSeconds('being-act', 'searches the drawer for the key')).toBeGreaterThanOrEqual(180);
  });
  it('never guesses past the cap', () => {
    expect(plausibleActSeconds('gm-line', 'searches '.repeat(2000))).toBe(PLAUSIBLE_CAP_SECONDS);
  });
  it('lineDuration prefers the stated span for a GM line and estimates the rest', () => {
    expect(lineDuration('gm-line', 'Two hours pass.')).toEqual({ seconds: 7200, source: 'stated' });
    expect(lineDuration('gm-line', 'He knocks on the door again.').source).toBe('plausible');
    expect(lineDuration('being-speech', 'Two hours pass, I swear.').source).toBe('plausible');
  });
});

describe('clock times and day words (finding 57)', () => {
  const live = 'At 2:32 pm the sky was dark and heavy and rain began to fall. Kristopher was waiting in his car.';
  it('the live opening line is the next 2:32 pm', () => {
    expect(lineDuration('gm-line', live, { localHour: 22 })).toEqual({ seconds: 59520, source: 'stated' });
  });
  it('a day word with a clock time lands on that time tomorrow', () => {
    expect(lineDuration('gm-line', 'The next afternoon, at 2:32 pm, rain began to fall.', { localHour: 22 })).toEqual({ seconds: 59520, source: 'stated' });
  });
  it('"the next afternoon" alone is 14:00 tomorrow; "tomorrow" alone 09:00', () => {
    expect(statedDurationSeconds('The next afternoon, rain.', { localHour: 22 })).toBe(16 * 3600);
    expect(statedDurationSeconds('Tomorrow, then.', { localHour: 22 })).toBe(11 * 3600);
  });
  it('9 am from 14:00 is 19 hours', () => {
    expect(lineDuration('gm-line', 'At 9 am the bell rings.', { localHour: 14 })).toEqual({ seconds: 68400, source: 'stated' });
  });
  it('already that time is no jump', () => {
    expect(lineDuration('gm-line', "It's 10:31 pm.", { localHour: 22, localMinute: 31 }).source).toBe('plausible');
  });
  it('spans and plain actions are unchanged', () => {
    expect(lineDuration('gm-line', 'Two hours pass.')).toEqual({ seconds: 7200, source: 'stated' });
    expect(lineDuration('gm-line', 'He knocks on the door again.', { localHour: 22 }).source).toBe('plausible');
  });
});

describe('bare clock times with a day word (finding 66)', () => {
  const live = 'The following day at exactly 2:22 Kristopher watches the first rain drops fall on his windshield.';
  it('the live line is 14:22 tomorrow (1-6 read as pm, assumed 2026-11-05)', () => {
    expect(lineDuration('gm-line', live, { localHour: 22, localMinute: 27 })).toEqual({ seconds: 57300, source: 'stated' });
  });
  it('a named part of day wins: "the next morning at 9:15" is 09:15 tomorrow', () => {
    expect(statedDurationSeconds('The next morning at 9:15 he wakes.', { localHour: 22, localMinute: 0 })).toBe(2 * 3600 + 9 * 3600 + 15 * 60);
    expect(statedDurationSeconds('The next morning at 2:15 he wakes.', { localHour: 22, localMinute: 0 })).toBe(2 * 3600 + 2 * 3600 + 15 * 60);
  });
  it('hour-only bare: "tomorrow at 7" is 07:00 (7-11 am)', () => {
    expect(statedDurationSeconds('Tomorrow at 7 the bell rings.', { localHour: 22, localMinute: 0 })).toBe(9 * 3600);
  });
  it('a bare time with no day word is ignored', () => {
    expect(lineDuration('gm-line', 'At 2:22 he looks up.', { localHour: 22 }).source).toBe('plausible');
    expect(statedDurationSeconds('At 7 he leaves.', { localHour: 22 })).toBeNull();
  });
  it('"at exactly" keeps the am/pm form working', () => {
    expect(statedDurationSeconds('At exactly 2:22 pm the rain starts.', { localHour: 12, localMinute: 0 })).toBe(2 * 3600 + 22 * 60);
  });

  it('a time with a named part of day lands on that clock time (session 6 "2:20 in the afternoon the next day")', () => {
    const at = (h: number, m = 0) => h * 3600 + m * 60;
    const ctx = { localHour: 21, localMinute: 0 };
    expect(statedDurationSeconds('It is 2:20 in the afternoon the next day', ctx)).toBe(86400 - at(21) + at(14, 20));
    expect(statedDurationSeconds('2:20 pm', { localHour: 9 })).toBe(at(14, 20) - at(9));
    expect(statedDurationSeconds('It is 2:20 in the afternoon.', { localHour: 9 })).toBe(at(14, 20) - at(9));
    expect(statedDurationSeconds('It is 2:20 in the afternoon.', ctx)).toBe(86400 - at(21) + at(14, 20));
    expect(statedDurationSeconds('Just before noon tomorrow, at noon tomorrow', ctx)).toBe(86400 - at(21) + at(12));
    expect(statedDurationSeconds('It is half past seven the next morning', ctx)).toBe(86400 - at(21) + at(7, 30));
    expect(statedDurationSeconds('ten minutes later', ctx)).toBe(600);
    expect(statedDurationSeconds('three hours pass', ctx)).toBe(3 * 3600);
  });
});
