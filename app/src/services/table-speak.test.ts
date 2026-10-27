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
  beats: [] as Array<string | undefined>,
  held: null as { id: string } | null,
  feeds: [] as Array<Record<string, unknown> | undefined>,
  payloads: [] as Array<Record<string, unknown>>,
  session: { id: 'session-1' } as { id: string } | null,
  converse: vi.fn(),
  listen: vi.fn(),
  answer: vi.fn(),
  readNarration: vi.fn(),
  judge: vi.fn(),
  card: vi.fn(),
  carry: null as null | { speakerId: string; route: unknown[] },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    character: {
      findMany: vi.fn(async (args: { where: { entityType?: string | { in: string[] }; id?: { not: string } } }) =>
        args.where.entityType ? w.npcs : w.characters.filter((c) => c.id !== args.where.id?.not)),
    },
    campaignEvent: { findMany: vi.fn(async () => []) },
    dayaEntity: { findMany: vi.fn(async () => w.active.map((characterId) => ({ characterId }))) },
    copilotMessage: { create: vi.fn(async (args: { data: { content: string; actions: string } }) => { w.dropped.push(args.data); return {}; }) },
    gameSession: { findFirst: vi.fn(async () => w.session) },
    campaign: { findUnique: vi.fn(async () => ({ currentCycle: 0.25 })) },
  },
}));
vi.mock('@/services/campaign-event', () => ({
  createCampaignEvent: vi.fn(async (e: { actor: string; characterId: string; payload: { message: string } }) => {
    w.chats.push({ actor: e.actor, characterId: e.characterId, message: e.payload.message });
    w.payloads.push(e.payload as unknown as Record<string, unknown>);
    return { id: `ev-${w.chats.length}`, createdAt: new Date(0), sessionId: null };
  }),
}));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn((_campaign: string, data: Record<string, unknown>) => { w.broadcasts.push(data); }) }));
vi.mock('@/daya/conversation', () => ({ converseWithEntity: w.converse, listenToTable: w.listen, answerAtTable: w.answer }));
vi.mock('@/daya/events', () => ({ isDayaEnabled: () => true }));
vi.mock('@/daya/l1-keepalive', () => ({ ensureKeepalive: vi.fn(async () => {}) }));
vi.mock('@/services/canon', () => ({
  declareCanon: vi.fn(async (_c: string, _a: unknown, input: { narration: string; beatId?: string | null; feed?: Record<string, unknown> }) => { w.canon.push({ kind: 'narration', narration: input.narration }); w.beats.push(input.beatId ?? undefined); w.feeds.push(input.feed); return { event: { id: `canon-${w.canon.length}` } }; }),
  recordDialogueCanon: vi.fn(async (_c: string, speakerId: string, _label: string, text: string, beatId?: string | null) => { w.canon.push({ kind: 'dialogue', speaker: speakerId, text }); w.beats.push(beatId ?? undefined); return { id: `canon-${w.canon.length}` }; }),
  recordUnattributedDialogueCanon: vi.fn(async (_c: string, label: string, text: string, _context: unknown, beatId?: string | null) => { w.canon.push({ kind: 'dialogue', speaker: label, text }); w.beats.push(beatId ?? undefined); return { id: `canon-${w.canon.length}` }; }),
  attachTruthToMemory: vi.fn(async (memoryId: string, canonEventId: string, extra: string[] = []) => { w.attached.push({ memoryId, canonEventId }); w.extras[memoryId] = extra; return true; }),
  attachTruthToRecentMemories: vi.fn(async () => 0),
}));
vi.mock('@/services/perception-reach', async (orig) => ({ ...(await orig<typeof import('@/services/perception-reach')>()), judgeCanonReach: w.judge }));
vi.mock('@/services/world-apply', async (orig) => {
  const real = await orig<typeof import('@/services/world-apply')>();
  return {
    ...real,
    actorMap: async (id: string) => (w.carry ? { roomId: 'r', roomName: 'landing', home: { id: 'r', name: 'landing' }, doors: [] } : real.actorMap(id)),
    whereOthersStand: async (c: string, id: string, m: unknown) => (w.carry ? [{ id: w.carry.speakerId, name: 'Tess', roomName: 'flat', route: w.carry.route }] : real.whereOthersStand(c, id, m as never)),
  };
});
vi.mock('@/services/scene-builder', async (orig) => ({
  ...(await orig<typeof import('@/services/scene-builder')>()),
  buildBeingCard: w.card,
  buildScene: vi.fn(async () => ({ scene: null, cards: [], source: 'seed' })),
  sceneFacts: vi.fn(async () => ({ lines: [], names: [] })),
}));
vi.mock('@/services/reconciliation', () => ({
  readNarration: w.readNarration,
  takeConfirmed: vi.fn(async (_c: string, id: string) => ({ id })),
  attachCanonToTicket: vi.fn(async () => {}),
  cementCheck: vi.fn(async () => {}),
}));

import { speakProse, hearSpoken, forgetSpokenTable, getTableRoster, tableSplitLoop, actionToTableLine, lastVoicedFrom, reachEventOf, withoutThoughts, withoutRepeats, waitsFor, orderBeats, cardWithoutRepeats, awaitCard, CARD_WAIT_MS, readingsFor } from './table-speak';

describe("reachEventOf — the Watcher's prose act is its actor's own event (HW5 2026-10-25)", () => {
  const narr = (text: string) => ({ text, kind: 'narration' as const, to: null, speaker: null, expectsReply: false, ambiguous: false, rule: 'x' });
  const say = (text: string, id: string, label: string) => ({ text, kind: 'dialogue' as const, to: null, speaker: { id, label }, expectsReply: false, ambiguous: false, rule: 'x' });
  it('narration voiced for one roster character carries him as the source; with no actor the source stays null', () => {
    expect(reachEventOf([narr('He walks back to the door and knocks.')], 'c1', 'kris')).toMatchObject({ kind: 'narration', sourceId: 'kris', sourceName: null });
    expect(reachEventOf([narr('The radiator ticks.')], 'c1', null)).toMatchObject({ kind: 'narration', sourceId: null });
  });
  it('speech from one speaker keeps that speaker as the source, whoever the prose actor is', () => {
    expect(reachEventOf([say('Who is it?', 'violet', 'Violet')], 'c1', 'kris')).toMatchObject({ kind: 'speech', sourceId: 'violet', sourceName: 'Violet' });
  });
});

describe("lastVoicedFrom — the Watcher's last voice (HW5 2026-10-25)", () => {
  const roster = [{ id: 'kris', name: 'Kristopher' }, { id: 'violet', name: 'Violet' }];
  it("a being's chat line does not count; the newest declaration's last act or quote does", () => {
    const rows = [
      { type: 'chat', payload: JSON.stringify({ kind: 'chat', message: 'I was going to.' }) },
      { type: 'game_event', payload: JSON.stringify({ kind: 'game_event', eventType: 'declaration', speech: [{ speakerId: 'kris' }], actions: [{ actorId: 'kris' }] }) },
      { type: 'game_event', payload: JSON.stringify({ kind: 'game_event', eventType: 'declaration', speech: [{ speakerId: 'violet' }] }) },
    ];
    expect(lastVoicedFrom(rows, roster)?.id).toBe('kris');
  });
  it('a session marker or an unattributed quote is skipped; nothing voiced → null', () => {
    const rows = [
      { type: 'game_event', payload: JSON.stringify({ kind: 'game_event', eventType: 'session_end', description: 'Session 5 ended' }) },
      { type: 'game_event', payload: JSON.stringify({ kind: 'game_event', eventType: 'declaration', speech: [{ speakerId: null }] }) },
    ];
    expect(lastVoicedFrom(rows, roster)).toBeNull();
  });
});

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
  w.canon.length = 0; w.beats.length = 0; w.chats.length = 0; w.feeds.length = 0; w.payloads.length = 0; w.broadcasts.length = 0; w.dropped.length = 0; w.attached.length = 0;
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
    expect(w.beats).toEqual([undefined]); // typed prose is one row per message; beats are for spoken narration
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
    expect(w.listen.mock.calls.filter((c) => c[2].content === 'The door bangs open.').map((c) => c[0])).toEqual(['mara', 'oren']);
    expect(w.answer.mock.calls.map((c) => [c[0], c[2]])).toEqual([['mara', { kind: 'turn' }], ['oren', { kind: 'turn' }]]);
    const speaking = w.broadcasts.filter((b) => b.kind === 'being_speaking');
    expect(speaking.filter((b) => b.characterId === 'mara').map((b) => b.phase)).toEqual(['start', 'partial', 'final']);
    expect(speaking.filter((b) => b.characterId === 'oren').map((b) => b.phase)).toEqual(['start', 'final']);
    expect(w.chats).toEqual(expect.arrayContaining([
      { actor: 'ai_copilot', characterId: 'mara', message: 'Who is there?' },
    ]));
    // AN ACT ANSWER IS A CARD ACT (HW8 run 7): Oren's act is an action segment on his card, never a chat row.
    expect(w.chats.some((c) => c.characterId === 'oren' && c.message === '*steps back*')).toBe(false);
    expect(w.payloads).toContainEqual(expect.objectContaining({ kind: 'being_thought', segments: [{ kind: 'action', text: 'Oren steps back.' }] }));
    expect(result.responses.map((r) => [r.characterId, r.status, r.actionKind])).toEqual([['mara', 'ok', 'speak'], ['oren', 'ok', 'act']]);
    // The record keeps the GM's text as given when nothing was ignored; Mara's words are canon dialogue too.
    expect(w.canon[0]).toEqual({ kind: 'narration', narration: 'The door bangs open. What do you do?' });
    await flush(); await flush();
    expect(w.canon).toContainEqual({ kind: 'dialogue', speaker: 'mara', text: 'Who is there?' });
    // THE ROOM HEARS HER (HW5 2026-10-25): Oren is handed Mara's line as something said; Mara never hears her own.
    expect(w.listen.mock.calls.filter((c) => c[2].content === 'Mara: Who is there?').map((c) => c[0])).toEqual(['oren']);
  });

  it('a turn to one name: only that being answers', async () => {
    answerWith({ mara: { kind: 'speak', content: 'Me?' } });
    await speakProse('camp', actor, { message: 'Mara, what do you do?' });
    expect(w.answer.mock.calls.map((c) => c[0])).toEqual(['mara']);
    expect(w.readNarration).not.toHaveBeenCalled();
    await flush(); await flush();
    // The ask itself is never canon; Mara's answer is, and Oren hears it (HW5 2026-10-25). Nobody listened to the ask.
    expect(w.canon).toEqual([{ kind: 'dialogue', speaker: 'mara', text: 'Me?' }]);
    expect(w.listen.mock.calls.map((c) => [c[0], c[2].content])).toEqual([['oren', 'Mara: Me?']]);
  });

  it('an NPC speaks to one being: that one answers the line, the other overhears it, and the line is on the record', async () => {
    answerWith({ mara: { kind: 'speak', content: 'Depends who asks.' } });
    const result = await speakProse('camp', actor, { message: 'Tess: Mara, you the pilot?' });
    expect(w.answer.mock.calls.map((c) => [c[0], c[2]])).toEqual([['mara', { kind: 'spoken', by: 'Tess', text: 'Mara, you the pilot?' }]]);
    expect(w.listen.mock.calls[0].slice(0, 3).filter((_, i) => i !== 1)).toEqual(['oren', { source: 'dialogue', content: 'Tess: Mara, you the pilot?' }]);
    expect(w.canon[0]).toEqual({ kind: 'dialogue', speaker: 'tess', text: 'Mara, you the pilot?' });
    await flush(); await flush();
    // Mara's answer is on the record and reaches Oren too (HW5 2026-10-25).
    expect(w.canon).toContainEqual({ kind: 'dialogue', speaker: 'mara', text: 'Depends who asks.' });
    expect(w.listen.mock.calls.map((c) => [c[0], c[2].content])).toContainEqual(['oren', 'Mara: Depends who asks.']);
    // A lone attributed line still reads at the table as that NPC speaking.
    expect(w.chats[0]).toEqual({ actor: 'gm', characterId: 'tess', message: 'Mara, you the pilot?' });
    expect(result.dialogue).toHaveLength(1);
    await flush();
    expect(w.attached).toEqual(expect.arrayContaining([{ memoryId: 'ask-mem-mara', canonEventId: 'canon-1' }, { memoryId: 'listen-mem-oren', canonEventId: 'canon-1' }]));
  });

  it('a being voiced by the GM hears its own line as its own saying (HW6 2026-10-25); with one other present, that one is spoken TO and answers', async () => {
    w.npcs = [{ id: 'tess', name: 'Tess' }, { id: 'oren', name: 'Oren' }];
    await speakProse('camp', actor, { message: 'Oren: "Leave it."' });
    await flush();
    expect(w.listen.mock.calls.map((c) => [c[0], c[2]])).toEqual([['oren', { source: 'dialogue', content: 'I say: "Leave it."', own: true }]]);
    expect(w.answer.mock.calls.map((c) => [c[0], (c[2] as { kind: string }).kind])).toEqual([['mara', 'spoken']]);
    w.npcs = [{ id: 'tess', name: 'Tess' }];
  });

  it("a being's own impulse earns it the turn the ask did not give (Mike 2026-10-24)", async () => {
    w.listen.mockImplementation(async (id: string) => ({ status: 'ok', listened: { status: 'listened', memoryEntryId: `listen-mem-${id}`, impulse: id === 'mara' ? 'speak' : 'stay' } }));
    answerWith({ mara: { kind: 'speak', content: 'Who is it?' } });
    await speakProse('camp', actor, { message: 'Three knocks on the door, slow and even.' });
    await flush(); await flush();
    expect(w.listen.mock.calls.filter((c) => c[2].content === 'Three knocks on the door, slow and even.').map((c) => c[0]).sort()).toEqual(['mara', 'oren']);
    expect(w.answer.mock.calls.map((c) => [c[0], (c[2] as { kind: string }).kind])).toEqual([['mara', 'turn']]);
    expect(w.chats.some((c) => c.characterId === 'mara' && c.message === 'Who is it?')).toBe(true);
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
    expect(w.chats.filter((c) => c.actor === 'ai_copilot')).toEqual([{ actor: 'ai_copilot', characterId: 'mara', message: 'Me?' }]);
    // The ask itself is table talk: it is never recorded as something that happened in the world. Mara's answer is.
    expect(w.canon).toEqual([{ kind: 'dialogue', speaker: 'mara', text: 'Me?' }]);
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

  it('every spoken row carries its beat; the GM handing the turn over starts the next beat (Mike 2026-10-06)', async () => {
    await hearSpoken('camp', gm, 'The desk lamp flickers. Somewhere a door closes.');
    await hearSpoken('camp', gm, 'Tess says, sit down. Mara, what do you do?');
    await hearSpoken('camp', gm, 'The blinds stir.');
    expect(w.canon.map((c) => c.kind)).toEqual(['narration', 'narration', 'dialogue', 'narration']);
    expect(w.beats.every(Boolean)).toBe(true);
    expect(new Set(w.beats.slice(0, 3)).size).toBe(1);
    expect(w.beats[3]).not.toBe(w.beats[0]);
  });
  it('a long silence starts a new beat', async () => {
    await hearSpoken('camp', gm, 'The desk lamp flickers.');
    forgetSpokenTable();
    await hearSpoken('camp', gm, 'The blinds stir.');
    expect(w.beats[1]).not.toBe(w.beats[0]);
  });
  it('JEWL does not read each chunk (no cloud call per few seconds of speech)', async () => {
    await hearSpoken('camp', gm, 'You are suddenly on a ship.');
    expect(w.readNarration).not.toHaveBeenCalled();
  });
});

describe('the TABLE feed fields (ruling-feed-segment-colours-pillars, 2026-10-07)', () => {
  it('typed prose: the declaration carries the raw message and the preprocessor split', async () => {
    await speakProse('camp', actor, { message: 'Tess sets the lamp down.  "Sit."' });
    // Prose about a roster character is her act (Mike 2026-10-24): the declaration carries it, not narration.
    expect(w.feeds[0]).toEqual({
      via: 'typed',
      raw: 'Tess sets the lamp down.  "Sit."',
      narration: null,
      speech: [{ text: 'Sit.', speakerId: 'tess', speakerLabel: 'Tess', context: 'Tess sets the lamp down.' }],
      actions: [{ text: 'Sets the lamp down', actorId: 'tess', actorLabel: 'Tess' }],
    });
  });

  it("a being's line says it came from a being, the cycle it happened at, and the engine's raw action", async () => {
    await speakProse('camp', actor, { message: 'The door bangs open.' });
    expect(w.payloads[0]).toEqual({ kind: 'chat', message: 'Hm.', via: 'being', cycle: 0.25, raw: 'Say: Hm.' });
  });

  it('a lone typed line through an NPC is typed, raw kept when it differs', async () => {
    w.converse.mockResolvedValue({ status: 'ok', action: { kind: 'rest' } });
    await speakProse('camp', actor, { message: 'Tess: Sit down.' });
    expect(w.payloads[0]).toEqual({ kind: 'chat', message: 'Sit down.', via: 'typed', cycle: 0.25, raw: 'Tess: Sit down.' });
  });

  it('switch on, typed: the same split reaches the declaration', async () => {
    process.env.TABLE_SPLIT_LOOP = 'on';
    await speakProse('camp', actor, { message: 'Rain on the glass. "Who is there?"' });
    expect(w.feeds[0]).toMatchObject({ via: 'typed', narration: 'Rain on the glass.', speech: [{ text: 'Who is there?', speakerLabel: 'someone present' }] });
  });

  it('spoken: every sentence row is marked spoken and carries what was heard', async () => {
    process.env.TABLE_SPLIT_LOOP = 'on'; forgetSpokenTable(); w.session = { id: 'session-1' };
    await hearSpoken('camp', gm, 'The door bangs open. Rain comes in with it.');
    expect(w.feeds).toEqual([
      { via: 'spoken', raw: 'The door bangs open. Rain comes in with it.' },
      { via: 'spoken', raw: 'The door bangs open. Rain comes in with it.' },
    ]);
  });
});

describe('actionToTableLine (hello world 2026-10-17)', () => {
  it('an act shows what HAPPENED when the adjudicator has said, else the intent', () => {
    expect(actionToTableLine('Violet', { kind: 'act', content: 'push the door open', outcome: 'Violet tries the Entry door; it is locked and does not give.' })).toBe('*Violet tries the Entry door; it is locked and does not give.*');
    expect(actionToTableLine('Violet', { kind: 'act', content: 'steps back' })).toBe('*steps back*');
  });
  it('an empty Attend ("The dust") is no beat; a real one still is', () => {
    expect(actionToTableLine('Violet', { kind: 'attend', content: 'The dust' })).toBeNull();
    expect(actionToTableLine('Violet', { kind: 'attend', content: 'the folded bill by the door' })).toBe("*Violet's attention settles on the folded bill by the door*");
    expect(actionToTableLine('Violet', { kind: 'attend' })).toBe('*Violet goes quiet, watching*');
  });
});

describe("the Watcher's line, per part: a thought is the thinker's alone, an own act is in his person (HW6 2026-10-25)", () => {
  const narr = (text: string) => ({ text, kind: 'narration' as const, to: null, speaker: null, expectsReply: false, ambiguous: false, rule: 'x' });
  const say = (text: string, id: string, label: string) => ({ text, kind: 'dialogue' as const, to: null, speaker: { id, label }, expectsReply: false, ambiguous: false, rule: 'x' });
  beforeEach(() => { process.env.TABLE_SPLIT_LOOP = 'on'; });
  it('withoutThoughts takes the thought sentences out of the run and drops what is left empty', () => {
    const run = [narr('He thinks about leaving. He knocks again.'), say('Hello?', 'kris', 'Kristopher'), narr('He remembers her.')];
    expect(withoutThoughts(run, [{ sentence: 'He thinks about leaving.' }, { sentence: 'He remembers her.' }]).map((u) => u.text)).toEqual(['He knocks again.', 'Hello?']);
    expect(withoutThoughts(run, [])).toBe(run);
  });
  it('a thought that is a tag and its quote comes out of the run even when the run holds the tag alone (HW7 2026-10-25)', () => {
    const run = [narr('He wipes his eyes. And he says the prayer in his head. He knocks on the door.')];
    expect(withoutThoughts(run, [{ sentence: 'And he says the prayer in his head. "Lord Jesus Christ, have mercy on me."' }]).map((u) => u.text)).toEqual(['He wipes his eyes. He knocks on the door.']);
  });
  it('the others never sense what Tess thinks; Tess gets her thought with her act, both in her own person', async () => {
    const before = [...w.active];
    w.active.push('tess');
    try {
      await speakProse('camp', actor, { message: 'Tess thinks about leaving. Tess knocks on the door.' });
      await flush();
      const byId = Object.fromEntries(w.listen.mock.calls.map((c) => [c[0], c[2]]));
      expect(byId.mara).toEqual({ source: 'perception', content: 'Tess knocks on the door.' });
      expect(byId.oren).toEqual({ source: 'perception', content: 'Tess knocks on the door.' });
      expect(byId.tess).toEqual({ source: 'perception', content: 'I knock on the door.\nI think about leaving.', own: true });
      expect(w.feeds[0]).toMatchObject({ actions: [{ actorId: 'tess', text: 'Knocks on the door' }], thoughts: [{ actorId: 'tess', text: 'Thinks about leaving', sentence: 'Tess thinks about leaving.' }] });
    } finally {
      w.active.length = 0; w.active.push(...before);
    }
  });
  it("a being the Watcher voiced hears its own words as its own saying, not as a stranger's", async () => {
    const before = [...w.active];
    w.active.push('tess');
    try {
      await speakProse('camp', actor, { message: 'Tess gets close to the door and speaks loudly. "Anyone home?"' });
      await flush();
      const tess = w.listen.mock.calls.find((c) => c[0] === 'tess')?.[2];
      expect(tess).toMatchObject({ own: true, content: 'I get close to the door and speak loudly.\nI say: "Anyone home?"' });
    } finally {
      w.active.length = 0; w.active.push(...before);
    }
  });
});

describe('withoutRepeats — a being never returns its last thought verbatim (REPLAY 2026-10-25)', () => {
  it('drops a sentence seen before (case, spacing and trailing punctuation ignored), keeps the new one', () => {
    expect(withoutRepeats('The salt stings.  Her hand shakes.', ['the SALT stings!'])).toBe('Her hand shakes.');
  });
  it('is empty when every sentence repeats; unchanged with no history', () => {
    expect(withoutRepeats('The salt stings.', ['The salt stings.'])).toBe('');
    expect(withoutRepeats('The salt stings.', [])).toBe('The salt stings.');
  });
});

describe('waitsFor — a wait that names another being hands it the turn (HW8 2026-10-25)', () => {
  const roster = [{ id: 'kris', name: 'Kristopher', sex: 'm' }, { id: 'vio', name: 'Violet', sex: 'f' }];
  it('resolves the pronoun to the other being', () => {
    expect(waitsFor('He waits until she opens the door.', roster, 'kris')).toBe('vio');
  });
  it('a wait naming nobody gives nothing', () => {
    expect(waitsFor('He waits patiently.', roster, 'kris')).toBeNull();
  });
  it('resolves a name', () => {
    expect(waitsFor('She waits for Kristopher to knock', roster, 'vio')).toBe('kris');
  });
  it('a wait on the door hands the turn to the one being behind it (HW8 run 5, 2026-10-26)', () => {
    expect(waitsFor('He waits for the door.', roster, 'kris', 'vio')).toBe('vio');
    expect(waitsFor('He waits for the door.', roster, 'kris', null)).toBeNull();
    expect(waitsFor('He waits for the door.', roster, 'kris')).toBeNull();
  });
});

describe('orderBeats — hear beats first, the rest in order (HW8 run 5, 2026-10-26)', () => {
  it('moves a quote that precedes its narration behind the hear beat', () => {
    const out = orderBeats([{ type: 'spoken', n: 1 }, { type: 'hear', n: 2 }, { type: 'turn', n: 3 }]);
    expect(out.map((b) => b.n)).toEqual([2, 1, 3]);
  });
});

describe('withoutRepeats / cardWithoutRepeats — the replay, sentence by sentence, on every path (HW8 run 6)', () => {
  it('markdown emphasis and curly quotes are not part of a sentence', () => {
    expect(withoutRepeats("The wood doesn't vibrate; it just is. Something shifts.", ["The wood doesn't vibrate; it just *is*."])).toBe('Something shifts.');
  });
  it('a near-verbatim re-set of a long sentence is the same sentence', () => {
    expect(withoutRepeats('The caged bulb above the landing hums softly.', ['The caged bulb above the landing hums softly, steady.'])).toBe('');
    expect(withoutRepeats('Short one.', ['Short one!'])).toBe('');
    expect(withoutRepeats('A different thing entirely happens here today.', ['The caged bulb above the landing hums softly.'])).toBe('A different thing entirely happens here today.');
  });
  it('a card loses the sentences it repeats; speech is never touched; a card with nothing left is null', () => {
    const prev = ["The wood doesn't vibrate; it just *is*.", 'Violet holds still behind the door.'];
    const card = { scene: 'Violet holds still behind the door.', segments: [{ kind: 'thought' as const, text: "The wood doesn't vibrate; it just is. Something shifts in the hall." }, { kind: 'speech' as const, text: 'Violet holds still behind the door.' }] };
    expect(cardWithoutRepeats(card, prev)).toEqual({ scene: null, segments: [{ kind: 'thought', text: 'Something shifts in the hall.' }, { kind: 'speech', text: 'Violet holds still behind the door.' }] });
    expect(cardWithoutRepeats({ scene: 'Violet holds still behind the door.', segments: [{ kind: 'thought', text: "The wood doesn't vibrate; it just is." }] }, prev)).toBeNull();
  });
});

describe('awaitCard — a being\'s line goes up after its own card (HW8 run 6)', () => {
  it('waits for a card that is slower than the old 8 s cap would have allowed, but never past the cap', async () => {
    let done = false;
    const slow = new Promise<void>((r) => setTimeout(() => { done = true; r(); }, 30));
    await awaitCard(slow, 1000);
    expect(done).toBe(true);
    const t0 = Date.now();
    await awaitCard(new Promise<void>(() => {}), 40);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(35);
    await awaitCard(undefined, 10);
    expect(CARD_WAIT_MS).toBeGreaterThan(30_000);
  });
});

describe('readingsFor — the text in his hand is put in front of the being who reads it (HW8 run 6)', () => {
  it('"looks at the receipt" gives the receipt\'s data.text exactly; nothing for a line that reads nothing', async () => {
    const { prisma } = await import('@/lib/db');
    (prisma as unknown as { campaignItem: unknown }).campaignItem = {
      findMany: vi.fn(async () => [
        { name: 'Chess Pizza receipt', data: JSON.stringify({ text: '*** NOT PAID — COLLECT 22.97 ***' }) },
        { name: 'Orthodox prayer rope', data: JSON.stringify({ text: 'Lord Jesus Christ, have mercy on me.' }) },
      ]),
    };
    try {
      const read = await readingsFor(['kris'], 'He looks at the receipt to see if she paid already.');
      expect(read.get('kris')).toBe('What you read on the Chess Pizza receipt, exactly as it is written:\n*** NOT PAID — COLLECT 22.97 ***');
      expect((await readingsFor(['kris'], 'He knocks on the door.')).size).toBe(0);
    } finally {
      delete (prisma as unknown as { campaignItem?: unknown }).campaignItem;
    }
  });
});

describe('the engine at the table, run 6 (HW8)', () => {
  beforeEach(() => { process.env.TABLE_SPLIT_LOOP = 'on'; process.env.SCENE_BUILDER = 'off'; });

  it('a line with two hear beats around a quote is judged ONCE per being (the adjudicator was $0.20 of a $0.28 run)', async () => {
    process.env.PERCEPTION_REACH = 'on';
    w.judge.mockReset().mockImplementation(async (_c: string, _e: unknown, ids: string[]) => ({
      verdicts: new Map(ids.map((id) => [id, { beingId: id, reaches: true, via: ['hearing'], noticed: true, salience: 0.9 }])),
      source: 'model', beings: [],
    }));
    await speakProse('camp', actor, { message: 'The door bangs open. Tess: "Mara, you the pilot?" Rain comes in.' });
    await flush(); await flush();
    expect(w.judge).toHaveBeenCalledTimes(1);
  });

  it('the hearer\'s own name inside a quote is marked "says your name" (HW8 run 6)', async () => {
    await speakProse('camp', actor, { message: 'The door bangs open. Tess: "Mara, you the pilot?"' });
    await flush(); await flush();
    const toMara = w.listen.mock.calls.filter((c) => c[0] === 'mara').map((c) => c[2].content as string);
    expect(toMara.some((c) => c.includes('Tess says your name — "Mara, you the pilot?"'))).toBe(true);
    const toOren = w.listen.mock.calls.filter((c) => c[0] === 'oren').map((c) => c[2].content as string);
    expect(toOren.some((c) => c.includes('says your name'))).toBe(false);
  });

  it('her line goes up AFTER her own thought card on the hear → answer path (HW8 run 6)', async () => {
    w.listen.mockImplementation(async (id: string) => {
      if (id === 'mara') await new Promise((r) => setTimeout(r, 60));
      return { status: 'ok', listened: { status: 'listened', memoryEntryId: `listen-mem-${id}`, thought: 'The wood is cold.', impulse: 'stay' } };
    });
    answerWith({ mara: { kind: 'speak', content: 'Who is there?' } });
    await speakProse('camp', actor, { message: 'The door bangs open. Mara, what do you do?' });
    await flush(); await flush();
    const order = w.chats.filter((c) => c.characterId === 'mara').map((c) => c.actor);
    expect(order.indexOf('system')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('system')).toBeLessThan(order.indexOf('ai_copilot'));
  });
});

describe('a silence has no scene line (HW8 run 7 item 12)', () => {
  beforeEach(() => { process.env.TABLE_SPLIT_LOOP = 'on'; process.env.PERCEPTION_REACH = 'on'; process.env.SCENE_BUILDER = 'on'; });
  const nothingReaches = () => w.judge.mockReset().mockImplementation(async (_c: string, _e: unknown, ids: string[]) => ({
    verdicts: new Map(ids.map((id) => [id, { beingId: id, reaches: false, via: [], noticed: false, salience: 0 }])),
    source: 'model', beings: [],
  }));
  it('an addressed quote that did not carry posts the one "did not hear" sentence; the standing beat card has no scene row', async () => {
    nothingReaches();
    const { prisma } = await import('@/lib/db');
    (prisma as unknown as { entityRelationship: unknown }).entityRelationship = { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) };
    w.listen.mockImplementation(async (id: string) => ({ status: 'ok', listened: { status: 'listened', memoryEntryId: `m-${id}`, thought: 'The radiator ticks.', impulse: 'stay' } }));
    w.card.mockReset().mockResolvedValue({ scene: 'Nothing on the landing has changed.', segments: [{ kind: 'thought', text: 'The radiator ticks.' }] });
    await speakProse('camp', actor, { message: 'The door bangs open. Tess: "Mara, you the pilot?"' });
    await flush(); await flush(); await flush();
    expect(w.canon.filter((c) => c.kind === 'narration' && /^Mara did not hear/.test(c.narration ?? '')).length).toBeGreaterThan(0);
    const cards = w.payloads.filter((p) => p.kind === 'being_thought');
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((p) => !p.scene)).toBe(true);
  });
  it('an unaddressed line that did not reach posts no sentence at all', async () => {
    nothingReaches();
    w.card.mockReset().mockResolvedValue(null);
    await speakProse('camp', actor, { message: 'The door bangs open. Rain comes in.' });
    await flush(); await flush(); await flush();
    expect(w.canon.filter((c) => /did not hear/.test(c.narration ?? ''))).toEqual([]);
  });
});

describe('a quoted line is always sound (HW8 run 7 #4)', () => {
  beforeEach(() => { process.env.TABLE_SPLIT_LOOP = 'on'; process.env.PERCEPTION_REACH = 'on'; process.env.SCENE_BUILDER = 'off'; });
  afterEach(() => { w.carry = null; });
  it('the judge says NOT REACHED for a quote one door away: she hears it by hearing and is asked', async () => {
    const { prisma } = await import('@/lib/db');
    (prisma as unknown as { dayaEntity: { findUnique: unknown } }).dayaEntity.findUnique = vi.fn(async () => null);
    w.carry = { speakerId: 'tess', route: [{ kind: 'door', state: 'closed', name: 'entry_door' }] };
    w.judge.mockReset().mockImplementation(async (_c: string, _e: unknown, ids: string[]) => ({
      verdicts: new Map(ids.map((id) => [id, { beingId: id, reaches: false, via: [], noticed: false, salience: 0 }])),
      source: 'model', beings: [],
    }));
    await speakProse('camp', actor, { message: 'Tess waits for the door to open and when it does not she speaks again. "Are you ok?" Mara, what do you do?' });
    await flush(); await flush(); await flush();
    const toMara = w.listen.mock.calls.filter((c) => c[0] === 'mara').map((c) => c[2].content as string);
    expect(toMara.some((c) => c.includes('Are you ok?'))).toBe(true);
  });
});
