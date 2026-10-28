/**
 * The live canvas model (Mike 2026-10-27: "no reloads — something changes, it
 * changes in everybody's browser"). A typed stream event carries its payload;
 * this pure reducer applies it to the model the canvas already holds, so the
 * token moves, the door redraws, the thing changes hands — in place, with no
 * page re-run. Anything an event cannot describe falls back to re-fetching the
 * model (`needsReload`), never to a navigation.
 */
import type { CanvasNode, CanvasFolder } from '@/types/canvas';
import type { StreamEventData, TokenMovedEvent, DoorChangedEvent, ItemChangedEvent } from '@/types/campaign-events';

export interface LiveModel {
  nodes: CanvasNode[];
  autoFolders: CanvasFolder[];
  locatedAtEdges: Array<{ child: string; parent: string }>;
}

export interface LiveApply {
  model: LiveModel;
  /** The event changed something the model holds. */
  changed: boolean;
  /** The event is one the model cannot apply from its payload — re-fetch. */
  needsReload: boolean;
}

const folderIdOf = (locationId: string) => `auto-${locationId}`;

/** The auto-folder (room) a node is filed in, if any. */
export function roomOfNode(model: LiveModel, nodeId: string): CanvasFolder | null {
  return model.autoFolders.find(f => f.id.startsWith('auto-') && f.nodeIds.includes(nodeId)) ?? null;
}

/** Re-count a folder's members by type (characters vs NPCs by the node's data). */
function recount(folder: CanvasFolder, nodesById: Map<string, CanvasNode>): CanvasFolder {
  if (!folder.locationInfo) return folder;
  const counts = { locations: 0, characters: 0, npcs: 0, items: 0 };
  for (const id of folder.nodeIds) {
    const n = nodesById.get(id);
    // A child Location is a folder, not a node the canvas holds.
    if (!n || n.type === 'location') { counts.locations += 1; continue; }
    else if (n.type === 'character') {
      const isNpc = (n.characterData as { entityType?: unknown } | null | undefined)?.entityType === 'NPC';
      if (isNpc) counts.npcs += 1; else counts.characters += 1;
    } else if (n.type === 'item') counts.items += 1;
  }
  const prev = folder.locationInfo.contentCounts ?? {};
  return { ...folder, locationInfo: { ...folder.locationInfo, contentCounts: { ...prev, ...counts } } };
}

/** Move a node between room folders (null = off every room), fixing the parent graph and counts. */
function refile(model: LiveModel, nodeId: string, roomId: string | null): LiveModel {
  const current = roomOfNode(model, nodeId);
  const currentLoc = current?.locationInfo?.locationId ?? (current ? current.id.slice('auto-'.length) : null);
  if (currentLoc === roomId) return model;
  const nodesById = new Map(model.nodes.map(n => [n.id, n]));
  const target = roomId ? folderIdOf(roomId) : null;
  const autoFolders = model.autoFolders.map(f => {
    if (current && f.id === current.id) return recount({ ...f, nodeIds: f.nodeIds.filter(id => id !== nodeId) }, nodesById);
    if (target && f.id === target && !f.nodeIds.includes(nodeId)) return recount({ ...f, nodeIds: [...f.nodeIds, nodeId] }, nodesById);
    return f;
  });
  const locatedAtEdges = [
    ...model.locatedAtEdges.filter(e => e.child !== nodeId),
    ...(roomId ? [{ child: nodeId, parent: roomId }] : []),
  ];
  return { ...model, autoFolders, locatedAtEdges };
}

function applyTokenMoved(model: LiveModel, ev: TokenMovedEvent): LiveApply {
  const idx = model.nodes.findIndex(n => n.id === ev.entityId);
  if (idx < 0) return { model, changed: false, needsReload: true }; // a token we do not hold yet (new on the map)
  const node = model.nodes[idx];
  const roomName = ev.roomName ?? undefined;
  const nextNode: CanvasNode = {
    ...node,
    x: ev.x,
    y: ev.y,
    placedAt: ev.placedAt,
    ...(node.type === 'item' ? { roomId: ev.roomId ?? undefined, ...(roomName !== undefined ? { locationName: roomName ?? undefined } : {}) } : {}),
  };
  const nodes = model.nodes.slice();
  nodes[idx] = nextNode;
  let next: LiveModel = { ...model, nodes };
  next = refile(next, ev.entityId, ev.roomId);
  return { model: next, changed: true, needsReload: false };
}

function applyDoorChanged(model: LiveModel, ev: DoorChangedEvent): LiveApply {
  const fid = folderIdOf(ev.locationId);
  let changed = false;
  const autoFolders = model.autoFolders.map(f => {
    if (f.id !== fid || !f.locationInfo?.openings) return f;
    const openings = f.locationInfo.openings.map(o => {
      if (o.id !== ev.openingId) return o;
      if (o.state === ev.state) return o;
      changed = true;
      return { ...o, state: ev.state };
    });
    return changed ? { ...f, locationInfo: { ...f.locationInfo, openings } } : f;
  });
  if (!changed) {
    // The home is not one we hold, or the opening is unknown here — the drawn map may be stale.
    const known = model.autoFolders.some(f => f.id === fid && f.locationInfo?.openings?.some(o => o.id === ev.openingId));
    return { model, changed: false, needsReload: !known };
  }
  return { model: { ...model, autoFolders }, changed: true, needsReload: false };
}

function applyItemChanged(model: LiveModel, ev: ItemChangedEvent): LiveApply {
  const idx = model.nodes.findIndex(n => n.id === ev.itemId && n.type === 'item');
  if (idx < 0) return { model, changed: false, needsReload: true };
  const node = model.nodes[idx];
  const holderName = ev.holderId ? model.nodes.find(n => n.id === ev.holderId)?.name ?? ev.holderName ?? undefined : undefined;
  const locationName = ev.locationId
    ? model.autoFolders.find(f => f.locationInfo?.locationId === ev.locationId)?.name ?? node.locationName
    : undefined;
  const nextNode: CanvasNode = {
    ...node,
    holderId: ev.holderId,
    holderName,
    locationName,
    roomId: ev.holderId ? undefined : ev.locationId ?? undefined,
    ...(typeof ev.x === 'number' && typeof ev.y === 'number' ? { x: ev.x, y: ev.y } : {}),
    ...(typeof ev.placedAt === 'number' ? { placedAt: ev.placedAt } : {}),
  };
  const nodes = model.nodes.slice();
  nodes[idx] = nextNode;
  let next: LiveModel = { ...model, nodes };
  // A held thing is drawn on its holder's card, not the floor: it leaves the room folder; a thing put down joins it.
  next = refile(next, ev.itemId, ev.holderId ? null : ev.locationId);
  return { model: next, changed: true, needsReload: false };
}

/**
 * Apply one stream event to the model. Returns the same model object when
 * nothing changed, so callers can skip a state write.
 */
export function applyLiveEvent(model: LiveModel, event: StreamEventData): LiveApply {
  switch (event.kind) {
    case 'token_moved': return applyTokenMoved(model, event);
    case 'door_changed': return applyDoorChanged(model, event);
    case 'item_changed': return applyItemChanged(model, event);
    case 'map_changed':
    case 'character_update':
      return { model, changed: false, needsReload: true };
    default:
      return { model, changed: false, needsReload: false };
  }
}

/** A fetched model is the same picture when every node's id, place and placement stamp match, and folders match. */
export function sameModel(a: LiveModel, b: LiveModel): boolean {
  if (a.nodes.length !== b.nodes.length || a.autoFolders.length !== b.autoFolders.length || a.locatedAtEdges.length !== b.locatedAtEdges.length) return false;
  const key = (n: CanvasNode) => `${n.id}|${n.type}|${n.x}|${n.y}|${n.placedAt ?? ''}|${n.status ?? ''}|${n.holderId ?? ''}|${n.roomId ?? ''}|${n.name}|${n.portrait ?? ''}|${n.awaitingImage ? 1 : 0}`;
  for (let i = 0; i < a.nodes.length; i++) if (key(a.nodes[i]) !== key(b.nodes[i])) return false;
  const fkey = (f: CanvasFolder) => `${f.id}|${f.name}|${f.nodeIds.join(',')}|${f.posX ?? ''}|${f.posY ?? ''}|${f.placedAt ?? ''}|${JSON.stringify(f.locationInfo ?? null)}`;
  for (let i = 0; i < a.autoFolders.length; i++) if (fkey(a.autoFolders[i]) !== fkey(b.autoFolders[i])) return false;
  for (let i = 0; i < a.locatedAtEdges.length; i++) if (a.locatedAtEdges[i].child !== b.locatedAtEdges[i].child || a.locatedAtEdges[i].parent !== b.locatedAtEdges[i].parent) return false;
  return true;
}

/** Length of a polyline in world units. */
export function pathLength(path: Array<{ x: number; y: number }>): number {
  let d = 0;
  for (let i = 1; i < path.length; i++) d += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return d;
}

/** How long a token takes to walk its path on screen: 3 ms per world unit, 0.4–2.5 s. */
export function tweenDurationMs(path: Array<{ x: number; y: number }>): number {
  return Math.max(400, Math.min(2500, pathLength(path) * 3));
}

/** The point `t` (0..1) of the way along a polyline, by distance. */
export function pointAlong(path: Array<{ x: number; y: number }>, t: number): { x: number; y: number } {
  if (!path.length) return { x: 0, y: 0 };
  if (path.length === 1 || t <= 0) return { ...path[0] };
  const total = pathLength(path);
  if (t >= 1 || total === 0) return { ...path[path.length - 1] };
  let want = t * total;
  for (let i = 1; i < path.length; i++) {
    const seg = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    if (want <= seg) {
      const k = seg === 0 ? 0 : want / seg;
      return { x: path[i - 1].x + (path[i].x - path[i - 1].x) * k, y: path[i - 1].y + (path[i].y - path[i - 1].y) * k };
    }
    want -= seg;
  }
  return { ...path[path.length - 1] };
}
