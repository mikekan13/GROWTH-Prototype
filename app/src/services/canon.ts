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
