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
import { converseWithEntity, type ConverseStatus } from '@/daya/conversation';
import type { TerminalEvent, TerminalActor, TerminalPayload } from '@/types/terminal';
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
}

/** Kept for the pre-09-26 narrate-only callers; prose handles it now. */
export type TableNarrateResult = TableProseResult;

async function postChat(
  campaignId: string,
  actor: TerminalActor,
  actorUserId: string,
  actorName: string,
  characterId: string,
  characterName: string,
  message: string,
) {
  const payload: TerminalPayload = { kind: 'chat', message };
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
        await postChat(campaignId, 'ai_copilot', actor.userId, listener.name, listener.id, listener.name, line);
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
    await postChat(campaignId, 'gm', actor.userId, actor.username, q.speakerId!, q.speakerLabel, q.text);
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

async function recordQuote(campaignId: string, q: ProseQuote) {
  if (q.speakerId) return recordDialogueCanon(campaignId, q.speakerId, q.speakerLabel, q.text);
  return recordUnattributedDialogueCanon(campaignId, q.speakerLabel, q.text, q.context);
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
  await postChat(campaignId, 'gm', actor.userId, actor.username, npc.id, npc.name, input.message);
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
  };
}
