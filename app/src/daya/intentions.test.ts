import { describe, it, expect } from 'vitest';

describe('the words alone close a doing only when they carry nearly all of it (HW8 run 2)', () => {
  it('"I\'m just getting the tip" does not close "give it to him as the tip"; "I\'m no longer pretending" does not close the cat', async () => {
    const { actCompletes } = await import('./intentions');
    expect(actCompletes("Tonight, when he knocks, I'm going to give it to him as the tip.", "I'm just getting the tip.")).toBe(false);
    expect(actCompletes("If he doesn't, I go to the shelter on Fifth Street and adopt the cat, and I stop pretending I'm waiting for anything.", "I'm not opening yet, but I'm no longer pretending I'm waiting for anything else.")).toBe(false);
    expect(actCompletes("Tonight, when he knocks, I'm going to give it to him as the tip.", 'She gives it to him as the tip.')).toBe(true);
  });
});
import { extractIntentions, dueReason, hasLapsed, intentionLine, DAY_CYCLES } from './intentions';

// Violet's own words (genesis memories, 2026-10-12/16) — the test Mike called "a wonderful test of a being".
const LINGERS = "Kristopher always lingers. Every other driver hands over the box and leaves. He stands there an extra few seconds. I noticed the first time. The second time I thought: he's just slow. The third time I thought: he's not slow. By the sixth time I had started putting my hair up before he arrived, which I noticed and found embarrassing and did anyway. I wrote my phone number on a five-dollar bill. It's folded on the shelf by the door. Tonight, when he knocks, I'm going to give it to him as the tip. If he calls, something new begins. If he doesn't, I go to the shelter on Fifth Street and adopt the cat, and I stop pretending I'm waiting for anything. Those are the terms.";
const PIZZA = "I order from the same pizza place every day. Hawaiian plus black olives. I'm not sure I even like Hawaiian that much. But they always knock. Forty-five seconds, sometimes a minute if there's change involved. Another person standing in my doorway, on my terms, holding something warm. I figured out a while ago that I'm not ordering the pizza. I'm ordering the knock. I haven't decided what to do with that information.";
const LOCK = "I lock the door every time. Even when I'm inside. I don't think about why — it's just the motion: key in, turn, hear the click, then I can put my bag down.";
const ROSEMARY = 'Rosemary died on a Thursday in March. The doctor said it was her heart. I sat in the hallway for a long time. I was going to call someone and did not.';

const AT = 0.0015; // ~13:00 on the first day of play — when the lingers memory was formed
const EVENING = Math.floor(AT / DAY_CYCLES) * DAY_CYCLES + 0.75 * DAY_CYCLES;

describe('extractIntentions — a being\'s own prospective words become intentions', () => {
  it('"Tonight, when he knocks, I\'m going to…" is an intention with a trigger and tonight\'s window', () => {
    const got = extractIntentions(LINGERS, AT);
    const tonight = got.find((i) => i.description.startsWith('Tonight, when he knocks'));
    expect(tonight).toBeDefined();
    expect(tonight!.trigger).toBe('he knocks');
    expect(tonight!.dueCycle).toBeCloseTo(EVENING, 8);
    expect(tonight!.dueUntil).toBeCloseTo(EVENING + 0.25 * DAY_CYCLES, 8);
    expect(tonight!.cadence).toBeNull();
  });
  it('"If he doesn\'t, I go to the shelter…" is a conditional plan; "If he calls, something new begins" is not hers to do', () => {
    const got = extractIntentions(LINGERS, AT);
    expect(got.some((i) => i.description.startsWith("If he doesn't, I go to the shelter") && i.trigger === "he doesn't")).toBe(true);
    expect(got.some((i) => i.description.startsWith('If he calls'))).toBe(false);
    expect(got.some((i) => i.description.startsWith('Kristopher always lingers'))).toBe(false);
  });
  it('a habit is a routine: every day, every time', () => {
    expect(extractIntentions(PIZZA, -0.1)).toMatchObject([{ description: 'I order from the same pizza place every day.', cadence: 'daily', trigger: null, dueCycle: null }]);
    expect(extractIntentions(LOCK, -0.1)).toMatchObject([{ description: 'I lock the door every time.', cadence: 'always' }]);
  });
  it('the past, and other people\'s habits, are not intentions', () => {
    expect(extractIntentions(ROSEMARY, -0.5)).toEqual([]);
    expect(extractIntentions('They always knock. He is going to be late.', 0)).toEqual([]);
    // Seeding her 70 memories the first time (2026-10-25) caught these — a plan remembered is not a plan held.
    expect(extractIntentions("I thought: if I call and they don't answer, I will know for certain.", 0)).toEqual([]);
    expect(extractIntentions('I know it was Tuesday because we had leftovers for dinner and we always had leftovers on Tuesdays.', 0)).toEqual([]);
    expect(extractIntentions("I watched from the window and I thought: that's the last time I'll see him leave.", 0)).toEqual([]);
    expect(extractIntentions("It was a thing I'd built, year by year, in the daily work of paying attention.", 0)).toEqual([]);
    expect(extractIntentions("It sits on the shelf now and I don't think about it most days, but I notice when the light hits it differently.", 0)).toEqual([]);
  });
  it("Kristopher's day job is a routine: \"I work on GRO.WTH every day.\"", () => {
    expect(extractIntentions('I work on GRO.WTH every day. I leave the curtain open a crack because I need to see something moving.', 0)).toMatchObject([{ description: 'I work on GRO.WTH every day.', cadence: 'daily' }]);
  });
});

describe('dueReason / hasLapsed', () => {
  const tonight = { trigger: 'he knocks', dueCycle: EVENING, dueUntil: EVENING + 0.25 * DAY_CYCLES };
  it('the trigger in the cue makes it due, whatever the hour', () => {
    expect(dueReason(tonight, 'He knocks on the door.', 0.0010)).toBe('trigger');
    expect(dueReason(tonight, 'He wipes his eyes from the tears he was crying in the car. He knocks on the door.', 0.0010)).toBe('trigger');
    expect(dueReason(tonight, 'He waits for a moment.', 0.0010)).toBeNull();
  });
  it('its own hour makes it due without the trigger', () => {
    expect(dueReason(tonight, 'The radiator ticks.', 0.0022)).toBe('time'); // 19:18
    expect(dueReason(tonight, 'The radiator ticks.', 0.0015)).toBeNull(); // 13:08
  });
  it('a time-only intention lapses a day after its window; one that waits on a trigger is given a month; a routine never', () => {
    expect(hasLapsed({ trigger: null, dueUntil: EVENING, cadence: null }, EVENING + 2 * DAY_CYCLES)).toBe(true);
    expect(hasLapsed({ trigger: null, dueUntil: EVENING, cadence: null }, EVENING + 0.5 * DAY_CYCLES)).toBe(false);
    expect(hasLapsed({ trigger: 'he knocks', dueUntil: EVENING, cadence: null }, EVENING + 7 * DAY_CYCLES)).toBe(false);
    expect(hasLapsed({ trigger: 'he knocks', dueUntil: EVENING, cadence: null }, EVENING + 40 * DAY_CYCLES)).toBe(true);
    expect(hasLapsed({ trigger: null, dueUntil: null, cadence: 'daily' }, 9)).toBe(false);
  });
  it('the prompt line', () => {
    expect(intentionLine([])).toBeNull();
    expect(intentionLine([{ description: "Tonight, when he knocks, I'm going to give it to him as the tip." }])).toBe("What you meant to do: Tonight, when he knocks, I'm going to give it to him as the tip.");
  });
});

describe('completing — what an act carries out (Mike 2026-10-25: "build a way for intentions to be completed")', async () => {
  const { doingOf, actCompletes } = await import('./intentions');
  it('the doing is the words after the prospective marker', () => {
    expect(doingOf("Tonight, when he knocks, I'm going to give it to him as the tip.")).toBe('give it to him as the tip');
    expect(doingOf("If he doesn't, I go to the shelter on Fifth Street and adopt the cat.")).toBe('I go to the shelter on Fifth Street and adopt the cat');
    expect(doingOf('I lock the door every time.')).toBe('I lock the door every time');
  });
  it('an act that carries most of the doing completes it by the words; a step toward it does not', () => {
    expect(actCompletes("Tonight, when he knocks, I'm going to give it to him as the tip.", 'She gives the folded bill to him as the tip.')).toBe(true);
    expect(actCompletes("Tonight, when he knocks, I'm going to give it to him as the tip.", 'She walks to the door.')).toBe(false);
    expect(actCompletes("If he doesn't, I go to the shelter on Fifth Street and adopt the cat.", 'She goes to the shelter on Fifth Street and adopts the cat.')).toBe(true);
  });
});

// ── finding 63, 2026-11-05: a promise is not a plan ──────────────────────────────
import { relativeWindow, promiseFromReply, actKeepsPromise, actSettles, leaveForLine, travelLeadCycles, placeOf } from './intentions';
import type { DueIntention } from './intentions';

const MIN = DAY_CYCLES / 1440;
const T0 = 2.9356 * DAY_CYCLES; // ≈ 22:27 on day 2
const DAY2 = 2 * DAY_CYCLES;
const at = (day: number, h: number, m = 0) => day * DAY_CYCLES + ((h + m / 60) / 24) * DAY_CYCLES;

describe('relativeWindow (finding 63, 2026-11-05)', () => {
  it('"in 15 minutes or so" is a point 15 min on; window = [−5, +60]', () => {
    const w = relativeWindow('Meet me at the coffee shop in 15 minutes or so?', T0)!;
    expect(w.pointCycle!).toBeCloseTo(T0 + 15 * MIN, 9);
    expect(w.dueCycle).toBeCloseTo(T0 + 10 * MIN, 9);
    expect(w.dueUntil).toBeCloseTo(T0 + 75 * MIN, 9);
    expect(w.words).toBe('in 15 minutes');
  });
  it.each([
    ['in ten', 10], ['in ten minutes', 10], ['in half an hour', 30], ['in an hour', 60], ['in a couple of hours', 120],
    ['in 2 hours', 120], ['in about 20 minutes', 20], ['in ten-ish', 10], ['see you in forty-five minutes', 45],
  ])('"%s" is %i minutes on', (s, mins) => {
    expect(relativeWindow(s, T0)!.pointCycle!).toBeCloseTo(T0 + mins * MIN, 9);
  });
  it('"in two days" and "in one piece" are not a clock', () => {
    expect(relativeWindow('in two days', T0)).toBeNull();
    expect(relativeWindow('I got home in one piece', T0)).toBeNull();
  });
  it('"at four" / "at 4" / "at 4:30" / "at four o\'clock" is the NEXT 16:00 (bare 1–6 = afternoon)', () => {
    for (const s of ['at four', 'at 4', "at four o'clock", 'at around four']) expect(relativeWindow(s, T0)!.pointCycle!).toBeCloseTo(at(3, 16), 9);
    expect(relativeWindow('at 4:30', T0)!.pointCycle!).toBeCloseTo(at(3, 16, 30), 9);
    // before four on the same day, the next occurrence is today
    expect(relativeWindow('at four', at(2, 10))!.pointCycle!).toBeCloseTo(at(2, 16), 9);
    const w = relativeWindow('at four', at(2, 10))!;
    expect(w.dueCycle).toBeCloseTo(at(2, 16) - 5 * MIN, 9);
    expect(w.dueUntil).toBeCloseTo(at(2, 16) + 60 * MIN, 9);
  });
  it('am/pm and tonight/tomorrow', () => {
    expect(relativeWindow('at 9 am', T0)!.pointCycle!).toBeCloseTo(at(3, 9), 9);
    expect(relativeWindow('tonight at nine', at(2, 18))!.pointCycle!).toBeCloseTo(at(2, 21), 9);
    expect(relativeWindow('tomorrow at four', T0)!.pointCycle!).toBeCloseTo(at(3, 16), 9);
    expect(relativeWindow('tomorrow at four', T0)!.words).toBe('tomorrow at four');
  });
  it('span words keep the day-fraction windows', () => {
    const w = relativeWindow('this afternoon', at(2, 9))!;
    expect(w.dueCycle).toBeCloseTo(DAY2 + 0.5 * DAY_CYCLES, 9);
    expect(w.dueUntil).toBeCloseTo(DAY2 + 0.75 * DAY_CYCLES, 9);
    expect(w.pointCycle).toBeUndefined();
  });
  it('soon / later / now are loose windows', () => {
    expect(relativeWindow('soon', T0)!.dueCycle).toBeCloseTo(T0 + 30 * MIN, 9);
    expect(relativeWindow('soon', T0)!.dueUntil).toBeCloseTo(T0 + 90 * MIN, 9);
    expect(relativeWindow('later', T0)!.dueCycle).toBeCloseTo(T0 + 30 * MIN, 9);
    expect(relativeWindow('right now', T0)!.dueCycle).toBeCloseTo(T0, 9);
    expect(relativeWindow('right now', T0)!.dueUntil).toBeCloseTo(T0 + 10 * MIN, 9);
    expect(relativeWindow('the coffee shop on Broadway', T0)).toBeNull();
  });
});

describe('placeOf', () => {
  it('reads the place up to a time word or punctuation', () => {
    expect(placeOf('Meet me at the coffee shop in 15 minutes or so?')).toBe('the coffee shop');
    expect(placeOf('coffee tomorrow at the coffee shop on Broadway')).toBe('the coffee shop on Broadway');
    expect(placeOf('Meet me at Extra Space Coffee? If you still want to.')).toBe('Extra Space Coffee');
    expect(placeOf('Come to the apartment')).toBe('the apartment');
    expect(placeOf('Does four tomorrow work?')).toBeNull();
  });
});

describe('promiseFromReply (finding 63, 2026-11-05)', () => {
  it('LIVE: "Meet me at the coffee shop in 15 minutes or so?" / "I\'ll be there." → a pending meeting with a clock', () => {
    const p = promiseFromReply("I'll be there.", 'Meet me at the coffee shop in 15 minutes or so?', T0)!;
    expect(p.description).toBe('be at the coffee shop in 15 minutes');
    expect(p.trigger).toBeNull();
    expect(p.cadence).toBeNull();
    expect(p.dueCycle!).toBeCloseTo(T0 + 10 * MIN, 9);
    expect(p.dueUntil!).toBeCloseTo(T0 + 75 * MIN, 9);
  });
  it('LIVE: "Meet me at Extra Space Coffee? If you still want to." / "In ten." → the counter-time wins', () => {
    const p = promiseFromReply('In ten.', 'Just saw rain... Meet me at Extra Space Coffee? If you still want to.', T0)!;
    expect(p.description).toBe('be at Extra Space Coffee in ten minutes');
    expect(p.dueCycle!).toBeCloseTo(T0 + 5 * MIN, 9);
    expect(p.dueUntil!).toBeCloseTo(T0 + 70 * MIN, 9);
  });
  it('GM scene 9: "Does four tomorrow work? At the coffee shop on Broadway." / "Yes." → tomorrow 16:00', () => {
    const p = promiseFromReply('Yes.', 'Does four tomorrow work? At the coffee shop on Broadway.', T0)!;
    expect(p.description).toBe('be at the coffee shop on Broadway tomorrow at four');
    expect(p.dueCycle!).toBeCloseTo(at(3, 16) - 5 * MIN, 9);
    expect(p.dueUntil!).toBeCloseTo(at(3, 16) + 60 * MIN, 9);
  });
  it('a meeting proposed with no time is "soon": [+15 min, +3 h]', () => {
    const p = promiseFromReply('Sure', 'Come to the apartment', T0)!;
    expect(p.description).toBe('be at the apartment');
    expect(p.dueCycle!).toBeCloseTo(T0 + 15 * MIN, 9);
    expect(p.dueUntil!).toBeCloseTo(T0 + 180 * MIN, 9);
  });
  it('other assents', () => {
    for (const r of ['yes', 'ok', 'Okay!', 'sure', 'See you there.', 'On my way', "I'll come.", 'Sounds good', 'Deal.'])
      expect(promiseFromReply(r, 'Meet me at the coffee shop in 15 minutes', T0), r).not.toBeNull();
  });
  it('a decline or a question is no promise', () => {
    const ask = 'Meet me at the coffee shop in 15 minutes or so?';
    for (const r of ["Can't, sorry.", 'Not tonight.', 'No.', 'Rain check?', 'Another time.', 'What time?', 'Where?'])
      expect(promiseFromReply(r, ask, T0), r).toBeNull();
  });
  it('a proposal that is not a meeting makes no promise', () => {
    expect(promiseFromReply('Yes.', 'Did you eat yet?', T0)).toBeNull();
  });
});

describe('extractIntentions — a bare promise is not a plan (finding 63, 2026-11-05)', () => {
  it('"I\'ll be there." / "I\'ll come." / "I\'ll be there in ten." yield nothing; "I\'ll go to the shelter" still does', () => {
    expect(extractIntentions("I'll be there.", T0)).toEqual([]);
    expect(extractIntentions("I'll come.", T0)).toEqual([]);
    expect(extractIntentions("I'll be there in ten.", T0)).toEqual([]);
    expect(extractIntentions("I'll go to the shelter on Fifth Street tomorrow.", T0)).toHaveLength(1);
  });
});

describe('speaking a promise does not keep it (finding 63, 2026-11-05)', () => {
  const D = 'be at the coffee shop in 15 minutes';
  it('REGRESSION: her own text carrying the same words no longer settles it', () => {
    expect(actKeepsPromise(D, 'Violet texts Kristopher: "I\'ll be there."')).toBe(false);
    expect(actKeepsPromise(D, 'says "I\'ll be at the coffee shop in 15 minutes"')).toBe(false);
    expect(actKeepsPromise(D, 'She texts back: "be at the coffee shop in 15 minutes."')).toBe(false);
    expect(actSettles(D, 'writes "be at the coffee shop in 15 minutes"')).toBe(false);
    expect(actSettles(D, 'be at the coffee shop in 15 minutes')).toBe(false); // words alone, no arrival
  });
  it('leaving is not arriving; arriving is', () => {
    expect(actKeepsPromise(D, 'leaves for the coffee shop')).toBe(false);
    expect(actKeepsPromise(D, 'arrives at the coffee shop')).toBe(true);
    expect(actKeepsPromise(D, 'walks into the coffee shop')).toBe(true);
    expect(actKeepsPromise('be at the coffee shop on Broadway tomorrow at four', 'sits down at a table in the coffee shop')).toBe(true);
    expect(actKeepsPromise(D, 'arrives at the laundromat')).toBe(false);
  });
  it('non-meeting intentions still settle by words (actCompletes)', () => {
    const d = "Tonight, when he knocks, I'm going to give it to him as the tip.";
    expect(actKeepsPromise(d, 'anything')).toBe(true);
    expect(actSettles(d, 'She gives it to him as the tip.')).toBe(true);
    expect(actSettles(d, "I'm just getting the tip.")).toBe(false);
  });
});

describe('leaving for the meeting (finding 63, 2026-11-05)', () => {
  const mk = (description: string, dueCycle: number | null): DueIntention => ({ id: description, description, trigger: null, sourceMemoryId: null, goalId: null, why: 'time', authority: 'self', dueCycle, dueUntil: dueCycle === null ? null : dueCycle + 65 * MIN });
  it('travelLeadCycles = 10 minutes', () => expect(travelLeadCycles('be at the coffee shop')).toBeCloseTo(10 * MIN, 12));
  it('dueReason counts a meeting as due from dueCycle − lead', () => {
    const i = { trigger: null, dueCycle: T0 + 10 * MIN, dueUntil: T0 + 75 * MIN };
    expect(dueReason(i, '', T0 + 2 * MIN)).toBeNull();
    expect(dueReason(i, '', T0 + 2 * MIN, 10 * MIN)).toBe('time');
    expect(dueReason(i, '', T0 - 1 * MIN, 10 * MIN)).toBeNull();
  });
  it('the earliest due meeting gives the chooser pair', () => {
    const later = mk('be at Extra Space Coffee in an hour', T0 + 55 * MIN);
    const sooner = mk('be at the coffee shop on Broadway tomorrow at four', T0 + 10 * MIN);
    expect(leaveForLine([later, sooner], T0 + 12 * MIN)).toEqual({ label: 'leave for the coffee shop on Broadway', deed: 'leaves for the coffee shop on Broadway' });
    expect(leaveForLine([mk('be at the coffee shop in 15 minutes', T0 + 10 * MIN)], T0 + 12 * MIN)!.label).toBe('leave for the coffee shop');
  });
  it('no meeting due → null; non-meeting intentions are ignored; an expired window is ignored', () => {
    expect(leaveForLine([], T0)).toBeNull();
    expect(leaveForLine([mk("I'm going to call my sister tonight.", T0)], T0)).toBeNull();
    expect(leaveForLine([mk('be at the coffee shop in ten minutes', T0)], T0 + 200 * MIN)).toBeNull();
  });
});
