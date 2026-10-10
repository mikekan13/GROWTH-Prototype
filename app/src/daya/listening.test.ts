import { describe, it, expect, beforeEach } from 'vitest';
import {
  ListenQueue, settledWithin, createSpeechGate, foldPerception, getListening, setListening, forgetListening,
  HEARD_KEEP, type GateResult, type ListeningState,
} from './listening';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

describe('ListenQueue — one listen in flight per being, later chunks joined', () => {
  it('works a lone chunk on its own', async () => {
    const batches: string[][] = [];
    const q = new ListenQueue<string>(async (_key, batch) => { batches.push([...batch]); });
    await q.push('mara', 'The rain stops.');
    expect(batches).toEqual([['The rain stops.']]);
  });

  it('chunks arriving while one is being worked travel together as the next batch, in order', async () => {
    const gates = [deferred(), deferred()];
    const batches: string[][] = [];
    const q = new ListenQueue<string>(async (_key, batch) => { batches.push([...batch]); await gates[batches.length - 1].promise; });
    const first = q.push('mara', 'one');
    await tick();
    const second = q.push('mara', 'two');
    const third = q.push('mara', 'three');
    expect(q.inFlight('mara')).toEqual(['one']);
    gates[0].release();
    await first;
    await tick();
    expect(batches).toEqual([['one'], ['two', 'three']]);
    gates[1].release();
    await Promise.all([second, third]);
    await q.idle('mara');
    expect(q.inFlight('mara')).toEqual([]);
  });

  it('chunks pushed in the same tick are one batch', async () => {
    const batches: string[][] = [];
    const q = new ListenQueue<string>(async (_key, batch) => { batches.push([...batch]); });
    await Promise.all([q.push('mara', 'a'), q.push('mara', 'b')]);
    expect(batches).toEqual([['a', 'b']]);
  });

  it('beings do not wait on each other', async () => {
    const gate = deferred();
    const seen: string[] = [];
    const q = new ListenQueue<string>(async (key) => { seen.push(key); if (key === 'mara') await gate.promise; });
    const slow = q.push('mara', 'x');
    await q.push('oren', 'y');
    expect(seen).toEqual(['mara', 'oren']);
    gate.release();
    await slow;
  });

  it('takePending hands back what has not started and settles those pushes; the batch in flight is untouched', async () => {
    const gate = deferred();
    const batches: string[][] = [];
    const q = new ListenQueue<string>(async (_key, batch) => { batches.push([...batch]); await gate.promise; });
    const first = q.push('mara', 'one');
    await tick();
    const second = q.push('mara', 'two');
    expect(q.takePending('mara')).toEqual(['two']);
    await second;
    expect(q.takePending('mara')).toEqual([]);
    gate.release();
    await first;
    await q.idle('mara');
    expect(batches).toEqual([['one']]);
  });

  it('a worker that throws does not stall the lane', async () => {
    let calls = 0;
    const q = new ListenQueue<string>(async () => { calls += 1; if (calls === 1) throw new Error('lane down'); });
    await q.push('mara', 'one');
    await q.push('mara', 'two');
    expect(calls).toBe(2);
  });

  it('idle resolves at once when there is nothing to wait for', async () => {
    const q = new ListenQueue<string>(async () => {});
    await q.idle('nobody');
    expect(q.takePending('nobody')).toEqual([]);
  });
});

describe('settledWithin — the cap at the ask', () => {
  it('true when the work finishes in time, false when the cap comes first', async () => {
    expect(await settledWithin(Promise.resolve(), 50)).toBe(true);
    expect(await settledWithin(new Promise(() => {}), 10)).toBe(false);
  });
  it('work that fails still counts as settled', async () => {
    expect(await settledWithin(Promise.reject(new Error('x')), 50)).toBe(true);
  });
});

describe('foldPerception — what a being carries from listening', () => {
  const now = 5_000;
  it('the first full take becomes the standing scene', () => {
    const s = foldPerception(undefined, { prose: 'A low room, a long bar.', standing: 'full', locationId: 'inn' }, now);
    expect(s).toMatchObject({ locationId: 'inn', standingScene: 'A low room, a long bar.', heard: [], updatedAt: now });
  });
  it('later stretches are appended, oldest dropped past the limit', () => {
    let s = foldPerception(undefined, { prose: 'room', standing: 'full', locationId: 'inn' }, now);
    for (let i = 0; i < HEARD_KEEP + 3; i++) s = foldPerception(s, { prose: `heard ${i}`, standing: 'new', locationId: 'inn' }, now + i);
    expect(s.standingScene).toBe('room');
    expect(s.heard).toHaveLength(HEARD_KEEP);
    expect(s.heard[0]).toBe('heard 3');
    expect(s.heard.at(-1)).toBe(`heard ${HEARD_KEEP + 2}`);
  });
  it('a new full take (new place, long gap) replaces the scene and starts the heard list over, keeping the rest', () => {
    const before: ListeningState = { locationId: 'inn', standingScene: 'room', heard: ['a', 'b'], innerState: 'wary', feltStateBrief: 'tired', feltAt: 1, recallBlock: 'r', desiresBlock: 'd', updatedAt: 1 };
    const s = foldPerception(before, { prose: 'A cellar, cold.', standing: 'full', locationId: 'cellar' }, now);
    expect(s).toMatchObject({ locationId: 'cellar', standingScene: 'A cellar, cold.', heard: [], innerState: 'wary', feltStateBrief: 'tired' });
    expect(before.heard).toEqual(['a', 'b']);
  });
  it('a narrowed stretch with no scene held yet stands in as the scene', () => {
    const s = foldPerception(undefined, { prose: 'A door bangs.', standing: 'new', locationId: 'inn' }, now);
    expect(s.standingScene).toBe('A door bangs.');
  });
});

describe('listening state store', () => {
  beforeEach(() => forgetListening());
  it('holds one state per being and forgets on request', () => {
    const s = foldPerception(undefined, { prose: 'room', standing: 'full', locationId: 'inn' }, 1);
    setListening('mara', s);
    setListening('oren', s);
    expect(getListening('mara')).toBe(s);
    forgetListening('mara');
    expect(getListening('mara')).toBeUndefined();
    expect(getListening('oren')).toBe(s);
    forgetListening();
    expect(getListening('oren')).toBeUndefined();
  });
});

/** Run pieces through a gate; returns what was shown piece by piece, whether the gate asked to stop, and the result. */
function run(pieces: string[]): { shown: string[]; wholes: string[]; stoppedAt: number | null; result: GateResult } {
  const shown: string[] = [];
  const wholes: string[] = [];
  const gate = createSpeechGate((delta, whole) => { shown.push(delta); wholes.push(whole); });
  let stoppedAt: number | null = null;
  pieces.forEach((piece, i) => { if (stoppedAt === null && gate.push(piece) === false) stoppedAt = i; });
  return { shown, wholes, stoppedAt, result: gate.end() };
}

describe('createSpeechGate — the growing line', () => {
  it('strips the Say: label and hands out whole words as they complete', () => {
    const r = run(['Say', ':', ' Who', ' is', ' th', 'ere', '?']);
    expect(r.shown).toEqual(['Who', ' is', ' there?']);
    expect(r.wholes.at(-1)).toBe('Who is there?');
    expect(r.result).toMatchObject({ kind: 'speak', content: 'Who is there?', retracted: null, shown: true });
    expect(r.stoppedAt).toBeNull();
  });
  it('a label split across pieces or in another case is still a label', () => {
    expect(run(['S', 'a', 'y: ', 'No.']).result).toMatchObject({ kind: 'speak', content: 'No.' });
    expect(run(['SAY : Fine.']).result).toMatchObject({ kind: 'speak', content: 'Fine.' });
    expect(run(['\n  say: Fine.']).result).toMatchObject({ kind: 'speak', content: 'Fine.' });
  });
  it('a reply with no label is speech', () => {
    const r = run(['Don', "'t", ' touch', ' that.']);
    expect(r.result).toMatchObject({ kind: 'speak', content: "Don't touch that." });
    expect(run(['Restless,', ' I', ' guess.']).result).toMatchObject({ kind: 'speak', content: 'Restless, I guess.' });
    expect(run(['A', ' man', ' can', ' hope.']).result).toMatchObject({ kind: 'speak', content: 'A man can hope.' });
  });
  it('Do: shows nothing and keeps its content', () => {
    const r = run(['Do', ':', ' steps', ' back', ' from', ' the', ' door']);
    expect(r.shown).toEqual([]);
    expect(r.result).toMatchObject({ kind: 'act', content: 'steps back from the door', shown: false });
  });
  it('Attend: and Rest show nothing', () => {
    expect(run(['Attend: the window']).result).toMatchObject({ kind: 'attend', content: 'the window', shown: false });
    expect(run(['Rest']).result).toMatchObject({ kind: 'rest', content: '' });
    expect(run(['Rest', '.']).result).toMatchObject({ kind: 'rest', content: '' });
    expect(run(['Rest: nothing to add']).result).toMatchObject({ kind: 'rest', content: '' });
  });
  it('the line ends at the first line break; later text is ignored and the stream is left running', () => {
    const r = run(['Say: Not', ' tonight.', '\n', 'Do: leaves', ' at once']);
    expect(r.result).toMatchObject({ kind: 'speak', content: 'Not tonight.' });
    expect(r.shown.join('')).toBe('Not tonight.');
    expect(r.stoppedAt).toBeNull();
    expect(r.result.raw).toContain('leaves at once');
  });
  it('an empty reply, or a label with nothing after it, is the being letting it pass', () => {
    expect(run([]).result).toMatchObject({ kind: 'rest', content: '', shown: false });
    expect(run(['Say:', ' ']).result).toMatchObject({ kind: 'rest', content: '' });
  });
  it('the whole text arriving as one piece (a tier that does not stream) works the same', () => {
    const r = run(['Say: Sit down, then.\nI mean it.']);
    expect(r.shown).toEqual(['Sit down, then.']);
    expect(r.result.content).toBe('Sit down, then.');
  });
});

describe('createSpeechGate — the seal on a streamed line', () => {
  it('a hit in a word that has not been shown yet stops the line before anything of it is seen', () => {
    const r = run(['Say:', ' Check', ' your', ' stats', ' first.']);
    expect(r.shown.join('')).toBe('Check your');
    expect(r.result.retracted).toEqual({ rule: 'meta-vocabulary' });
    expect(r.result.kind).toBe('speak');
    expect(r.stoppedAt).toBe(4);
  });
  it('a hit that only completes on a later word withdraws what was already shown', () => {
    const r = run(['Say:', ' That', ' was', ' a', ' DR', ' 14', ' climb.']);
    expect(r.shown.join('')).toBe('That was a DR');
    expect(r.result.retracted).toEqual({ rule: 'numeric-mechanics' });
    expect(r.result.shown).toBe(true);
    expect(r.stoppedAt).toBe(6);
  });
  it('a hit in the very first word shows nothing at all', () => {
    const r = run(['Say:', ' KRMA', ' is', ' low.']);
    expect(r.shown).toEqual([]);
    expect(r.result).toMatchObject({ retracted: { rule: 'meta-vocabulary' }, shown: false });
  });
  it('a hit in the last word is caught at the end of the stream', () => {
    const r = run(['Say:', ' Ask', ' the', ' GM']);
    expect(r.shown.join('')).toBe('Ask the');
    expect(r.result.retracted).toEqual({ rule: 'meta-vocabulary' });
  });
  it('a word that merely starts like a flagged one is not a hit once it finishes', () => {
    const r = run(['Say:', ' A', ' token', 'ism', ' of', ' sorts.']);
    expect(r.result.retracted).toBeNull();
    expect(r.result.content).toBe('A tokenism of sorts.');
  });
  it('after a retract the gate asks for the generation to stop and shows nothing more', () => {
    const shown: string[] = [];
    const gate = createSpeechGate((delta) => { shown.push(delta); });
    expect(gate.push('Say: roll')).toBe(true);
    expect(gate.push(' a')).toBe(true);
    expect(gate.push(' die,')).toBe(false);
    expect(gate.push(' friend.')).toBe(false);
    expect(shown.join('')).toBe('roll');
    expect(gate.end().retracted).toEqual({ rule: 'meta-vocabulary' });
  });
  it('a Do: line is not checked here — it is never shown as speech', () => {
    const r = run(['Do: checks the dice on the table']);
    expect(r.result).toMatchObject({ kind: 'act', retracted: null, shown: false });
  });
  it('a soft hit (an attribute word used plainly) does not stop the line', () => {
    const r = run(['Say:', ' My', ' focus', ' is', ' gone.']);
    expect(r.result).toMatchObject({ retracted: null, content: 'My focus is gone.' });
  });
});
