/**
 * Table speak — the GM types normal tabletop prose at the table.
 *
 * Mike 2026-09-02: "As a GM you should be able to select any npc and speak
 * through them. It works like normal tabletop."
 * Mike 2026-09-26: "The system shouldn't need a tab switcher. It should pick
 * up from normal prose." — and: "The GM narrative during play is usually
 * additive. Everything should essentially go through the murky Mirror
 * before being presented to the AI."
 *
 * One message does three things, in table order:
 *   1. TRUTH. The prose is parsed (services/table-prose.ts): narration
 *      becomes a Watcher declaration (`declareCanon`, kind `narration`) and
 *      each quoted line a `dialogue` canon event — attributed to a campaign
 *      NPC when the prose names one, otherwise to the noun phrase that
 *      introduced it. The table record (event feed) gets the line.
 *   2. PERCEPTION. Every ACTIVE DAYA being at the table receives the prose
 *      as one stimulus — and the being loop runs it through the murky
 *      mirror (daya/perceive.ts): composed with the place it stands in, who
 *      is present, what is there; filtered by its senses; rendered through
 *      its own observer. What it perceived is what it remembers, pointing
 *      at the canon events (truthRef + chain).
 *   3. RESPONSE. Whatever the being does posts back into the feed as chat.
 *
 * Infra states (core warming / offline) are RETURNED to the caller for the
 * GM's eyes only — they are never posted into the table record.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { isWatcherOrAbove } from '@/lib/permissions';
import { createCampaignEvent } from '@/services/campaign-event';
import { broadcastEvent } from '@/lib/campaign-stream';
import { converseWithEntity, listenToTable, answerAtTable, type ConverseStatus } from '@/daya/conversation';
import { isDayaEnabled } from '@/daya/events';
import type { TableAsk, ListenTimings, AnswerTimings } from '@/daya/ensemble';
import { readTableTalk, type TableTalkState } from '@/services/table-talk';
import { planTableTalk, stimulusFor, answerers, overhearers, canonNarration, narrationSentences, type PlannedStimulus, type TableBeat, type TablePlan } from '@/services/table-plan';
import type { TerminalEvent, TerminalActor, TerminalPayload, TableFeedFields } from '@/types/terminal';
import {
  attachTruthToMemory,
  attachTruthToRecentMemories,
  declareCanon,
  recordDialogueCanon,
  recordUnattributedDialogueCanon,
} from '@/services/canon';
import { parseTableProse, type ProseQuote } from '@/services/table-prose';
import { ensureKeepalive } from '@/daya/l1-keepalive';
import { readNarration, takeConfirmed, attachCanonToTicket, cementCheck, type ReconTicket } from '@/services/reconciliation';

export interface TableActor {
  userId: string;
  username: string;
  role: string;
}

export interface ListenerResponse {
  characterId: string;
  characterName: string;
  status: ConverseStatus;
  actionKind?: string;
  detail?: string;
}

export interface TableSpeakResult {
  npcName: string;
  responses: ListenerResponse[];
}

export interface TableProseResult {
  /** JEWL stopped the table: the narration differs enough from the sim. Nothing was written. Answer via /reconcile, then resend with confirmTicketId. */
  held?: ReconTicket;
  /** The narration canon event (null when the message was speech alone). */
  canonEventId: string | null;
  /** One per quoted line, with who the record says spoke it. */
  dialogue: Array<{ canonEventId: string; speakerId: string | null; speakerLabel: string; text: string }>;
  narration: string | null;
  responses: ListenerResponse[];
  /** Split loop only: talk that was not part of the world (out-of-character, check calls) — not recorded, not heard. Listed so the GM can see what was left out. */
  ignored?: Array<{ kind: string; text: string }>;
}

/**
 * ROLLOUT GUARD (orchestrator, 2026-10-06) — not a feature and not a setting.
 * Off, the default: the table runs the serial loop exactly as it always has.
 * On (TABLE_SPLIT_LOOP=on in the environment): typed prose, and the GM's mic
 * while a session is live, go through the split loop — beings listen while the
 * GM has the floor and answer at the ask (TABLE-RHYTHM-DESIGN-2026-10-01).
 * This is the ONE place it is read. Delete it, together with the serial path
 * it guards, once U2d has signed off on a live run.
 */
export function tableSplitLoop(): boolean {
  return process.env.TABLE_SPLIT_LOOP === 'on';
}

/**
 * When beings speak on the split path. 'when-asked': only when the turn comes
 * to them or they are spoken to (TABLE-RHYTHM-DESIGN §1 — proposed default,
 * Mike's ruling pending). 'always': also after every message, as the serial loop does.
 */
const BEINGS_ANSWER = 'when-asked' as 'when-asked' | 'always';

/** Kept for the pre-09-26 narrate-only callers; prose handles it now. */
export type TableNarrateResult = TableProseResult;

/** The campaign clock for a feed row; a row without it still posts (the feed shows "not recorded"). */
async function feedCycle(campaignId: string): Promise<number | undefined> {
  try {
    const c = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } });
    return typeof c?.currentCycle === 'number' ? c.currentCycle : undefined;
  } catch { return undefined; }
}

/** A being's action as the engine produced it, before the table line was made of it ("Say: …", "Do: …") — the feed's raw text. */
function rawBeingAction(action: { kind: string; content?: string }): string {
  const label = ({ speak: 'Say', act: 'Do', attend: 'Attend', rest: 'Rest' } as Record<string, string>)[action.kind] ?? action.kind;
  return action.content ? `${label}: ${action.content}` : label;
}

async function postChat(
  campaignId: string,
  actor: TerminalActor,
  actorUserId: string,
  actorName: string,
  characterId: string,
  characterName: string,
  message: string,
  feed: TableFeedFields = {},
) {
  const cycle = await feedCycle(campaignId);
  const payload: TerminalPayload = {
    kind: 'chat', message,
    ...(feed.via ? { via: feed.via } : {}),
    ...(cycle !== undefined ? { cycle } : {}),
    ...(feed.raw !== undefined && feed.raw.trim() !== message.trim() ? { raw: feed.raw } : {}),
  };
  const event = await createCampaignEvent({
    campaignId,
    type: 'chat',
    actor,
    actorUserId,
    actorName,
    characterId,
    characterName,
    payload,
  });
  const terminalEvent: TerminalEvent = {
    id: `ev-${event.id}`,
    type: 'chat',
    timestamp: event.createdAt instanceof Date ? event.createdAt.toISOString() : String(event.createdAt),
    campaignId,
    actor,
    actorUserId,
    actorName,
    characterId,
    characterName,
    sessionId: event.sessionId || undefined,
    payload,
  };
  broadcastEvent(campaignId, { kind: 'terminal_event', event: terminalEvent });
  return event;
}

/** Render a DAYA action as a table-visible line, diegetic body language only. */
function actionToTableLine(name: string, action: { kind: string; content?: string }): string | null {
  switch (action.kind) {
    case 'speak':
      return action.content ?? null;
    case 'act':
      return `*${action.content ?? 'moves'}*`;
    case 'attend':
      return action.content ? `*${name}'s attention settles on ${action.content}*` : `*${name} goes quiet, watching*`;
    case 'rest':
      return `*stays quiet*`;
    default:
      return null;
  }
}

/** The being loop hands back the id of the memory row that IS the perception; point that one at the truth. Sweep only when it didn't. */
async function attachTruth(listenerId: string, memoryEntryId: string | undefined, canonEventId: string, extraRefs: string[], since: Date) {
  try {
    if (memoryEntryId && (await attachTruthToMemory(memoryEntryId, canonEventId, extraRefs))) return;
    await attachTruthToRecentMemories(listenerId, canonEventId, since);
  } catch { /* record-keeping only */ }
}

async function activeListeners(campaignId: string, excludeId?: string) {
  const characters = await prisma.character.findMany({
    where: { campaignId, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, name: true },
  });
  const activeEntities = await prisma.dayaEntity.findMany({
    where: { characterId: { in: characters.map((c) => c.id) }, status: 'ACTIVE' },
    select: { characterId: true },
  });
  const activeIds = new Set(activeEntities.map((e) => e.characterId));
  return characters.filter((c) => activeIds.has(c.id));
}

/**
 * Deliver one stimulus to every awake being at the table (no filter, no
 * selection — stimulus always goes through; the mirror inside the loop
 * decides what each one perceives), point the perception at the truth, and
 * post what each does back into the feed.
 */
async function deliverToTable(
  campaignId: string,
  actor: TableActor,
  stimulus: string,
  source: 'perception' | 'dialogue',
  truth: { primary: string | null; extra: string[] },
  excludeId?: string,
): Promise<ListenerResponse[]> {
  const since = new Date();
  const listeners = await activeListeners(campaignId, excludeId);
  const responses: ListenerResponse[] = [];
  for (const listener of listeners) {
    const result = await converseWithEntity(listener.id, actor.role, stimulus, {}, source);
    responses.push({
      characterId: listener.id,
      characterName: listener.name,
      status: result.status,
      actionKind: result.action?.kind,
      detail: result.detail,
    });
    const primary = truth.primary ?? truth.extra[0];
    if (primary) await attachTruth(listener.id, result.memoryEntryId, primary, truth.extra.filter((id) => id !== primary), since);

    if (result.status === 'ok' && result.action) {
      const line = actionToTableLine(listener.name, result.action);
      if (line) {
        await postChat(campaignId, 'ai_copilot', actor.userId, listener.name, listener.id, listener.name, line, { via: 'being', raw: rawBeingAction(result.action) });
      }
    }
  }
  return responses;
}

/**
 * The GM types prose. Narration and quoted speech are picked up from it;
 * nothing to select. Watcher-and-above only.
 */
export async function speakProse(
  campaignId: string,
  actor: TableActor,
  input: { message: string; locationId?: string | null; confirmTicketId?: string | null },
): Promise<TableProseResult> {
  if (!isWatcherOrAbove(actor.role)) {
    throw new ForbiddenError('GM/ADMIN only — the table is a Watcher-seat surface');
  }
  const message = input.message.trim();
  if (!message) throw new ValidationError('Nothing to say');
  if (tableSplitLoop()) return speakProseSplit(campaignId, actor, { ...input, message });

  const roster = await prisma.character.findMany({
    where: { campaignId, entityType: 'NPC' },
    select: { id: true, name: true },
  });
  const parsed = parseTableProse(message, roster);

  // 0. JEWL reads it against the sim BEFORE it becomes canon (Mike 09-26,
  //    fluid-canon ruling). A confirmed ticket means the Watcher already
  //    answered "we're going somewhere new" and the world was spun up.
  const listeners = await activeListeners(campaignId);
  let ticketId: string | null = null;
  if (input.confirmTicketId) {
    ticketId = (await takeConfirmed(campaignId, input.confirmTicketId, message)).id;
    const rosterNow = await prisma.character.findMany({ where: { campaignId, entityType: 'NPC' }, select: { id: true, name: true } });
    Object.assign(parsed, parseTableProse(message, rosterNow));
  } else {
    const held = await readNarration(campaignId, actor, message, parsed, listeners);
    if (held) return { held, canonEventId: null, dialogue: [], narration: parsed.narration, responses: [] };
  }

  // 1. TRUTH — narration as a declaration (also lands in the feed as a game
  //    event), each quote as dialogue. witnessIds: [] because the beings
  //    live it through the mirror below, not as a raw witness row.
  let canonEventId: string | null = null;
  const dialogue: TableProseResult['dialogue'] = [];
  const soloAttributed = parsed.narration === null && parsed.quotes.length === 1 && parsed.quotes[0].speakerId;
  if (parsed.narration !== null || parsed.quotes.length !== 1) {
    const declared = await declareCanon(campaignId, actor, {
      narration: parsed.full,
      kind: 'narration',
      locationId: input.locationId ?? null,
      witnessIds: [],
      feed: { via: 'typed', raw: message, narration: parsed.narration, speech: parsed.quotes },
    });
    canonEventId = declared.event.id;
  }
  for (const q of parsed.quotes) {
    try {
      const ev = await recordQuote(campaignId, q);
      dialogue.push({ canonEventId: ev.id, speakerId: q.speakerId, speakerLabel: q.speakerLabel, text: q.text });
    } catch (err) { console.warn('[table-speak] dialogue canon failed', err); }
  }
  // A lone attributed line ("Ruth: Sit down.") reads at the table as that NPC speaking.
  if (soloAttributed) {
    const q = parsed.quotes[0];
    await postChat(campaignId, 'gm', actor.userId, actor.username, q.speakerId!, q.speakerLabel, q.text, { via: 'typed', raw: message });
  }

  // 2 + 3. PERCEPTION through the mirror, then responses.
  const source: 'perception' | 'dialogue' = parsed.narration !== null ? 'perception' : 'dialogue';
  const stimulus = source === 'perception'
    ? parsed.full
    : parsed.quotes.map((q) => `${q.speakerLabel}: ${q.text}`).join('\n');
  const responses = await deliverToTable(
    campaignId, actor, stimulus, source,
    { primary: canonEventId, extra: dialogue.map((d) => d.canonEventId) },
    soloAttributed ? parsed.quotes[0].speakerId! : undefined,
  );

  if (ticketId) await attachCanonToTicket(ticketId, canonEventId ?? dialogue[0]?.canonEventId ?? null);
  // Canon is fluid till it isn't: settle any improvisation the table has now built on.
  try { await cementCheck(campaignId, actor.userId); } catch (err) { console.warn('[table-speak] cement check failed', err); }

  return { canonEventId, dialogue, narration: parsed.narration, responses };
}

async function recordQuote(campaignId: string, q: ProseQuote, beatId?: string | null) {
  if (q.speakerId) return recordDialogueCanon(campaignId, q.speakerId, q.speakerLabel, q.text, beatId);
  return recordUnattributedDialogueCanon(campaignId, q.speakerLabel, q.text, q.context, beatId);
}

/** Talk left out of the world still leaves a trace where JEWL's ambient log keeps the table's chatter, so a wrong call can be found. */
async function markDropped(campaignId: string, actor: TableActor, kind: string, rule: string, text: string) {
  try {
    await prisma.copilotMessage.create({
      data: {
        campaignId,
        role: 'user',
        content: text,
        username: '[ambient]',
        userId: actor.userId,
        actions: JSON.stringify({ source: 'TABLE_DROPPED', kind, rule }),
      },
    });
  } catch (err) { console.warn('[table-speak] could not mark dropped table talk', err); }
}

/**
 * One measurement off the split loop (U2d): which being, what happened, how
 * long each stage took. Timings and counts only — never what was perceived,
 * thought or said — so it is safe in a log and in a report.
 */
export type TableTiming =
  | { kind: 'listen'; characterId: string; outcome: 'listened' | 'not_lived' | 'taken_over' | ConverseStatus; timings?: ListenTimings }
  | { kind: 'answer'; characterId: string; outcome: ConverseStatus; action?: string; timings?: AnswerTimings };

const timingWatchers = new Set<(timing: TableTiming) => void>();

/** Subscribe to the split loop's measurements (the U2d harness). Returns the unsubscribe. */
export function watchTableTimings(watcher: (timing: TableTiming) => void): () => void {
  timingWatchers.add(watcher);
  return () => { timingWatchers.delete(watcher); };
}

function reportTiming(timing: TableTiming): void {
  console.log(`[table-timing] ${JSON.stringify(timing)}`);
  for (const watcher of timingWatchers) { try { watcher(timing); } catch { /* a watcher must not break the table */ } }
}

/**
 * Play a plan's beats to the awake beings: world content is handed over to be
 * listened to (never awaited — reflection is off the clock); a turn or a line
 * that expects a reply is answered, streamed as `being_speaking`, and posted
 * as chat. Returns what each being that answered did. With
 * `waitForAnswers: false` (the mic: the GM is still talking) the answers run
 * on their own and the map comes back empty.
 */
async function runBeats(
  campaignId: string,
  actor: TableActor,
  beats: TableBeat[],
  listeners: Array<{ id: string; name: string }>,
  truth: { primary: string | null; extra: string[] },
  opts: { waitForAnswers: boolean; answerAfterWorldOnly: boolean },
): Promise<Map<string, ListenerResponse>> {
  const since = new Date();
  const pointAtTruth = async (listenerId: string, memoryEntryId: string | undefined) => {
    if (truth.primary) await attachTruth(listenerId, memoryEntryId, truth.primary, truth.extra, since);
  };
  const hear = (listenerId: string, stimulus: PlannedStimulus | null) => {
    if (!stimulus) return;
    void listenToTable(listenerId, actor.role, stimulus)
      .then(async (outcome) => {
        if (outcome.status !== 'ok') {
          console.warn(`[table-speak] ${listenerId} could not listen: ${outcome.status}${outcome.detail ? ` (${outcome.detail})` : ''}`);
          reportTiming({ kind: 'listen', characterId: listenerId, outcome: outcome.status });
          return;
        }
        reportTiming({ kind: 'listen', characterId: listenerId, outcome: outcome.listened ? outcome.listened.status : 'taken_over', timings: outcome.listened?.timings });
        // null = an answer took this stretch over; that answer stores it and points it at the truth.
        if (outcome.listened?.memoryEntryId) await pointAtTruth(listenerId, outcome.listened.memoryEntryId);
      })
      .catch((err) => console.error('[table-speak] listening failed (non-fatal):', err));
  };
  const answered = new Map<string, ListenerResponse>();
  const answer = async (listenerId: string, ask: TableAsk) => {
    const listener = listeners.find((l) => l.id === listenerId);
    if (!listener) return;
    const outcome = await answerAtTable(listenerId, actor.role, ask, {
      onEvent: (event) => broadcastEvent(campaignId, { ...event, kind: 'being_speaking' }),
    });
    const action = outcome.answer?.action;
    answered.set(listenerId, { characterId: listenerId, characterName: listener.name, status: outcome.status, actionKind: action?.kind, detail: outcome.detail });
    reportTiming({ kind: 'answer', characterId: listenerId, outcome: outcome.status, action: action?.kind, timings: outcome.answer?.timings });
    if (outcome.status !== 'ok' || !outcome.answer || !action) return;
    const line = actionToTableLine(listener.name, action);
    if (line) await postChat(campaignId, 'ai_copilot', actor.userId, listener.name, listener.id, listener.name, line, { via: 'being', raw: rawBeingAction(action) });
    void outcome.answer.after.then((stored) => pointAtTruth(listenerId, stored.memoryEntryId)).catch(() => {});
  };
  const answerAll = async (ids: string[], ask: TableAsk) => {
    const work = Promise.all(ids.map((id) => answer(id, ask))).catch((err) => console.error('[table-speak] answering failed (non-fatal):', err));
    if (opts.waitForAnswers) await work;
  };
  const askOf = (beat: Extract<TableBeat, { type: 'turn' | 'spoken' }>): TableAsk =>
    beat.type === 'spoken' ? { kind: 'spoken', by: beat.utterance.speaker?.label ?? 'someone present', text: beat.utterance.text } : { kind: 'turn' };

  for (const beat of beats) {
    if (beat.type === 'hear') {
      for (const l of listeners) hear(l.id, stimulusFor(beat.utterances, l.id));
      continue;
    }
    if (beat.type === 'spoken') for (const id of overhearers(beat, listeners)) hear(id, stimulusFor([beat.utterance], id));
    await answerAll(answerers(beat, listeners), askOf(beat));
  }
  if (opts.answerAfterWorldOnly && beats.length > 0 && beats.every((b) => b.type === 'hear')) {
    await answerAll(listeners.map((l) => l.id), { kind: 'turn' });
  }
  return answered;
}

/**
 * The split loop for one typed message (behind tableSplitLoop). Same truth
 * writing as speakProse; what changes is who hears what and when anyone
 * speaks: world content is LISTENED to (not awaited — reflection is off the
 * clock), and only a turn handed over or a line that expects a reply makes a
 * being ANSWER. The call returns once the record is written and the answers
 * are out, not when the listening is done.
 */
async function speakProseSplit(
  campaignId: string,
  actor: TableActor,
  input: { message: string; locationId?: string | null; confirmTicketId?: string | null },
): Promise<TableProseResult> {
  const message = input.message;
  const npcRoster = () => prisma.character.findMany({ where: { campaignId, entityType: 'NPC' }, select: { id: true, name: true } });
  const listeners = await activeListeners(campaignId);
  let roster = await npcRoster();
  let parsed = parseTableProse(message, roster);
  const planFor = (npcs: typeof roster) => planTableTalk(readTableTalk(message, { present: listeners, npcs }).utterances, 'typed');
  let plan = planFor(roster);

  // 0. JEWL's read still comes BEFORE anything is written on this path (U2c-5 moves it beside the listening).
  //    A message with nothing in the world (only an ask, only ignored talk) has nothing for him to read.
  let ticketId: string | null = null;
  if (input.confirmTicketId) {
    ticketId = (await takeConfirmed(campaignId, input.confirmTicketId, message)).id;
    roster = await npcRoster();
    parsed = parseTableProse(message, roster);
    plan = planFor(roster);
  } else if (plan.world.length) {
    const held = await readNarration(campaignId, actor, message, parsed, listeners);
    if (held) return { held, canonEventId: null, dialogue: [], narration: parsed.narration, responses: [] };
  }

  // 1. TRUTH — as speakProse writes it, minus what was not part of the world.
  const narration = canonNarration(parsed.full, plan);
  const narrated = plan.world.some((u) => u.kind !== 'dialogue');
  let canonEventId: string | null = null;
  const dialogue: TableProseResult['dialogue'] = [];
  const soloAttributed = !narrated && parsed.quotes.length === 1 && parsed.quotes[0].speakerId;
  if (narration !== null && (narrated || parsed.quotes.length !== 1)) {
    const declared = await declareCanon(campaignId, actor, {
      narration, kind: 'narration', locationId: input.locationId ?? null, witnessIds: [],
      feed: { via: 'typed', raw: message, narration: narrated ? parsed.narration : null, speech: parsed.quotes },
    });
    canonEventId = declared.event.id;
  }
  for (const q of parsed.quotes) {
    try {
      const ev = await recordQuote(campaignId, q);
      dialogue.push({ canonEventId: ev.id, speakerId: q.speakerId, speakerLabel: q.speakerLabel, text: q.text });
    } catch (err) { console.warn('[table-speak] dialogue canon failed', err); }
  }
  if (soloAttributed) {
    const q = parsed.quotes[0];
    await postChat(campaignId, 'gm', actor.userId, actor.username, q.speakerId!, q.speakerLabel, q.text, { via: 'typed', raw: message });
  }
  for (const u of plan.ignored) await markDropped(campaignId, actor, u.kind, u.rule, u.text);

  // 2. LISTEN and ANSWER, beat by beat.
  const truthPrimary = canonEventId ?? dialogue[0]?.canonEventId ?? null;
  const truthExtra = dialogue.map((d) => d.canonEventId).filter((id) => id !== truthPrimary);
  const answered = await runBeats(campaignId, actor, plan.beats, listeners, { primary: truthPrimary, extra: truthExtra }, {
    waitForAnswers: true,
    answerAfterWorldOnly: BEINGS_ANSWER === 'always',
  });

  if (ticketId) await attachCanonToTicket(ticketId, truthPrimary);
  try { await cementCheck(campaignId, actor.userId); } catch (err) { console.warn('[table-speak] cement check failed', err); }

  // A being that only listened is reported as awake; whether its listening went well is not known yet (it is still going).
  const responses = listeners.map((l) => answered.get(l.id) ?? {
    characterId: l.id,
    characterName: l.name,
    status: (isDayaEnabled() ? 'ok' : 'disabled') as ConverseStatus,
    ...(plan.world.length ? { detail: 'listening' } : {}),
  });
  return {
    canonEventId,
    dialogue,
    narration: narrated ? narration : null,
    responses,
    ...(plan.ignored.length ? { ignored: plan.ignored.map((u) => ({ kind: u.kind, text: u.text })) } : {}),
  };
}

// ── The GM's mic (U2c-4, behind tableSplitLoop) ───────────────────────────────
// While a session is live the GM's transcript chunks are table talk too: read
// with the same detector, played to the beings by the same beats. Nothing here
// waits on a being — the GM is still talking.

/** After this long with nothing said, an unfinished sentence is not glued onto the next chunk. [PLACEHOLDER] */
const SPOKEN_FRAGMENT_KEEP_MS = 20_000;
/** After this long with nothing said, who the GM was addressing and a check awaiting its result are forgotten. [PLACEHOLDER] */
const SPOKEN_STATE_KEEP_MS = 5 * 60_000;

interface SpokenTable {
  talk: TableTalkState;
  pending: string | null;
  lastAt: number;
  /** The beat the next spoken sentence belongs to: narration up to the GM handing the turn over (Mike 2026-10-06). */
  beatId: string;
  /** Chunks are read one at a time, in the order they arrived: each needs the state the one before left. */
  queue: Promise<unknown>;
}
// In-process, per campaign; a restart only loses an unfinished sentence and who was last addressed.
const spokenTables = new Map<string, SpokenTable>();

export interface SpokenTableResult {
  /** false = the mic did not feed the table; `why` names the gate. */
  fed: boolean;
  why?: 'switch_off' | 'not_the_gm' | 'no_session';
  /** Utterances handed to the beings to listen to. */
  heard: number;
  /** Turns handed over and lines that expected a reply. */
  asked: number;
  ignored: Array<{ kind: string; text: string }>;
  /** An unfinished sentence is being held for the next chunk. */
  holding: boolean;
}

const NOT_FED = { heard: 0, asked: 0, ignored: [], holding: false };

/**
 * How spoken world content goes on the record (Mike 2026-10-06: sentences,
 * grouped into beats): one narration row per sentence the GM completed,
 * speech as dialogue rows, in the order said, every row carrying the beat it
 * belongs to. A beat is the narration up to the GM handing the turn over; the
 * handover itself is table talk and is not recorded, and what follows it
 * starts the next beat. Returns the rows in order and the beat now current.
 */
async function recordSpoken(campaignId: string, actor: TableActor, plan: TablePlan, beatId: string, heard?: string): Promise<{ primary: string | null; extra: string[]; beatId: string }> {
  const ids: string[] = [];
  let beat = beatId;
  for (const b of plan.beats) {
    if (b.type === 'turn') { beat = crypto.randomUUID(); continue; }
    const utterances = b.type === 'hear' ? b.utterances : [b.utterance];
    for (const u of utterances) {
      if (u.kind === 'dialogue') {
        try {
          ids.push((await recordQuote(campaignId, { text: u.text, speakerId: u.speaker?.id ?? null, speakerLabel: u.speaker?.label ?? 'someone present', context: null }, beat)).id);
        } catch (err) { console.warn('[table-speak] spoken dialogue canon failed', err); }
        continue;
      }
      for (const sentence of narrationSentences({ beats: [], ignored: [], world: [u] })) {
        try {
          ids.push((await declareCanon(campaignId, actor, {
            narration: sentence, kind: 'narration', locationId: null, witnessIds: [], beatId: beat,
            feed: { via: 'spoken', ...(heard !== undefined ? { raw: heard } : {}) },
          })).event.id);
        } catch (err) { console.warn('[table-speak] spoken narration canon failed', err); }
      }
    }
  }
  return { primary: ids[0] ?? null, extra: ids.slice(1), beatId: beat };
}

async function hearSpokenChunk(campaignId: string, actor: TableActor, transcript: string, table: SpokenTable): Promise<SpokenTableResult> {
  const now = Date.now();
  if (now - table.lastAt > SPOKEN_STATE_KEEP_MS) { table.talk = { focusIds: [], checkPending: false }; table.beatId = crypto.randomUUID(); }
  const carried = table.pending && now - table.lastAt <= SPOKEN_FRAGMENT_KEEP_MS ? `${table.pending} ` : '';
  const [listeners, npcs] = await Promise.all([
    activeListeners(campaignId),
    prisma.character.findMany({ where: { campaignId, entityType: 'NPC' }, select: { id: true, name: true } }),
  ]);
  const heard = `${carried}${transcript}`.trim();
  const reading = readTableTalk(heard, { present: listeners, npcs, state: table.talk, holdTrailingFragment: true });
  table.talk = reading.state;
  table.pending = reading.pending;
  table.lastAt = now;

  const plan = planTableTalk(reading.utterances, 'spoken');
  const truth = await recordSpoken(campaignId, actor, plan, table.beatId, heard);
  table.beatId = truth.beatId;
  for (const u of plan.ignored) await markDropped(campaignId, actor, u.kind, u.rule, u.text);
  await runBeats(campaignId, actor, plan.beats, listeners, truth, { waitForAnswers: false, answerAfterWorldOnly: BEINGS_ANSWER === 'always' });
  const asked = plan.beats.filter((b) => b.type !== 'hear').length;
  // The table builds on what was said when it hands the turn over: that is when improvisations can settle.
  if (asked > 0) { try { await cementCheck(campaignId, actor.userId); } catch (err) { console.warn('[table-speak] cement check failed', err); } }
  return { fed: true, heard: plan.world.length, asked, ignored: plan.ignored.map((u) => ({ kind: u.kind, text: u.text })), holding: reading.pending !== null };
}

/**
 * One transcript chunk from the mic. Feeds the table only when the rollout
 * switch is on, the speaker runs this campaign, and a session is live;
 * otherwise it does nothing and says why (the transcript still goes to the
 * copilot's ambient log, as it always has — that is the caller's business).
 */
export async function hearSpoken(
  campaignId: string,
  actor: TableActor & { runsCampaign: boolean },
  transcript: string,
): Promise<SpokenTableResult> {
  if (!tableSplitLoop()) return { fed: false, why: 'switch_off', ...NOT_FED };
  if (!actor.runsCampaign || !isWatcherOrAbove(actor.role)) return { fed: false, why: 'not_the_gm', ...NOT_FED };
  const live = await prisma.gameSession.findFirst({ where: { campaignId, endedAt: null }, select: { id: true } });
  if (!live) return { fed: false, why: 'no_session', ...NOT_FED };

  let table = spokenTables.get(campaignId);
  if (!table) { table = { talk: { focusIds: [], checkPending: false }, pending: null, lastAt: 0, beatId: crypto.randomUUID(), queue: Promise.resolve() }; spokenTables.set(campaignId, table); }
  const mine = table;
  const run = mine.queue.then(() => hearSpokenChunk(campaignId, actor, transcript, mine));
  mine.queue = run.catch(() => {});
  return run;
}

/** Forget what the mic was in the middle of (tests; a session ending). */
export function forgetSpokenTable(campaignId?: string): void {
  if (campaignId) spokenTables.delete(campaignId);
  else spokenTables.clear();
}

/** Narrate-only entry (pre-09-26 API shape) — prose covers it. */
export async function narrateAtTable(
  campaignId: string,
  actor: TableActor,
  input: { message: string; actorId?: string | null; targetId?: string | null; locationId?: string | null },
): Promise<TableNarrateResult> {
  return speakProse(campaignId, actor, { message: input.message, locationId: input.locationId ?? null });
}

/**
 * The GM speaks one utterance through a chosen NPC (pre-09-26 API shape;
 * the picker is gone from the table but scripts and tests still use it).
 * Every ACTIVE DAYA entity in the campaign (other than the speaker) hears
 * it through the mirror and responds through its full being loop.
 */
export async function speakThroughNpc(
  campaignId: string,
  actor: TableActor,
  input: { npcCharacterId: string; message: string },
): Promise<TableSpeakResult> {
  if (!isWatcherOrAbove(actor.role)) {
    throw new ForbiddenError('GM/ADMIN only — speaking through NPCs is a Watcher-seat action');
  }

  const npc = await prisma.character.findUnique({
    where: { id: input.npcCharacterId },
    select: { id: true, name: true, entityType: true, campaignId: true },
  });
  if (!npc) throw new NotFoundError('NPC character not found');
  if (npc.entityType !== 'NPC') {
    throw new ValidationError(`Cannot speak through entityType=${npc.entityType} — pick an NPC`);
  }
  if (npc.campaignId && npc.campaignId !== campaignId) {
    throw new ValidationError('NPC does not belong to this campaign');
  }

  // 1. The NPC's line hits the table record first, like normal tabletop.
  await postChat(campaignId, 'gm', actor.userId, actor.username, npc.id, npc.name, input.message, { via: 'typed' });
  // Truth first (Mike 09-20/23): what was said is canon; listeners' memories will point at it.
  let dialogueCanonId: string | null = null;
  try { dialogueCanonId = (await recordDialogueCanon(campaignId, npc.id, npc.name, input.message)).id; } catch (err) { console.warn('[table-speak] dialogue canon failed', err); }

  // 2. Every awake DAYA being in the campaign perceives it (through the mirror).
  const responses = await deliverToTable(campaignId, actor, `${npc.name}: ${input.message}`, 'dialogue', { primary: dialogueCanonId, extra: [] }, npc.id);
  return { npcName: npc.name, responses };
}

/**
 * Picker data for the table tab: NPCs the GM can speak through, and the
 * DAYA-active characters at the table (used for core warm-up + display).
 */
export async function getTableRoster(campaignId: string, actorRole: string) {
  if (!isWatcherOrAbove(actorRole)) {
    throw new ForbiddenError('GM/ADMIN only');
  }
  // The TABLE tab opening is the moment to make sure the lane is being kept
  // warm for the open session (re-arms after a dev-server restart).
  void ensureKeepalive(campaignId).catch(() => {});
  const characters = await prisma.character.findMany({
    where: { campaignId },
    select: { id: true, name: true, entityType: true, status: true, data: true },
    orderBy: { name: 'asc' },
  });
  const entities = await prisma.dayaEntity.findMany({
    where: { characterId: { in: characters.map((c) => c.id) }, status: 'ACTIVE' },
    select: { characterId: true },
  });
  const activeIds = new Set(entities.map((e) => e.characterId));
  const isTableHidden = (raw: string | null) => {
    try {
      return raw ? JSON.parse(raw).tableHidden === true : false;
    } catch {
      return false;
    }
  };
  return {
    // Any NPC is speakable — a freshly built one included (Mike builds an
    // NPC and plays as it; no ACTIVE-status friction here). EXCEPT
    // data.tableHidden — the blind-play firewall: NPCs whose identity comes
    // from a protagonist's unread story stay out of the picker until the
    // GM asks for them by name.
    npcs: characters
      .filter((c) => c.entityType === 'NPC' && !isTableHidden(c.data))
      .map((c) => ({ id: c.id, name: c.name })),
    dayaActive: characters.filter((c) => activeIds.has(c.id)).map((c) => ({ id: c.id, name: c.name })),
    /** The rollout switch, for the recorder: shorter chunks only make sense when the mic feeds the table. */
    splitLoop: tableSplitLoop(),
  };
}
