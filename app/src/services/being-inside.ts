/**
 * ENTITIES INSIDE THINGS (ruling 12, Michael 2026-11-04: "we will need entities inside other things.... You could even have
 * entities inside other entities"). A being can sit INSIDE a thing (Kristopher in the Fusion, a body in a coffin, a rider in an
 * elevator) or inside another being (carried, ridden, a passenger of a living ship). The relation is one edge:
 *   CHARACTER --inside--> CAMPAIGN_ITEM | CHARACTER
 * The being keeps its room edge (located_at a LOCATION): its room IS the container's room, so every room-based path (reach,
 * standing, routines) keeps working. The canvas draws the being at its container's point (canvas-model). What is still owed
 * (Day 8): perception THROUGH the container (a car's windows, a closed trunk), entering and leaving as adjudicated ops.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { stampBeingPoint } from '@/services/spatial-world';
import { broadcastEvent } from '@/lib/campaign-stream';

export const INSIDE_REL = 'inside';

export interface InsideEdge { containerId: string; containerType: 'CAMPAIGN_ITEM' | 'CHARACTER'; containerName: string }

/** What a being is inside of, if anything. */
export async function insideOf(characterId: string): Promise<InsideEdge | null> {
  const e = await prisma.entityRelationship.findFirst({ where: { sourceId: characterId, sourceType: 'CHARACTER', relationshipType: INSIDE_REL }, select: { targetId: true, targetType: true } });
  if (!e) return null;
  const name = e.targetType === 'CHARACTER'
    ? (await prisma.character.findUnique({ where: { id: e.targetId }, select: { name: true } }))?.name
    : (await prisma.campaignItem.findUnique({ where: { id: e.targetId }, select: { name: true } }))?.name;
  return { containerId: e.targetId, containerType: e.targetType === 'CHARACTER' ? 'CHARACTER' : 'CAMPAIGN_ITEM', containerName: name ?? e.targetId };
}

/** The room and the point of a container: an item's located_at room + its token point, or a being's room + stored point. */
async function containerStanding(campaignId: string, id: string, type: 'CAMPAIGN_ITEM' | 'CHARACTER'): Promise<{ roomId: string | null; point: { x: number; y: number } | null }> {
  if (type === 'CHARACTER') {
    const c = await prisma.character.findUnique({ where: { id }, select: { data: true } });
    let point: { x: number; y: number } | null = null;
    try { const d = JSON.parse(c?.data ?? '{}') as { canvasX?: number; canvasY?: number }; if (typeof d.canvasX === 'number' && typeof d.canvasY === 'number') point = { x: d.canvasX, y: d.canvasY }; } catch { /* none */ }
    const room = await prisma.entityRelationship.findFirst({ where: { sourceId: id, relationshipType: 'located_at', targetType: 'LOCATION' }, select: { targetId: true } });
    return { roomId: room?.targetId ?? null, point };
  }
  const edge = await prisma.entityRelationship.findFirst({ where: { campaignId, sourceId: id, relationshipType: 'located_at', targetType: 'LOCATION' }, select: { targetId: true, data: true } });
  if (!edge) return { roomId: null, point: null };
  let point: { x: number; y: number } | null = null;
  try {
    const d = edge.data ? JSON.parse(edge.data) as { position?: { x?: number; y?: number } } : null;
    const room = await prisma.location.findUnique({ where: { id: edge.targetId }, select: { data: true } });
    const fp = room ? (JSON.parse(room.data) as { footprint?: { points?: Array<{ x: number; y: number }> } }).footprint?.points : undefined;
    if (d?.position && typeof d.position.x === 'number' && typeof d.position.y === 'number' && fp?.length) {
      const xs = fp.map((p) => p.x), ys = fp.map((p) => p.y);
      const minX = Math.min(...xs), minY = Math.min(...ys), w = Math.max(...xs) - minX, h = Math.max(...ys) - minY;
      point = { x: minX + d.position.x * w, y: minY + d.position.y * h };
    }
  } catch { /* no point */ }
  return { roomId: edge.targetId, point };
}

/**
 * Seat a being inside a thing or another being (or take it out: containerId null). The being's room becomes the
 * container's room and its token moves to the container's point. Broadcasts the move so open canvases follow.
 */
export async function seatBeingIn(
  campaignId: string,
  characterId: string,
  container: { id: string; type: 'CAMPAIGN_ITEM' | 'CHARACTER' } | null,
  cause: 'sim' | 'gm' | 'jewl' = 'gm',
): Promise<InsideEdge | null> {
  const being = await prisma.character.findUnique({ where: { id: characterId }, select: { id: true, name: true, campaignId: true } });
  if (!being || being.campaignId !== campaignId) throw new NotFoundError('Being not found in this campaign');
  await prisma.entityRelationship.deleteMany({ where: { sourceId: characterId, sourceType: 'CHARACTER', relationshipType: INSIDE_REL } });
  if (!container) return null;
  if (container.id === characterId) throw new ValidationError('A being cannot be inside itself');
  const exists = container.type === 'CHARACTER'
    ? await prisma.character.findUnique({ where: { id: container.id }, select: { id: true, name: true } })
    : await prisma.campaignItem.findUnique({ where: { id: container.id }, select: { id: true, name: true } });
  if (!exists) throw new NotFoundError('Container not found');
  await prisma.entityRelationship.create({ data: { campaignId, sourceId: characterId, sourceType: 'CHARACTER', targetId: container.id, targetType: container.type, relationshipType: INSIDE_REL } });
  const standing = await containerStanding(campaignId, container.id, container.type);
  if (standing.roomId) {
    await prisma.entityRelationship.deleteMany({ where: { sourceId: characterId, sourceType: 'CHARACTER', relationshipType: 'located_at', targetType: 'LOCATION' } });
    await prisma.entityRelationship.create({ data: { campaignId, sourceId: characterId, sourceType: 'CHARACTER', targetId: standing.roomId, targetType: 'LOCATION', relationshipType: 'located_at' } });
  }
  if (standing.point) {
    const placedAt = await stampBeingPoint(characterId, standing.point);
    try { broadcastEvent(campaignId, { kind: 'token_moved', entityId: characterId, entityType: 'character', x: standing.point.x, y: standing.point.y, placedAt, roomId: standing.roomId ?? undefined, cause } as never); } catch { /* canvases re-read */ }
  }
  return { containerId: container.id, containerType: container.type, containerName: exists.name };
}
