import { describe, it, expect } from 'vitest';
import { nextStep, endMet, routineDone, advanceCursor, normalizeEndOrder, triggerInCue, parseRoutineDrafts, endsInWords, pickByName, type RoutineEnd, type RoutineWorld } from './routines';
import { splitImpulse } from './prompts/roles/spirit';
import { readPlayerDecision, sheetReadout } from './prompts/roles/player';
import { pathSeconds, walkFtPerSFromCelerity } from '@/lib/spatial/pathfinding';

// The apartment at the knock (reset-to-the-knock, 2026-10-29): Violet mid-room, 12 ft from her locked entry door, whose
// deadbolt is under her hand; Kristopher on the landing beyond it with the pizza; her cash and the folded five on her.
const VIOLET = 'v', KRIS = 'k';
function world(over: Partial<{ doorState: 'open' | 'closed' | 'locked'; doorFt: number; pizzaHolder: string | null; cashHolder: string; billHolder: string; krisReach: RoutineWorld['people'][number]['reach'] }> = {}): RoutineWorld {
  const doorState = over.doorState ?? 'locked';
  const krisReach = over.krisReach ?? (doorState === 'open' ? 'through-open' : 'beyond-door');
  return {
    actor: { id: VIOLET, name: 'Violet', sex: 'female', roomId: 'main', roomName: 'Main Room' },
    doors: [
      { id: 'entry', name: 'Entry door', state: doorState, between: ['Main Room', 'Landing'], mine: doorState === 'locked', wayOut: true, touchesMyRoom: true, distanceFt: over.doorFt ?? 12 },
      { id: 'bath', name: 'Bathroom door', state: 'closed', between: ['Main Room', 'Bathroom'], mine: false, wayOut: false, touchesMyRoom: true, distanceFt: 9 },
    ],
    things: [
      { id: 'pizza', name: 'Pizza (Hawaiian + black olives)', holderId: over.pizzaHolder === undefined ? KRIS : over.pizzaHolder, holderName: 'Kristopher', roomId: null, distanceFt: null },
      { id: 'cash', name: 'The cash in her wallet', holderId: over.cashHolder ?? VIOLET, holderName: 'Violet', roomId: null, distanceFt: 0 },
      { id: 'bill', name: 'Five-dollar bill with her number', holderId: over.billHolder ?? VIOLET, holderName: 'Violet', roomId: null, distanceFt: 0 },
      { id: 'receipt', name: 'Chess Pizza receipt', holderId: KRIS, holderName: 'Kristopher', roomId: null, distanceFt: null },
    ],
    people: [{ id: KRIS, name: 'Kristopher', roomId: null, roomName: 'Landing', reach: krisReach, doorBetween: 'Entry door' }],
  };
}
const PIZZA_ENDS: RoutineEnd[] = [
  { kind: 'hold', item: 'the pizza' },
  { kind: 'gave', item: 'cash', to: 'the driver' },
  { kind: 'gave', item: 'five-dollar bill', to: 'Kristopher' },
  { kind: 'door', door: 'the way out', state: 'locked' },
];

describe('the planner: go → unlock and open → take → pay → tip → shut and lock, one step a beat, from the live world', () => {
  it('from mid-room the first step is to go to the way out', () => {
    const s = nextStep(PIZZA_ENDS, world())!;
    expect(s.effect).toEqual({ op: 'move', to: 'Entry door' });
    expect(s.act).toBe('goes to the Entry door');
    expect(s.because.join(' ')).toMatch(/pizza/i);
    expect(s.endIndex).toBe(0);
  });
  it('at the locked door, with the deadbolt hers, she turns the lock and opens it', () => {
    const s = nextStep(PIZZA_ENDS, world({ doorFt: 2 }))!;
    expect(s.effect).toEqual({ op: 'door', door: 'Entry door', state: 'open' });
    expect(s.act).toBe('turns the lock and opens the Entry door');
    expect(s.step).toBe('turn the lock and open the Entry door');
  });
  it('with the door open and the box still in his hands, she waits for it — the world gives it, not the planner', () => {
    const s = nextStep(PIZZA_ENDS, world({ doorFt: 2, doorState: 'open' }))!;
    expect(s.effect).toEqual({ op: 'wait', for: 'the Pizza (Hawaiian + black olives) from Kristopher' });
  });
  it('box in hand: pay him — "the driver" is the one other person in reach', () => {
    const s = nextStep(PIZZA_ENDS, world({ doorFt: 2, doorState: 'open', pizzaHolder: VIOLET }))!;
    expect(s.effect).toEqual({ op: 'give', item: 'The cash in her wallet', to: 'Kristopher' });
  });
  it('paid: the tip (the one-night intention rides as an end at its place)', () => {
    const s = nextStep(PIZZA_ENDS, world({ doorFt: 2, doorState: 'open', pizzaHolder: VIOLET, cashHolder: KRIS }))!;
    expect(s.effect).toEqual({ op: 'give', item: 'Five-dollar bill with her number', to: 'Kristopher' });
  });
  it('tipped: shut and lock the way out; then the routine is done', () => {
    const w = world({ doorFt: 2, doorState: 'open', pizzaHolder: VIOLET, cashHolder: KRIS, billHolder: KRIS });
    const s = nextStep(PIZZA_ENDS, w)!;
    expect(s.effect).toEqual({ op: 'door', door: 'Entry door', state: 'locked' });
    expect(s.act).toBe('shuts and locks the Entry door');
    expect(routineDone(PIZZA_ENDS, { ...w, doors: w.doors.map((d) => (d.id === 'entry' ? { ...d, state: 'locked' as const } : d)) })).toBe(true);
  });
  it('the cursor never goes back: cash handed over is not fetched back even though "have the cash" is now unmet', () => {
    const ends: RoutineEnd[] = [{ kind: 'hold', item: 'cash' }, { kind: 'gave', item: 'cash', to: 'Kristopher' }, { kind: 'door', door: 'the way out', state: 'locked' }];
    const before = world({ doorFt: 2, doorState: 'open' });
    expect(advanceCursor(ends, before, 0)).toBe(1);
    const after = world({ doorFt: 2, doorState: 'open', cashHolder: KRIS });
    const cursor = advanceCursor(ends, after, 1);
    expect(cursor).toBe(2);
    expect(nextStep(ends, after, cursor)!.effect).toEqual({ op: 'door', door: 'Entry door', state: 'locked' });
    // From zero the planner would want the cash back (Kristopher has it): the cursor is what stops that.
    expect(nextStep(ends, after, 0)!.effect.op).toBe('wait');
  });
  it('names keep their own article: "goes to the charcoal coat", never "the The"', () => {
    const w = world();
    w.things.push({ id: 'coat', name: 'The charcoal coat', holderId: null, holderName: null, roomId: 'main', distanceFt: 9 });
    const s = nextStep([{ kind: 'hold', item: 'charcoal coat' }], w)!;
    expect(s.act).toBe('goes to the charcoal coat');
    expect(s.because[0]).toBe('she means to have the charcoal coat');
  });
  it('the hands\' order is restored whatever the deriver listed: receive, pay, tip, then lock', () => {
    const got = normalizeEndOrder([
      { kind: 'door', door: 'the way out', state: 'locked' }, { kind: 'gave', item: 'cash', to: 'K' }, { kind: 'gave', item: 'bill', to: 'K' }, { kind: 'hold', item: 'pizza' }, { kind: 'door', door: 'the way out', state: 'open' },
    ]);
    expect(got.map((e) => (e.kind === 'door' ? `door:${e.state}` : e.kind === 'at' ? `at:${e.place}` : `${e.kind}:${e.item}`))).toEqual(['door:open', 'hold:pizza', 'gave:cash', 'gave:bill', 'door:locked']);
  });
  it('the plan adapts: the Watcher opened the door himself, so she skips straight to waiting for the box', () => {
    const s = nextStep(PIZZA_ENDS, world({ doorFt: 12, doorState: 'open' }))!;
    expect(s.effect.op).toBe('wait');
  });
  it('an end the world cannot satisfy (no such thing) is skipped, not planned for', () => {
    const s = nextStep([{ kind: 'hold', item: 'the unicorn' }, ...PIZZA_ENDS], world())!;
    expect(s.effect).toEqual({ op: 'move', to: 'Entry door' });
  });
  it('endMet reads the door by "the way out" and a thing by its loose name', () => {
    expect(endMet({ kind: 'door', door: 'the way out', state: 'locked' }, world())).toBe(true);
    expect(endMet({ kind: 'hold', item: 'pizza' }, world({ pizzaHolder: VIOLET }))).toBe(true);
    expect(pickByName('the cash', world().things)?.id).toBe('cash');
  });
  it('ends in words, ticked against the world', () => {
    expect(endsInWords(PIZZA_ENDS, world({ pizzaHolder: VIOLET }))[0]).toBe('✓ have the pizza');
    expect(endsInWords(PIZZA_ENDS, world())[3]).toBe('✓ the way out locked');
  });
});

describe('a routine is called up by its trigger words, stemmed', () => {
  it('"knock" is in "Kristopher politely knocks on the door."', () => {
    expect(triggerInCue(['knock', 'delivery', 'pizza'], 'Kristopher politely knocks on the door.')).toBe('knock');
    expect(triggerInCue(['knock'], 'A sound from beyond the room, too faint to make out.')).toBeNull();
    expect(triggerInCue(['someone at the door'], 'There is someone at the door now.')).toBe('someone at the door');
  });
});

describe('what the deriver wrote is read defensively', () => {
  it('keeps well-formed routines and drops the rest', () => {
    const got = parseRoutineDrafts({ routines: [
      { name: 'the pizza comes', triggers: ['knock', 'PIZZA '], cadence: 'daily', ends: [{ kind: 'hold', item: 'Pizza' }, { kind: 'door', state: 'locked' }, { kind: 'nope' }], sourceIntentionIds: ['a'] },
      { name: '', ends: [{ kind: 'hold', item: 'x' }] },
      { name: 'empty', ends: [] },
    ] });
    expect(got).toHaveLength(1);
    expect(got[0].triggers).toEqual(['knock', 'pizza']);
    expect(got[0].ends).toEqual([{ kind: 'hold', item: 'Pizza' }, { kind: 'door', door: 'the way out', state: 'locked' }]);
  });
});

describe('inaction is a claim: the impulse line carries its reason', () => {
  it('"Impulse: stay — the knock was not for me" keeps the thought and reads the reason', () => {
    const r = splitImpulse('The wood is cold.\nImpulse: stay — the knock was not for me');
    expect(r.thought).toBe('The wood is cold.');
    expect(r.impulse).toBe('stay');
    expect(r.reason).toBe('the knock was not for me');
  });
  it('a bare impulse has no reason; a trailing word no longer loses the line to stay', () => {
    expect(splitImpulse('A thought.\nImpulse: act').impulse).toBe('act');
    expect(splitImpulse('A thought.\nImpulse: act (now)').impulse).toBe('act');
    expect(splitImpulse('A thought with no marker.').impulse).toBe('stay');
  });
});

describe('the player behind the character', () => {
  it('reads its one line of JSON, and anything unreadable is follow', () => {
    expect(readPlayerDecision('{"decision":"hold","reason":"Willpower 3/34 — nothing left tonight"}')).toEqual({ decision: 'hold', reason: 'Willpower 3/34 — nothing left tonight' });
    expect(readPlayerDecision('follow — she opens every day').decision).toBe('follow');
    expect(readPlayerDecision('').decision).toBe('follow');
  });
  it('reads the sheet raw and names a condition at zero', () => {
    const r = sheetReadout({ attributes: { willpower: { level: 34, current: 0, augmentPositive: 0, augmentNegative: 0 }, celerity: { level: 22, current: 22, augmentPositive: 0, augmentNegative: 0 } } } as never);
    expect(r.lines).toEqual(['Celerity 22/22', 'Willpower 0/34']);
    expect(r.conditions).toEqual(['Overwhelmed']);
  });
});

describe('the sheet is the dial: a walk reads Celerity', () => {
  it('Celerity 24 walks 4 ft/s; the stand-in holds without a sheet', () => {
    expect(walkFtPerSFromCelerity(24)).toBe(4);
    expect(walkFtPerSFromCelerity(6)).toBe(1.5);
    expect(pathSeconds(12, 'walk', 4)).toBe(3);
    expect(pathSeconds(12, 'walk')).toBe(3);
    expect(pathSeconds(12, 'run', 4)).toBe(1);
  });
});
