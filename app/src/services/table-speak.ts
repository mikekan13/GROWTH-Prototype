/**
 * Table speak — the GM speaking through an NPC at the table (Mike 2026-09-02:
 * "As a GM you should be able to select any npc and speak through them. It
 * works like normal tabletop.").
 *
 * One utterance does two things, in table order:
 *   1. Lands in the shared campaign event stream as `chat` attributed to the
 *      NPC (same shape npc_speak established) — everyone at the table sees it.
 *   2. Is delivered VERBATIM (prefixed with the speaker's name) as a
 *      'dialogue' stimulus to every ACTIVE DAYA-wrapped character in the
 *      campaign — stimulus always goes through, it is part of the loop the
 *      same way thinking is. Their responses land back in the event stream
 *      as chat from them, like any player speaking.
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
import { attachTruthToMemory, attachTruthToRecentMemories, declareCanon, recordDialogueCanon } from '@/services/canon';

/** The being loop hands back the id of the memory row that IS the perception; point that one at the truth. Sweep only when it didn't. */
async function attachTruth(listenerId: string, memoryEntryId: string | undefined, canonEventId: string, since: Date) {
  try {
    if (memoryEntryId && (await attachTruthToMemory(memoryEntryId, canonEventId))) return;
    await attachTruthToRecentMemories(listenerId, canonEventId, since);
  } catch { /* record-keeping only */ }
}

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

/**
 * The GM speaks one utterance through an NPC. Watcher-and-above only.
 * Every ACTIVE DAYA entity in the campaign (other than the speaker) hears
 * it and responds through its full being loop; responses post back into
 * the event stream attributed to those characters.
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
  const since = new Date();
  let dialogueCanonId: string | null = null;
  try { dialogueCanonId = (await recordDialogueCanon(campaignId, npc.id, npc.name, input.message)).id; } catch (err) { console.warn('[table-speak] dialogue canon failed', err); }

  // 2. Every awake DAYA being in the campaign perceives it. No filter,
  //    no selection — stimulus always goes through.
  const characters = await prisma.character.findMany({
    where: { campaignId, id: { not: npc.id } },
    select: { id: true, name: true },
  });
  const activeEntities = await prisma.dayaEntity.findMany({
    where: { characterId: { in: characters.map((c) => c.id) }, status: 'ACTIVE' },
    select: { characterId: true },
  });
  const activeIds = new Set(activeEntities.map((e) => e.characterId));
  const listeners = characters.filter((c) => activeIds.has(c.id));

  const responses: ListenerResponse[] = [];
  for (const listener of listeners) {
    const result = await converseWithEntity(listener.id, actor.role, `${npc.name}: ${input.message}`);
    const response: ListenerResponse = {
      characterId: listener.id,
      characterName: listener.name,
      status: result.status,
      actionKind: result.action?.kind,
      detail: result.detail,
    };
    responses.push(response);
    if (dialogueCanonId) await attachTruth(listener.id, result.memoryEntryId, dialogueCanonId, since);

    if (result.status === 'ok' && result.action) {
      const line = actionToTableLine(listener.name, result.action);
      if (line) {
        await postChat(campaignId, 'ai_copilot', actor.userId, listener.name, listener.id, listener.name, line);
      }
    }
  }

  return { npcName: npc.name, responses };
}

export interface TableNarrateResult {
  canonEventId: string;
  responses: ListenerResponse[];
}

/**
 * The GM narrates the world at the table (readiness for the live campaign,
 * 2026-09-26). Narration is a Watcher DECLARATION: it becomes canon first
 * (`declareCanon`, which also posts it to the table record as a game event),
 * then every ACTIVE DAYA being present perceives it through its full being
 * loop — a 'perception' memory pointing at the canon event — and anything it
 * does in response posts back as chat, exactly like table-speak.
 *
 * Nothing is said "through" anyone here: the actor is the world itself.
 */
export async function narrateAtTable(
  campaignId: string,
  actor: TableActor,
  input: { message: string; actorId?: string | null; targetId?: string | null; locationId?: string | null },
): Promise<TableNarrateResult> {
  if (!isWatcherOrAbove(actor.role)) {
    throw new ForbiddenError('GM/ADMIN only — narrating is a Watcher-seat action');
  }
  // 1. Truth first. witnessIds: [] — we deliver the perception ourselves below
  //    so each being lives it (emotion, attention, action), not just files it.
  const since = new Date();
  const declared = await declareCanon(campaignId, actor, {
    narration: input.message,
    kind: 'narration',
    actorId: input.actorId ?? null,
    targetId: input.targetId ?? null,
    locationId: input.locationId ?? null,
    witnessIds: [],
  });

  // 2. Every awake being present perceives the world change.
  const characters = await prisma.character.findMany({ where: { campaignId }, select: { id: true, name: true } });
  const activeEntities = await prisma.dayaEntity.findMany({
    where: { characterId: { in: characters.map((c) => c.id) }, status: 'ACTIVE' },
    select: { characterId: true },
  });
  const activeIds = new Set(activeEntities.map((e) => e.characterId));
  const listeners = characters.filter((c) => activeIds.has(c.id));

  const responses: ListenerResponse[] = [];
  for (const listener of listeners) {
    const result = await converseWithEntity(listener.id, actor.role, input.message, {}, 'perception');
    responses.push({
      characterId: listener.id,
      characterName: listener.name,
      status: result.status,
      actionKind: result.action?.kind,
      detail: result.detail,
    });
    await attachTruth(listener.id, result.memoryEntryId, declared.event.id, since);

    if (result.status === 'ok' && result.action) {
      const line = actionToTableLine(listener.name, result.action);
      if (line) {
        await postChat(campaignId, 'ai_copilot', actor.userId, listener.name, listener.id, listener.name, line);
      }
    }
  }

  return { canonEventId: declared.event.id, responses };
}

/**
 * Picker data for the table tab: NPCs the GM can speak through, and the
 * DAYA-active characters at the table (used for core warm-up + display).
 */
export async function getTableRoster(campaignId: string, actorRole: string) {
  if (!isWatcherOrAbove(actorRole)) {
    throw new ForbiddenError('GM/ADMIN only');
  }
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
