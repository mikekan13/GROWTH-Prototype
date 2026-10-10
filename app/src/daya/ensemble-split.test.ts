/**
 * U2b-3 — the split loop driven end to end with every store and neighbor
 * mocked and a fake lane behind the real model client. What is real here:
 * ensemble.ts's listenStimulus / listenAtTable / answerAsk, listening.ts,
 * the spirit prompts, the seal, and model-client's streaming. Fixtures are
 * invented (no campaign rows).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DayaFetch } from './model-client';
import type { BeingSpeakingEvent } from './listening';

const store = vi.hoisted(() => ({
  modelCalls: [] as Array<{ subsystem: string; rationale?: string | null; tokensIn: number; tokensOut: number }>,
  memories: [] as Array<{ source: string; content: string }>,
  ingested: [] as Array<{ source: string; content: string }>,
  perceived: [] as Array<{ stimulus: string; source: string; standing?: string; voice?: boolean }>,
  persona: {} as Record<string, unknown>,
  ingestPersists: true,
  holdVoiced: null as Promise<void> | null,
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    dayaEntity: { findUniqueOrThrow: vi.fn(async () => ({ id: 'ent-mara', personaProfile: JSON.stringify(store.persona) })) },
    character: { findUnique: vi.fn(async () => ({ id: 'mara', name: 'Mara', campaignId: 'camp', data: '{}' })) },
    dayaAffect: { findUnique: vi.fn(async () => null) },
    goal: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null) },
    dayaModelCall: { create: vi.fn(async (args: { data: (typeof store.modelCalls)[number] }) => { store.modelCalls.push(args.data); return {}; }) },
  },
}));
vi.mock('@/ai/network', () => ({ recordAiCall: vi.fn() }));
vi.mock('@/services/history', () => ({ currentCycleOf: vi.fn(async () => 7) }));
vi.mock('./entity', () => ({ resolveDayaEntityId: vi.fn(async () => 'ent-mara') }));
vi.mock('./events', () => ({ registerHandler: vi.fn(), wake: vi.fn(async () => ({ trigger: 'adjudication_result', ran: true })) }));
vi.mock('./memory', () => ({
  ingestStimulus: vi.fn(async (p: { source: string; content: string }) => {
    store.ingested.push({ source: p.source, content: p.content });
    return store.ingestPersists
      ? { persisted: true, memoryEntryId: `mem-${store.ingested.length}`, tags: { arousal: 0.2, valence: 0, salience: 0.3, entityRefs: [], classification: { icOoc: 'IC' } } }
      : { persisted: false, tags: { arousal: 0, valence: 0, salience: 0, entityRefs: [], classification: { icOoc: 'OOC' } } };
  }),
  writeMemoryEntry: vi.fn(async (p: { source: string; content: string }) => { store.memories.push({ source: p.source, content: p.content }); return { id: `own-${store.memories.length}` }; }),
}));
vi.mock('./recall', () => ({ recall: vi.fn(async () => ({ prose: 'A night like this one, years back.' })), stemmedJaccard: () => 0 }));
vi.mock('./renderer', () => ({ render: vi.fn() }));
vi.mock('./world-ledger', () => ({ currentFacts: vi.fn(async () => []) }));
vi.mock('./perceive', () => ({
  perceive: vi.fn(async (_id: string, _campaign: string, stimulus: string, source: string, _overrides: unknown, opts: { standing?: string; voice?: boolean } = {}) => {
    const first = !store.perceived.some((p) => p.standing === 'once');
    store.perceived.push({ stimulus, source, standing: opts.standing, voice: opts.voice });
    if (opts.voice !== false && store.holdVoiced) await store.holdVoiced;
    const standing = opts.standing === 'once' && !first ? 'new' : 'full';
    const prose = opts.voice === false ? `[plain] ${stimulus}`.trim() : standing === 'full' ? `[the room] ${stimulus}` : `[noticed] ${stimulus}`;
    return { prose, fidelityLevel: 4, distortions: [], locationId: 'inn', truthLines: 3, mirrored: true, observer: { mood: { morale: 0, stress: 0, grief: 0 }, attunement: 0.8 }, standing, voiced: opts.voice !== false };
  }),
}));
vi.mock('./adjudicator', () => ({ resolveIntent: vi.fn(async () => ({ outcome: 'done' })) }));
vi.mock('./jewl-action', () => ({ runJewlToolAction: vi.fn() }));
vi.mock('./mechanics/resolve', () => ({ resolveEffortCheck: vi.fn(), maybeAdvanceVine: vi.fn(), restAndRecover: vi.fn() }));
vi.mock('./mechanics/thorns', () => ({
  detectAndFireThorns: vi.fn(async () => ({ fired: [] })),
  loadActiveThornBlocks: vi.fn(async () => []),
  isRuminationLockActive: vi.fn(async () => false),
}));

import { listenStimulus, listenAtTable, answerAsk } from './ensemble';
import { forgetListening, getListening, ANSWER_LISTEN_CAP_MS } from './listening';
import { STREAM_STOPPED_NOTE } from './model-client';
import { wake } from './events';

// ── a fake lane ─────────────────────────────────────────────────────────────

interface LaneCall { kind: 'soul' | 'listen' | 'answer' | 'body'; stream: boolean; stop?: string[]; hinted: boolean; prompt: string }

function sseBody(pieces: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = [
    ...pieces.map((content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }], usage: null })}\n\n`),
    `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 800, completion_tokens: pieces.length } })}\n\n`,
    'data: [DONE]\n\n',
  ];
  let i = 0;
  return new ReadableStream<Uint8Array>({ pull(controller) { if (i < chunks.length) controller.enqueue(encoder.encode(chunks[i++])); else controller.close(); } });
}

function fakeLane(script: { answers?: string[][]; listen?: string; soul?: string } = {}) {
  const calls: LaneCall[] = [];
  let answered = 0;
  const fetchImpl: DayaFetch = async (_url, init) => {
    const body = JSON.parse(init.body) as { messages: Array<{ content: string }>; stream?: boolean; stop?: string[] };
    const prompt = body.messages.map((m) => m.content).join('\n');
    const kind: LaneCall['kind'] = prompt.includes('Answer now') ? 'answer' : prompt.includes('Nobody is waiting on you') ? 'listen' : prompt.includes('Output ONLY JSON') ? 'body' : 'soul';
    calls.push({ kind, stream: body.stream === true, stop: body.stop, hinted: body.messages.length > 1, prompt });
    const json = (text: string) => ({ ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 800, completion_tokens: 20 } }) });
    if (kind === 'answer') {
      const pieces = script.answers?.[answered++] ?? ['Say:', ' Fine.'];
      return body.stream ? { ok: true, status: 200, text: async () => '', json: async () => { throw new Error('streamed'); }, body: sseBody(pieces) } : json(pieces.join(''));
    }
    if (kind === 'listen') return json(script.listen ?? 'He looks like trouble. Keep the bar between us.');
    if (kind === 'body') return json('{"intent":"steps back from the door","subjectKeys":[],"effortContext":"casual"}');
    return json(script.soul ?? 'Tired in the shoulders, wary.');
  };
  return { fetchImpl, calls };
}

function collect() {
  const events: BeingSpeakingEvent[] = [];
  return { events, onEvent: (e: BeingSpeakingEvent) => { events.push(e); } };
}

const savedEnv = { ...process.env };
beforeEach(() => {
  process.env.DAYA_L1_URL = 'http://mock-l1.local';
  process.env.DAYA_L1_MODEL = 'mock-model';
  delete process.env.DAYA_L1_PROVIDER;
  store.modelCalls.length = 0;
  store.memories.length = 0;
  store.ingested.length = 0;
  store.perceived.length = 0;
  store.persona = { identityNarrative: 'A ferry pilot who trusts water more than people.', voiceNotes: 'Dry, short sentences.' };
  store.ingestPersists = true;
  store.holdVoiced = null;
  forgetListening();
  vi.mocked(wake).mockClear();
});
afterEach(() => {
  process.env = { ...savedEnv };
});

describe('listenStimulus — reflection while someone else has the floor', () => {
  it('takes the place in once, stores the perception, thinks, and says nothing', async () => {
    const lane = fakeLane();
    const result = await listenStimulus('mara', { source: 'perception', content: 'The door bangs open.' }, { fetchImpl: lane.fetchImpl });
    expect(result).toMatchObject({ status: 'listened', memoryEntryId: 'mem-1', innerUpdated: true });
    expect(result.timings.standing).toBe('full');
    expect(store.perceived).toEqual([{ stimulus: 'The door bangs open.', source: 'perception', standing: 'once', voice: undefined }]);
    expect(store.ingested).toEqual([{ source: 'perception', content: '[the room] The door bangs open.' }]);
    expect(lane.calls.map((c) => c.kind).sort()).toEqual(['listen', 'soul']);
    expect(lane.calls.every((c) => !c.stream)).toBe(true);
    expect(store.memories).toEqual([]);
    expect(getListening('mara')).toMatchObject({
      locationId: 'inn',
      standingScene: '[the room] The door bangs open.',
      heard: [],
      innerState: 'He looks like trouble. Keep the bar between us.',
      feltStateBrief: 'Tired in the shoulders, wary.',
      recallBlock: 'A night like this one, years back.',
    });
  });

  it('a second stretch is heard against the place already taken in, and the recent felt state is reused', async () => {
    const lane = fakeLane();
    await listenStimulus('mara', { source: 'perception', content: 'The door bangs open.' }, { fetchImpl: lane.fetchImpl });
    const second = await listenStimulus('mara', { source: 'perception', content: 'A stranger shakes off the rain.' }, { fetchImpl: lane.fetchImpl });
    expect(second.timings).toMatchObject({ standing: 'new', soulMs: null });
    expect(lane.calls.map((c) => c.kind)).toEqual(expect.arrayContaining(['soul', 'listen', 'listen']));
    expect(lane.calls.filter((c) => c.kind === 'soul')).toHaveLength(1);
    const state = getListening('mara')!;
    expect(state.standingScene).toBe('[the room] The door bangs open.');
    expect(state.heard).toEqual(['[noticed] A stranger shakes off the rain.']);
    const listenPrompt = lane.calls.filter((c) => c.kind === 'listen')[1].prompt;
    expect(listenPrompt).toContain('[the room] The door bangs open.');
    expect(listenPrompt).toContain('What just reached you:\n[noticed] A stranger shakes off the rain.');
    expect(listenPrompt).toContain('He looks like trouble.');
  });

  it('a stretch the tagger calls out-of-character is not lived: nothing stored, nothing thought, nothing carried', async () => {
    store.ingestPersists = false;
    const lane = fakeLane();
    const result = await listenStimulus('mara', { source: 'perception', content: 'pass the chips' }, { fetchImpl: lane.fetchImpl });
    expect(result).toMatchObject({ status: 'not_lived', innerUpdated: false });
    expect(lane.calls.some((c) => c.kind === 'listen')).toBe(false);
    expect(getListening('mara')).toBeUndefined();
  });

  it('a monologue that trips the seal is dropped; the earlier inner state stands', async () => {
    const lane = fakeLane({ listen: 'Better check my stats before I answer.' });
    const result = await listenStimulus('mara', { source: 'perception', content: 'The door bangs open.' }, { fetchImpl: lane.fetchImpl });
    expect(result).toMatchObject({ status: 'listened', innerUpdated: false });
    expect(getListening('mara')!.innerState).toBe('');
  });

  it('stretches that arrive while one is being worked are heard together, in order', async () => {
    let release!: () => void;
    store.holdVoiced = new Promise<void>((resolve) => { release = resolve; });
    const lane = fakeLane();
    const o = { fetchImpl: lane.fetchImpl };
    const first = listenAtTable('mara', { source: 'perception', content: 'one' }, o);
    await new Promise((r) => setTimeout(r, 5));
    const second = listenAtTable('mara', { source: 'dialogue', content: 'Oren: "two"' }, o);
    const third = listenAtTable('mara', { source: 'perception', content: 'three' }, o);
    release();
    store.holdVoiced = null;
    const results = await Promise.all([first, second, third]);
    expect(store.perceived.map((p) => [p.source, p.stimulus])).toEqual([['perception', 'one'], ['perception', 'Oren: "two"\nthree']]);
    expect(results[1]).toBe(results[2]);
    expect(results[0]).not.toBe(results[1]);
  });
});

describe('answerAsk — one short streamed call at the ask', () => {
  const listened = async (lane: ReturnType<typeof fakeLane>) => {
    await listenAtTable('mara', { source: 'perception', content: 'The door bangs open.' }, { fetchImpl: lane.fetchImpl });
    lane.calls.length = 0;
    store.modelCalls.length = 0;
  };

  it('speaks: the line grows piece by piece, one model call, built on what listening left', async () => {
    const lane = fakeLane({ answers: [['Say', ':', ' Who', ' are', ' you', '?']] });
    await listened(lane);
    const { events, onEvent } = collect();
    const result = await answerAsk('mara', { kind: 'turn' }, { onEvent, overrides: { fetchImpl: lane.fetchImpl } });

    expect(lane.calls).toHaveLength(1);
    expect(lane.calls[0]).toMatchObject({ kind: 'answer', stream: true, stop: ['\n'], hinted: false });
    expect(lane.calls[0].prompt).toContain('He looks like trouble. Keep the bar between us.');
    expect(lane.calls[0].prompt).toContain('[the room] The door bangs open.');
    expect(lane.calls[0].prompt).toContain('The moment has come to you.');

    expect(events.map((e) => e.phase)).toEqual(['start', 'partial', 'partial', 'partial', 'final']);
    expect(events.filter((e) => e.phase === 'partial').map((e) => (e as { text: string }).text)).toEqual(['Who', 'Who are', 'Who are you?']);
    expect(events.at(-1)).toMatchObject({ phase: 'final', action: 'speak', text: 'Who are you?', revoiced: false });
    expect(new Set(events.map((e) => e.utteranceId)).size).toBe(1);

    expect(result.action).toEqual({ kind: 'speak', content: 'Who are you?' });
    expect(result.timings).toMatchObject({ listen: 'complete', retracted: false, revoiced: false, tokensOut: 6 });
    expect(result.timings.firstWordMs).not.toBeNull();
    expect(await result.after).toEqual({ spokenMemoryId: 'own-1' });
    expect(store.memories).toEqual([{ source: 'dialogue', content: 'Who are you?' }]);
    expect(store.modelCalls.map((c) => c.subsystem)).toEqual(['spirit_answer']);
    expect(store.modelCalls[0].rationale ?? null).toBeNull();
    expect(getListening('mara')!.heard.at(-1)).toBe('You said: "Who are you?"');
  });

  it('D1 — a seal hit mid-line withdraws it, re-voices without streaming, and only the clean line is stored', async () => {
    const lane = fakeLane({ answers: [['Say:', ' That', ' was', ' a', ' DR', ' 14', ' climb.'], ['Say: That was a hard climb.']] });
    await listened(lane);
    const { events, onEvent } = collect();
    const result = await answerAsk('mara', { kind: 'turn' }, { onEvent, overrides: { fetchImpl: lane.fetchImpl } });

    expect(events.map((e) => e.phase)).toEqual(['start', 'partial', 'partial', 'partial', 'partial', 'retract', 'final']);
    expect(events.find((e) => e.phase === 'retract')).toMatchObject({ reason: 'seal', rule: 'numeric-mechanics' });
    expect(JSON.stringify(events.find((e) => e.phase === 'retract'))).not.toContain('14');
    expect(events.at(-1)).toMatchObject({ phase: 'final', action: 'speak', text: 'That was a hard climb.', revoiced: true });

    expect(lane.calls.map((c) => [c.kind, c.stream, c.hinted])).toEqual([['answer', true, false], ['answer', false, true]]);
    expect(result.action).toEqual({ kind: 'speak', content: 'That was a hard climb.' });
    expect(result.timings).toMatchObject({ retracted: true, revoiced: true });
    await result.after;
    expect(store.memories).toEqual([{ source: 'dialogue', content: 'That was a hard climb.' }]);
    // The stopped stream is marked as such on its metering row; the audit row names the rule that fired.
    const answerRows = store.modelCalls.filter((c) => c.subsystem === 'spirit_answer');
    expect(answerRows[0].rationale).toBe(STREAM_STOPPED_NOTE);
    expect(store.modelCalls.some((c) => String(c.rationale ?? '').includes('numeric-mechanics'))).toBe(true);
  });

  it('D1 — when the re-voice is dirty too, the being lets the moment pass and nothing is stored as speech', async () => {
    const lane = fakeLane({ answers: [['Say:', ' Ask', ' the', ' GM', ' then.'], ['Say: The GM knows.']] });
    await listened(lane);
    const { events, onEvent } = collect();
    const result = await answerAsk('mara', { kind: 'turn' }, { onEvent, overrides: { fetchImpl: lane.fetchImpl } });
    expect(events.at(-1)).toMatchObject({ phase: 'final', action: 'rest', text: '', revoiced: true });
    expect(result.action).toEqual({ kind: 'rest' });
    await result.after;
    expect(store.memories).toEqual([]);
  });

  it('a hit before anything was shown re-voices with no retract event', async () => {
    const lane = fakeLane({ answers: [['Say:', ' KRMA', ' is', ' low.'], ['Say: I have nothing left.']] });
    await listened(lane);
    const { events, onEvent } = collect();
    const result = await answerAsk('mara', { kind: 'turn' }, { onEvent, overrides: { fetchImpl: lane.fetchImpl } });
    expect(events.map((e) => e.phase)).toEqual(['start', 'final']);
    expect(result.action).toEqual({ kind: 'speak', content: 'I have nothing left.' });
    expect(result.timings).toMatchObject({ retracted: true, revoiced: true });
  });

  it('acts: nothing is shown as speech and the intent goes down the act path after the line', async () => {
    const lane = fakeLane({ answers: [['Do', ':', ' steps', ' back', ' from', ' the', ' door']] });
    await listened(lane);
    const { events, onEvent } = collect();
    const result = await answerAsk('mara', { kind: 'turn' }, { onEvent, overrides: { fetchImpl: lane.fetchImpl } });
    expect(events.map((e) => e.phase)).toEqual(['start', 'final']);
    expect(events.at(-1)).toMatchObject({ action: 'act', text: 'steps back from the door' });
    expect(result.action).toEqual({ kind: 'act', content: 'steps back from the door' });
    expect(result.timings.firstWordMs).toBeNull();
    await result.after;
    expect(vi.mocked(wake)).toHaveBeenCalledWith(expect.objectContaining({ kind: 'adjudication_result', entityId: 'mara' }), expect.anything());
    expect(store.memories).toEqual([]);
  });

  it('being spoken to: the line reaches the being through the unvoiced mirror and is stored after the answer', async () => {
    const lane = fakeLane({ answers: [['Say:', ' Depends', ' who', ' asks.']] });
    await listened(lane);
    const result = await answerAsk('mara', { kind: 'spoken', by: 'Oren', text: 'You the pilot?' }, { overrides: { fetchImpl: lane.fetchImpl } });
    expect(store.perceived.at(-1)).toEqual({ stimulus: 'Oren: You the pilot?', source: 'dialogue', standing: 'once', voice: false });
    expect(lane.calls[0].prompt).toContain('You are being spoken to, right now:\n[plain] Oren: You the pilot?');
    expect(lane.calls).toHaveLength(1);
    expect(await result.after).toEqual({ memoryEntryId: 'mem-2', spokenMemoryId: 'own-1' });
    expect(store.ingested.at(-1)).toEqual({ source: 'dialogue', content: '[plain] Oren: You the pilot?' });
    expect(getListening('mara')!.heard.slice(-2)).toEqual(['[plain] Oren: You the pilot?', 'You said: "Depends who asks."']);
  });

  it('a cold ask (nothing listened to) still answers in one call, from the unvoiced place', async () => {
    const lane = fakeLane({ answers: [['Say:', ' Hm.']] });
    const result = await answerAsk('mara', { kind: 'turn' }, { overrides: { fetchImpl: lane.fetchImpl } });
    expect(result.timings.listen).toBe('none');
    expect(lane.calls.map((c) => c.kind)).toEqual(['answer']);
    expect(store.perceived).toEqual([{ stimulus: '', source: 'perception', standing: 'always', voice: false }]);
    expect(result.action).toEqual({ kind: 'speak', content: 'Hm.' });
  });

  it('a reply the stop sequence swallowed whole is asked for once more without it', async () => {
    const lane = fakeLane({ answers: [[], ['\nSay: Not tonight.']] });
    await listened(lane);
    const result = await answerAsk('mara', { kind: 'turn' }, { overrides: { fetchImpl: lane.fetchImpl } });
    expect(lane.calls.map((c) => [c.stream, c.stop])).toEqual([[true, ['\n']], [false, undefined]]);
    expect(result.action).toEqual({ kind: 'speak', content: 'Not tonight.' });
  });

  it('D2 — an ask that lands mid-listen waits only up to the cap, then goes on with the unvoiced mirror', async () => {
    const lane = fakeLane({ answers: [['Say:', ' Wait.']] });
    await listened(lane);
    let release!: () => void;
    store.holdVoiced = new Promise<void>((resolve) => { release = resolve; });
    const o = { fetchImpl: lane.fetchImpl };
    const inFlight = listenAtTable('mara', { source: 'perception', content: 'A stranger shakes off the rain.' }, o);
    await new Promise((r) => setTimeout(r, 5));
    const waiting = listenAtTable('mara', { source: 'perception', content: 'He looks straight at you.' }, o);

    const result = await answerAsk('mara', { kind: 'turn' }, { overrides: o });
    expect(result.timings.listen).toBe('capped');
    expect(result.timings.waitMs).toBeGreaterThanOrEqual(ANSWER_LISTEN_CAP_MS - 50);
    expect(result.timings.waitMs).toBeLessThan(ANSWER_LISTEN_CAP_MS + 400);
    const prompt = lane.calls.find((c) => c.kind === 'answer')!.prompt;
    expect(prompt).toContain('[plain] A stranger shakes off the rain.\n[plain] He looks straight at you.');
    expect(result.action).toEqual({ kind: 'speak', content: 'Wait.' });

    // The stretch that had not started was taken over by the answer and is stored by it; the one in flight stores itself.
    expect(await waiting).toBeNull();
    expect(await result.after).toMatchObject({ spokenMemoryId: 'own-1' });
    expect(store.ingested.map((i) => i.content)).toContain('[plain] He looks straight at you.');
    release();
    store.holdVoiced = null;
    expect(await inFlight).toMatchObject({ status: 'listened' });
    expect(store.ingested.map((i) => i.content)).toContain('[noticed] A stranger shakes off the rain.');
    expect(store.ingested.filter((i) => i.content.includes('He looks straight at you.'))).toHaveLength(1);
  });

  it('a lane failure closes the line it opened and surfaces the error', async () => {
    const lane = fakeLane();
    await listened(lane);
    const { events, onEvent } = collect();
    const failing: DayaFetch = async () => ({ ok: false, status: 500, text: async () => 'boom', json: async () => ({}) });
    await expect(answerAsk('mara', { kind: 'turn' }, { onEvent, overrides: { fetchImpl: failing } })).rejects.toThrow(/500/);
    expect(events.map((e) => e.phase)).toEqual(['start', 'final']);
    expect(events.at(-1)).toMatchObject({ action: 'rest', text: '' });
  });
});
