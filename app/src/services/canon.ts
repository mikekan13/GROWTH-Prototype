/**
 * Canon ledger — the infallible base reality (Mike 2026-09-20).
 *
 * "Character memory is fallible as intended. We need a truth or base reality
 * that must be recorded and be infallible." — and — "The GM can see whatever
 * he needs to see. He is called the Watcher for a reason."
 *
 * Rules:
 *  - Append-only. There is no update or delete here, and no route offers one.
 *  - Written by the simulation (the Willpower step) and by table acts; never
 *    by a being. A being's memory points at canon via `truthRef`; canon never
 *    points at memory.
 *  - Read by the Watcher (GM/ADMIN) in full. Players have no route.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';
import type { RoundLogEntry } from '@/sim/round/types';
import { classifyDomains } from '@/daya/domains';
import { goalsTouched } from '@/daya/chain';
import { recordVineEntriesSafe } from '@/services/vine-memory';
import { writeMemoryEntry } from '@/daya/memory';
import { createCampaignEvent } from '@/services/campaign-event';
import { broadcastEvent } from '@/lib/campaign-stream';
import type { TerminalEvent, TerminalPayload } from '@/types/terminal';

export interface CanonEventInput {
  campaignId: string;
  cycle: number;
  seq: number;
  kind: string;
  locationId?: string | null;
  actorId?: string | null;
  targetId?: string | null;
  narration: string;
  detail?: Record<string, unknown>;
  consequences?: Record<string, unknown>;
  sourceType?: string | null;
  sourceId?: string | null;
  parentId?: string | null;
  provenanceId?: string | null;
  /** The chain on the truth side (Mike 09-23). */
  itemIds?: string[];
  goalIds?: string[];
  domains?: string[];
}

/** What the sim knows about the scene when it records a round — feeds the truth-side chain. */
export interface RoundChainContext {
  locationId?: string | null;
  /** participantId → held item id (the interposable one) */
  heldItemByParticipant?: Record<string, string | null>;
  /** participantId → that being's ACTIVE goals */
  goalsByParticipant?: Record<string, Array<{ id: string; description: string }>>;
}

export async function recordCanonEvent(input: CanonEventInput) {
  return prisma.canonEvent.create({
    data: {
      itemIds: JSON.stringify(input.itemIds ?? []),
      goalIds: JSON.stringify(input.goalIds ?? []),
      domains: JSON.stringify(input.domains ?? []),
      campaignId: input.campaignId,
      cycle: input.cycle,
      seq: input.seq,
      kind: input.kind,
      locationId: input.locationId ?? null,
      actorId: input.actorId ?? null,
      targetId: input.targetId ?? null,
      narration: input.narration,
      detail: JSON.stringify(input.detail ?? {}),
      consequences: JSON.stringify(input.consequences ?? {}),
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      parentId: input.parentId ?? null,
      provenanceId: input.provenanceId ?? null,
    },
  });
}

/** Log kinds that are consequential enough to be canon (bookkeeping lines are not). */
const CANON_KINDS = new Set<RoundLogEntry['kind']>(['check', 'negate', 'block', 'redirect', 'damage', 'downed', 'action', 'note']);

/**
 * Pure: turn a resolved round's log into canon event inputs — one per
 * consequential, narrated entry, in slot order. Order-only lines and entries
 * without a diegetic narration are not events (nothing happened to witness).
 */
export function roundLogToCanon(args: {
  campaignId: string;
  cycle: number;
  encounterId: string;
  round: number;
  log: RoundLogEntry[];
  parentId: string;
  context?: RoundChainContext;
}): CanonEventInput[] {
  const out: CanonEventInput[] = [];
  const ctx = args.context ?? {};
  let seq = 0;
  for (const l of args.log) {
    if (!CANON_KINDS.has(l.kind) || !l.narration) continue;
    // Truth-side chain: items interposed/held by the parties to this act, the
    // goals of actor and target the act touched, the domains it falls under.
    const parties = [l.actorId, l.targetId].filter((x): x is string => !!x);
    const itemIds = (l.kind === 'block' || l.kind === 'redirect' || l.kind === 'damage' || l.kind === 'note')
      ? parties.map(p => ctx.heldItemByParticipant?.[p] ?? null).filter((x): x is string => !!x)
      : [];
    const goalIds = parties.flatMap(p => goalsTouched(`${l.narration} ${l.text}`, ctx.goalsByParticipant?.[p] ?? []));
    const domains = classifyDomains(`${l.narration} ${l.text}`).all;
    out.push({
      campaignId: args.campaignId,
      cycle: args.cycle,
      seq: seq++,
      kind: l.kind === 'action' ? (l.text.includes(' moves') ? 'move' : l.text.includes(' holds') ? 'hold' : 'action') : l.kind,
      locationId: ctx.locationId ?? null,
      actorId: l.actorId,
      targetId: l.targetId,
      narration: l.narration,
      detail: { slot: l.slot + 1, text: l.text, ...(l.detail ?? {}) },
      consequences: l.kind === 'damage' ? { events: (l.detail as { events?: unknown })?.events ?? [], pool: (l.detail as { pool?: unknown })?.pool ?? [] } : l.kind === 'downed' ? { downed: l.targetId } : {},
      sourceType: 'encounter',
      sourceId: args.encounterId,
      parentId: args.parentId,
      itemIds: [...new Set(itemIds)],
      goalIds: [...new Set(goalIds)],
      domains,
    });
  }
  return out;
}

/** Record a resolved round: one parent event plus one child per consequential act. Returns ids. */
export async function recordRoundCanon(args: {
  campaignId: string;
  cycle: number;
  encounterId: string;
  encounterName: string;
  round: number;
  log: RoundLogEntry[];
  provenanceId?: string | null;
  context?: RoundChainContext;
}): Promise<{ roundId: string; childIds: string[]; childBySlotIndex: Map<number, string[]>; itemsBySlotIndex: Map<number, string[]>; goalsByParticipant: Map<string, string[]> }> {
  const parent = await recordCanonEvent({
    campaignId: args.campaignId,
    cycle: args.cycle,
    seq: 0,
    kind: 'encounter_round',
    locationId: args.context?.locationId ?? null,
    narration: `${args.encounterName}: six seconds pass.`,
    detail: { round: args.round, entries: args.log.filter(l => l.kind !== 'order').length },
    sourceType: 'encounter',
    sourceId: args.encounterId,
    provenanceId: args.provenanceId ?? null,
  });
  const inputs = roundLogToCanon({ campaignId: args.campaignId, cycle: args.cycle, encounterId: args.encounterId, round: args.round, log: args.log, parentId: parent.id, context: args.context });
  const childIds: string[] = [];
  const childBySlotIndex = new Map<number, string[]>();
  const itemsBySlotIndex = new Map<number, string[]>();
  const goalsByParticipant = new Map<string, string[]>();
  for (const input of inputs) {
    const row = await recordCanonEvent(input);
    childIds.push(row.id);
    // Vines as custodian memory (Mike 09-22): every goal this act touched gets it on its vine.
    if (input.goalIds?.length) recordVineEntriesSafe({ campaignId: args.campaignId, canonEventId: row.id, cycle: args.cycle, narration: input.narration, goalIds: input.goalIds });
    const slot = Number((input.detail as { slot: number }).slot) - 1;
    childBySlotIndex.set(slot, [...(childBySlotIndex.get(slot) ?? []), row.id]);
    itemsBySlotIndex.set(slot, [...new Set([...(itemsBySlotIndex.get(slot) ?? []), ...(input.itemIds ?? [])])]);
    for (const p of [input.actorId, input.targetId]) {
      if (!p) continue;
      const own = (args.context?.goalsByParticipant?.[p] ?? []).map(g => g.id);
      const touched = (input.goalIds ?? []).filter(g => own.includes(g));
      if (touched.length) goalsByParticipant.set(p, [...new Set([...(goalsByParticipant.get(p) ?? []), ...touched])]);
    }
  }
  return { roundId: parent.id, childIds, childBySlotIndex, itemsBySlotIndex, goalsByParticipant };
}

// ── Reading — the Watcher's view ────────────────────────────────────────────

export interface CanonQuery {
  sinceCycle?: number;
  untilCycle?: number;
  actorId?: string;
  targetId?: string;
  kind?: string;
  limit?: number;
}

export async function listCanon(campaignId: string, actor: { userId: string; role: string }, q: CanonQuery = {}) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(actor.userId, actor.role, campaign)) throw new ForbiddenError('The canon ledger is the Watcher\'s to read');
  const rows = await prisma.canonEvent.findMany({
    where: {
      campaignId,
      ...(q.sinceCycle !== undefined || q.untilCycle !== undefined ? { cycle: { ...(q.sinceCycle !== undefined ? { gte: q.sinceCycle } : {}), ...(q.untilCycle !== undefined ? { lte: q.untilCycle } : {}) } } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.targetId ? { targetId: q.targetId } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
    },
    orderBy: [{ cycle: 'asc' }, { createdAt: 'asc' }, { seq: 'asc' }],
    take: Math.min(q.limit ?? 200, 1000),
  });
  return rows.map(r => ({ ...r, detail: JSON.parse(r.detail) as Record<string, unknown>, consequences: JSON.parse(r.consequences) as Record<string, unknown> }));
}

/**
 * Fallibility check for one being: its lived memories beside the canon they
 * point at. The Watcher's tool for "what does Danny think happened vs what did".
 */
export async function memoryVersusTruth(campaignId: string, actor: { userId: string; role: string }, characterId: string, limit = 50) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(actor.userId, actor.role, campaign)) throw new ForbiddenError('The canon ledger is the Watcher\'s to read');
  const entity = await prisma.dayaEntity.findUnique({ where: { characterId }, select: { id: true } });
  if (!entity) return [];
  const memories = await prisma.dayaMemoryEntry.findMany({ where: { entityId: entity.id, truthRef: { not: null } }, orderBy: { realTime: 'desc' }, take: limit });
  const truthIds = [...new Set(memories.map(m => m.truthRef as string))];
  const truths = await prisma.canonEvent.findMany({ where: { id: { in: truthIds } } });
  const byId = new Map(truths.map(t => [t.id, t]));
  return memories.map(m => ({
    memoryId: m.id,
    source: m.source,
    remembered: m.content,
    valence: m.valence,
    salience: m.salience,
    truth: byId.get(m.truthRef as string) ? { id: m.truthRef, kind: byId.get(m.truthRef as string)!.kind, narration: byId.get(m.truthRef as string)!.narration, cycle: byId.get(m.truthRef as string)!.cycle } : null,
  }));
}

// ── Other writers of truth (MEMORY-DESIGN §5: canon writers) ─────────────────

async function postCanonGameEvent(campaignId: string, actor: { userId: string; username?: string }, eventType: string, description: string) {
  const payload: TerminalPayload = { kind: 'game_event', eventType, description };
  const event = await createCampaignEvent({ campaignId, type: 'game_event', actor: 'gm', actorUserId: actor.userId, actorName: actor.username ?? 'Watcher', payload });
  const terminalEvent: TerminalEvent = {
    id: `ev-${event.id}`, type: 'game_event',
    timestamp: event.createdAt instanceof Date ? event.createdAt.toISOString() : String(event.createdAt),
    campaignId, actor: 'gm', actorUserId: actor.userId, actorName: actor.username ?? 'Watcher',
    sessionId: event.sessionId || undefined, payload,
  };
  broadcastEvent(campaignId, { kind: 'terminal_event', event: terminalEvent });
}

/**
 * The GM declares a fact (REALITY-SIM-DESIGN §2 ruling 9 / §5 improvisation):
 * a boundary condition the sim conforms to. Recorded once; every witness
 * perceives it (engine-authored memory with truthRef); touched goals reach
 * their custodians' vines. Canon-checking against prior ledger entries is a
 * later unit — v0 records what the Watcher declares.
 */
export async function declareCanon(
  campaignId: string,
  actor: { userId: string; username?: string; role: string },
  input: { narration: string; kind?: string; actorId?: string | null; targetId?: string | null; locationId?: string | null; witnessIds?: string[] },
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true, currentCycle: true } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(actor.userId, actor.role, campaign)) throw new ForbiddenError('Only the Watcher declares canon');
  const cycle = campaign.currentCycle;
  const parties = [input.actorId, input.targetId].filter((x): x is string => !!x);
  const goals = parties.length ? await prisma.goal.findMany({ where: { characterId: { in: parties }, status: 'ACTIVE' }, select: { id: true, description: true } }) : [];
  const goalIds = goalsTouched(input.narration, goals);
  const domains = classifyDomains(input.narration).all;
  const event = await recordCanonEvent({
    campaignId, cycle, seq: 0, kind: input.kind ?? 'declaration',
    locationId: input.locationId ?? null, actorId: input.actorId ?? null, targetId: input.targetId ?? null,
    narration: input.narration, detail: { declaredBy: actor.userId }, consequences: {},
    sourceType: 'gm', goalIds, domains,
  });
  if (goalIds.length) recordVineEntriesSafe({ campaignId, canonEventId: event.id, cycle, narration: input.narration, goalIds });
  try { await postCanonGameEvent(campaignId, actor, 'declaration', input.narration); } catch (err) { console.warn('[canon] declaration event failed', err); }

  // Everyone present perceives it — engine-authored, no confabulation.
  const witnesses = input.witnessIds?.length
    ? await prisma.dayaEntity.findMany({ where: { characterId: { in: input.witnessIds } }, select: { id: true, characterId: true } })
    : await prisma.dayaEntity.findMany({ where: { status: 'ACTIVE', character: { campaignId } }, select: { id: true, characterId: true } });
  const memoryIds: string[] = [];
  for (const w of witnesses) {
    try {
      const own = await prisma.goal.findMany({ where: { characterId: w.characterId, status: 'ACTIVE' }, select: { id: true, description: true } });
      const m = await writeMemoryEntry({
        entityId: w.id, narrativeCycle: cycle, source: 'perception', content: input.narration,
        valence: 0, arousal: 0.4, salience: 0.5,
        entityRefs: parties.filter(p => p !== w.characterId),
        classification: { kind: 'declaration', canonEventId: event.id },
        truthRef: event.id,
        chain: { truthRefs: [event.id], entities: parties.filter(p => p !== w.characterId), locationId: input.locationId ?? null, goalIds: goalsTouched(input.narration, own) },
      });
      memoryIds.push(m.id);
    } catch (err) { console.warn('[canon] witness memory failed', err); }
  }
  return { event, witnesses: witnesses.length, memoryIds };
}

/** Table dialogue is truth too: what an NPC said, recorded once. */
export async function recordDialogueCanon(campaignId: string, speakerId: string, speakerName: string, message: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } });
  const cycle = campaign?.currentCycle ?? 0;
  const goals = await prisma.goal.findMany({ where: { characterId: speakerId, status: 'ACTIVE' }, select: { id: true, description: true } });
  const goalIds = goalsTouched(message, goals);
  const event = await recordCanonEvent({
    campaignId, cycle, seq: 0, kind: 'dialogue', actorId: speakerId,
    narration: `${speakerName} says: "${message}"`, detail: { message }, consequences: {},
    sourceType: 'table', goalIds, domains: classifyDomains(message).all,
  });
  if (goalIds.length) recordVineEntriesSafe({ campaignId, canonEventId: event.id, cycle, narration: event.narration, goalIds });
  return event;
}

/** Point a being's memories written since `since` at the canon event they perceived (for writers that go through the stimulus pipeline). */
export async function attachTruthToRecentMemories(characterId: string, canonEventId: string, since: Date): Promise<number> {
  const entity = await prisma.dayaEntity.findUnique({ where: { characterId }, select: { id: true } });
  if (!entity) return 0;
  const res = await prisma.dayaMemoryEntry.updateMany({
    where: { entityId: entity.id, realTime: { gte: since }, truthRef: null, source: { in: ['dialogue', 'perception'] } },
    data: { truthRef: canonEventId },
  });
  return res.count;
}

/** The vine, read from the custodian's side (Watcher). */
export async function readVineForWatcher(campaignId: string, actor: { userId: string; role: string }, goalId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(actor.userId, actor.role, campaign)) throw new ForbiddenError("The vine is the Watcher's to read");
  return prisma.vineEntry.findMany({ where: { goalId, campaignId }, orderBy: [{ cycle: 'asc' }, { createdAt: 'asc' }] });
}
