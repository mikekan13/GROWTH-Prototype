/**
 * Last known (Mike 2026-10-28): a Trailblazer's map shows each being, thing and door where their character
 * LAST KNEW it — written when they see it (the point) or hear it (the room), read to draw the map they load.
 * Nothing ever perceived is not on their map at all; a door never perceived is drawn closed (a shut door and a
 * locked one look the same from outside). The Watcher reads the truth and never comes here.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import type { CanvasNode, CanvasFolder } from '@/types/canvas';
import type { Connection } from '@/types/canvas';
import type { PerceivedBy } from '@/types/campaign-events';

export interface LastKnownRow {
  viewerId: string;
  subjectId: string;
  kind: 'being' | 'thing' | 'door';
  known: 'point' | 'room';
  x: number | null;
  y: number | null;
  roomId: string | null;
  state: string | null;
}

export interface Perceivable {
  subjectId: string;
  kind: 'being' | 'thing' | 'door';
  /** The true point (beings and things). */
  at?: { x: number; y: number };
  /** The room's centre — what a room-grade viewer gets instead of the point. */
  roomPoint?: { x: number; y: number };
  roomId?: string | null;
  /** The door's state (doors). */
  state?: string;
}

/**
 * Write what each grading viewer now knows of the subject (grade `none` leaves their last known as it was).
 * Returns the viewers whose knowledge actually changed (a row already saying the same is not rewritten). Never throws.
 */
export async function recordPerceived(campaignId: string, subject: Perceivable, perceivedBy: PerceivedBy): Promise<Set<string>> {
  const changed = new Set<string>();
  try {
    for (const [viewerId, grade] of Object.entries(perceivedBy)) {
      if (grade === 'none' || viewerId === subject.subjectId) continue;
      const p = grade === 'point' ? subject.at : subject.roomPoint ?? subject.at;
      const data = { campaignId, viewerId, subjectId: subject.subjectId, kind: subject.kind, known: grade, x: p?.x ?? null, y: p?.y ?? null, roomId: subject.roomId ?? null, state: subject.state ?? null };
      const had = await prisma.lastKnown.findUnique({ where: { viewerId_subjectId: { viewerId, subjectId: subject.subjectId } }, select: { known: true, x: true, y: true, roomId: true, state: true } });
      if (had && had.known === data.known && had.x === data.x && had.y === data.y && had.roomId === data.roomId && had.state === data.state) continue;
      await prisma.lastKnown.upsert({ where: { viewerId_subjectId: { viewerId, subjectId: subject.subjectId } }, create: { ...data, seenAt: new Date() }, update: { ...data, seenAt: new Date() } });
      changed.add(viewerId);
    }
  } catch (err) { console.warn('[last-known] not recorded', err instanceof Error ? err.message : err); }
  return changed;
}

/** Everything one viewer last knew in a campaign. */
export async function lastKnownFor(campaignId: string, viewerId: string): Promise<LastKnownRow[]> {
  const rows = await prisma.lastKnown.findMany({ where: { campaignId, viewerId }, select: { viewerId: true, subjectId: true, kind: true, known: true, x: true, y: true, roomId: true, state: true } });
  return rows as LastKnownRow[];
}

export interface FoggableModel {
  nodes: CanvasNode[];
  connections: Connection[];
  autoFolders: CanvasFolder[];
  locatedAtEdges: Array<{ child: string; parent: string }>;
}

const folderIdOf = (locationId: string) => `auto-${locationId}`;

/**
 * The map as one character knows it (pure): their own token and what they hold stay the truth; every other
 * being or thing stands where they last knew it (greyed when only heard) or is absent; doors they never
 * perceived are drawn closed; places and everything that is not a token are untouched.
 */
export function fogCanvasModel<M extends FoggableModel>(model: M, viewerId: string, rows: LastKnownRow[]): M {
  const known = new Map(rows.map((r) => [r.subjectId, r]));
  const keep = new Set<string>();
  const place = new Map<string, LastKnownRow>();
  const isToken = (n: CanvasNode) => n.type === 'character' || n.type === 'npc' || n.type === 'item';
  const tokens = new Set(model.nodes.filter(isToken).map((n) => n.id));
  // Ids the model refers to that are not tokens (child places, quests) are not fogged.
  const dropped = (id: string) => tokens.has(id) && !keep.has(id);
  for (const n of model.nodes) {
    if (!isToken(n)) { keep.add(n.id); continue; }
    if (n.id === viewerId) { keep.add(n.id); continue; }
    if (n.type === 'item' && n.holderId) {
      // A held thing goes where its holder goes: own hands = truth; a perceived holder = shown on them; else absent.
      if (n.holderId === viewerId || known.has(n.holderId)) keep.add(n.id);
      continue;
    }
    const lk = known.get(n.id);
    if (lk && lk.kind !== 'door') { keep.add(n.id); place.set(n.id, lk); }
  }
  const nodes = model.nodes.filter((n) => keep.has(n.id)).map((n) => {
    const lk = place.get(n.id);
    if (!lk) return n;
    return {
      ...n,
      ...(typeof lk.x === 'number' && typeof lk.y === 'number' ? { x: lk.x, y: lk.y } : {}),
      unseen: lk.known === 'room',
      ...(n.type === 'item' ? { roomId: lk.roomId ?? undefined } : {}),
    };
  });
  const autoFolders = model.autoFolders.map((f) => {
    let nodeIds = f.nodeIds.filter((id) => !dropped(id));
    // Re-file the placed tokens into the room they were last known in.
    nodeIds = nodeIds.filter((id) => { const lk = place.get(id); return !lk || !lk.roomId || folderIdOf(lk.roomId) === f.id; });
    for (const [id, lk] of place) if (lk.roomId && folderIdOf(lk.roomId) === f.id && !nodeIds.includes(id)) nodeIds.push(id);
    const openings = f.locationInfo?.openings?.map((o) => {
      if (!o.state) return o;
      const lk = known.get(o.id);
      return { ...o, state: (lk?.state as typeof o.state) ?? 'closed' };
    });
    return { ...f, nodeIds, ...(openings ? { locationInfo: { ...f.locationInfo!, openings } } : {}) };
  });
  const locatedAtEdges = [
    ...model.locatedAtEdges.filter((e) => !dropped(e.child) && !place.has(e.child)),
    ...[...place].flatMap(([id, lk]) => (lk.roomId ? [{ child: id, parent: lk.roomId }] : [])),
  ];
  const connections = model.connections.filter((c) => !dropped(c.from) && !dropped(c.to));
  return { ...model, nodes, autoFolders, locatedAtEdges, connections };
}
