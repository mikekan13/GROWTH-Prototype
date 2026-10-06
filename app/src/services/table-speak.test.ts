/**
 * U2c-3 — speakProse in both positions of the rollout switch. Stores and the
 * being loop are mocked; what is real is table-speak.ts, table-prose,
 * table-talk and table-plan. Fixtures are invented.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const w = vi.hoisted(() => ({
  npcs: [{ id: 'tess', name: 'Tess' }] as Array<{ id: string; name: string }>,
  characters: [{ id: 'mara', name: 'Mara' }, { id: 'oren', name: 'Oren' }, { id: 'tess', name: 'Tess' }],
  active: ['mara', 'oren'],
  canon: [] as Array<{ kind: string; narration?: string; speaker?: string; text?: string }>,
  chats: [] as Array<{ actor: string; characterId: string; message: string }>,
  broadcasts: [] as Array<Record<string, unknown>>,
  dropped: [] as Array<{ content: string; actions: string }>,
  attached: [] as Array<{ memoryId: string; canonEventId: string }>,
  extras: {} as Record<string, string[]>,
  held: null as { id: string } | null,
  session: { id: 'session-1' } as { id: string } | null,
  converse: vi.fn(),
  listen: vi.fn(),
  answer: vi.fn(),
  readNarration: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    character: {
      findMany: vi.fn(async (args: { where: { entityType?: string; id?: { not: string } } }) =>
        args.where.entityType === 'NPC' ? w.npcs : w.characters.filter((c) => c.id !== args.where.id?.not)),
    },
    dayaEntity: { findMany: vi.fn(async () => w.active.map((characterId) => ({ characterId }))) },
    copilotMessage: { create: vi.fn(async (args: { data: { content: string; actions: string } }) => { w.dropped.push(args.data); return {}; }) },
    gameSession: { findFirst: vi.fn(async () => w.session) },
  },
}));
vi.mock('@/services/campaign-event', () => ({
  createCampaignEvent: vi.fn(async (e: { actor: string; characterId: string; payload: { message: string } }) => {
    w.chats.push({ actor: e.actor, characterId: e.characterId, message: e.payload.message });
    return { id: `ev-${w.chats.length}`, createdAt: new Date(0), sessionId: null };
  }),
}));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn((_campaign: string, data: Record<string, unknown>) => { w.broadcasts.push(data); }) }));
vi.mock('@/daya/conversation', () => ({ converseWithEntity: w.converse, listenToTable: w.listen, answerAtTable: w.answer }));
vi.mock('@/daya/events', () => ({ isDayaEnabled: () => true }));
vi.mock('@/daya/l1-keepalive', () => ({ ensureKeepalive: vi.fn(async () => {}) }));
vi.mock('@/services/canon', () => ({
  declareCanon: vi.fn(async (_c: string, _a: unknown, input: { narration: string }) => { w.canon.push({ kind: 'narration', narration: input.narration }); return { event: { id: `canon-${w.canon.length}` } }; }),
  recordDialogueCanon: vi.fn(async (_c: string, speakerId: string, _label: string, text: string) => { w.canon.push({ kind: 'dialogue', speaker: speakerId, text }); return { id: `canon-${w.canon.length}` }; }),
  recordUnattributedDialogueCanon: vi.fn(async (_c: string, label: string, text: string) => { w.canon.push({ kind: 'dialogue', speaker: label, text }); return { id: `canon-${w.canon.length}` }; }),
  attachTruthToMemory: vi.fn(async (memoryId: string, canonEventId: string, extra: string[] = []) => { w.attached.push({ memoryId, canonEventId }); w.extras[memoryId] = extra; return true; }),
  attachTruthToRecentMemories: vi.fn(async () => 0),
}));
vi.mock('@/services/reconciliation', () => ({
  readNarration: w.readNarration,
  takeConfirmed: vi.fn(async (_c: string, id: string) => ({ id })),
  attachCanonToTicket: vi.fn(async () => {}),
  cementCheck: vi.fn(async () => {}),
}));

import { speakProse, hearSpoken, forgetSpokenTable, getTableRoster, tableSplitLoop } from './table-speak';

const actor = { userId: 'gm', username: 'watcher', role: 'WATCHER' };
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const savedEnv = { ...process.env };

function answerWith(lines: Record<string, { kind: string; content?: string }>) {
  w.answer.mockImplementation(async (id: string, _role: string, _ask: unknown, opts: { onEvent?: (e: Record<string, unknown>) => void }) => {
    const action = lines[id] ?? { kind: 'rest' };
    opts.onEvent?.({ phase: 'start', utteranceId: `u-${id}`, characterId: id, characterName: id });
    if (action.kind === 'speak') opts.onEvent?.({ phase: 'partial', utteranceId: `u-${id}`, characterId: id, text: action.content, delta: action.content });
    opts.onEvent?.({ phase: 'final', utteranceId: `u-${id}`, characterId: id, action: action.kind, text: action.content ?? '', revoiced: false });
    return { status: 'ok', answer: { utteranceId: `u-${id}`, action, timings: {}, after: Promise.resolve({ memoryEntryId: `ask-mem-${id}` }) } };
  });
}

beforeEach(() => {
  delete process.env.TABLE_SPLIT_LOOP;
  w.canon.length = 0; w.chats.length = 0; w.broadcasts.length = 0; w.dropped.length = 0; w.attached.length = 0;
  w.converse.mockReset().mockResolvedValue({ status: 'ok', action: { kind: 'speak', content: 'Hm.' }, memoryEntryId: 'serial-mem' });
  w.listen.mockReset().mockImplementation(async (id: string) => ({ status: 'ok', listened: { status: 'listened', memoryEntryId: `listen-mem-${id}` } }));
  w.answer.mockReset();
  answerWith({});
  w.readNarration.mockReset().mockResolvedValue(null);
});
afterEach(() => {
  process.env = { ...savedEnv };
});

describe('the rollout switch', () => {
  it('is off unless TABLE_SPLIT_LOOP is exactly "on"', () => {
    expect(tableSplitLoop()).toBe(false);
    for (const v of ['1', 'true', 'ON', 'off', '']) { process.env.TABLE_SPLIT_LOOP = v; expect(tableSplitLoop()).toBe(false); }
    process.env.TABLE_SPLIT_LOOP = 'on';
    expect(tableSplitLoop()).toBe(true);
  });
});

describe('getTableRoster — tells the recorder where the switch stands', () => {
  it('splitLoop follows the one switch', async () => {
    expect((await getTableRoster('camp', 'WATCHER')).splitLoop).toBe(false);
    process.env.TABLE_SPLIT_LOOP = 'on';
    expect((await getTableRoster('camp', 'WATCHER')).splitLoop).toBe(true);
  });
});

describe('speakProse — switch OFF: the serial loop, as before', () => {
  it('one stimulus per awake being through converseWithEntity; the split loop is never touched', async () => {
    const result = await speakProse('camp', actor, { message: 'The door bangs open. What do you do?' });
    expect(w.converse).toHaveBeenCalledTimes(2);
    expect(w.converse.mock.calls.map((c) => [c[0], c[2], c[4]])).toEqual([
      ['mara', 'The door bangs open. What do you do?', 'perception'],
      ['oren', 'The door bangs open. What do you do?', 'perception'],
    ]);
    expect(w.listen).not.toHaveBeenCalled();
    expect(w.answer).not.toHaveBeenCalled();
    expect(w.broadcasts.some((b) => b.kind === 'being_speaking')).toBe(false);
    expect(w.canon).toEqual([{ kind: 'narration', narration: 'The door bangs open. What do you do?' }]);
    expect(w.chats.map((c) => c.message)).toEqual(['Hm.', 'Hm.']);
    expect(result.responses.map((r) => [r.characterId, r.status, r.actionKind])).toEqual([['mara', 'ok', 'speak'], ['oren', 'ok', 'speak']]);
    expect(result.ignored).toBeUndefined();
  });
  it('out-of-character talk and check calls are still narration on this path, as they always were', async () => {
    await speakProse('camp', actor, { message: '(brb) Roll perception.' });
    expect(w.canon).toEqual([{ kind: 'narration', narration: '(brb) Roll perception.' }]);
    expect(w.converse).toHaveBeenCalledTimes(2);
    expect(w.dropped).toEqual([]);
  });
  it('a held ticket stops everything, as before', async () => {
    w.readNarration.mockResolvedValue({ id: 'ticket-1' });
    const result = await speakProse('camp', actor, { message: 'You are suddenly on a ship.' });
    expect(result.held).toEqual({ id: 'ticket-1' });
    expect(w.canon).toEqual([]);
    expect(w.converse).not.toHaveBeenCalled();
  });
});

describe('speakProse — switch ON: listen while the GM has the floor, answer at the ask', () => {
  beforeEach(() => { process.env.TABLE_SPLIT_LOOP = 'on'; });

  it('narration only: everyone listens, nobody speaks, and the call does not wait for the listening', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    w.listen.mockImplementation(async (id: string) => { await gate; return { status: 'ok', listened: { status: 'listened', memoryEntryId: `listen-mem-${id}` } }; });
    const result = await speakProse('camp', actor, { message: 'The door bangs open. Rain comes in with it.' });
    expect(w.converse).not.toHaveBeenCalled();
    expect(w.answer).not.toHaveBeenCalled();
    expect(w.listen.mock.calls.map((c) => [c[0], c[2]])).toEqual([
      ['mara', { source: 'perception', content: 'The door bangs open. Rain comes in with it.' }],
      ['oren', { source: 'perception', content: 'The door bangs open. Rain comes in with it.' }],
    ]);
    expect(result.responses).toEqual([
      { characterId: 'mara', characterName: 'Mara', status: 'ok', detail: 'listening' },
      { characterId: 'oren', characterName: 'Oren', status: 'ok', detail: 'listening' },
    ]);
    expect(w.chats).toEqual([]);
    expect(w.attached).toEqual([]);
    release();
    await flush();
    await flush();
    expect(w.attached).toEqual([{ memoryId: 'listen-mem-mara', canonEventId: 'canon-1' }, { memoryId: 'listen-mem-oren', canonEventId: 'canon-1' }]);
  });

  it('narration then a turn to the party: all listen, all answer, the lines grow on the stream and land as chat', async () => {
    answerWith({ mara: { kind: 'speak', content: 'Who is there?' }, oren: { kind: 'act', content: 'steps back' } });
    const result = await speakProse('camp', actor, { message: 'The door bangs open. What do you do?' });
    expect(w.listen).toHaveBeenCalledTimes(2);
    expect(w.answer.mock.calls.map((c) => [c[0], c[2]])).toEqual([['mara', { kind: 'turn' }], ['oren', { kind: 'turn' }]]);
    const speaking = w.broadcasts.filter((b) => b.kind === 'being_speaking');
    expect(speaking.filter((b) => b.characterId === 'mara').map((b) => b.phase)).toEqual(['start', 'partial', 'final']);
    expect(speaking.filter((b) => b.characterId === 'oren').map((b) => b.phase)).toEqual(['start', 'final']);
    expect(w.chats).toEqual(expect.arrayContaining([
      { actor: 'ai_copilot', characterId: 'mara', message: 'Who is there?' },
      { actor: 'ai_copilot', characterId: 'oren', message: '*steps back*' },
    ]));
    expect(result.responses.map((r) => [r.characterId, r.status, r.actionKind])).toEqual([['mara', 'ok', 'speak'], ['oren', 'ok', 'act']]);
    // The record keeps the GM's text as given when nothing was ignored.
    expect(w.canon).toEqual([{ kind: 'narration', narration: 'The door bangs open. What do you do?' }]);
  });

  it('a turn to one name: only that being answers', async () => {
    answerWith({ mara: { kind: 'speak', content: 'Me?' } });
    await speakProse('camp', actor, { message: 'Mara, what do you do?' });
    expect(w.answer.mock.calls.map((c) => c[0])).toEqual(['mara']);
    expect(w.listen).not.toHaveBeenCalled();
    expect(w.canon).toEqual([]);
    expect(w.readNarration).not.toHaveBeenCalled();
  });

  it('an NPC speaks to one being: that one answers the line, the other overhears it, and the line is on the record', async () => {
    answerWith({ mara: { kind: 'speak', content: 'Depends who asks.' } });
    const result = await speakProse('camp', actor, { message: 'Tess: Mara, you the pilot?' });
    expect(w.answer.mock.calls.map((c) => [c[0], c[2]])).toEqual([['mara', { kind: 'spoken', by: 'Tess', text: 'Mara, you the pilot?' }]]);
    expect(w.listen.mock.calls.map((c) => [c[0], c[2]])).toEqual([['oren', { source: 'dialogue', content: 'Tess: Mara, you the pilot?' }]]);
    expect(w.canon).toEqual([{ kind: 'dialogue', speaker: 'tess', text: 'Mara, you the pilot?' }]);
    // A lone attributed line still reads at the table as that NPC speaking.
    expect(w.chats[0]).toEqual({ actor: 'gm', characterId: 'tess', message: 'Mara, you the pilot?' });
    expect(result.dialogue).toHaveLength(1);
    await flush();
    expect(w.attached).toEqual(expect.arrayContaining([{ memoryId: 'ask-mem-mara', canonEventId: 'canon-1' }, { memoryId: 'listen-mem-oren', canonEventId: 'canon-1' }]));
  });

  it('a being voiced by the GM does not hear its own line', async () => {
    w.npcs = [{ id: 'tess', name: 'Tess' }, { id: 'oren', name: 'Oren' }];
    await speakProse('camp', actor, { message: 'Oren: "Leave it."' });
    expect(w.listen.mock.calls.map((c) => c[0])).toEqual(['mara']);
    w.npcs = [{ id: 'tess', name: 'Tess' }];
  });

  it('out-of-character talk and check calls are not recorded, not heard, listed back, and marked in the ambient log', async () => {
    const result = await speakProse('camp', actor, { message: 'The lock is old. Roll perception. (brb, phone) It will not budge.' });
    expect(w.canon).toEqual([{ kind: 'narration', narration: 'The lock is old. It will not budge.' }]);
    expect(w.listen.mock.calls[0][2]).toEqual({ source: 'perception', content: 'The lock is old.\nIt will not budge.' });
    expect(result.ignored).toEqual([{ kind: 'check-call', text: 'Roll perception.' }, { kind: 'ooc', text: '(brb, phone)' }]);
    expect(w.dropped.map((d) => [d.content, JSON.parse(d.actions)])).toEqual([
      ['Roll perception.', { source: 'TABLE_DROPPED', kind: 'check-call', rule: 'check:roll-imperative' }],
      ['(brb, phone)', { source: 'TABLE_DROPPED', kind: 'ooc', rule: 'ooc:wrapped' }],
    ]);
    expect(w.answer).not.toHaveBeenCalled();
  });

  it('a message that is only ignored talk writes nothing and wakes nobody', async () => {
    const result = await speakProse('camp', actor, { message: '(brb)' });
    expect(w.canon).toEqual([]);
    expect(w.listen).not.toHaveBeenCalled();
    expect(w.readNarration).not.toHaveBeenCalled();
    expect(result).toMatchObject({ canonEventId: null, narration: null, ignored: [{ kind: 'ooc', text: '(brb)' }] });
    expect(result.responses.every((r) => r.detail === undefined)).toBe(true);
  });

  it('JEWL still reads first on this path: a held ticket stops everything', async () => {
    w.readNarration.mockResolvedValue({ id: 'ticket-1' });
    const result = await speakProse('camp', actor, { message: 'You are suddenly on a ship. What do you do?' });
    expect(result.held).toEqual({ id: 'ticket-1' });
    expect(w.canon).toEqual([]);
    expect(w.listen).not.toHaveBeenCalled();
    expect(w.answer).not.toHaveBeenCalled();
  });

  it('a being whose core is not answering is reported as such, and nothing is posted for it', async () => {
    w.answer.mockResolvedValue({ status: 'warming', detail: 'still warming' });
    const result = await speakProse('camp', actor, { message: 'Mara, what do you do?' });
    expect(result.responses.find((r) => r.characterId === 'mara')).toMatchObject({ status: 'warming', detail: 'still warming' });
    expect(w.chats).toEqual([]);
  });

  it('only a Watcher runs the table, on either path', async () => {
    await expect(speakProse('camp', { ...actor, role: 'TRAILBLAZER' }, { message: 'The door opens.' })).rejects.toThrow(/GM\/ADMIN only/);
  });
});

// ── U2c-4: the GM's mic ────────────────────────────────────────────────────

const gm = { ...actor, runsCampaign: true };

describe('hearSpoken — switch OFF, or the wrong moment: the mic does not feed the table', () => {
  beforeEach(() => { forgetSpokenTable(); w.session = { id: 'session-1' }; });

  it('switch off: nothing is read, written or woken — not even a session lookup', async () => {
    const result = await hearSpoken('camp', gm, 'The door bangs open. What do you do?');
    expect(result).toEqual({ fed: false, why: 'switch_off', heard: 0, asked: 0, ignored: [], holding: false });
    expect(w.canon).toEqual([]);
    expect(w.listen).not.toHaveBeenCalled();
    expect(w.answer).not.toHaveBeenCalled();
    expect(w.dropped).toEqual([]);
  });
  it('switch on but no session is live', async () => {
    process.env.TABLE_SPLIT_LOOP = 'on';
    w.session = null;
    expect(await hearSpoken('camp', gm, 'The door bangs open.')).toMatchObject({ fed: false, why: 'no_session' });
    expect(w.canon).toEqual([]);
    expect(w.listen).not.toHaveBeenCalled();
  });
  it('switch on but the speaker does not run this campaign, or is a player', async () => {
    process.env.TABLE_SPLIT_LOOP = 'on';
    expect(await hearSpoken('camp', { ...gm, runsCampaign: false }, 'The door bangs open.')).toMatchObject({ fed: false, why: 'not_the_gm' });
    expect(await hearSpoken('camp', { ...gm, role: 'TRAILBLAZER' }, 'The door bangs open.')).toMatchObject({ fed: false, why: 'not_the_gm' });
    expect(w.listen).not.toHaveBeenCalled();
  });
});

describe('hearSpoken — switch ON, session live: the mic is table talk', () => {
  beforeEach(() => { process.env.TABLE_SPLIT_LOOP = 'on'; forgetSpokenTable(); w.session = { id: 'session-1' }; });

  it('narration is recorded sentence by sentence and listened to; nobody speaks', async () => {
    const result = await hearSpoken('camp', gm, 'The door bangs open. Rain comes in with it.');
    expect(result).toEqual({ fed: true, heard: 1, asked: 0, ignored: [], holding: false });
    expect(w.canon).toEqual([{ kind: 'narration', narration: 'The door bangs open.' }, { kind: 'narration', narration: 'Rain comes in with it.' }]);
    expect(w.listen.mock.calls.map((c) => [c[0], c[2]])).toEqual([
      ['mara', { source: 'perception', content: 'The door bangs open. Rain comes in with it.' }],
      ['oren', { source: 'perception', content: 'The door bangs open. Rain comes in with it.' }],
    ]);
    expect(w.answer).not.toHaveBeenCalled();
    await flush();
    // The listen's memory rests on every sentence it covered.
    expect(w.attached.filter((a) => a.memoryId === 'listen-mem-mara')).toEqual([{ memoryId: 'listen-mem-mara', canonEventId: 'canon-1' }]);
    expect(w.extras['listen-mem-mara']).toEqual(['canon-2']);
  });

  it('an ask is answered without the call waiting for it: the GM is still talking', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    w.answer.mockImplementation(async (id: string) => { await gate; return { status: 'ok', answer: { utteranceId: `u-${id}`, action: { kind: 'speak', content: 'Me?' }, timings: {}, after: Promise.resolve({}) } }; });
    const result = await hearSpoken('camp', gm, 'Mara, what do you do?');
    expect(result).toMatchObject({ fed: true, heard: 0, asked: 1 });
    expect(w.answer.mock.calls.map((c) => [c[0], c[2]])).toEqual([['mara', { kind: 'turn' }]]);
    expect(w.chats).toEqual([]);
    release();
    await flush();
    await flush();
    expect(w.chats).toEqual([{ actor: 'ai_copilot', characterId: 'mara', message: 'Me?' }]);
    // The ask itself is table talk: it is never recorded as something that happened in the world.
    expect(w.canon).toEqual([]);
  });

  it('who the GM addressed carries from one chunk to the next', async () => {
    await hearSpoken('camp', gm, 'Mara, the door is locked.');
    await hearSpoken('camp', gm, 'What do you do?');
    expect(w.answer.mock.calls.map((c) => c[0])).toEqual(['mara']);
  });

  it('a sentence the chunk cut off is held and finished by the next chunk', async () => {
    const first = await hearSpoken('camp', gm, 'The rain stops. Then the door at the end of');
    expect(first).toMatchObject({ heard: 1, holding: true });
    expect(w.canon.map((c) => c.narration)).toEqual(['The rain stops.']);
    const second = await hearSpoken('camp', gm, 'the hall opens.');
    expect(second).toMatchObject({ heard: 1, holding: false });
    expect(w.canon.map((c) => c.narration)).toEqual(['The rain stops.', 'Then the door at the end of the hall opens.']);
  });

  it('chunks are read in the order they arrived even when they overlap', async () => {
    const both = Promise.all([hearSpoken('camp', gm, 'Mara, the door is locked.'), hearSpoken('camp', gm, 'What do you do?')]);
    await both;
    expect(w.answer.mock.calls.map((c) => c[0])).toEqual(['mara']);
  });

  it('unquoted speech is that NPC speaking, on the record and in what is heard', async () => {
    await hearSpoken('camp', gm, 'The fire pops. Tess says, sit down.');
    expect(w.canon).toEqual([{ kind: 'narration', narration: 'The fire pops.' }, { kind: 'dialogue', speaker: 'tess', text: 'sit down.' }]);
    expect(w.listen.mock.calls[0][2]).toEqual({ source: 'perception', content: 'The fire pops.\nTess: sit down.' });
  });

  it('a check call is left out and marked; guessed table chatter is kept as narration, never silently lost', async () => {
    const result = await hearSpoken('camp', gm, 'Hang on, let me check my notes. Roll perception. The lock is old.');
    expect(result.ignored).toEqual([{ kind: 'check-call', text: 'Roll perception.' }]);
    expect(w.canon.map((c) => c.narration)).toEqual(['Hang on, let me check my notes.', 'The lock is old.']);
    expect(w.dropped.map((d) => [d.content, JSON.parse(d.actions).source])).toEqual([['Roll perception.', 'TABLE_DROPPED']]);
  });

  it('an explicit "out of character" is dropped on this path too', async () => {
    const result = await hearSpoken('camp', gm, 'Out of character, I need five minutes.');
    expect(result).toMatchObject({ fed: true, heard: 0, ignored: [{ kind: 'ooc', text: 'Out of character, I need five minutes.' }] });
    expect(w.canon).toEqual([]);
    expect(w.listen).not.toHaveBeenCalled();
  });

  it('JEWL does not read each chunk (no cloud call per few seconds of speech)', async () => {
    await hearSpoken('camp', gm, 'You are suddenly on a ship.');
    expect(w.readNarration).not.toHaveBeenCalled();
  });
});
