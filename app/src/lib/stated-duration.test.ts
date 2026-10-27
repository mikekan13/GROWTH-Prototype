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
