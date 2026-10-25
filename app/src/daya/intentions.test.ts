import { describe, it, expect } from 'vitest';
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
