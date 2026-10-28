/**
 * Perception units 6+7 — the reach/notice pass wired to the world.
 *
 * sim/senses/reach.ts decides (one batched world-sim call per canon event);
 * this module feeds it (beings in range: organs, place, focus, Wisdom), carries
 * the call on the LOCAL lane, and writes the results:
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
import { localLane, routedChatText } from '@/ai/network';
import { senseProfileFromSheet, type SenseItemSource } from '@/sim/senses/field';
import { judgeReach, perceptionReachOn, type ReachBeing, type ReachEvent, type ReachJudgement, type ReachModel, type ReachVerdict, REACH_TUNING } from '@/sim/senses/reach';
import { recordExposureBatch, type ExposureSubject } from '@/services/familiarity';
import { writeMemoryEntry } from '@/daya/memory';
import { perceive } from '@/daya/perceive';
import type { MemoryChain } from '@/daya/chain';
import { laneReadiness } from '@/daya/l1-endpoint';
import { actorMap, mapFactLines } from '@/services/world-apply';
import { loadWorldLevel, beingStanding, levelOfBeing } from '@/services/spatial-world';
import { lineOfSight } from '@/lib/spatial';
import { decodePerceivedVia, encodePerceivedVia, mergePerceivedVia } from '@/daya/perceived-via';

export { perceptionReachOn };

// ── The model transport ───────────────────────────────────────────────────

/**
 * The world-sim call on the LOCAL lane (Mike 2026-10-12: perception reach is
 * live-table work — the Spirit pillar). Class 'fiction': the payload is the
 * canon event and the beings in range. Null when the local lane is not
 * configured — judgeReach then uses the stub (never a cloud fallback). The
 * 4 s cap and the stub-on-failure live in judgeReach (sim/senses/reach).
 */
export function reachModelFor(campaignId?: string | null, caller = 'perception-reach'): ReachModel | null {
  if (!localLane()) return null;
  return async ({ system, user, maxTokens }) => {
    const res = await routedChatText(
      { caller, lane: 'local', campaignId: campaignId ?? undefined, contentClass: 'fiction' },
      { system, user, maxTokens, temperature: 0 },
    );
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
  // The being's latest standing intention (when no encounter intent was passed) is what it is attending to. Best-effort.
  const intentOf = new Map<string, string>();
  try {
    const rows = await prisma.dayaIntention.findMany({ where: { status: 'PENDING', entity: { characterId: { in: ids } } }, orderBy: { createdAt: 'desc' }, select: { description: true, entity: { select: { characterId: true } } }, take: 60 });
    for (const r of rows ?? []) { const cid = r.entity?.characterId; if (cid && !intentOf.has(cid)) intentOf.set(cid, r.description); }
  } catch { /* no intention read → goals only */ }
  const goalsOf = new Map<string, string[]>();
  for (const g of goals) if (g.characterId) goalsOf.set(g.characterId, [...(goalsOf.get(g.characterId) ?? []), g.description]);
  return chars.map((c) => {
    let sheet: SheetBits | null = null;
    try { sheet = JSON.parse(c.data) as SheetBits; } catch { sheet = null; }
    const locationId = locOf.get(c.id) ?? null;
    const focus = opts.focusById?.[c.id] ?? ([intentOf.get(c.id) ? 'intends: ' + intentOf.get(c.id) : null, ...(goalsOf.get(c.id)?.slice(0, 2) ?? [])].filter(Boolean).join('; ') || null);
    return { id: c.id, name: c.name, locationId, locationName: locationId ? locName.get(locationId) ?? null : null, senses: senseProfileFromSheet(sheet, { items: held.get(c.id) ?? [] }), focus, wisdom: wisdomOf(sheet) };
  });
}

/**
 * One canon event, every being in `characterIds`: the batched world-sim call
 * (stub on timeout/failure). Never throws — on a read failure every being is
 * judged by the stub over a default-human profile, which reaches everyone at
 * the scene (the behaviour before units 6+7).
 */
/**
 * How long the judge waits for a cold lane before it judges (HW7 2026-10-25: the core was still loading its
 * weights, the judge gave up after 8 s and the stub, handed an unplaced line, ruled it theater of mind — Violet
 * saw the tears on his cheeks through a locked door). The mirror waits for the same lane; so does the judge.
 */
export const REACH_WARMUP_WAIT_MS = Number(process.env.PERCEPTION_REACH_WARMUP_WAIT_MS ?? 4 * 60 * 1000);
const REACH_WARMUP_POLL_MS = 5000;

/** Resolves when the lane is ready (or will not be: disabled / offline), or when the wait runs out. */
export async function awaitLaneForReach(readiness: () => Promise<{ phase: string }> = laneReadiness, waitMs = REACH_WARMUP_WAIT_MS, pollMs = REACH_WARMUP_POLL_MS): Promise<string> {
  const until = Date.now() + waitMs;
  let phase = 'host';
  for (;;) {
    try { phase = (await readiness()).phase; } catch { phase = 'offline'; }
    if (phase === 'ready' || phase === 'disabled' || phase === 'offline' || Date.now() >= until) return phase;
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

/**
 * An unplaced event from a known being happens where that being is: the stub (a fallback) then keeps it to
 * that place instead of the whole scene. The model judge still reads the passages. Pure.
 */
export function placeAtSource(event: ReachEvent, beings: ReachBeing[]): ReachEvent {
  if (event.locationId || !event.sourceId) return event;
  const src = beings.find((b) => b.id === event.sourceId);
  return src?.locationId ? { ...event, locationId: src.locationId, locationName: src.locationName ?? null } : event;
}

/** A door the map knows between two rooms, by name. */
export interface WallDoor { name: string; between: string[]; state: string }

/**
 * Sight does not cross a closed door (HW7 2026-10-25: the judge, told nothing of the door, ruled that Violet SAW
 * his smile widen from inside her locked apartment). A being in another room than the event keeps sight only
 * when an OPEN door or opening joins the two rooms; otherwise sight comes off its verdict, and a verdict left
 * with no sense does not reach. Rooms are matched by name, as the map names them. Pure.
 */
export function throughWalls(event: ReachEvent, b: ReachBeing, v: ReachVerdict, doors: WallDoor[], lineOfSight?: boolean): ReachVerdict {
  if (!v.reaches || v.via.includes('self')) return v;
  // The map's own ray (2026-10-27): when both points are known, sight is a straight line against the walls
  // and the doors as they stand — in the same room or not.
  if (lineOfSight === true) return v;
  if (lineOfSight === undefined) {
    if (!event.locationId || !b.locationId || event.locationId === b.locationId) return v;
    const here = (b.locationName ?? '').toLowerCase();
    const there = (event.locationName ?? '').toLowerCase();
    if (!here || !there) return v;
    const joins = doors.filter((d) => { const rooms = d.between.map((r) => r.toLowerCase()); return rooms.includes(here) && rooms.includes(there); });
    const open = joins.some((d) => d.state === 'open');
    if (open) return v;
  }
  const via = v.via.filter((s) => s !== 'sight');
  if (via.length === v.via.length) return v;
  if (!via.length) return { beingId: b.id, reaches: false, via: [], noticed: false, salience: 0 };
  const clarity = v.clarity ? Object.fromEntries(Object.entries(v.clarity).filter(([k]) => k !== 'sight')) : undefined;
  return { ...v, via, ...(clarity ? { clarity } : {}) };
}

/**
 * Line of sight from the event's source to each being on the real map (lib/spatial): a straight ray against
 * the walls, the doors as they stand, archways and windows letting it through. Only beings whose points are
 * known get a verdict; the rest fall back to the room-name rule. Never throws.
 */
async function sightLines(campaignId: string, sourceId: string | null | undefined, beingIds: string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  if (!sourceId) return out;
  try {
    const { map } = await loadWorldLevel(campaignId, await levelOfBeing(sourceId));
    if (!map.rooms.length) return out;
    const src = await beingStanding(map, sourceId);
    if (!src) return out;
    for (const id of beingIds) {
      if (id === sourceId) continue;
      const s = await beingStanding(map, id);
      if (!s) continue;
      out.set(id, lineOfSight(map, src.point, s.point));
    }
  } catch (err) { console.warn('[perception-reach] line of sight unread (room rule applies)', err instanceof Error ? err.message : err); }
  return out;
}

/** The doors around the event's source, as the adjudicator reads them (services/world-apply). Never throws. */
async function doorsAround(sourceId: string | null | undefined): Promise<{ doors: WallDoor[]; lines: string[] }> {
  if (!sourceId) return { doors: [], lines: [] };
  try {
    const map = await actorMap(sourceId);
    return { doors: (map?.doors ?? []).map((d) => ({ name: d.name, between: d.between, state: d.state })), lines: mapFactLines(map) };
  } catch { return { doors: [], lines: [] }; }
}

export async function judgeCanonReach(
  campaignId: string,
  event: ReachEvent,
  characterIds: string[],
  opts: { focusById?: Record<string, string | null | undefined>; model?: ReachModel | null; beings?: ReachBeing[]; atScene?: boolean } = {},
): Promise<ReachJudgement & { beings: ReachBeing[] }> {
  let beings: ReachBeing[] = [];
  let walls: WallDoor[] = [];
  try {
    beings = opts.beings ?? await loadReachBeings(campaignId, characterIds, { focusById: opts.focusById });
    if (opts.atScene) beings = beings.map((b) => ({ ...b, locationId: event.locationId ?? null, locationName: event.locationName ?? b.locationName ?? null }));
    if (!opts.atScene) event = placeAtSource(event, beings);
    // What stands between the rooms: the judge is told the doors, and held to them below.
    if (!opts.atScene) {
      const around = await doorsAround(event.sourceId);
      walls = around.doors;
      if (around.lines.length) event = { ...event, setting: [event.setting, ...around.lines].filter(Boolean).join(' · ') };
    }
    if (event.locationId && !event.locationName) {
      const loc = await prisma.location.findUnique({ where: { id: event.locationId }, select: { name: true } });
      event = { ...event, locationName: loc?.name ?? null };
    }
    if (event.sourceId && !event.sourceName) event = { ...event, sourceName: beings.find((b) => b.id === event.sourceId)?.name ?? null };
  } catch (err) {
    console.warn('[perception-reach] could not load beings; the stub judges a default body', err);
    beings = characterIds.map((id) => ({ id, name: id, locationId: null, senses: senseProfileFromSheet(null) }));
  }
  const model = opts.model === undefined ? reachModelFor(campaignId) : opts.model;
  // A cold lane is waited for, not judged around; a timed-out judge gets one more, longer try before the stub.
  if (model && perceptionReachOn()) {
    const phase = await awaitLaneForReach();
    if (phase !== 'ready' && phase !== 'disabled') console.warn(`[perception-reach] lane ${phase} after the warm-up wait; judging anyway`);
  }
  let j = await judgeReach(event, beings, { model });
  if (j.source === 'fallback' && model && /timed out/.test(j.error ?? '')) {
    console.warn(`[perception-reach] judge timed out after ${j.ms}ms — once more, slower`);
    j = await judgeReach(event, beings, { model, timeoutMs: REACH_TUNING.timeoutMs * 3 });
  }
  if (j.source === 'fallback') console.warn(`[perception-reach] world-sim fell back to the stub after ${j.ms}ms: ${j.error}`);
  if (walls.length || event.locationId) {
    const sight = opts.atScene ? new Map<string, boolean>() : await sightLines(campaignId, event.sourceId, beings.map((b) => b.id));
    for (const b of beings) {
      const v = j.verdicts.get(b.id);
      if (!v) continue;
      const held = throughWalls(event, b, v, walls, sight.get(b.id));
      if (held !== v) { console.log(`[perception-reach] ${b.name}: a wall is a wall — ${v.via.join('+')} → ${held.reaches ? held.via.join('+') : 'nothing'}`); j.verdicts.set(b.id, held); }
    }
  }
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
export async function stampPerception(memoryId: string, v: ReachVerdict, source: ReachJudgement['source'], heardOf?: string): Promise<void> {
  try {
    const row = await prisma.dayaMemoryEntry.findUnique({ where: { id: memoryId }, select: { perceivedVia: true, chain: true } });
    if (!row) return;
    const f = memoryFieldsOf(v, source);
    const merged = mergePerceivedVia(decodePerceivedVia(row.perceivedVia), { via: f.perceivedVia, clarity: f.perceivedClarity ?? {} });
    // The stretch of the line this memory is of, as the table handed it over: the viewer's feed draws only its parts (HW7 2026-10-25).
    let chain: Record<string, unknown> | null = null;
    if (heardOf?.trim()) { try { chain = { ...(JSON.parse(row.chain) as Record<string, unknown>), heardOf: heardOf.trim() }; } catch { chain = null; } }
    await prisma.dayaMemoryEntry.update({ where: { id: memoryId }, data: { noticed: true, ...(chain ? { chain: JSON.stringify(chain) } : {}), perceivedVia: encodePerceivedVia(merged.via, merged.clarity), ...(f.salience !== undefined ? { salience: f.salience } : {}) } });
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
