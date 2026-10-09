/**
 * Perception units 6+7 — the reach/notice pass wired to the world.
 *
 * sim/senses/reach.ts decides (one batched world-sim call per canon event);
 * this module feeds it (beings in range: organs, place, focus, Wisdom), carries
 * the call on the 'classify' lane, and writes the results:
 *   - not reached → NO memory row (the caller skips the being),
 *   - reached, unnoticed → a row with noticed=false (kept out of normal recall),
 *   - reached, noticed → the row as before + perceivedVia (+ the world-sim's salience),
 *   - familiarity: one exposure batch per being per pass, for noticed subjects.
 *
 * Everything here runs only when PERCEPTION_REACH=on; callers check
 * perceptionReachOn() first so the flag-off path is untouched.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { route, anthropicChatText, openAiCompatChat, recordAiCall } from '@/ai/network';
import { senseProfileFromSheet, type SenseItemSource } from '@/sim/senses/field';
import { judgeReach, perceptionReachOn, type ReachBeing, type ReachEvent, type ReachJudgement, type ReachModel, type ReachVerdict } from '@/sim/senses/reach';
import { recordExposureBatch, type ExposureSubject } from '@/services/familiarity';
import { writeMemoryEntry } from '@/daya/memory';
import { perceive } from '@/daya/perceive';
import type { MemoryChain } from '@/daya/chain';
import { decodePerceivedVia, encodePerceivedVia, mergePerceivedVia } from '@/daya/perceived-via';

export { perceptionReachOn };

// ── The model transport ───────────────────────────────────────────────────

/** The world-sim call on the classify lane (Haiku today, the local small model when that lane points at it). */
export function reachModelFor(campaignId?: string | null): ReachModel {
  return async ({ system, user, maxTokens }) => {
    const lane = route({ caller: 'perception-reach', lane: 'classify', campaignId: campaignId ?? undefined, privacy: 'trusted-dev' });
    const opts = { maxTokens, temperature: 0 };
    let res: { text: string; model: string; usage: Parameters<typeof recordAiCall>[0]['usage'] };
    if (lane.provider === 'anthropic') {
      res = await anthropicChatText({ model: lane.model, system, cacheSystem: true, messages: [{ role: 'user', content: user }], ...opts });
    } else if (lane.provider === 'openai-compat' && lane.baseUrl) {
      res = await openAiCompatChat({ baseUrl: lane.baseUrl, apiKey: lane.apiKey, model: lane.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...opts });
    } else {
      throw new Error(`perception-reach: unsupported provider ${lane.provider}`);
    }
    recordAiCall({ lane: lane.lane, provider: lane.provider, model: res.model, caller: 'perception-reach', campaignId: campaignId ?? undefined, usage: res.usage });
    return res.text;
  };
}

// ── Beings in range ───────────────────────────────────────────────────────

type SheetBits = { bodyAnatomy?: unknown; attributes?: { wisdom?: { level?: number; augmentPositive?: number; augmentNegative?: number } } };

/** Wisdom pool max (level + aug+ − aug−), null when the sheet carries none. Pure. */
export function wisdomOf(sheet: SheetBits | null): number | null {
  const w = sheet?.attributes?.wisdom;
  if (!w || typeof w.level !== 'number') return null;
  return w.level + (w.augmentPositive ?? 0) - (w.augmentNegative ?? 0);
}

/**
 * SENSE GRANTS from held things (Mike 2026-10-09: a sense "could be an organ an item a spell"): every
 * ACTIVE item each being holds (equipped or carried), grouped by holder. A read failure grants nothing.
 */
export async function heldItemsBy(characterIds: string[]): Promise<Map<string, SenseItemSource[]>> {
  const out = new Map<string, SenseItemSource[]>();
  if (!characterIds.length) return out;
  try {
    const rows = await prisma.campaignItem.findMany({ where: { holderId: { in: characterIds }, status: 'ACTIVE' }, select: { id: true, name: true, data: true, holderId: true }, take: 400 });
    for (const r of rows) if (r.holderId) out.set(r.holderId, [...(out.get(r.holderId) ?? []), { id: r.id, name: r.name, data: r.data }]);
  } catch (err) { console.warn('[perception-reach] held items unread; no item sense grants', err); }
  return out;
}

/**
 * The beings the pass judges, with what the world-sim needs: organs, place,
 * focus (the caller's intent if it has one — an encounter plan — else the
 * being's ACTIVE goals), Wisdom. Five reads, whatever the number of beings.
 */
export async function loadReachBeings(campaignId: string, characterIds: string[], opts: { focusById?: Record<string, string | null | undefined> } = {}): Promise<ReachBeing[]> {
  const ids = [...new Set(characterIds)];
  if (!ids.length) return [];
  const [chars, rels, goals, held] = await Promise.all([
    prisma.character.findMany({ where: { id: { in: ids }, campaignId }, select: { id: true, name: true, data: true } }),
    prisma.entityRelationship.findMany({ where: { sourceId: { in: ids }, relationshipType: 'located_at' }, select: { sourceId: true, targetId: true } }),
    prisma.goal.findMany({ where: { characterId: { in: ids }, status: 'ACTIVE' }, select: { characterId: true, description: true } }),
    heldItemsBy(ids),
  ]);
  const locOf = new Map(rels.map((r) => [r.sourceId, r.targetId]));
  const locIds = [...new Set(rels.map((r) => r.targetId))];
  const locs = locIds.length ? await prisma.location.findMany({ where: { id: { in: locIds } }, select: { id: true, name: true } }) : [];
  const locName = new Map(locs.map((l) => [l.id, l.name]));
  const goalsOf = new Map<string, string[]>();
  for (const g of goals) if (g.characterId) goalsOf.set(g.characterId, [...(goalsOf.get(g.characterId) ?? []), g.description]);
  return chars.map((c) => {
    let sheet: SheetBits | null = null;
    try { sheet = JSON.parse(c.data) as SheetBits; } catch { sheet = null; }
    const locationId = locOf.get(c.id) ?? null;
    const focus = opts.focusById?.[c.id] ?? (goalsOf.get(c.id)?.slice(0, 2).join('; ') || null);
    return { id: c.id, name: c.name, locationId, locationName: locationId ? locName.get(locationId) ?? null : null, senses: senseProfileFromSheet(sheet, { items: held.get(c.id) ?? [] }), focus, wisdom: wisdomOf(sheet) };
  });
}

/**
 * One canon event, every being in `characterIds`: the batched world-sim call
 * (stub on timeout/failure). Never throws — on a read failure every being is
 * judged by the stub over a default-human profile, which reaches everyone at
 * the scene (the behaviour before units 6+7).
 */
export async function judgeCanonReach(
  campaignId: string,
  event: ReachEvent,
  characterIds: string[],
  opts: { focusById?: Record<string, string | null | undefined>; model?: ReachModel | null; beings?: ReachBeing[]; atScene?: boolean } = {},
): Promise<ReachJudgement & { beings: ReachBeing[] }> {
  let beings: ReachBeing[] = [];
  try {
    beings = opts.beings ?? await loadReachBeings(campaignId, characterIds, { focusById: opts.focusById });
    // atScene: every being is IN this scene by definition (encounter participants) — wherever its located_at edge says.
    if (opts.atScene) beings = beings.map((b) => ({ ...b, locationId: event.locationId ?? null, locationName: event.locationName ?? b.locationName ?? null }));
    if (event.locationId && !event.locationName) {
      const loc = await prisma.location.findUnique({ where: { id: event.locationId }, select: { name: true } });
      event = { ...event, locationName: loc?.name ?? null };
    }
    if (event.sourceId && !event.sourceName) event = { ...event, sourceName: beings.find((b) => b.id === event.sourceId)?.name ?? null };
  } catch (err) {
    console.warn('[perception-reach] could not load beings; the stub judges a default body', err);
    beings = characterIds.map((id) => ({ id, name: id, locationId: null, senses: senseProfileFromSheet(null) }));
  }
  const j = await judgeReach(event, beings, { model: opts.model === undefined ? reachModelFor(campaignId) : opts.model });
  if (j.source === 'fallback') console.warn(`[perception-reach] world-sim fell back to the stub after ${j.ms}ms: ${j.error}`);
  return { ...j, beings };
}

/**
 * The table's unnoticed write: the being's own (unvoiced) mirror of the stimulus, stored noticed=false,
 * pointed at the truth. No listening, no answer — it did not notice. Never throws.
 */
export async function storeUnnoticedAtTable(campaignId: string, characterId: string, stimulus: { source: 'perception' | 'dialogue'; content: string }, verdict: ReachVerdict, truthRef: string | null): Promise<void> {
  try {
    const [entity, campaign] = await Promise.all([
      prisma.dayaEntity.findUnique({ where: { characterId }, select: { id: true } }),
      prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } }),
    ]);
    if (!entity) return;
    let content = stimulus.content;
    try {
      content =(await perceive(characterId, campaignId, stimulus.content, stimulus.source, {}, { standing: 'stimulus', voice: false })).prose;
    } catch { /* raw */ }
    await writeUnnoticed({ entityId: entity.id, cycle: campaign?.currentCycle ?? 0, content, verdict, truthRef, classification: { kind: 'table', source: stimulus.source } });
  } catch (err) { console.warn('[perception-reach] table unnoticed write failed', err); }
}

/**
 * An encounter round: one batched call per narrated act, all acts in parallel
 * (each time-capped). Beings are read ONCE for the round. Keyed by log entry.
 */
export async function judgeRoundReach<L extends { slot: number; kind: string; actorId: string | null; targetId: string | null; narration?: string }>(
  campaignId: string,
  locationId: string | null,
  log: L[],
  participantIds: string[],
  focusById: Record<string, string | null | undefined> = {},
  model?: ReachModel | null,
): Promise<Map<L, ReachJudgement>> {
  const acts = log.filter((l) => l.narration);
  const out = new Map<L, ReachJudgement>();
  if (!acts.length || !participantIds.length) return out;
  let beings: ReachBeing[];
  try { beings = await loadReachBeings(campaignId, participantIds, { focusById }); }
  catch { beings = participantIds.map((id) => ({ id, name: id, locationId: null, senses: senseProfileFromSheet(null) })); }
  const judged = await Promise.all(acts.map((l) => judgeCanonReach(campaignId, {
    kind: 'action', text: l.narration as string, sourceId: l.actorId, targetId: l.targetId, locationId,
    volume: l.kind === 'damage' || l.kind === 'downed' ? 'loud' : null,
  }, participantIds, { beings, atScene: true, ...(model !== undefined ? { model } : {}) })));
  acts.forEach((l, i) => out.set(l, judged[i]));
  return out;
}

/** What a verdict adds to a memory write. The world-sim's salience only when it judged (the stub's is the old heuristic). */
export function memoryFieldsOf(v: ReachVerdict, source: ReachJudgement['source']): { noticed: boolean; perceivedVia: string[]; perceivedClarity?: Record<string, number>; salience?: number } {
  return { noticed: v.noticed, perceivedVia: v.via, ...(v.clarity && Object.keys(v.clarity).length ? { perceivedClarity: v.clarity } : {}), ...(source === 'model' ? { salience: v.salience } : {}) };
}

/** Stamp a row the being loop wrote (the table's listening path) with the verdict; joined stretches union their senses (newer clarity wins per sense). */
export async function stampPerception(memoryId: string, v: ReachVerdict, source: ReachJudgement['source']): Promise<void> {
  try {
    const row = await prisma.dayaMemoryEntry.findUnique({ where: { id: memoryId }, select: { perceivedVia: true } });
    if (!row) return;
    const f = memoryFieldsOf(v, source);
    const merged = mergePerceivedVia(decodePerceivedVia(row.perceivedVia), { via: f.perceivedVia, clarity: f.perceivedClarity ?? {} });
    await prisma.dayaMemoryEntry.update({ where: { id: memoryId }, data: { noticed: true, perceivedVia: encodePerceivedVia(merged.via, merged.clarity), ...(f.salience !== undefined ? { salience: f.salience } : {}) } });
  } catch (err) { console.warn('[perception-reach] stamp failed (record-keeping only)', err); }
}

/** A sensed-but-unnoticed perception: stored, no inner life spent on it (the being did not notice). */
export async function writeUnnoticed(args: { entityId: string; cycle: number; content: string; verdict: ReachVerdict; truthRef: string | null; entityRefs?: string[]; chain?: Partial<MemoryChain>; classification?: Record<string, unknown> }): Promise<{ id: string } | null> {
  try {
    return await writeMemoryEntry({
      entityId: args.entityId, narrativeCycle: args.cycle, source: 'perception', content: args.content,
      valence: 0, arousal: 0.1, salience: args.verdict.salience,
      entityRefs: args.entityRefs ?? [],
      classification: { ...(args.classification ?? {}), unnoticed: true },
      truthRef: args.truthRef,
      chain: { ...(args.chain ?? {}), truthRefs: args.truthRef ? [args.truthRef] : [] },
      noticed: false, perceivedVia: args.verdict.via, ...(args.verdict.clarity ? { perceivedClarity: args.verdict.clarity } : {}),
      // Unnoticed things do not press toward dreaming.
      skipDreamPressure: true,
    });
  } catch (err) { console.warn('[perception-reach] unnoticed write failed', err); return null; }
}

// ── Familiarity exposure ──────────────────────────────────────────────────

export interface EventRefs {
  characterIds?: Array<string | null | undefined>; itemIds?: string[]; locationIds?: Array<string | null | undefined>;
  /** Change-record pointers (FamiliarityChange.memoryId / canonEventId): the being's row / the event this pass rests on (latest wins). */
  memoryId?: string | null; canonEventId?: string | null;
}

/**
 * Exposure for every being that NOTICED something this pass: one transaction
 * per being (services/familiarity recordExposureBatch), its own items 'own'.
 * `refsByBeing` = the subjects of the events that being noticed. Never throws.
 */
export async function recordNoticedExposures(campaignId: string, cycle: number, refsByBeing: Map<string, EventRefs>): Promise<void> {
  try {
    if (!refsByBeing.size) return;
    const charIds = new Set<string>(); const itemIds = new Set<string>();
    for (const r of refsByBeing.values()) {
      for (const c of r.characterIds ?? []) if (c) charIds.add(c);
      for (const i of r.itemIds ?? []) if (i) itemIds.add(i);
    }
    const [chars, items, entities] = await Promise.all([
      charIds.size ? prisma.character.findMany({ where: { id: { in: [...charIds] } }, select: { id: true, entityType: true } }) : [],
      itemIds.size ? prisma.campaignItem.findMany({ where: { id: { in: [...itemIds] } }, select: { id: true, holderId: true } }) : [],
      prisma.dayaEntity.findMany({ where: { characterId: { in: [...refsByBeing.keys()] } }, select: { id: true, characterId: true } }),
    ]);
    const kindOf = new Map(chars.map((c) => [c.id, c.entityType === 'NPC' ? 'NPC' as const : 'CHARACTER' as const]));
    const holderOf = new Map(items.map((i) => [i.id, i.holderId]));
    for (const e of entities) {
      const r = refsByBeing.get(e.characterId);
      if (!r) continue;
      const subjects: ExposureSubject[] = [
        ...(r.characterIds ?? []).filter((c): c is string => !!c && kindOf.has(c)).map((c) => ({ subjectId: c, subjectKind: kindOf.get(c)!, source: 'exposure' as const })),
        ...(r.itemIds ?? []).filter((i) => holderOf.has(i)).map((i) => ({ subjectId: i, subjectKind: 'ITEM' as const, source: holderOf.get(i) === e.characterId ? 'own' as const : 'exposure' as const })),
        ...(r.locationIds ?? []).filter((l): l is string => !!l).map((l) => ({ subjectId: l, subjectKind: 'LOCATION' as const, source: 'exposure' as const })),
      ];
      const refs = r.memoryId || r.canonEventId ? { memoryId: r.memoryId ?? null, canonEventId: r.canonEventId ?? null } : undefined;
      try { await recordExposureBatch({ campaignId, perceiverId: e.id, perceiverCharacterId: e.characterId, cycle, subjects, refs }); }
      catch (err) { console.warn(`[perception-reach] exposure batch failed for ${e.characterId}`, err); }
    }
  } catch (err) { console.warn('[perception-reach] exposure pass failed', err); }
}

/** Merge one event's refs into a being's pass refs. Pure. */
export function addRefs(map: Map<string, EventRefs>, beingId: string, refs: EventRefs): void {
  const prior = map.get(beingId) ?? {};
  map.set(beingId, {
    characterIds: [...(prior.characterIds ?? []), ...(refs.characterIds ?? [])],
    itemIds: [...(prior.itemIds ?? []), ...(refs.itemIds ?? [])],
    locationIds: [...(prior.locationIds ?? []), ...(refs.locationIds ?? [])],
    memoryId: refs.memoryId ?? prior.memoryId ?? null,
    canonEventId: refs.canonEventId ?? prior.canonEventId ?? null,
  });
}
