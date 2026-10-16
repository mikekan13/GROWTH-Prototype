/**
 * PLACEMENT (Mike 2026-10-16): "A jumble mess of items. We need organization
 * and JEWL needs to know how to use it. The canvas can be imagined as a top
 * down view and things can be placed accordingly — just like any map in any
 * tabletop game. Also some items can contain other items. Like boxes and
 * bookshelves and basically anything… A bookcase can hold things."
 *
 * One law, already the canvas's: physical containment is the `located_at`
 * edge, child → parent, ONE parent. A room is a Location inside the home;
 * a bookcase is an item inside the room; a book is an item inside the
 * bookcase. `CampaignItem.locationId` stays the ENCLOSING ROOM (walked up
 * the chain) so room queries keep working. Ownership (`owns`) is separate.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { createLocation, setLocationParent, updateLocation } from '@/services/location';
import { establishFact, supersede } from '@/daya/world-ledger';

const REL = 'located_at';
const MAX_DEPTH = 12;

export type Place = { kind: 'location'; id: string; name: string } | { kind: 'item'; id: string; name: string; locationId: string | null };

/** A Location or a container item of this campaign, by id or exact name (case-insensitive). */
export async function resolvePlace(campaignId: string, ref: string): Promise<Place | null> {
  const r = ref.trim();
  if (!r) return null;
  const locs = await prisma.location.findMany({ where: { campaignId }, select: { id: true, name: true } });
  const loc = locs.find(l => l.id === r) ?? locs.find(l => l.name.toLowerCase() === r.toLowerCase());
  if (loc) return { kind: 'location', id: loc.id, name: loc.name };
  const items = await prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE', OR: [{ id: r }, { name: r }] }, select: { id: true, name: true, locationId: true } });
  const it = items.find(i => i.id === r) ?? items.find(i => i.name.toLowerCase() === r.toLowerCase()) ?? null;
  if (it) return { kind: 'item', id: it.id, name: it.name, locationId: it.locationId };
  const loose = await prisma.campaignItem.findFirst({ where: { campaignId, status: 'ACTIVE', name: { equals: r } }, select: { id: true, name: true, locationId: true } });
  return loose ? { kind: 'item', id: loose.id, name: loose.name, locationId: loose.locationId } : null;
}

/** The parent (located_at target) of an entity, if any. */
async function parentOf(entityId: string): Promise<{ id: string; type: string } | null> {
  const e = await prisma.entityRelationship.findFirst({ where: { sourceId: entityId, relationshipType: REL }, select: { targetId: true, targetType: true } });
  return e ? { id: e.targetId, type: e.targetType } : null;
}

/** Walk up from an item to the Location that encloses it (null when loose). */
export async function enclosingLocationId(itemId: string): Promise<string | null> {
  let cur: { id: string; type: string } | null = await parentOf(itemId);
  for (let i = 0; cur && i < MAX_DEPTH; i++) {
    if (cur.type === 'LOCATION') return cur.id;
    cur = await parentOf(cur.id);
  }
  return null;
}

/** Is `candidate` the item itself or somewhere below it? (cycle guard) */
async function isSelfOrDescendant(itemId: string, candidate: string): Promise<boolean> {
  if (candidate === itemId) return true;
  let cur: { id: string; type: string } | null = await parentOf(candidate);
  for (let i = 0; cur && i < MAX_DEPTH; i++) {
    if (cur.id === itemId) return true;
    cur = await parentOf(cur.id);
  }
  return false;
}

export interface PlaceLink { kind: 'location' | 'item'; id: string; name: string }

/** The chain above an entity, root first, with kinds (what placePath renders). */
export async function placeChain(entityId: string): Promise<PlaceLink[]> {
  const chain: PlaceLink[] = [];
  let cur: { id: string; type: string } | null = await parentOf(entityId);
  for (let i = 0; cur && i < MAX_DEPTH; i++) {
    const isLoc = cur.type === 'LOCATION';
    const name = isLoc
      ? (await prisma.location.findUnique({ where: { id: cur.id }, select: { name: true } }))?.name
      : (await prisma.campaignItem.findUnique({ where: { id: cur.id }, select: { name: true } }))?.name;
    chain.unshift({ kind: isLoc ? 'location' : 'item', id: cur.id, name: name ?? '?' });
    cur = await parentOf(cur.id);
  }
  return chain;
}

/** "Studio › Bookcase" — the chain of names above an entity. Pure over a lookup. */
export async function placePath(entityId: string): Promise<string[]> {
  return (await placeChain(entityId)).map(l => l.name);
}

export interface PlaceResult { itemId: string; name: string; into: Place; path: string[]; locationId: string | null; warnings?: string[] }

/**
 * Put an item in a room (Location) or inside a container (item). Replaces
 * its single located_at edge, clears any holder (a placed thing is not
 * carried), and sets locationId to the enclosing room.
 */
export async function placeItem(campaignId: string, opts: { item: string; into: string }): Promise<PlaceResult> {
  const items = await prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE', OR: [{ id: opts.item.trim() }, { name: opts.item.trim() }] }, select: { id: true, name: true, data: true } });
  const item = items.find(i => i.id === opts.item.trim()) ?? items.find(i => i.name.toLowerCase() === opts.item.trim().toLowerCase());
  if (!item) throw new NotFoundError(`No item "${opts.item}" in this campaign (exact local name or id).`);
  const into = await resolvePlace(campaignId, opts.into);
  if (!into) throw new NotFoundError(`No place "${opts.into}" — a Location or a container item of this campaign.`);
  if (into.kind === 'item' && await isSelfOrDescendant(item.id, into.id)) {
    throw new ValidationError(`"${into.name}" is ${into.id === item.id ? 'the item itself' : `inside "${item.name}"`} — a thing cannot contain itself.`);
  }
  // CAPACITY (Mike 2026-10-16: "I can't put a whale in my apartment").
  const { assertFits, bulkOf } = await import('./capacity');
  let itemData: Record<string, unknown> = {};
  try { itemData = JSON.parse((item as { data?: string }).data ?? '{}') as Record<string, unknown>; } catch { itemData = {}; }
  const warnings = await assertFits(into, bulkOf(item.name, itemData), item.id);
  const locationId = into.kind === 'location' ? into.id : (into.locationId ?? await enclosingLocationId(into.id));
  await prisma.$transaction([
    prisma.entityRelationship.deleteMany({ where: { sourceId: item.id, relationshipType: REL } }),
    prisma.entityRelationship.create({
      data: {
        campaignId, sourceId: item.id, sourceType: 'CAMPAIGN_ITEM',
        targetId: into.id, targetType: into.kind === 'location' ? 'LOCATION' : 'CAMPAIGN_ITEM',
        relationshipType: REL, strength: 5,
      },
    }),
    prisma.campaignItem.update({ where: { id: item.id }, data: { locationId, holderId: null } }),
  ]);
  const path = await placePath(item.id);
  return { itemId: item.id, name: item.name, into, path, locationId, ...(warnings.length ? { warnings } : {}) };
}

export interface PlaceNode { id: string; kind: 'location' | 'item'; name: string; children: PlaceNode[] }

/** The tree under a Location: rooms (child Locations) and things, nested by container. */
export async function contentsTree(locationId: string, depth = 0): Promise<PlaceNode[]> {
  if (depth > MAX_DEPTH) return [];
  const edges = await prisma.entityRelationship.findMany({ where: { targetId: locationId, relationshipType: REL }, select: { sourceId: true, sourceType: true }, orderBy: { createdAt: 'asc' } });
  return buildChildren(edges, depth);
}

async function buildChildren(edges: Array<{ sourceId: string; sourceType: string }>, depth: number): Promise<PlaceNode[]> {
  const out: PlaceNode[] = [];
  for (const e of edges) {
    if (e.sourceType === 'LOCATION') {
      const l = await prisma.location.findUnique({ where: { id: e.sourceId }, select: { id: true, name: true } });
      if (l) out.push({ id: l.id, kind: 'location', name: l.name, children: await contentsTree(l.id, depth + 1) });
    } else if (e.sourceType === 'CAMPAIGN_ITEM' || e.sourceType === 'ITEM') {
      const it = await prisma.campaignItem.findUnique({ where: { id: e.sourceId }, select: { id: true, name: true, status: true } });
      if (!it || it.status !== 'ACTIVE') continue;
      const inner = depth + 1 > MAX_DEPTH ? [] : await prisma.entityRelationship.findMany({ where: { targetId: it.id, relationshipType: REL }, select: { sourceId: true, sourceType: true }, orderBy: { createdAt: 'asc' } });
      out.push({ id: it.id, kind: 'item', name: it.name, children: await buildChildren(inner, depth + 1) });
    }
  }
  return out;
}

/** The tree as indented lines for a brief. Pure. */
export function renderTree(nodes: PlaceNode[], indent = 0): string[] {
  const lines: string[] = [];
  for (const n of nodes) {
    lines.push(`${'  '.repeat(indent)}${n.kind === 'location' ? '▣' : '·'} ${n.name}${n.children.length ? ` (${n.children.length})` : ''}`);
    lines.push(...renderTree(n.children, indent + 1));
  }
  return lines;
}

// ---------------------------------------------------------------------------
// ONE PLAN, CODE APPLIES (Mike 2026-10-16: "why did he stop... it took him a
// very long time... we need a way to make this extremely quick"). JEWL thinks
// once — rooms, placements, descriptions, state facts — and this service
// applies it deterministically. Placement facts are DERIVED from the map so
// the three stores (located_at edges, WorldFacts, Location descriptions)
// cannot disagree ([[ruling-novels-are-worlds-canvas-is-the-map-consistency-2026-10-16]]).
// ---------------------------------------------------------------------------

export interface LayoutActor { userId: string; role: string }

export interface LayoutPlan {
  /** Rooms to ensure (child Locations of `parent`). Existing names are reused, never duplicated. */
  rooms?: Array<{ name: string; parent: string; description?: string }>;
  /** Thing → room or container. Applied in order (containers before contents). */
  placements?: Array<{ item: string; into: string }>;
  /** The truth of each place, present tense (Location.data.description). */
  descriptions?: Array<{ location: string; description: string }>;
  /** STATE facts only (surfaces, condition, sounds). Placement keys are derived and rejected here. */
  facts?: Array<{ subjectKey: string; fact: string }>;
  /** Fact key prefix for this place (e.g. "violet_apartment"). Defaults to the slug of the root Location. */
  factPrefix?: string;
}

export interface LayoutReport {
  roomsCreated: string[];
  placed: number;
  described: number;
  factsWritten: number;
  /** Derived placement keys written this run (one per placed thing). */
  derivedKeys: string[];
  rejected: Array<{ subjectKey: string; reason: string }>;
  errors: string[];
}

/** "The reading corner shelf" -> "reading_corner_shelf". Stable key segment. Pure. */
export function slugKey(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/^(the|a|an|her|his|their)\s+/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return s || 'thing';
}

/**
 * The derived placement key + sentence for a thing from its chain (root first).
 * `<prefix>.<room_slug>.<container_slug...>.<item_slug>`; the room segment is
 * omitted when the thing sits directly in the root place. Pure.
 */
export function derivePlacement(prefix: string, itemName: string, chain: PlaceLink[]): { key: string; fact: string } {
  const locs = chain.filter(l => l.kind === 'location');
  const room = locs.length > 1 ? locs[locs.length - 1] : null;
  const roomIdx = room ? chain.lastIndexOf(room) : chain.findIndex(l => l.kind === 'location');
  const containers = chain.slice(roomIdx + 1).filter(l => l.kind === 'item');
  const segs = [prefix, ...(room ? [slugKey(room.name)] : []), ...containers.map(c => slugKey(c.name)), slugKey(itemName)];
  const where = room?.name ?? locs[0]?.name ?? 'the world';
  const inside = containers.length ? `, inside ${containers.map(c => c.name).join(', inside ')}` : '';
  return { key: segs.join('.'), fact: `${itemName} is in ${where}${inside}.` };
}

/** The sentence shape every derived placement fact has — how a stale one is recognised. */
function isDerivedFactFor(itemName: string, fact: string): boolean {
  return fact.startsWith(`${itemName} is in `);
}

async function latestCycle(campaignId: string): Promise<number> {
  const latest = await prisma.worldFact.aggregate({ where: { campaignId }, _max: { establishedAtCycle: true } });
  return latest._max.establishedAtCycle ?? 0;
}

type LiveFact = { id: string; subjectKey: string; fact: string };

/** Live facts under a prefix, as a mutable map the writers keep current. */
async function liveUnder(campaignId: string, prefix: string): Promise<Map<string, LiveFact>> {
  const rows = await prisma.worldFact.findMany({
    where: { campaignId, supersededById: null, subjectKey: { startsWith: `${prefix}.` } },
    select: { id: true, subjectKey: true, fact: true },
  });
  return new Map(rows.map(r => [r.subjectKey, r]));
}

/** Supersede-or-establish on one key, keeping the live map current. */
async function writeFact(campaignId: string, live: Map<string, LiveFact>, key: string, fact: string, cycle: number): Promise<LiveFact> {
  const cur = live.get(key);
  const rec = cur ? await supersede(cur.id, { fact, cycle }) : await establishFact(campaignId, key, fact, cycle);
  const out = { id: rec.id, subjectKey: key, fact };
  live.set(key, out);
  return out;
}

/**
 * Write the derived placement fact for each placed thing and retire the
 * stale derived fact it had under another key (a moved thing keeps ONE
 * live placement fact; the old row points at the new).
 */
async function derivePlacementFacts(
  campaignId: string, prefix: string, placed: PlaceResult[], live: Map<string, LiveFact>, cycle: number,
): Promise<string[]> {
  const keys: string[] = [];
  for (const p of placed) {
    const chain = await placeChain(p.itemId);
    const { key, fact } = derivePlacement(prefix, p.name, chain);
    const written = await writeFact(campaignId, live, key, fact, cycle);
    keys.push(key);
    const itemSuffix = `.${slugKey(p.name)}`;
    for (const [k, f] of [...live]) {
      if (k !== key && k.endsWith(itemSuffix) && isDerivedFactFor(p.name, f.fact)) {
        await prisma.worldFact.update({ where: { id: f.id }, data: { supersededById: written.id } });
        live.delete(k);
      }
    }
  }
  return keys;
}

/** The root Location above a place (walk up located_at). */
async function rootLocationName(campaignId: string, ref: string): Promise<string | null> {
  const place = await resolvePlace(campaignId, ref);
  if (!place) return null;
  const chain = await placeChain(place.id);
  const top = chain.find(l => l.kind === 'location');
  return top?.name ?? (place.kind === 'location' ? place.name : null);
}

async function readLocationData(locationId: string): Promise<Record<string, unknown>> {
  const row = await prisma.location.findUnique({ where: { id: locationId }, select: { data: true } });
  try { return row?.data ? (JSON.parse(row.data) as Record<string, unknown>) : {}; } catch { return {}; }
}

/**
 * Apply a whole layout plan: rooms -> placements -> descriptions -> derived
 * placement facts -> state facts. Each entry fails alone (reported in
 * `errors`); the rest still lands.
 */
export async function applyLayout(campaignId: string, actor: LayoutActor, plan: LayoutPlan): Promise<LayoutReport> {
  const report: LayoutReport = { roomsCreated: [], placed: 0, described: 0, factsWritten: 0, derivedKeys: [], rejected: [], errors: [] };
  const descriptions = [...(plan.descriptions ?? [])];

  // 1. Rooms — reuse by name, create the missing ones under their parent.
  for (const room of plan.rooms ?? []) {
    try {
      const existing = await resolvePlace(campaignId, room.name);
      if (existing?.kind === 'location') {
        if (room.description) descriptions.push({ location: existing.id, description: room.description });
        continue;
      }
      const parent = await resolvePlace(campaignId, room.parent);
      if (!parent || parent.kind !== 'location') throw new NotFoundError(`No Location "${room.parent}" to put "${room.name}" in.`);
      const created = await createLocation(campaignId, actor.userId, actor.role, {
        name: room.name,
        type: 'point_of_interest',
        data: { description: room.description ?? '', tags: [], features: [], connections: [] },
      });
      await setLocationParent(campaignId, actor.userId, actor.role, created.id, parent.id);
      report.roomsCreated.push(room.name);
    } catch (e) {
      report.errors.push(`room "${room.name}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 2. Placements, in plan order (containers first, then their contents).
  const placed: PlaceResult[] = [];
  for (const p of plan.placements ?? []) {
    try {
      placed.push(await placeItem(campaignId, { item: p.item, into: p.into }));
      report.placed++;
    } catch (e) {
      report.errors.push(`place "${p.item}" into "${p.into}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 3. Descriptions — the truth of each place, merged into Location.data.
  for (const d of descriptions) {
    try {
      const loc = await resolvePlace(campaignId, d.location);
      if (!loc || loc.kind !== 'location') throw new NotFoundError(`No Location "${d.location}" to describe.`);
      const data = await readLocationData(loc.id);
      await updateLocation(loc.id, campaignId, actor.userId, actor.role, { data: { ...data, description: d.description } });
      report.described++;
    } catch (e) {
      report.errors.push(`describe "${d.location}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 4. Facts — placement derived from the map; JEWL's entries are state only.
  const wantsFacts = placed.length > 0 || (plan.facts?.length ?? 0) > 0;
  if (wantsFacts) {
    const firstRef = plan.placements?.[0]?.into ?? plan.rooms?.[0]?.parent ?? plan.descriptions?.[0]?.location;
    const prefix = plan.factPrefix?.trim() || slugKey((firstRef && await rootLocationName(campaignId, firstRef)) || 'world');
    const cycle = await latestCycle(campaignId);
    const live = await liveUnder(campaignId, prefix);
    const derived = await derivePlacementFacts(campaignId, prefix, placed, live, cycle);
    report.derivedKeys = derived;
    report.factsWritten += derived.length;
    const derivedSet = new Set(derived);
    for (const f of plan.facts ?? []) {
      const key = f.subjectKey.trim();
      if (derivedSet.has(key)) {
        report.rejected.push({ subjectKey: key, reason: `"${key}" is a placement key — written from the map, not by hand. Move the thing instead; write only its state under another key.` });
        continue;
      }
      try {
        await writeFact(campaignId, live, key, f.fact, cycle);
        report.factsWritten++;
      } catch (e) {
        report.errors.push(`fact "${key}": ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return report;
}

export interface MoveResult { item: string; into: string; ok: boolean; path?: string[]; error?: string }

/** Batch moves; each fails alone. With `factPrefix`, re-derives the moved things' placement facts. */
export async function moveItems(
  campaignId: string, moves: Array<{ item: string; into: string }>, opts: { factPrefix?: string } = {},
): Promise<{ results: MoveResult[]; moved: number; derivedKeys: string[] }> {
  const results: MoveResult[] = [];
  const placed: PlaceResult[] = [];
  for (const m of moves) {
    try {
      const r = await placeItem(campaignId, m);
      placed.push(r);
      results.push({ item: m.item, into: m.into, ok: true, path: r.path });
    } catch (e) {
      results.push({ item: m.item, into: m.into, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  let derivedKeys: string[] = [];
  if (opts.factPrefix && placed.length) {
    const cycle = await latestCycle(campaignId);
    const live = await liveUnder(campaignId, opts.factPrefix);
    derivedKeys = await derivePlacementFacts(campaignId, opts.factPrefix, placed, live, cycle);
  }
  return { results, moved: placed.length, derivedKeys };
}
