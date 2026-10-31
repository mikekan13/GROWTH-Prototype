import { describe, it, expect } from 'vitest';
import { DAY_CYCLES } from './intentions';
import {
  dayFraction, quarterOf, dayIndexOf, grainFor, windowsFor, windowLabel, windowSeconds,
  quarterInWords, usualQuarterOf, routinesDueIn, accountWindowIndex, actsInProse, dayParagraph, pastTense,
  type RoutineForStretch, type StretchWindow,
} from './stretch';

// The Incubator at the end of HW12 (2026-10-31): clock 0.00225 ≈ 0.82 of day 0, an evening.
const NOW = 0.0022509259259259258;
const D = DAY_CYCLES;

describe('quarters of the local day, one reckoning with the intention grammar', () => {
  it('reads the fraction of the day and names its quarter', () => {
    expect(dayFraction(0.82 * D)).toBeCloseTo(0.82, 6);
    expect(quarterOf(0.1 * D)).toBe('night');
    expect(quarterOf(0.3 * D)).toBe('morning');
    expect(quarterOf(0.6 * D)).toBe('afternoon');
    expect(quarterOf(NOW)).toBe('evening');
    expect(dayIndexOf(NOW)).toBe(0);
    expect(dayIndexOf(NOW + 2 * D)).toBe(2);
  });
});

describe('the level of detail follows the span', () => {
  it('two days are lived in quarters; a fortnight in days; a season in weeks', () => {
    expect(grainFor(2 * 86400)).toBe('quarter');
    expect(grainFor(4 * 86400)).toBe('quarter');
    expect(grainFor(14 * 86400)).toBe('day');
    expect(grainFor(90 * 86400)).toBe('week');
  });
});

describe('windows: the clock walks the span', () => {
  it('two days from an evening: the rest of this evening, then 7 whole quarters, then the part of the last evening', () => {
    const ws = windowsFor(NOW, NOW + 2 * D);
    expect(ws.map((w) => w.kind)).toEqual(['evening', 'night', 'morning', 'afternoon', 'evening', 'night', 'morning', 'afternoon', 'evening']);
    expect(ws[0].start).toBeCloseTo(NOW, 12);
    expect(ws[0].end).toBeCloseTo(D, 12);
    expect(ws[ws.length - 1].end).toBeCloseTo(NOW + 2 * D, 12);
    expect(ws.map((w) => w.dayIndex)).toEqual([0, 1, 1, 1, 1, 2, 2, 2, 2]);
    expect(ws.filter((w) => w.sleep).length).toBe(2);
    // The windows tile the span exactly.
    for (let i = 1; i < ws.length; i++) expect(ws[i].start).toBeCloseTo(ws[i - 1].end, 12);
  });
  it('a span that ends on a boundary leaves no sliver window', () => {
    const start = 3 * D + 0.75 * D; // the start of an evening
    const ws = windowsFor(start, start + 0.25 * D);
    expect(ws).toHaveLength(1);
    expect(ws[0].kind).toBe('evening');
  });
  it('day grain: a night and one awake window per day', () => {
    const ws = windowsFor(0.3 * D, 0.3 * D + 10 * D, 'day');
    expect(ws[0].kind).toBe('awake');
    expect(ws[1].kind).toBe('night');
    expect(ws[1].sleep).toBe(true);
    expect(ws.filter((w) => w.kind === 'awake')).toHaveLength(11);
  });
  it('week grain: seven-day windows', () => {
    const ws = windowsFor(0, 21 * D, 'week');
    expect(ws).toHaveLength(3);
    expect(windowSeconds(ws[0])).toBeCloseTo(7 * 86400, 0);
  });
  it('labels read as a page would', () => {
    const ws = windowsFor(NOW, NOW + 2 * D);
    expect(windowLabel(ws[0], 3)).toBe('the evening, day 1 of 3');
    expect(windowLabel(ws[1], 3)).toBe('the night, day 2 of 3');
    expect(windowLabel({ ...ws[2], kind: 'awake' } as StretchWindow, 3)).toBe('the day, day 2 of 3');
  });
  it('nothing for an empty or backwards span', () => {
    expect(windowsFor(NOW, NOW)).toEqual([]);
    expect(windowsFor(NOW, NOW - D)).toEqual([]);
  });
});

// Violet's and Kristopher's real routines (10-31): the pizza every day (last done at 0.80 of day 0), locking up
// (always), the coat (always), his pizza run (daily, never run), his work session (daily, never run).
const PIZZA_DELIVERY: RoutineForStretch = { id: 'pd', name: 'Pizza delivery', cadence: 'daily', status: 'DONE', lastDoneCycle: 0.002246613394216134, sourceDescriptions: ['I order from the same pizza place every day.', "Tonight, when he knocks, I'm going to give it to him as the tip."] };
const LOCKING_UP: RoutineForStretch = { id: 'lu', name: 'Locking up', cadence: 'always', status: 'READY', lastDoneCycle: null, sourceDescriptions: ['I lock the door every time.'] };
const PIZZA_RUN: RoutineForStretch = { id: 'pr', name: 'Pizza run to her door', cadence: 'daily', status: 'READY', lastDoneCycle: null, sourceDescriptions: ['I always stay a few seconds longer at her door than the delivery needs.'] };
const WORK: RoutineForStretch = { id: 'ws', name: 'GRO.WTH work session', cadence: 'daily', status: 'READY', lastDoneCycle: null, sourceDescriptions: ['I work on GRO.WTH every day.'] };
const WORK_MORNINGS: RoutineForStretch = { ...WORK, sourceDescriptions: ['I work on GRO.WTH every morning before the deliveries.'] };

describe("a routine's usual hour is READ, never invented", () => {
  it('time words in its own sentences name the quarter', () => {
    expect(quarterInWords('I order from the same pizza place every evening.')).toBe('evening');
    expect(quarterInWords('Most mornings I write before anything else.')).toBe('morning');
    expect(quarterInWords('I lock up every night before bed.')).toBe('night');
    expect(quarterInWords('I work on GRO.WTH every day.')).toBeNull();
  });
  it('with no time word, the quarter of its last run; with neither, nothing — the clock will not fire it', () => {
    expect(usualQuarterOf(PIZZA_DELIVERY)).toBe('evening'); // last done at 0.80 of the day
    expect(usualQuarterOf(WORK)).toBeNull();
    expect(usualQuarterOf(WORK_MORNINGS)).toBe('morning');
    expect(usualQuarterOf(PIZZA_RUN)).toBeNull();
    expect(usualQuarterOf(LOCKING_UP)).toBeNull(); // always = trigger-only
    expect(usualQuarterOf({ cadence: 'nightly', lastDoneCycle: null, sourceDescriptions: [] })).toBe('night');
  });
});

describe('what the clock calls up in a window', () => {
  const ws = windowsFor(NOW, NOW + 2 * D);
  const all = [PIZZA_DELIVERY, LOCKING_UP, PIZZA_RUN, WORK_MORNINGS];
  it('the rest of tonight: the pizza ran minutes ago, nothing is due', () => {
    expect(routinesDueIn(ws[0], all)).toEqual([]);
  });
  it("tomorrow evening: Violet's pizza delivery is due again; tomorrow morning: the work session", () => {
    expect(routinesDueIn(ws[4], all).map((r) => r.id)).toEqual(['pd']);
    expect(routinesDueIn(ws[2], all).map((r) => r.id)).toEqual(['ws']);
  });
  it('a routine with no readable hour, or always, is never fired by the clock', () => {
    for (const w of ws) expect(routinesDueIn(w, [PIZZA_RUN, LOCKING_UP])).toEqual([]);
  });
  it('a day window carries every daytime routine; a night window only the nightly ones', () => {
    const day = windowsFor(NOW, NOW + 10 * D, 'day');
    const awake = day.find((w) => w.kind === 'awake' && w.dayIndex === 1)!;
    expect(routinesDueIn(awake, all).map((r) => r.id).sort()).toEqual(['pd', 'ws']);
    const night = day.find((w) => w.kind === 'night' && w.dayIndex === 1)!;
    expect(routinesDueIn(night, all)).toEqual([]);
    expect(routinesDueIn(night, [{ ...WORK, cadence: 'nightly', sourceDescriptions: [] }]).map((r) => r.id)).toEqual(['ws']);
  });
  it('a RUNNING or RETIRED routine is not called up by the clock', () => {
    expect(routinesDueIn(ws[4], [{ ...PIZZA_DELIVERY, status: 'RUNNING' }, { ...PIZZA_DELIVERY, id: 'x', status: 'RETIRED' }])).toEqual([]);
  });
});

describe('the account of the day falls in the first free awake window, else the last', () => {
  const ws = windowsFor(NOW, NOW + 2 * D);
  it('day 2 with the pizza due in the evening: the morning is free', () => {
    const due = ws.map((w) => (w.kind === 'evening' && w.dayIndex === 1 ? 1 : 0));
    const i = accountWindowIndex(ws, 1, due)!;
    expect(ws[i].kind).toBe('morning');
  });
  it('a day with something due in every awake window: the last one', () => {
    const due = ws.map((w) => (w.dayIndex === 1 && !w.sleep ? 1 : 0));
    const i = accountWindowIndex(ws, 1, due)!;
    expect(ws[i].kind).toBe('evening');
    expect(ws[i].dayIndex).toBe(1);
  });
  it('no awake window for that day: null', () => {
    expect(accountWindowIndex(ws.filter((w) => w.sleep), 1, [])).toBeNull();
  });
});

describe('the record is built from the acts, no model', () => {
  it('acts become one past-tense sentence', () => {
    expect(pastTense('turns the lock and opens the Entry door')).toBe('turned the lock and opened the Entry door');
    expect(actsInProse('Violet', ['goes to the Entry door', 'turns the lock and opens the Entry door', 'hands the cash to Kristopher', 'shuts and locks the Entry door']))
      .toBe('Violet went to the Entry door, turned the lock and opened the Entry door, handed the cash to Kristopher, and shut and locked the Entry door.');
    expect(actsInProse('Violet', ['knocks at the Entry door'])).toBe('Violet knocked at the Entry door.');
  });
  it('a day paragraph carries acts, speech, the account and sleep; an empty day says so', () => {
    const p = dayParagraph('Kristopher', { dayIndex: 1, calendarDay: 1, acts: ['goes to the Entry door', 'knocks at the Entry door'], said: ['Kristopher: Evening.'], account: 'I worked on the game most of the morning.', intentionsDone: [], routinesDone: [], refused: [], dreamed: true });
    expect(p).toBe("Kristopher went to the Entry door and knocked at the Entry door. Kristopher: Evening. In Kristopher's own words: I worked on the game most of the morning. Kristopher slept.");
    expect(dayParagraph('Violet', { dayIndex: 0, calendarDay: 0, acts: [], said: [], intentionsDone: [], routinesDone: [], refused: [] })).toBe('Violet: nothing of note.');
  });
});

describe("the hour may not send a being to take a thing from another's hands", () => {
  it('his pizza run when the only pizza is the one in her hands: the world lacks a fresh one', async () => {
    const { endsNeedingAnothersHands } = await import('./stretch');
    const { pickByName } = await import('./routines');
    const things = [{ name: 'Pizza (Hawaiian + black olives)', holderId: 'v', holderName: 'Violet', roomId: null }, { name: 'Chess Pizza receipt', holderId: 'k', holderName: 'Kristopher', roomId: null }];
    const ends = [{ kind: 'hold', item: 'Pizza (Hawaiian + black olives)' }, { kind: 'hold', item: 'Chess Pizza receipt' }, { kind: 'gave', item: 'Pizza (Hawaiian + black olives)', to: 'the customer' }];
    expect(endsNeedingAnothersHands(ends, things, 'k', pickByName)).toEqual([{ item: 'Pizza (Hawaiian + black olives)', holder: 'Violet' }, { item: 'Pizza (Hawaiian + black olives)', holder: 'Violet' }]);
  });
  it('a fresh one lying at the pizza place: nothing is lacking', async () => {
    const { endsNeedingAnothersHands } = await import('./stretch');
    const { pickByName } = await import('./routines');
    const things = [{ name: 'Pizza (Hawaiian + black olives)', holderId: 'v', holderName: 'Violet', roomId: null }, { name: 'Pizza (Hawaiian + black olives)', holderId: null, holderName: null, roomId: 'chess' }];
    expect(endsNeedingAnothersHands([{ kind: 'hold', item: 'the pizza' }], things, 'k', pickByName)).toEqual([]);
  });
});
