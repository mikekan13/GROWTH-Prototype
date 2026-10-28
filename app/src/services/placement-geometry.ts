/**
 * Placement geometry — WHERE on the map, as opposed to placement.ts (WHAT
 * is inside WHAT). Mike 2026-10-16: the canvas is a top-down map; every
 * place takes up space (a footprint: polygon + scale + level), stairs link
 * levels, and every thing sits at a point inside its room.
 *
 *   Location.data.footprint = { points: [{x,y}], scale, level, height? }
 *   Location.data.connects  = [{ locationId, level }]      (a passage)
 *   located_at edge data.position = { x, y }               (0..1 of the room box)
 *
 * No schema change: all three ride the existing JSON columns. Footprint
 * writes go through services/location.updateLocation (permissions + history).
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';
import { updateLocation } from '@/services/location';
import { parseFootprint, footprintBounds, fractionToWorld, type Footprint, type PassageLink, type TokenPosition } from '@/lib/canvas-geometry';
import { broadcastEvent } from '@/lib/campaign-stream';

const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

export const footprintSchema = z.object({
  points: z.array(pointSchema).min(3).max(256),
  scale: z.number().positive().max(10_000),
  level: z.number().int().min(-50).max(500),
  height: z.number().positive().max(10_000).optional(),
});

export const passageLinksSchema = z.array(z.object({
  locationId: z.string().min(1),
  level: z.number().int().min(-50).max(500),
})).max(64);

export const footprintPatchSchema = z.object({
  footprint: footprintSchema.optional(),
  connects: passageLinksSchema.optional(),
}).refine(v => v.footprint !== undefined || v.connects !== undefined, { message: 'footprint or connects required' });
export type FootprintPatchInput = z.infer<typeof footprintPatchSchema>;

export const tokenPositionSchema = z.object({
  position: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
});

function parseData(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/**
 * Set a Location's footprint and/or passage links, merging into its data
 * JSON (canvas coords, description etc. untouched). GM-only via updateLocation.
 */
export async function setLocationGeometry(
  campaignId: string,
  locationId: string,
  userId: string,
  userRole: string,
  input: FootprintPatchInput,
): Promise<{ footprint: Footprint | null; connects: PassageLink[] }> {
  const parsed = footprintPatchSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map(i => i.message).join('; '));
  const loc = await prisma.location.findUnique({ where: { id: locationId }, select: { campaignId: true, data: true } });
  if (!loc || loc.campaignId !== campaignId) throw new NotFoundError('Location not found');
  if (parsed.data.connects) {
    for (const c of parsed.data.connects) {
      if (c.locationId === locationId) throw new ValidationError('A passage cannot connect to itself');
      const other = await prisma.location.findUnique({ where: { id: c.locationId }, select: { campaignId: true } });
      if (!other || other.campaignId !== campaignId) throw new NotFoundError(`Connected location ${c.locationId} not found`);
    }
  }
  const data = parseData(loc.data);
  const merged: Record<string, unknown> = {
    ...data,
    ...(parsed.data.footprint ? { footprint: parsed.data.footprint, footprintAt: Date.now() } : {}),
    ...(parsed.data.connects ? { connects: parsed.data.connects } : {}),
  };
  await updateLocation(locationId, campaignId, userId, userRole, { data: merged });
  return {
    footprint: parseFootprint(merged.footprint),
    connects: (merged.connects as PassageLink[] | undefined) ?? [],
  };
}

/**
 * Set a thing's point inside its room: `data.position` on the located_at
 * edge, as fractions of the room's footprint box. Stamps `positionAt` so the
 * canvas can let a newer server placement win over an older local drag.
 */
export async function setTokenPosition(
  parentEntityId: string,
  edgeId: string,
  userId: string,
  userRole: string,
  position: TokenPosition,
): Promise<{ edgeId: string; position: TokenPosition; positionAt: number }> {
  const parsed = tokenPositionSchema.safeParse({ position });
  if (!parsed.success) throw new ValidationError('position must be {x,y} fractions in 0..1');
  const edge = await prisma.entityRelationship.findUnique({
    where: { id: edgeId },
    select: { id: true, sourceId: true, targetId: true, relationshipType: true, campaignId: true, data: true },
  });
  if (!edge || edge.targetId !== parentEntityId || edge.relationshipType !== 'located_at') {
    throw new NotFoundError('Contents edge not found');
  }
  if (!edge.campaignId) throw new ForbiddenError('Edge has no campaign');
  const campaign = await prisma.campaign.findUnique({ where: { id: edge.campaignId }, select: { gmUserId: true } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(userId, userRole, campaign)) throw new ForbiddenError('Only the GM can place things');
  const positionAt = Date.now();
  const data = { ...parseData(edge.data), position: parsed.data.position, positionAt };
  await prisma.entityRelationship.update({ where: { id: edgeId }, data: { data: JSON.stringify(data) } });
  // Every open canvas moves the thing's token in place (2026-10-27).
  try {
    const room = await prisma.location.findUnique({ where: { id: parentEntityId }, select: { name: true, data: true } });
    const fp = room ? parseFootprint(parseData(room.data).footprint) : null;
    if (room && fp) {
      const world = fractionToWorld(parsed.data.position, footprintBounds(fp.points));
      broadcastEvent(edge.campaignId, { kind: 'token_moved', entityId: edge.sourceId, entityType: 'item', x: world.x, y: world.y, placedAt: positionAt, roomId: parentEntityId, roomName: room.name, cause: 'gm' });
    }
  } catch { /* canvases re-read on their own */ }
  return { edgeId, position: parsed.data.position, positionAt };
}
