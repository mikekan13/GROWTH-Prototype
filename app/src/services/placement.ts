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

/** "Studio › Bookcase" — the chain of names above an entity. Pure over a lookup. */
export async function placePath(entityId: string): Promise<string[]> {
  const names: string[] = [];
  let cur: { id: string; type: string } | null = await parentOf(entityId);
  for (let i = 0; cur && i < MAX_DEPTH; i++) {
    const name = cur.type === 'LOCATION'
      ? (await prisma.location.findUnique({ where: { id: cur.id }, select: { name: true } }))?.name
      : (await prisma.campaignItem.findUnique({ where: { id: cur.id }, select: { name: true } }))?.name;
    names.unshift(name ?? '?');
    cur = await parentOf(cur.id);
  }
  return names;
}

export interface PlaceResult { itemId: string; name: string; into: Place; path: string[]; locationId: string | null }

/**
 * Put an item in a room (Location) or inside a container (item). Replaces
 * its single located_at edge, clears any holder (a placed thing is not
 * carried), and sets locationId to the enclosing room.
 */
export async function placeItem(campaignId: string, opts: { item: string; into: string }): Promise<PlaceResult> {
  const items = await prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE', OR: [{ id: opts.item.trim() }, { name: opts.item.trim() }] }, select: { id: true, name: true } });
  const item = items.find(i => i.id === opts.item.trim()) ?? items.find(i => i.name.toLowerCase() === opts.item.trim().toLowerCase());
  if (!item) throw new NotFoundError(`No item "${opts.item}" in this campaign (exact local name or id).`);
  const into = await resolvePlace(campaignId, opts.into);
  if (!into) throw new NotFoundError(`No place "${opts.into}" — a Location or a container item of this campaign.`);
  if (into.kind === 'item' && await isSelfOrDescendant(item.id, into.id)) {
    throw new ValidationError(`"${into.name}" is ${into.id === item.id ? 'the item itself' : `inside "${item.name}"`} — a thing cannot contain itself.`);
  }
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
  return { itemId: item.id, name: item.name, into, path, locationId };
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
