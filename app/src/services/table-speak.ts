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
import { assertLawfulInput } from '@/services/lawful-intake';
import { isWatcherOrAbove } from '@/lib/permissions';
import { createCampaignEvent } from '@/services/campaign-event';
import { detectActiveCheck, isRecall } from '@/lib/active-check';
import { resolveReferents } from '@/services/table-referents';
import { startTableRoll } from '@/services/table-roll';
import { broadcastEvent } from '@/lib/campaign-stream';
import { converseWithEntity, listenToTable, answerAtTable, type ConverseStatus, type TableListenOutcome } from '@/daya/conversation';
import { sceneBuilderOn, buildScene, buildBeingCard, sceneFacts, clockLine, nameHead, type SeedParts } from '@/services/scene-builder';
import { getFamiliarity, familiarityAt, scoreForLevel } from '@/services/familiarity';
import { settleIntentionsByAct } from '@/daya/intentions';
import { judgeIntentionsDone } from '@/daya/intention-judge';
import { isDayaEnabled } from '@/daya/events';
import type { TableAsk, ListenTimings, AnswerTimings } from '@/daya/ensemble';
import { readTableTalk, type TableTalkState, type TableUtterance } from '@/services/table-talk';
import { learnIntroductions, groupRows } from '@/services/introductions';
import { perceptionReachOn, judgeCanonReach, stampPerception, storeUnnoticedAtTable, recordNoticedExposures, addRefs, type EventRefs } from '@/services/perception-reach';
import { REACH_TUNING, cuesFromText, type ReachEvent, type ReachJudgement, type ReachVerdict } from '@/sim/senses/reach';
import { ownVoice, type OwnVoiceActor } from '@/services/own-voice';
import { audibleOnly } from '@/services/senses-filter';
import { planTableTalk, stimulusFor, answerers, overhearers, canonNarration, narrationSentences, type PlannedStimulus, type TableBeat, type TablePlan } from '@/services/table-plan';
import type { TerminalEvent, TerminalActor, TerminalPayload, TableFeedFields } from '@/types/terminal';
import {
  attachTruthToMemory,
  attachTruthToRecentMemories,
  declareCanon,
  recordDialogueCanon,
  recordUnattributedDialogueCanon,
} from '@/services/canon';
import { parseTableProse, splitSentences, closeUnclosedQuote, type ProseQuote, type ProseRosterEntry, type ProseThought } from '@/services/table-prose';
import { ensureKeepalive } from '@/daya/l1-keepalive';
import { readNarration, takeConfirmed, attachCanonToTicket, cementCheck, type ReconTicket } from '@/services/reconciliation';
import { advanceClockForLine } from '@/services/table-clock';
import type { ListenImpulse } from '@/daya/prompts/roles/spirit';
import { recordBeingThought } from '@/services/being-thought';
import { actorMap, whereOthersStand } from '@/services/world-apply';
import { actInThirdPerson, worldChangeSentences } from '@/daya/act-card';
import { didNotHear } from '@/daya/did-not-hear';
import { statedStretchOf, simulateStatedStretch } from '@/services/table-timeskip';
import { resolveIntent } from '@/daya/adjudicator';
import { recentVoiceOf, recentCardTextsOf } from '@/daya/voice-history';
import { markAddressedByName } from '@/daya/name-addressed';
import { splitHeld, readHeldIn } from '@/daya/facts-for-actor';
import { cueCoverage } from '@/daya/ladder';

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

/** How long the page waits for a voiced being's own listening before it is built without the monologue. */
const PRELISTEN_WAIT_MS = 20_000;

/**
 * THE SEED → THE PAGE (Mike 2026-10-25): a being the Watcher voiced listens to its own beat FIRST, so its monologue
 * ("the salt stings") can be blended into its card by the scene builder instead of landing as a second row. The
 * same stretch gatedHear would compose for it — the public run in its own voice, what it was voiced as thinking, its
 * own words — handed to listenToTable now; runBeats takes the promise instead of listening again.
 */
function preListenVoiced(
  actor: TableActor,
  plan: TablePlan,
  parsed: { thoughts?: ProseThought[] },
  actors: Record<string, OwnVoiceActor>,
  ids: string[],
  readings: Map<string, string> = new Map(),
): Map<string, Promise<TableListenOutcome>> {
  const out = new Map<string, Promise<TableListenOutcome>>();
  const hearBeat = plan.beats.find((b): b is Extract<TableBeat, { type: 'hear' }> => b.type === 'hear');
  const thoughts = parsed.thoughts ?? [];
  const publicRun = hearBeat ? withoutThoughts(hearBeat.utterances, thoughts) : [];
  for (const id of ids) {
    const s = stimulusFor(publicRun, id, { ownVoiced: true });
    const thinking = thoughts.filter((t) => t.actorId === id).map((t) => t.sentence).join(' ');
    const words = plan.beats
      .filter((b): b is Extract<TableBeat, { type: 'spoken' }> => b.type === 'spoken' && b.utterance.speaker?.id === id)
      .map((b) => `${b.utterance.speaker?.label ?? 'someone present'}: ${b.utterance.text}`).join('\n');
    let content = [s?.content, thinking, words].filter((x) => x && x.trim()).join('\n');
    if (!content) continue;
    // HELD REACTIONS (Mike 2026-10-25: "held until the next story beat — just like a turn of combat"): what he heard another being say since his last beat, and what went through him then, ride into this beat.
    const held = heldReactions.get(id);
    if (held?.length) {
      content += held.map((h) => `\nSince you last acted, you heard:\n- ${h.heard}\nand what went through you then:\n- ${h.thought}`).join('');
      console.log(`[held-reaction] ${id}: blended ${held.length} into the next beat`);
      heldReactions.delete(id);
    }
    const me = actors[id];
    if (me) content = ownVoice(content, me);
    // WHAT HE READS (HW8 run 6: the line had him look at the receipt "to see if she paid already"; his voice said the tab was settled
    // while the paper said NOT PAID): the text in his hand rides beside the stretch (not through the mirror), exactly as written.
    const reading = readings.get(id);
    // Exactly what hear() would hand it: its senses ride along only when the reach pass is on (then it is 'self' by rule).
    const stim: PlannedStimulus = { source: s?.source ?? (words ? 'dialogue' : 'perception'), content, own: true, ...(reading ? { reads: reading } : {}), ...(perceptionReachOn() ? { via: ['self'] } : {}) };
    out.set(id, listenToTable(id, actor.role, stim));
  }
  return out;
}

/**
 * When the Watcher's line has a being READ or look at a thing it holds, what is written on the thing (`data.text`) is put in front
 * of it as what it reads, exactly. A being that misreads what is in its hand is the being's misread — but the text is there to be
 * read, not guessed. Never throws.
 */
export async function readingsFor(ids: string[], seedText: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const id of ids) {
    try {
      const rows = await prisma.campaignItem.findMany({ where: { holderId: id, status: 'ACTIVE' }, select: { name: true, data: true }, take: 100 });
      const read = readHeldIn(seedText, splitHeld(rows ?? []).written ?? []);
      if (read.length) out.set(id, read.map((w) => `What you read on the ${w.name}, exactly as it is written:\n${w.text}`).join('\n'));
    } catch { /* nothing to read */ }
  }
  return out;
}

/** The monologues that are in within the wait; the rest keep listening and land by themselves. */
async function monologuesWithin(pre: Map<string, Promise<TableListenOutcome>>, ms: number, campaignId?: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all([...pre].map(async ([id, p]) => {
    const o = await Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]).catch(() => null);
    let t = o?.listened?.thought?.trim();
    if (t && campaignId) {
      const kept = withoutRepeats(t, await recentThoughtsOf(campaignId, id));
      if (!kept) console.log(`[table-speak] ${id}: the whole thought was a repeat — dropped`);
      t = kept;
    }
    if (t) out.set(id, t);
  }));
  return out;
}

/**
 * HELD REACTIONS (Mike 2026-10-25: "Those things should be held until the next story beat. This goes back to the
 * entire principle of the simulation. Just like in a turn of combat/encounter."): what the Watcher's character heard
 * another being say, and what went through him — remembered at once, but shown on the page only in his next beat.
 */
const heldReactions = new Map<string, Array<{ heard: string; thought: string; at: number }>>();
const HELD_CAP = 3;

/** THE REPLAY (Mike 2026-10-25): sentence-level normal form — lowercase, whitespace collapsed, trailing punctuation off. */
// Markdown emphasis and the model's quote marks are not part of a sentence (HW8 run 6: "it just *is*." came back as "it just is.").
const norm = (s: string) => s.toLowerCase().replace(/[*_`]/g, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').replace(/[\s.!?…"')\]]+$/u, '').trim();
/** A sentence of five or more words whose content words are (≥ 0.9) all in one earlier sentence is the same sentence said again. */
const SAME_SENTENCE_FLOOR = 0.9;
const sameSentenceAgain = (s: string, previous: string[]): boolean => {
  if (previous.some((p) => norm(p) === norm(s))) return true;
  if (s.trim().split(/\s+/).length < 5) return false;
  return previous.some((p) => p.trim().split(/\s+/).length >= 5 && cueCoverage(s, p) >= SAME_SENTENCE_FLOOR);
};

/** The thought without any sentence it already thought verbatim in `previous`. Empty when every sentence repeats. */
export function withoutRepeats(thought: string, previous: string[]): string {
  const sentences = previous.flatMap((p) => splitSentences(p)).filter(Boolean);
  if (!sentences.length) return thought.trim();
  return splitSentences(thought).filter((s) => !sameSentenceAgain(s, sentences)).join(' ').trim();
}

/**
 * THE REPLAY, on the CARD (HW8 run 6): the standing-beat card repeated "The wood doesn't vibrate; it just *is*." from the card
 * before it. The built card's scene and thought / action segments are held against the being's last three thoughts, monologues
 * and cards; a repeated sentence is dropped, and a card with nothing left is `null` (it is not posted). Speech is never touched. Pure.
 */
export function cardWithoutRepeats<C extends { scene: string | null; segments: Array<{ kind: 'action' | 'thought' | 'speech'; text: string }> }>(card: C, previous: string[]): C | null {
  const scene = card.scene ? withoutRepeats(card.scene, previous) : '';
  const segments = card.segments
    .map((s) => (s.kind === 'speech' ? s : { ...s, text: withoutRepeats(s.text, previous) }))
    .filter((s) => s.text.trim());
  if (!scene && !segments.length) return null;
  return { ...card, scene: scene || null, segments };
}

/** The being's last `n` recorded thoughts on this campaign (newest first). Never throws. */
export async function recentThoughtsOf(campaignId: string, characterId: string, n = 3): Promise<string[]> {
  return recentVoiceOf(campaignId, characterId, n);
}

/** How long a being's line waits for its own thought card to be on the page first — the cloud build alone is allowed 30 s (HW8 run 6: 8 s let "It's open." go up 7 s before her card). */
export const CARD_WAIT_MS = 45_000;
/** Wait for a card (bounded, non-fatal): the line that follows goes up after it. */
export async function awaitCard(card: Promise<void> | undefined, ms = CARD_WAIT_MS): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([card ?? Promise.resolve(), new Promise<void>((r) => { timer = setTimeout(r, ms); })]); } catch { /* non-fatal */ } finally { clearTimeout(timer); }
}

/**
 * THE TURN HANDED OVER (HW8): "He waits until she opens the door" gives HER the turn. The being a wait names — by
 * pronoun (matching sex) or by name — other than the Watcher's own character; null when it names none.
 */
export function waitsFor(message: string, roster: Array<{ id: string; name: string; sex?: string | null }>, gmActorId: string | null, otherBehindDoor: string | null = null): string | null {
  // "He waits for the door" (HW8 run 5, 2026-10-26): the door is opened by whoever is on its other side — the one being not in the
  // Watcher's character's room, when there is exactly one (the caller computes it).
  if (/\b(?:waits?|waiting)\b[^.]*?\bfor the door\b/i.test(message)) return otherBehindDoor && roster.some((r) => r.id === otherBehindDoor && r.id !== gmActorId) ? otherBehindDoor : null;
  const m = /\b(?:waits?|waiting)\b[^.]*?\b(?:until|for|till)\s+(he|she|they|[A-Za-z][\w'’-]*)\b/i.exec(message);
  if (!m) return null;
  const who = m[1].toLowerCase();
  const others = roster.filter((r) => r.id !== gmActorId);
  const byName = others.find((r) => r.name.toLowerCase() === who || r.name.toLowerCase().split(/\s+/)[0] === who);
  if (byName) return byName.id;
  if (who !== 'he' && who !== 'she' && who !== 'they') return null;
  const want = who === 'she' ? 'f' : who === 'he' ? 'm' : null;
  const sexOf = (r: { sex?: string | null }) => (r.sex ?? '').trim().toLowerCase().charAt(0);
  const matched = want ? others.find((r) => sexOf(r) === want) : undefined;
  return (matched ?? others.find((r) => !sexOf(r)) ?? (want ? undefined : others[0]))?.id ?? null;
}

/** A being's act on the record settles the intentions it carried out (Mike 2026-10-25: "build a way for intentions to be completed"). */
const REPLAY_WINDOW_MS = 90_000;
/**
 * The same text twice within the window is a replay, not a second beat (HW8 run 2: two lines whose first POST ran past
 * ~25 s were posted again 23–27 s later — the dev server recycling for memory — and the record got each beat twice, with
 * two answers). Checks the declarations and the canon of the last 90 s. Never throws.
 */
async function saidJustNow(campaignId: string, message: string): Promise<boolean> {
  const want = message.replace(/\s+/g, ' ').trim();
  if (!want) return false;
  try {
    const since = new Date(Date.now() - REPLAY_WINDOW_MS);
    const [events, canon] = await Promise.all([
      prisma.campaignEvent.findMany({ where: { campaignId, type: 'game_event', createdAt: { gte: since } }, select: { payload: true }, take: 12 }),
      prisma.canonEvent.findMany({ where: { campaignId, createdAt: { gte: since } }, select: { narration: true }, take: 12 }),
    ]);
    for (const e of events) {
      try { const p = JSON.parse(e.payload) as { description?: string; raw?: string }; if ([p.description, p.raw].some((t) => typeof t === 'string' && t.replace(/\s+/g, ' ').trim() === want)) return true; } catch { /* skip */ }
    }
    return canon.some((c) => c.narration.replace(/\s+/g, ' ').trim() === want);
  } catch { return false; }
}

function settleByAct(campaignId: string, characterId: string, act: string): void {
  void settleIntentionsByAct(characterId, act, (pending, a) => judgeIntentionsDone(campaignId, pending, a)).catch(() => {});
}

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

/**
 * AN ACT ANSWER IS A CARD ACT (HW8 run 7, 2026-10-27: "*I turn the deadbolt…*" went up as a chat row with asterisks). The act goes on
 * the being's card as an action segment, third person ("She turns the deadbolt…"), never as a chat / speech row.
 */
async function postActCard(
  campaignId: string,
  by: { userId: string; username: string },
  being: { id: string; name: string; sex?: string | null },
  content: string,
): Promise<string | null> {
  const text = actInThirdPerson(being.name, being.sex, content);
  if (!text) return null;
  await recordBeingThought(campaignId, by, {
    characterId: being.id, characterName: being.name, heard: '', thought: text, impulse: 'act', canonEventId: null,
    segments: [{ kind: 'action', text }],
  });
  return text;
}

/**
 * A QUOTED LINE IS ALWAYS SOUND (HW8 run 7 #4: "Are you ok?" through a door ruled NOT REACHED and so NOT ASKED). True when the speaker
 * is in the listener's room or at most ONE passage away (a door, open or shut, is no obstacle to a voice). Never throws.
 */
async function voiceCarries(campaignId: string, listenerId: string, speakerId: string | null): Promise<boolean> {
  if (!speakerId || speakerId === listenerId) return false;
  try {
    const map = await actorMap(listenerId);
    if (!map) return false;
    const w = (await whereOthersStand(campaignId, listenerId, map)).find((r) => r.id === speakerId);
    return !!w && w.route !== null && w.route.length <= 1;
  } catch { return false; }
}

/** What the world did when a being's act changed a fact ("The entry door stands open."), said once on the page, from the change. */
async function postWorldChange(campaignId: string, actor: TableActor, applied: string[]): Promise<void> {
  const sentences = worldChangeSentences(applied);
  if (sentences.length) await postSceneSentence(campaignId, actor, sentences.join(' '));
}

/** One narrator sentence on the page (a built declaration, no witnesses: it is the page's line, not a perception). */
async function postSceneSentence(campaignId: string, actor: TableActor, narration: string): Promise<void> {
  try {
    await declareCanon(campaignId, actor, {
      narration, kind: 'narration', actorId: null, locationId: null, witnessIds: [],
      feed: { via: 'typed', raw: narration, narration, speech: [], actions: [], thoughts: [], built: true },
    });
  } catch (err) { console.warn('[table-speak] the change in the world was not said (non-fatal):', err instanceof Error ? err.message : err); }
}

/** An Attend worth a line names something: "The dust" is not a beat (hello world 2026-10-17). */
const ATTEND_MIN_WORDS = 3;

/** Render a DAYA action as a table-visible line, diegetic body language only. */
export function actionToTableLine(name: string, action: { kind: string; content?: string; outcome?: string }): string | null {
  switch (action.kind) {
    case 'speak':
      return action.content ?? null;
    case 'act':
      // What HAPPENED, when the adjudicator has said (the map may have refused the intent); else the intent.
      return `*${action.outcome?.trim() || action.content || 'moves'}*`;
    case 'attend': {
      const words = (action.content ?? '').trim().split(/\s+/).filter(Boolean);
      if (action.content && words.length < ATTEND_MIN_WORDS) return null;
      return action.content ? `*${name}'s attention settles on ${action.content}*` : `*${name} goes quiet, watching*`;
    }
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

/** The awake beings at the table — the scene's characters for the lawfulness screen's structural ages. */
export async function tableParticipantIds(campaignId: string): Promise<string[]> {
  return (await activeListeners(campaignId)).map((c) => c.id);
}

/** The sheet's sex, from identity.sex or physicalDescription.gender (either may hold it). */
function sexFromSheet(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as { identity?: { sex?: string; physicalDescription?: { gender?: string } } };
    return d.identity?.sex || d.identity?.physicalDescription?.gender || null;
  } catch { return null; }
}

/**
 * Everyone the GM's prose can name: NPCs AND player characters, each with the
 * sex a pronoun has to match (hello world 2026-10-17: `::Kristopher …::` and
 * "His voice is warm" both went unattributed because the roster was NPC-only
 * and knew no sex).
 */
export async function proseRoster(campaignId: string): Promise<ProseRosterEntry[]> {
  const rows = await prisma.character.findMany({
    where: { campaignId, entityType: { in: ['NPC', 'PLAYER_CHARACTER'] } },
    select: { id: true, name: true, data: true },
  });
  return rows.map((c) => ({ id: c.id, name: c.name, sex: sexFromSheet(c.data) }));
}

/**
 * Who acted or spoke last at the table: the referent of a bare "he"/"she" in
 * the GM's next line. Read off the feed's own rows, newest first — a being's
 * chat line, or the last actor/speaker a declaration named.
 */
export async function lastTableActor(campaignId: string, roster: ProseRosterEntry[]): Promise<ProseRosterEntry | null> {
  return (await recentTableActors(campaignId, roster))[0] ?? null;
}

/**
 * The recent actors at the table, newest first, each once: a being's chat
 * line, or the actors/speakers a declaration named. A bare "he" after Violet
 * spoke still finds Kristopher two rows back (HW3 2026-10-24).
 */
export async function recentTableActors(campaignId: string, roster: ProseRosterEntry[], limit = 4): Promise<ProseRosterEntry[]> {
  if (!roster.length) return [];
  const rows = await prisma.campaignEvent.findMany({
    where: { campaignId, type: { in: ['game_event', 'chat'] } },
    orderBy: { createdAt: 'desc' },
    take: 24,
    select: { type: true, characterId: true, payload: true },
  });
  const out: ProseRosterEntry[] = [];
  const add = (id: string | null | undefined) => {
    const hit = id ? roster.find((r) => r.id === id) : null;
    if (hit && !out.some((o) => o.id === hit.id)) out.push(hit);
  };
  for (const row of rows) {
    if (out.length >= limit) break;
    if (row.type === 'chat') { add(row.characterId); continue; }
    try {
      const p = JSON.parse(row.payload) as { eventType?: string; actions?: Array<{ actorId: string }>; thoughts?: Array<{ actorId: string }>; speech?: Array<{ speakerId: string | null }> };
      if (p.eventType !== 'declaration') continue;
      const ids = [...(p.thoughts ?? []).map((t) => t.actorId), ...(p.actions ?? []).map((a) => a.actorId), ...(p.speech ?? []).map((s) => s.speakerId)].filter((x): x is string => !!x);
      for (const id of ids.reverse()) add(id);
    } catch { /* not a payload we read */ }
  }
  return out;
}

/**
 * The roster character the Watcher voiced last on a line of their own — the newest declaration's
 * last act or quote; beings' chat lines do not count (HW5 2026-10-25). Pure.
 */
export function lastVoicedFrom(rows: Array<{ type: string; payload: string }>, roster: ProseRosterEntry[]): ProseRosterEntry | null {
  for (const row of rows) {
    if (row.type !== 'game_event') continue;
    try {
      const p = JSON.parse(row.payload) as { eventType?: string; actions?: Array<{ actorId: string }>; thoughts?: Array<{ actorId: string }>; speech?: Array<{ speakerId: string | null }> };
      if (p.eventType !== 'declaration') continue;
      const ids = [...(p.thoughts ?? []).map((t) => t.actorId), ...(p.actions ?? []).map((a) => a.actorId), ...(p.speech ?? []).map((s) => s.speakerId)].filter((x): x is string => !!x);
      for (const id of ids.reverse()) { const hit = roster.find((r) => r.id === id); if (hit) return hit; }
    } catch { /* not a payload we read */ }
  }
  return null;
}

/** `lastVoicedFrom` over the table's recent rows. */
export async function lastVoicedActor(campaignId: string, roster: ProseRosterEntry[]): Promise<ProseRosterEntry | null> {
  if (!roster.length) return null;
  const rows = await prisma.campaignEvent.findMany({
    where: { campaignId, type: 'game_event' },
    orderBy: { createdAt: 'desc' },
    take: 24,
    select: { type: true, payload: true },
  });
  return lastVoicedFrom(rows, roster);
}

/** Every being the Watcher voiced in this message: the actors of its `::actions::` and the speakers of its quotes. */
function voicedIn(parsed: { actions?: Array<{ actorId: string }>; thoughts?: Array<{ actorId: string }>; quotes: Array<{ speakerId: string | null }> }): string[] {
  return [...new Set([...(parsed.actions ?? []).map((a) => a.actorId), ...(parsed.thoughts ?? []).map((t) => t.actorId), ...parsed.quotes.map((q) => q.speakerId).filter((id): id is string => !!id)])];
}

/** The roster by id, for a being's own voice (name + sex). */
function actorsOf(roster: ProseRosterEntry[]): Record<string, OwnVoiceActor> {
  return Object.fromEntries(roster.map((r) => [r.id, { name: r.name, sex: r.sex ?? null }]));
}

/**
 * A run of utterances with a character's thought sentences taken out (HW6 2026-10-25): what the Watcher
 * voiced as going THROUGH him is his alone — the rest of the table never senses it, and the reach judge
 * is not handed it as if it were in the room. Utterances left empty go. Pure.
 */
export function withoutThoughts(utterances: TableUtterance[], thoughts: Array<{ sentence: string }>): TableUtterance[] {
  if (!thoughts.length) return utterances;
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
  const out: TableUtterance[] = [];
  for (const u of utterances) {
    if (u.kind === 'dialogue') { out.push(u); continue; }
    let text = norm(u.text);
    // A thought's `sentence` may be a tag and its quote ("And he says the prayer in his head. "Lord…""); the
    // run holds the tag alone (the quote is no longer speech), so each sentence of it comes out on its own.
    for (const t of thoughts) for (const part of [norm(t.sentence), ...splitSentences(t.sentence).map(norm)]) if (part) text = text.split(part).join(' ');
    text = norm(text);
    if (text) out.push(text === norm(u.text) ? u : { ...u, text });
  }
  return out;
}

/** The one speaker of a run's dialogue, when there is exactly one. */
function oneSpeakerOf(utterances: TableUtterance[]): string | null {
  const ids = [...new Set(utterances.filter((u) => u.kind === 'dialogue').map((u) => u.speaker?.id ?? null))];
  return ids.length === 1 ? ids[0] : null;
}

/** The one actor every `::action::` in the message belongs to, when there is exactly one — the canon row's actorId. */
function soleActor(parsed: { actions?: Array<{ actorId: string }> }): string | null {
  const ids = new Set((parsed.actions ?? []).map((a) => a.actorId));
  return ids.size === 1 ? [...ids][0] : null;
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
  // Perception units 6+7 (PERCEPTION_REACH=on): one world-sim call for every listener before anyone lives it.
  const primaryTruth = truth.primary ?? truth.extra[0] ?? null;
  const reach = perceptionReachOn() && listeners.length
    ? await judgeCanonReach(campaignId, { id: primaryTruth, kind: source === 'dialogue' ? 'speech' : 'narration', text: stimulus, sourceId: excludeId ?? null }, listeners.map((l) => l.id))
    : null;
  const exposures = new Map<string, EventRefs>();
  const noticedRows: Array<{ characterId: string; memoryId: string }> = [];
  for (const listener of listeners) {
    const verdict = reach?.verdicts.get(listener.id);
    if (reach && (!verdict || !verdict.reaches)) { responses.push({ characterId: listener.id, characterName: listener.name, status: 'ok', detail: 'out of reach' }); continue; }
    if (reach && verdict && !verdict.noticed) {
      await storeUnnoticedAtTable(campaignId, listener.id, { source, content: stimulus }, verdict, primaryTruth);
      responses.push({ characterId: listener.id, characterName: listener.name, status: 'ok', detail: 'unnoticed' });
      continue;
    }
    const result = await converseWithEntity(listener.id, actor.role, stimulus, {}, source);
    if (reach) addRefs(exposures, listener.id, { characterIds: [excludeId], locationIds: [reach.beings.find((b) => b.id === listener.id)?.locationId], memoryId: result.memoryEntryId ?? null, canonEventId: primaryTruth });
    if (reach && verdict && result.memoryEntryId) await stampPerception(result.memoryEntryId, verdict, reach.source);
    responses.push({
      characterId: listener.id,
      characterName: listener.name,
      status: result.status,
      actionKind: result.action?.kind,
      detail: result.detail,
    });
    const primary = truth.primary ?? truth.extra[0];
    if (primary) await attachTruth(listener.id, result.memoryEntryId, primary, truth.extra.filter((id) => id !== primary), since);
    if (reach && verdict && result.memoryEntryId) noticedRows.push({ characterId: listener.id, memoryId: result.memoryEntryId });

    if (result.status === 'ok' && result.action) {
      const line = actionToTableLine(listener.name, result.action);
      if (line) {
        if (result.action.kind === 'speak' || result.action.kind === 'act') await advanceClockForLine(campaignId, result.action.kind === 'speak' ? 'being-speech' : 'being-act', result.action.content ?? line);
        if (result.action.kind === 'act') await postActCard(campaignId, { userId: actor.userId, username: actor.username }, { id: listener.id, name: listener.name }, result.action.content?.trim() ?? '');
        else await postChat(campaignId, 'ai_copilot', actor.userId, listener.name, listener.id, listener.name, line, { via: 'being', raw: rawBeingAction(result.action) });
      }
    }
  }
  if (reach) {
    const cycle = (await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } }))?.currentCycle ?? 0;
    await recordNoticedExposures(campaignId, cycle, exposures);
    // Introductions teach names: what each listener CAUGHT of "I'm Ruth" / "this is Ruth".
    if (noticedRows.length) await learnIntroductions(campaignId, groupRows(noticedRows), cycle, { canonEventId: primaryTruth });
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
  // LAWFULNESS (unit 8b): blocked → stored withheld + flagged, 422 with the withheld string.
  await assertLawfulInput({
    campaignId, userId: actor.userId, username: actor.username, text: message, origin: 'TABLE_PROSE',
    participants: () => tableParticipantIds(campaignId),
  });
  if (tableSplitLoop()) return speakProseSplit(campaignId, actor, { ...input, message });

  const roster = await proseRoster(campaignId);
  const proseCtx = { recentActors: await recentTableActors(campaignId, roster), lastVoiced: await lastVoicedActor(campaignId, roster) };
  const parsed = parseTableProse(message, roster, proseCtx);

  // 0. JEWL reads it against the sim BEFORE it becomes canon (Mike 09-26,
  //    fluid-canon ruling). A confirmed ticket means the Watcher already
  //    answered "we're going somewhere new" and the world was spun up.
  const listeners = await activeListeners(campaignId);
  let ticketId: string | null = null;
  if (input.confirmTicketId) {
    ticketId = (await takeConfirmed(campaignId, input.confirmTicketId, message)).id;
    const rosterNow = await proseRoster(campaignId);
    delete parsed.actions;
    Object.assign(parsed, parseTableProse(message, rosterNow, proseCtx));
  } else {
    const held = await readNarration(campaignId, actor, message, parsed, listeners);
    if (held) return { held, canonEventId: null, dialogue: [], narration: parsed.narration, responses: [] };
  }

  // 1. TRUTH — narration as a declaration (also lands in the feed as a game
  //    event), each quote as dialogue. witnessIds: [] because the beings
  //    live it through the mirror below, not as a raw witness row.
  let canonEventId: string | null = null;
  const dialogue: TableProseResult['dialogue'] = [];
  const hasActions = (parsed.actions?.length ?? 0) + (parsed.thoughts?.length ?? 0) > 0;
  const soloAttributed = parsed.narration === null && !hasActions && parsed.quotes.length === 1 && parsed.quotes[0].speakerId;
  await liveStatedTime(campaignId, actor, await advanceClockForLine(campaignId, 'gm-line', message), message);
  if (parsed.narration !== null || hasActions || parsed.quotes.length !== 1) {
    const declared = await declareCanon(campaignId, actor, {
      narration: parsed.full,
      kind: 'narration',
      actorId: soleActor(parsed),
      locationId: input.locationId ?? null,
      witnessIds: [],
      feed: { via: 'typed', raw: message, narration: parsed.narration, speech: parsed.quotes, actions: parsed.actions },
    });
    canonEventId = declared.event.id;
    narratedActs(campaignId, parsed.actions, actor);
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
        contentClass: 'table', // the wall: dropped table talk never reaches a cloud lane
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
  | { kind: 'listen'; characterId: string; outcome: 'listened' | 'not_lived' | 'taken_over' | ConverseStatus; timings?: ListenTimings; impulse?: ListenImpulse }
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

// Per campaign: the reach verdicts of successive beats are applied in the order the beats were said
// (a slow judgement for an earlier beat holds a later one back, each capped by REACH_TUNING.timeoutMs).
const reachChains = new Map<string, Promise<unknown>>();

/** The world-sim's event for a run of table utterances: speech if every one is dialogue (from its one speaker), else narration. Pure. */
export function reachEventOf(utterances: TableUtterance[], truthId: string | null, actorId: string | null = null): ReachEvent {
  const speech = utterances.every((u) => u.kind === 'dialogue');
  const speakers = [...new Set(utterances.map((u) => u.speaker?.id ?? null))];
  const oneSpeaker = speech && speakers.length === 1 ? speakers[0] : null;
  return {
    id: truthId,
    kind: speech ? 'speech' : 'narration',
    text: utterances.map((u) => (u.kind === 'dialogue' && u.speaker ? `${u.speaker.label}: ${u.text}` : u.text)).join(' '),
    // Narration the Watcher wrote for one roster character is that character's own doing: the judge sees it as
    // 'self' for him (HW5 2026-10-25: Kristopher "reached via hearing" his own knock).
    sourceId: oneSpeaker ?? actorId ?? null,
    sourceName: oneSpeaker ? utterances[0].speaker?.label ?? null : null,
  };
}

/**
 * QUOTE BEFORE NARRATION (HW8 run 5, 2026-10-26): `"ok... good pizza." He starts to walk away.` puts the spoken beat first, so the
 * being answered before the stretch's reach verdict was set. Every hear beat goes first (each stretch is handed over and its verdict
 * awaited), then the spoken / turn beats in their original order. Pure.
 */
export function orderBeats<T extends { type: string }>(beats: T[]): T[] {
  return [...beats.filter((b) => b.type === 'hear'), ...beats.filter((b) => b.type !== 'hear')];
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
  truth: {
    primary: string | null;
    extra: string[];
    /** Beings the Watcher voiced in THIS message (its actor/speaker): the voicing is their act this beat — no impulse turn on top of it (Mike 2026-10-24). */
    voicedIds?: string[];
    /** The one roster character every prose act in the message belongs to, when there is one: the reach judge's source for narration. */
    actorId?: string | null;
    /** What the Watcher voiced as going through a character (HW6): his alone — out of everyone else's stretch, never judged as in the room. */
    thoughts?: ProseThought[];
    /** The roster by id, so a being's own act can be put in its own person. */
    actors?: Record<string, OwnVoiceActor>;
    /** Voiced beings already listening to their own beat (preListenVoiced): their promise is taken once instead of a second listen. */
    preListened?: Map<string, Promise<TableListenOutcome>>;
    /** Voiced beings whose monologue the scene builder blended into their card: no second row for them. */
    blended?: Set<string>;
    /** The roster character the Watcher voices (HELD REACTIONS): his reaction to another being's line is held to his next beat, not posted. */
    gmActorId?: string | null;
    /** THE TURN HANDED OVER: a being the line's "waits until she…" names — it gets the turn after the beats. */
    turnTo?: string | null;
  },
  opts: { waitForAnswers: boolean; answerAfterWorldOnly: boolean },
): Promise<Map<string, ListenerResponse>> {
  const since = new Date();
  // WHO IS IN WHICH ROOM (HW8 run 5, 2026-10-26): a stretch with no verdict, or a fallback one, was handed over unfiltered — to a
  // being behind a door too. Loaded once per line; an unknown room counts as the same room (never hide a stretch on a guess).
  const roomOf = new Map<string, string>();
  try {
    const who = [...new Set([...listeners.map((l) => l.id), ...(truth.actorId ? [truth.actorId] : [])])];
    const rows = who.length ? await prisma.entityRelationship.findMany({ where: { sourceId: { in: who }, relationshipType: 'located_at' }, select: { sourceId: true, targetId: true } }) : [];
    for (const r of rows ?? []) if (!roomOf.has(r.sourceId)) roomOf.set(r.sourceId, r.targetId);
  } catch { /* rooms unknown → same room */ }
  const otherRoomFrom = (listenerId: string, fromId: string | null | undefined): boolean => {
    if (!fromId || listenerId === fromId) return false;
    const a = roomOf.get(listenerId), b = roomOf.get(fromId);
    return !!a && !!b && a !== b;
  };
  const pointAtTruth = async (listenerId: string, memoryEntryId: string | undefined, truthId: string | null = truth.primary) => {
    if (truthId) await attachTruth(listenerId, memoryEntryId, truthId, truthId === truth.primary ? truth.extra : [], since);
  };
  // One answer turn per being per message, whoever grants it: the ask (named / party) or the being's own impulse.
  const granted = new Set<string>();
  const voiced = new Set(truth.voicedIds ?? []);
  // The senses that carried the last stretch to each being (for the reply's way back, HW6).
  const lastVia = new Map<string, string[]>();
  // The words the Watcher voiced for a being at the table that expect a reply: a spoken beat goes to its
  // answerers and overhearers, never its speaker — so his own question rides in his own stretch (HW6).
  const ownWords = new Map<string, TableUtterance[]>();
  for (const b of beats) {
    if (b.type !== 'spoken') continue;
    const sid = b.utterance.speaker?.id;
    if (sid && voiced.has(sid) && listeners.some((l) => l.id === sid)) ownWords.set(sid, [...(ownWords.get(sid) ?? []), b.utterance]);
  }
  // CARD ORDER: a being's line is not posted before its own thought card — answer() waits (bounded) on this.
  const cardPosted = new Map<string, Promise<void>>();
  const hear = (listenerId: string, stimulus: PlannedStimulus | null, reached?: { verdict: ReachVerdict; source: ReachJudgement['source'] }, askFor?: TableAsk, truthId: string | null = truth.primary) => {
    if (!stimulus) return;
    // What the senses carried, and whether it was the being's own doing, travel with the stretch (HW5 2026-10-25).
    const via = reached?.verdict.via;
    if (via) lastVia.set(listenerId, via);
    // His own only on the Watcher's stretch that voiced him — never on another being's line (HW8 run 2: her reply
    // reached him "via self" and he remembered her words as the narrator, not as a voice through a door).
    const own = (truthId === truth.primary && voiced.has(listenerId)) || (via?.includes('self') ?? false);
    // Hearing alone carries sound and words, not the receipt in his hand (HW6 2026-10-25).
    const handed = own ? stimulus.content : audibleOnly(stimulus.content, via);
    let content = handed;
    const unnamed = !own && !!via && !via.includes('sight') && !via.includes('self') ? withheldNames(listenerId, content) : null;
    // His own act, in his own person: "I knock again", not a stranger knocking (HW6 2026-10-25).
    const me = own ? truth.actors?.[listenerId] : undefined;
    if (me) content = ownVoice(content, me);
    // WHO SAID WHOSE NAME (HW8 run 6): "Violet?" in his mouth is HIS saying HER name — not her thought opening on "Kristopher."
    const hearerName = listeners.find((l) => l.id === listenerId)?.name ?? '';
    if (!own && hearerName) content = markAddressedByName(content, hearerName);
    const carried: PlannedStimulus = { ...stimulus, content, ...(via ? { via } : {}), ...(own ? { own: true } : {}) };
    // A voiced being already listening to this beat (the page was built from its monologue): take that, once.
    const pre = truth.preListened?.get(listenerId);
    if (pre) truth.preListened!.delete(listenerId);
    let cardDone: () => void = () => {};
    cardPosted.set(listenerId, new Promise<void>((r) => { cardDone = r; }));
    void (pre ?? (unnamed ? unnamed.then((c) => listenToTable(listenerId, actor.role, { ...carried, content: hearerName ? markAddressedByName(c, hearerName) : c })) : listenToTable(listenerId, actor.role, carried)))
      .then(async (outcome) => {
        if (outcome.status !== 'ok') {
          console.warn(`[table-speak] ${listenerId} could not listen: ${outcome.status}${outcome.detail ? ` (${outcome.detail})` : ''}`);
          reportTiming({ kind: 'listen', characterId: listenerId, outcome: outcome.status });
          return;
        }
        reportTiming({ kind: 'listen', characterId: listenerId, outcome: outcome.listened ? outcome.listened.status : 'taken_over', timings: outcome.listened?.timings, impulse: outcome.listened?.impulse });
        // The Watcher can read a silence: what went through it and its own say, on the record (not a memory).
        // Built up (Mike 2026-10-25): a prose line setting the being's side of the scene, then its card — unless the
        // Watcher voiced it this beat and its monologue already went into its card on the page.
        if (outcome.listened?.status === 'listened' && !truth.blended?.has(listenerId)) {
          const name = listeners.find((l) => l.id === listenerId)?.name ?? listenerId;
          const said = outcome.listened.thought;
          // THE REPLAY: no sentence the being already thought, verbatim, in its last three records.
          const thought = said?.trim() ? withoutRepeats(said, await recentThoughtsOf(campaignId, listenerId)) : said;
          const repeat = !!said?.trim() && !thought;
          if (repeat) console.log(`[table-speak] ${name}: the whole thought was a repeat — dropped`);
          // HELD REACTIONS: the Watcher's character still listened (memory formed), but his reaction to another being's line waits for his next beat.
          const holding = !repeat && !!thought && !!truth.gmActorId && listenerId === truth.gmActorId && truthId !== truth.primary;
          if (holding) {
            const held = heldReactions.get(listenerId) ?? [];
            held.push({ heard: carried.content, thought: thought!, at: Date.now() });
            heldReactions.set(listenerId, held.slice(-HELD_CAP));
            console.log(`[held-reaction] ${name}: held (${Math.min(held.length, HELD_CAP)})`);
          }
          let card = !repeat && !holding && sceneBuilderOn() && thought && !own
            ? await buildBeingCard(campaignId, { id: listenerId, name }, carried.content, thought, await sceneFacts(campaignId, [listenerId])).catch(() => null)
            : null;
          // THE REPLAY, on the card (HW8 run 6): a sentence the being's last three thoughts or cards already carried is dropped from
          // this one (the standing beat repeated one verbatim); a card with nothing left is not posted.
          if (card && standingIds.delete(listenerId)) card = { ...card, scene: null };
          let cardRepeat = false;
          if (card) {
            const previous = [...await recentThoughtsOf(campaignId, listenerId), ...await recentCardTextsOf(campaignId, listenerId)];
            const deduped = cardWithoutRepeats(card, previous);
            if (!deduped) { cardRepeat = true; console.log(`[table-speak] ${name}: the whole card was a repeat — not posted`); }
            card = deduped;
          }
          // A repeated thought or card is not posted again — but the BEAT is (HW9, 2026-10-29: Violet heard the third knock,
          // thought the same sentences as before, and the table went dead because nothing was recorded at all). The record
          // keeps what reached her and her impulse; only the prose she already said is left out.
          if (!holding) await recordBeingThought(campaignId, { userId: actor.userId, username: actor.username }, {
            characterId: listenerId,
            characterName: name,
            heard: carried.content,
            thought: repeat ? '' : thought,
            impulse: outcome.listened.impulse,
            canonEventId: truthId,
            ...(card && !cardRepeat ? { scene: card.scene, segments: card.segments } : {}),
          });
        }
        cardDone();
        // null = an answer took this stretch over; that answer stores it and points it at the truth.
        if (outcome.listened?.memoryEntryId) await pointAtTruth(listenerId, outcome.listened.memoryEntryId, truthId);
        if (reached && outcome.listened?.memoryEntryId) {
          await stampPerception(outcome.listened.memoryEntryId, reached.verdict, reached.source, handed);
          // Introductions teach names (this stretch's row, once it points at the truth and carries its senses).
          await learnIntroductions(campaignId, [{ characterId: listenerId, memoryIds: [outcome.listened.memoryEntryId] }], undefined, { canonEventId: truthId });
        }
        // THE BEING'S OWN SAY (Mike 2026-10-24: "the entities themselves should have a say if they
        // want to answer"): a listen that ends in "speak" or "act" earns the turn the ask did not give.
        const impulse = outcome.listened?.impulse;
        if (askFor && (impulse === 'speak' || impulse === 'act') && !granted.has(listenerId) && !voiced.has(listenerId)) {
          await answer(listenerId, askFor);
        }
      })
      .catch((err) => console.error('[table-speak] listening failed (non-fatal):', err))
      .finally(() => cardDone());
  };

  // Perception units 6+7 (PERCEPTION_REACH=on) — the reach/notice pass sits in the LISTEN beat: a stretch
  // waits for the world-sim's verdict before it is handed to the being (not reached → nothing; unnoticed →
  // stored noticed=false, no listening). Nothing on the answer clock waits for it: a being that is asked
  // to answer before its verdict is in takes the waiting stretches as heard (flushed below), as before.
  const reachOn = perceptionReachOn();
  const judgements = new Map<string, ReturnType<typeof judgeCanonReach>>();
  const waiting = new Map<string, Array<() => void>>();
  // The ask waits for the verdict on the stretch that carried it (HW5 2026-10-25: Violet, asked at once, was
  // handed every plea "as before" and answered a man the judge had ruled she could not hear from inside).
  const verdictWaits = new Map<string, Promise<ReachVerdict | null>>();
  const selfVerdict = (id: string): ReachVerdict => ({ beingId: id, reaches: true, via: ['self'], noticed: true, salience: 0.95 });
  // Hearing names a voice only when the hearer knows it (HW8 run 2, Mike: "does he know her?… would he recognize her
  // voice"): a speaker's label on a line that reached a being by hearing alone stands only if that being's familiarity
  // with the speaker's identity is F2 or better; otherwise it is "a man's voice" / "a woman's voice".
  const withheldNames = async (listenerId: string, content: string): Promise<string> => {
    const actorsHere = Object.entries(truth.actors ?? {}).filter(([id]) => id !== listenerId);
    if (!actorsHere.length) return content;
    const entity = await prisma.dayaEntity.findUnique({ where: { characterId: listenerId }, select: { id: true } }).catch(() => null);
    const camp = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } }).catch(() => null);
    let out = content;
    for (const [id, a] of actorsHere) {
      if (!a.name || !new RegExp(`(^|\\n)${a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\s`, 'i').test(out)) continue;
      const rec = entity ? await getFamiliarity(entity.id, id, 'identity').catch(() => null) : null;
      const known = rec ? familiarityAt(rec, camp?.currentCycle ?? 0) >= scoreForLevel(2) : false;
      if (known) continue;
      const voice = a.sex === 'f' || /^f/i.test(a.sex ?? '') ? "A woman's voice" : a.sex === 'm' || /^m/i.test(a.sex ?? '') ? "A man's voice" : 'A voice';
      out = out.replace(new RegExp(`(^|\\n)${a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\s`, 'gi'), `$1${voice}: `);
    }
    return out;
  };
  // THE STANDING BEAT (Mike 2026-10-25, ruling 22: "Violet is still within the scene so it should have then introduced
  // her inside the apartment and given her a card. What is she doing before he knocks"): a being within the scene that
  // this line did NOT reach still lives the moment — it listens to where it is and the hour, and its side goes on the
  // page as a scene line and a card. Once per line, never for the being the Watcher voiced.
  // A STANDING BEAT HAS NO SCENE LINE (Mike 2026-10-27): its card stands alone.
  const standingIds = new Set<string>();
  const standingBeat = async (listenerId: string, truthId: string | null) => {
    if (process.env.STANDING_BEAT === 'off' || truthId !== truth.primary || voiced.has(listenerId)) return;
    try {
      const clock = (await clockLine(campaignId))?.replace(/^\[clock\]\s*/, '') ?? null;
      const where = await prisma.entityRelationship.findFirst({ where: { sourceId: listenerId, relationshipType: 'located_at' }, select: { targetId: true } });
      const room = where ? await prisma.location.findUnique({ where: { id: where.targetId }, select: { name: true } }) : null;
      const content = [clock ? `It is ${clock}.` : null, room ? `You are in the ${nameHead(room.name)}.` : null, 'Nothing from beyond the room has reached you just now.'].filter(Boolean).join(' ');
      console.log(`[standing-beat] ${listeners.find((l) => l.id === listenerId)?.name ?? listenerId}: ${content}`);
      standingIds.add(listenerId);
      hear(listenerId, { source: 'perception', content }, { verdict: { beingId: listenerId, reaches: true, via: ['sight'], noticed: true, salience: 0.3 }, source: 'stub' }, undefined, truthId);
    } catch (err) { console.warn('[standing-beat] failed (non-fatal):', err instanceof Error ? err.message : err); }
  };
  const gatedHear = (utterances: TableUtterance[], ids: string[], askFor?: TableAsk, truthId: string | null = truth.primary, preset: Map<string, ReachVerdict> = new Map(), withOwnWords = false, judgeWith?: TableUtterance[]) => {
    // Reach per part (HW6 2026-10-25: one verdict on a line that opened with what he THOUGHT ruled the whole
    // of it unperceivable, his spoken plea included, and nobody was asked). What goes through a character is
    // his alone: out of the run everyone else is judged on, and handed to him with his own, unjudged.
    const thoughts = truthId === truth.primary ? truth.thoughts ?? [] : [];
    const publicRun = withoutThoughts(utterances, thoughts);
    const stims = new Map<string, PlannedStimulus>();
    for (const id of ids) {
      const s = stimulusFor(publicRun, id, { ownVoiced: voiced.has(id) });
      const mine = thoughts.filter((t) => t.actorId === id);
      if (mine.length) {
        const thinking = mine.map((t) => t.sentence).join(' ');
        stims.set(id, s ? { ...s, content: `${s.content}\n${thinking}`, own: true } : { source: 'perception', content: thinking, own: true });
      } else if (s) stims.set(id, s);
    }
    if (withOwnWords) {
      for (const [sid, us] of ownWords) {
        if (!ids.includes(sid)) continue;
        const lines = us.map((u) => `${u.speaker?.label ?? 'someone present'}: ${u.text}`).join('\n');
        const s = stims.get(sid);
        // The whole public stretch already carries a voiced speaker's own quotes (stimulusFor ownVoiced): not twice.
        if (s && us.every((u) => s.content.includes(u.text))) { stims.set(sid, { ...s, own: true }); continue; }
        stims.set(sid, s ? { ...s, content: `${s.content}\n${lines}`, own: true } : { source: 'dialogue', content: lines, own: true });
      }
    }
    // A being's own stretch — the Watcher voiced him in it — is his by rule; the judge is for the others.
    for (const id of stims.keys()) if (((truthId === truth.primary && voiced.has(id)) || stims.get(id)!.own) && !preset.has(id)) preset.set(id, selfVerdict(id));
    if (!reachOn) { for (const id of stims.keys()) hear(id, stims.get(id)!, undefined, askFor, truthId); return; }
    if (!stims.size) return;
    const delivered = new Set<string>();
    const soundChecked = new Set<string>();
    const nameOf = (id: string) => listeners.find((l) => l.id === id)?.name ?? id;
    const settle = new Map<string, (v: ReachVerdict | null) => void>();
    if (askFor) for (const id of stims.keys()) verdictWaits.set(id, new Promise<ReachVerdict | null>((resolve) => settle.set(id, resolve)));
    const deliver = (id: string, verdict: ReachVerdict | null, source: ReachJudgement['source']) => {
      if (delivered.has(id)) return;
      // A QUOTED LINE IS ALWAYS SOUND: the judge said no, but a voice crosses one door - hearing-only reach of the quote, never "NOT ASKED".
      if (verdict && !verdict.reaches && !soundChecked.has(id)) {
        const quote = publicRun.find((u) => u.kind === 'dialogue' && cuesFromText(u.text).volume !== 'whisper');
        if (quote) {
          soundChecked.add(id);
          void voiceCarries(campaignId, id, quote.speaker?.id ?? truth.actorId ?? null).then((ok) => {
            if (ok) console.log(`[perception-reach] ${nameOf(id)}: the judge said NOT REACHED, but a quoted line carries through a door - hearing only`);
            deliver(id, ok ? { beingId: id, reaches: true, via: ['hearing'], noticed: true, salience: 0.7 } : verdict, ok ? 'stub' : source);
          });
          return;
        }
      }
      delivered.add(id);
      settle.get(id)?.(verdict);
      const stim = stims.get(id)!;
      // Every verdict on the record (HW3 2026-10-24: Violet had no row for "Kristopher begins to cry" and
      // nothing said why — a man crying softly beyond a locked door did not reach her, correctly, invisibly).
      const what = `"${stim.content.slice(0, 60).replace(/\s+/g, ' ')}${stim.content.length > 60 ? '…' : ''}"`;
      // No verdict, or only the fallback's, for a being NOT in the line's actor's room: hearing alone (HW8 run 5, 2026-10-26) — never the unfiltered stretch.
      const lineActor = truthId === truth.primary ? truth.actorId ?? null : null;
      if ((!verdict || source === 'fallback') && otherRoomFrom(id, lineActor)) {
        console.log(`[perception-reach] ${nameOf(id)}: ${verdict ? 'fallback verdict' : 'no verdict'} across rooms → hearing only ${what}`);
        hear(id, stim, { verdict: { beingId: id, reaches: true, via: ['hearing'], noticed: true, salience: 0.5 }, source: 'stub' }, askFor, truthId);
        return;
      }
      if (!verdict) { console.log(`[perception-reach] ${nameOf(id)}: no verdict (${source}) → heard as before ${what}`); hear(id, stim, undefined, askFor, truthId); return; }
      if (!verdict.reaches) { console.log(`[perception-reach] ${nameOf(id)}: NOT REACHED (${source}) — nothing stored ${what}`);
        // Addressed to this being (a quote that names them, a knock at their door) and it did not carry: the ONE line, nothing else.
        const unheard = didNotHear({ id, name: nameOf(id) }, publicRun.map((u) => ({ text: u.text, kind: u.kind, speakerLabel: u.speaker?.label ?? null, speakerSex: u.speaker?.id ? truth.actors?.[u.speaker.id]?.sex ?? null : null, to: u.to && u.to.scope === 'named' && u.to.ids.includes(id) ? id : null })), truth.actorId ? truth.actors?.[truth.actorId]?.sex ?? null : null);
        if (unheard && truthId === truth.primary) void postSceneSentence(campaignId, actor, unheard);
        void standingBeat(id, truthId); return; }
      if (!verdict.noticed) { console.log(`[perception-reach] ${nameOf(id)}: reached via ${verdict.via.join('+')}, UNNOTICED (${source}) — stored noticed=false ${what}`); void storeUnnoticedAtTable(campaignId, id, stim, verdict, truthId); return; }
      console.log(`[perception-reach] ${nameOf(id)}: reached via ${verdict.via.join('+')}, noticed (${source}, salience ${verdict.salience.toFixed(2)}) ${what}`);
      hear(id, stim, { verdict, source }, askFor, truthId);
    };
    // Settled by rule, not by the judge: a being's own thought, or the way back of a reply (HW6).
    for (const [id, v] of preset) if (stims.has(id)) deliver(id, v, 'stub');
    const toJudge = [...stims.keys()].filter((id) => !preset.has(id));
    if (!toJudge.length || !publicRun.length) return;
    for (const id of toJudge) waiting.set(id, [...(waiting.get(id) ?? []), () => deliver(id, null, 'stub')]);
    // The judge reads the WHOLE public stretch — the narration and the words spoken in it (HW8 run 2: "He breaks the
    // silence." was judged alone, made no sound, and his "Is everything ok?" inherited the verdict: she never heard him).
    const judgedRun = judgeWith ? withoutThoughts(judgeWith, thoughts) : publicRun;
    // ONE VERDICT PER (STRETCH, BEING) (HW8 run 6: every stretch was judged twice per being — $0.20 of a $0.28 run): the same event text
    // for the same beings on the same truth reuses the verdict it already asked for.
    const event = reachEventOf(judgedRun, truthId, truthId === truth.primary ? truth.actorId ?? null : null);
    const judgeKey = `${truthId ?? ''}|${event.text}|${[...toJudge].sort().join(',')}`;
    let judged = judgements.get(judgeKey);
    if (judged) console.log(`[perception-reach] verdict reused for ${toJudge.map(nameOf).join(', ')} (the stretch was already judged)`);
    else { judged = judgeCanonReach(campaignId, event, toJudge); judgements.set(judgeKey, judged); }
    const prior = reachChains.get(campaignId) ?? Promise.resolve();
    const next = prior.then(() => judged).then(async (j) => {
      const refs = new Map<string, EventRefs>();
      for (const id of toJudge) {
        const v = j.verdicts.get(id) ?? null;
        const early = delivered.has(id);
        deliver(id, v, j.source);
        // The stretch's memory row is written later by listening; the change record points at the truth event.
        if (!early && v?.reaches && v.noticed) addRefs(refs, id, { characterIds: utterances.map((u) => u.speaker?.id ?? null), locationIds: [j.beings.find((b) => b.id === id)?.locationId], canonEventId: truthId });
      }
      if (refs.size) {
        const cycle = (await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } }))?.currentCycle ?? 0;
        await recordNoticedExposures(campaignId, cycle, refs);
      }
    }).catch((err) => {
      console.error('[table-speak] reach pass failed; stretches heard as before (non-fatal):', err);
      for (const id of toJudge) deliver(id, null, 'stub');
    });
    reachChains.set(campaignId, next);
  };

  const answered = new Map<string, ListenerResponse>();
  // Who asked each being (the speaker of the line it answers), for the reply's way back.
  const askSource = new Map<string, string | null>();
  const answer = async (listenerId: string, ask: TableAsk) => {
    const listener = listeners.find((l) => l.id === listenerId);
    if (!listener || granted.has(listenerId)) return;
    granted.add(listenerId);
    // An ask that did not reach the being is no ask: wait for the verdict (the judge's own cap), and if the
    // stretch did not reach or was not noticed, nobody answers (HW5 2026-10-25).
    const pending = verdictWaits.get(listenerId);
    if (pending) {
      const v = await Promise.race([pending, new Promise<undefined>((r) => setTimeout(r, REACH_TUNING.timeoutMs + 500))]);
      if (v && (!v.reaches || !v.noticed)) {
        console.log(`[perception-reach] ${listener.name}: NOT ASKED — the ask ${v.reaches ? 'went unnoticed' : 'did not reach'}`);
        answered.set(listenerId, { characterId: listenerId, characterName: listener.name, status: 'ok', detail: v.reaches ? 'unnoticed' : 'not reached' });
        return;
      }
    }
    for (const flush of waiting.get(listenerId) ?? []) flush();
    waiting.delete(listenerId);
    const outcome = await answerAtTable(listenerId, actor.role, ask, {
      onEvent: (event) => broadcastEvent(campaignId, { ...event, kind: 'being_speaking' }),
    });
    const action = outcome.answer?.action;
    answered.set(listenerId, { characterId: listenerId, characterName: listener.name, status: outcome.status, actionKind: action?.kind, detail: outcome.detail });
    reportTiming({ kind: 'answer', characterId: listenerId, outcome: outcome.status, action: action?.kind, timings: outcome.answer?.timings });
    if (outcome.status !== 'ok' || !outcome.answer || !action) return;
    // A REST IS NOT A ROW (HW8 run 5, 2026-10-26: "*stays quiet*" went on the record as a line): the answer is reported and kept,
    // nothing is posted, no seconds are spent, nothing reaches the room.
    const line = action.kind === 'rest' ? null : actionToTableLine(listener.name, action);
    // The being's line costs the world its seconds (table-clock) before it is on the record.
    if (line && (action.kind === 'speak' || action.kind === 'act')) await advanceClockForLine(campaignId, action.kind === 'speak' ? 'being-speech' : 'being-act', action.content ?? line);
    // CARD ORDER: its own thought card goes up before its line (bounded wait, non-fatal).
    await awaitCard(cardPosted.get(listenerId));
    // AN ACT ANSWER = A CARD ACT (run 7): never a chat / speech row; speech and attend keep their chat line.
    if (line && action.kind === 'act') await postActCard(campaignId, { userId: actor.userId, username: actor.username }, { id: listener.id, name: listener.name, sex: truth.actors?.[listener.id]?.sex }, action.content?.trim() ?? '');
    else if (line) await postChat(campaignId, 'ai_copilot', actor.userId, listener.name, listener.id, listener.name, line, { via: 'being', raw: rawBeingAction(action) });
    // What it did settles what it meant to do.
    // Only a DOING settles what it meant to do (HW8 run 2: "I'm just getting the tip" closed "give it to him as the tip").
    if (action.kind === 'act' && action.content?.trim()) settleByAct(campaignId, listener.id, action.content.trim());
    // THE ROOM HEARS HER (HW5 2026-10-25: Violet's answers never reached Kristopher — a being's words went on the
    // record and into nobody's senses). Her line is canon dialogue; every other being is judged for reach and
    // listens, as for anyone's words. No turn is granted on it: the Watcher drives the turns, and being-to-being
    // talk would otherwise chain without end.
    if (action.kind === 'speak' && action.content?.trim()) {
      const said = action.content.trim();
      const others = listeners.map((l) => l.id).filter((id) => id !== listener.id);
      if (others.length) {
        // The way back is open (HW6 2026-10-25: his shout crossed the door to her and the judge ruled her reply
        // could not cross it back). Whoever asked her, and reached her by hearing, hears the answer — unless
        // she whispered it. Everyone else is judged as before.
        const askedBy = askSource.get(listener.id) ?? null;
        const preset = new Map<string, ReachVerdict>();
        if (askedBy && others.includes(askedBy) && (lastVia.get(listener.id)?.includes('hearing') ?? false) && cuesFromText(said).volume !== 'whisper') {
          preset.set(askedBy, { beingId: askedBy, reaches: true, via: ['hearing'], noticed: true, salience: 0.8 });
        }
        void recordDialogueCanon(campaignId, listener.id, listener.name, said, null)
          .then((ev) => {
            const u: TableUtterance = { text: said, kind: 'dialogue', to: null, speaker: { id: listener.id, label: listener.name }, expectsReply: false, ambiguous: false, rule: 'being-line' };
            gatedHear([u], others, undefined, ev.id, preset);
          })
          .catch((err) => console.warn('[table-speak] the room did not hear the being (non-fatal):', err));
      }
    }
    // A SOUNDING ACT REACHES THE ROOM TOO (HW8 run 5, 2026-10-26: Violet slid the deadbolt and Kristopher never heard the clack):
    // the act is put to the others as narration and the judge decides what crosses the door. No preset, no turn granted.
    // Not recorded as canon here (no narration-recording helper for a being's act exists in this file) → the truth id is null.
    if (action.kind === 'act' && action.content?.trim()) {
      const others = listeners.map((l) => l.id).filter((id) => id !== listener.id);
      if (others.length) {
        const u: TableUtterance = { text: action.content.trim(), kind: 'narration', to: null, speaker: null, expectsReply: false, ambiguous: false, rule: 'being-act' };
        gatedHear([u], others, undefined, null);
      }
    }
    void outcome.answer.after.then(async (stored) => {
      await pointAtTruth(listenerId, stored.memoryEntryId);
      // The act line went out as the INTENT (everything behind the line happens after it is out). When the
      // map refused it or its check failed, the table is told what actually happened (Mike 2026-10-17: a
      // locked door was "pushed open" and nothing said otherwise).
      if (action.kind === 'act' && stored.outcome && stored.outcomeDiffers) {
        await postActCard(campaignId, { userId: actor.userId, username: actor.username }, { id: listener.id, name: listener.name, sex: truth.actors?.[listener.id]?.sex }, stored.outcome);
      }
      // THE PAGE SAYS WHAT THE WORLD DID (run 7): a fact the act changed (the door opened) is one scene sentence, from the change.
      if (action.kind === 'act' && stored.worldChanges?.length) await postWorldChange(campaignId, actor, stored.worldChanges);
    }).catch(() => {});
  };
  const answerAll = async (ids: string[], ask: TableAsk) => {
    const work = Promise.all(ids.map((id) => answer(id, ask))).catch((err) => console.error('[table-speak] answering failed (non-fatal):', err));
    if (opts.waitForAnswers) await work;
  };
  const askOf = (beat: Extract<TableBeat, { type: 'turn' | 'spoken' }>): TableAsk =>
    beat.type === 'spoken' ? { kind: 'spoken', by: beat.utterance.speaker?.label ?? 'someone present', text: beat.utterance.text } : { kind: 'turn' };

  // What a listener who was not asked could answer to, should its own impulse say so: the spoken
  // line it overheard, or the turn the world's beat implies.
  const impulseAskFor = (beat: TableBeat): TableAsk => (beat.type === 'spoken' ? askOf(beat) : { kind: 'turn' });
  // No run of world content to ride in: a voiced being still gets its own words as its own stretch.
  if (!beats.some((b) => b.type === 'hear')) for (const [sid, us] of ownWords) gatedHear(us, [sid], undefined, truth.primary, new Map(), false);
  // Everything the line put into the world — what was done and what was said — is one stretch for the reach judge.
  const publicStretch: TableUtterance[] = beats.flatMap((b) => (b.type === 'hear' ? b.utterances : b.type === 'spoken' ? [b.utterance] : []));
  const hasHearBeat = beats.some((b) => b.type === 'hear');
  let stretchHeard = false;
  for (const beat of orderBeats(beats)) {
    if (beat.type === 'hear') {
      const by = oneSpeakerOf(beat.utterances);
      for (const l of listeners) if (l.id !== by) askSource.set(l.id, by);
      // The first hear beat hands over the WHOLE public stretch (every hear beat's words are in it): a second hear beat would judge
      // the same stretch again for every being (HW8 run 6).
      if (stretchHeard) continue;
      stretchHeard = true;
      // HER CARD GETS HIS WORDS (HW8 run 5, 2026-10-26): the whole public stretch is the stimulus — the hearing filter keeps a
      // speech line whole — so a hearer's card is built on the words, not on "Someone speaks up." while she answers them.
      gatedHear(publicStretch, listeners.map((l) => l.id), impulseAskFor(beat), truth.primary, new Map(), true, publicStretch);
      continue;
    }
    if (beat.type === 'spoken') {
      for (const id of answerers(beat, listeners)) askSource.set(id, beat.utterance.speaker?.id ?? null);
      // The stretch already carried the quote when the line had a hear beat; speech-only lines hand it over here.
      if (!hasHearBeat) gatedHear([beat.utterance], overhearers(beat, listeners), impulseAskFor(beat));
    }
    await answerAll(answerers(beat, listeners), askOf(beat));
  }
  // THE TURN HANDED OVER: "he waits until she opens the door" — the being it names has the turn.
  if (truth.turnTo && listeners.some((l) => l.id === truth.turnTo) && !granted.has(truth.turnTo)) await answerAll([truth.turnTo], { kind: 'turn' });
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
  const rawMessage = input.message;
  let message = rawMessage;
  if (!input.confirmTicketId && await saidJustNow(campaignId, rawMessage)) {
    throw new ValidationError('That exact line was said moments ago — nothing written twice. (A slow reply can make the page re-send; say something new.)');
  }
  const npcRoster = () => proseRoster(campaignId);
  const listeners = await activeListeners(campaignId);
  let roster = await npcRoster();
  // AN UNCLOSED QUOTE (run 7 #3): it ends at the third-person sentence that follows; the rest is narration (an ambiguous one is JEWL's ask).
  if (!input.confirmTicketId) {
    const closed = closeUnclosedQuote(message, roster.map((r) => r.name));
    if (closed.status === 'closed') { console.log('[table-prose] an unclosed quote was closed at the third-person sentence after it'); message = closed.text; }
  }
  const proseCtx = { recentActors: await recentTableActors(campaignId, roster), lastVoiced: await lastVoicedActor(campaignId, roster) };
  let parsed = parseTableProse(message, roster, proseCtx);
  // REFERENTS THE GM LEAVES TO THE WORLD (run 7 #10, #2): "tries to remember the price ... and says it through the door" - the value
  // is what the receipt he holds (or his memory) says; when nothing holds it, he cannot. Resolved before the line is read.
  {
    const speaker = soleActor(parsed) ?? proseCtx.lastVoiced?.id ?? null;
    const others = listeners.filter((l) => l.id !== speaker);
    const resolved = await resolveReferents(campaignId, message, speaker, others.length === 1 ? others[0].name : null);
    if (resolved.kind !== 'none') {
      console.log(`[table-referents] ${resolved.kind}${resolved.value ? ` (${resolved.value})` : ''}: ${resolved.message.slice(0, 200)}`);
      message = resolved.message;
      parsed = parseTableProse(message, roster, proseCtx);
    }
  }
  const planFor = (npcs: typeof roster) => planTableTalk(readTableTalk(message, { present: listeners, npcs, prose: proseCtx }).utterances, 'typed');
  let plan = planFor(roster);

  // 0. JEWL's read still comes BEFORE anything is written on this path (U2c-5 moves it beside the listening).
  //    A message with nothing in the world (only an ask, only ignored talk) has nothing for him to read.
  let ticketId: string | null = null;
  if (input.confirmTicketId) {
    ticketId = (await takeConfirmed(campaignId, input.confirmTicketId, message)).id;
    roster = await npcRoster();
    parsed = parseTableProse(message, roster, proseCtx);
    plan = planFor(roster);
  } else if (plan.world.length) {
    const held = await readNarration(campaignId, actor, message, parsed, listeners);
    if (held) return { held, canonEventId: null, dialogue: [], narration: parsed.narration, responses: [] };
  }

  // 0b. TIME — the line costs the world what it states, else what it plausibly takes (table-clock).
  if (plan.world.length) await liveStatedTime(campaignId, actor, await advanceClockForLine(campaignId, 'gm-line', message), message);

  // 1. TRUTH — as speakProse writes it, minus what was not part of the world.
  const narration = canonNarration(parsed.full, plan);
  const narrated = plan.world.some((u) => u.kind !== 'dialogue');
  const hasActions = (parsed.actions?.length ?? 0) + (parsed.thoughts?.length ?? 0) > 0;
  let canonEventId: string | null = null;
  const dialogue: TableProseResult['dialogue'] = [];
  const soloAttributed = !narrated && !hasActions && parsed.quotes.length === 1 && parsed.quotes[0].speakerId;
  // 0c. THE SEED → THE PAGE (Mike 2026-10-25: the record reads like a novel, built from data). The beings the
  //     Watcher voiced listen to their own beat first; their monologue, the seed and the world's facts go to the
  //     scene builder; what comes back is the declaration's feed — the seed itself stays the canon text and the raw.
  const actorsById = actorsOf(roster);
  let feedParts: { narration: string | null; speech: typeof parsed.quotes; actions: typeof parsed.actions; thoughts: typeof parsed.thoughts; built?: boolean; seedNarration?: string | null; monologues?: Array<{ actorId: string; text: string }> } = { narration: narrated ? parsed.narration : null, speech: parsed.quotes, actions: parsed.actions, thoughts: parsed.thoughts };
  let preListened: Map<string, Promise<TableListenOutcome>> | undefined;
  let blended: Set<string> | undefined;
  if (sceneBuilderOn() && narration !== null && (narrated || hasActions)) {
    const voicedHere = voicedIn(parsed).filter((id) => listeners.some((l) => l.id === id));
    preListened = preListenVoiced(actor, plan, parsed, actorsById, voicedHere, await readingsFor(voicedHere, parsed.full));
    const monologues = await monologuesWithin(preListened, PRELISTEN_WAIT_MS, campaignId);
    const seed: SeedParts = { full: parsed.full, narration: narrated ? parsed.narration : null, actions: parsed.actions ?? [], thoughts: parsed.thoughts ?? [], quotes: parsed.quotes };
    const focus = [...new Set([soleActor(parsed), ...voicedHere].filter((x): x is string => !!x))];
    const built = await buildScene(campaignId, seed, monologues, await sceneFacts(campaignId, focus.length ? focus : listeners.map((l) => l.id)));
    if (built.source === 'cloud') {
      feedParts = {
        narration: built.scene,
        speech: parsed.quotes,
        actions: built.cards.flatMap((c) => c.segments.filter((s) => s.kind === 'action').map((s) => ({ actorId: c.actorId, actorLabel: c.actorLabel, text: s.text, sentence: s.sentence }))),
        thoughts: built.cards.flatMap((c) => c.segments.filter((s) => s.kind === 'thought').map((s) => ({ actorId: c.actorId, actorLabel: c.actorLabel, text: s.text, sentence: s.sentence, ...(s.narrated ? { narrated: s.narrated } : {}) }))),
        built: true,
        seedNarration: narrated ? parsed.narration : null,
        monologues: [...monologues].map(([actorId, text]) => ({ actorId, text })),
      };
      blended = new Set(monologues.keys());
    }
  }
  if (narration !== null && (narrated || hasActions || parsed.quotes.length !== 1)) {
    const declared = await declareCanon(campaignId, actor, {
      narration, kind: 'narration', actorId: soleActor(parsed), locationId: input.locationId ?? null, witnessIds: [],
      feed: { via: 'typed', raw: rawMessage, ...feedParts },
    });
    canonEventId = declared.event.id;
    narratedActs(campaignId, parsed.actions, actor);
  }
  for (const q of parsed.quotes) {
    try {
      const ev = await recordQuote(campaignId, q);
      dialogue.push({ canonEventId: ev.id, speakerId: q.speakerId, speakerLabel: q.speakerLabel, text: q.text });
    } catch (err) { console.warn('[table-speak] dialogue canon failed', err); }
  }
  if (soloAttributed) {
    const q = parsed.quotes[0];
    await postChat(campaignId, 'gm', actor.userId, actor.username, q.speakerId!, q.speakerLabel, q.text, { via: 'typed', raw: rawMessage });
  }
  for (const u of plan.ignored) await markDropped(campaignId, actor, u.kind, u.rule, u.text);

  // 2. LISTEN and ANSWER, beat by beat.
  const truthPrimary = canonEventId ?? dialogue[0]?.canonEventId ?? null;
  const truthExtra = dialogue.map((d) => d.canonEventId).filter((id) => id !== truthPrimary);
  // "He waits for the door": the one being in a different room from the Watcher's character (null unless exactly one).
  const gmId = proseCtx.lastVoiced?.id ?? soleActor(parsed);
  let otherBehindDoor: string | null = null;
  if (gmId && /\bfor the door\b/i.test(message)) {
    try {
      const rows = await prisma.entityRelationship.findMany({ where: { sourceId: { in: [gmId, ...listeners.map((l) => l.id)] }, relationshipType: 'located_at' }, select: { sourceId: true, targetId: true } });
      const at = new Map<string, string>(); for (const r of rows ?? []) if (!at.has(r.sourceId)) at.set(r.sourceId, r.targetId);
      const away = listeners.map((l) => l.id).filter((id) => id !== gmId && at.get(id) && at.get(gmId) && at.get(id) !== at.get(gmId));
      otherBehindDoor = away.length === 1 ? away[0] : null;
    } catch { /* unknown → no turn handed */ }
  }
  const answered = await runBeats(campaignId, actor, plan.beats, listeners, { primary: truthPrimary, extra: truthExtra, voicedIds: voicedIn(parsed), actorId: soleActor(parsed), thoughts: parsed.thoughts, actors: actorsById, preListened, blended, gmActorId: gmId, turnTo: waitsFor(message, roster, gmId, otherBehindDoor) }, {
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

/**
 * TIME JUMPS REQUIRE SIMULATION FOR ALL CHARACTERS (Mike 2026-10-24): a GM line that stated a span
 * long enough (table-timeskip) is lived by every being before the table goes on — the beings then
 * listen to the jump line having lived the days. Never throws.
 */
async function liveStatedTime(campaignId: string, actor: TableActor, adv: Awaited<ReturnType<typeof advanceClockForLine>>, said: string): Promise<void> {
  const stretch = statedStretchOf(adv);
  if (!stretch) return;
  try {
    const outcomes = await simulateStatedStretch(campaignId, actor, stretch, said);
    console.log(`[table-speak] ${stretch.span} lived by ${outcomes.length} being(s): ${outcomes.map((o) => `${o.name}=${o.status}`).join(', ')}`);
  } catch (err) {
    console.warn('[table-speak] living the stated stretch failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

/**
 * THE MAP STAYS TRUE UNDER THE WATCHER'S VOICE (HW3 2026-10-24: "He walks slowly down the hall" was
 * his card, and Kristopher stayed located_at the landing — only a being's own Do: went through the
 * adjudicator). Each `::action::` the Watcher wrote for a roster character is read once, as narrated:
 * no check, the words stand, the model names what it did to doors, hands and rooms, and world-apply
 * lands it. Fire-and-forget: the table never waits on it; what the map refuses is logged.
 */
function narratedActs(campaignId: string, actions: Array<{ actorId: string; actorLabel: string; text: string }> | undefined, gm?: { userId: string; username: string }): void {
  for (const a of actions ?? []) {
    if (!a.actorId || !a.text.trim()) continue;
    // What the Watcher had it do settles what it meant to do (intentions, 2026-10-25).
    settleByAct(campaignId, a.actorId, a.text);
    // ROLLS AT THE TABLE (2026-10-26): a deliberate inspection / search / listen-closely, or an attempt the Watcher frames as
    // uncertain ("tries to"), is a real check — the popup for its owner and the card. The world does NOT take the words as done:
    // the Watcher narrates the result. Passive noticing, reading, knocking, walking are never checks.
    // A MEMORY is a RECALL, never a roll (run 7 #2): the value was resolved into the line (table-referents); nothing is rolled or adjudicated.
    if (isRecall(a.text)) continue;
    if (gm && detectActiveCheck(a.text)) {
      void startTableRoll(campaignId, { id: gm.userId, username: gm.username }, { characterId: a.actorId, text: a.text })
        .catch((err) => console.warn(`[table-speak] roll for ${a.actorLabel} not started (non-fatal):`, err instanceof Error ? err.message : err));
      continue;
    }
    void feedCycle(campaignId)
      .then((cycle) => resolveIntent({ campaignId, entityCharacterId: a.actorId, intent: a.text, cycle: cycle ?? 0, narrated: true }))
      .then((r) => {
        const applied = r.effects?.applied ?? [];
        const refused = r.effects?.refused ?? [];
        if (applied.length || refused.length) console.log(`[table-speak] narrated act by ${a.actorLabel}: ${applied.join('; ') || 'nothing moved'}${refused.length ? ` · refused: ${refused.join('; ')}` : ''}`);
      })
      .catch((err) => console.warn(`[table-speak] narrated act by ${a.actorLabel} not read by the world (non-fatal):`, err instanceof Error ? err.message : err));
  }
}

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
  const reading = readTableTalk(heard, { present: listeners, npcs, state: table.talk, holdTrailingFragment: true, prose: { recentActors: await recentTableActors(campaignId, npcs), lastVoiced: await lastVoicedActor(campaignId, npcs) } });
  table.talk = reading.state;
  table.pending = reading.pending;
  table.lastAt = now;

  const plan = planTableTalk(reading.utterances, 'spoken');
  if (plan.world.length) { const said = plan.world.map((u) => u.text).join(' '); await liveStatedTime(campaignId, actor, await advanceClockForLine(campaignId, 'gm-line', said), said); }
  const truth = await recordSpoken(campaignId, actor, plan, table.beatId, heard);
  table.beatId = truth.beatId;
  for (const u of plan.ignored) await markDropped(campaignId, actor, u.kind, u.rule, u.text);
  const voicedIds = [...new Set(reading.utterances.map((u) => u.speaker?.id).filter((id): id is string => !!id))];
  await runBeats(campaignId, actor, plan.beats, listeners, { ...truth, voicedIds }, { waitForAnswers: false, answerAfterWorldOnly: BEINGS_ANSWER === 'always' });
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
  await assertLawfulInput({
    campaignId, userId: actor.userId, username: actor.username, text: input.message, origin: 'TABLE_NPC_SPEAK',
    participantCharacterIds: [npc.id], participants: () => tableParticipantIds(campaignId),
  });

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
    where: { characterId: { in: characters.map((c) => c.id) } },
    select: { characterId: true, status: true },
  });
  const activeIds = new Set(entities.filter((e) => e.status === 'ACTIVE').map((e) => e.characterId));
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
