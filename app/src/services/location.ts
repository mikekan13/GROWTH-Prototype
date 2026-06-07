import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';

// --- Schemas ---

export const createLocationSchema = z.object({
  name: z.string().min(1, 'Location name required').max(200),
  // Type kept for backward compat; the design now treats Location as a single
  // primitive (description does the "what is this" work). Defaults to a
  // neutral value; UI no longer surfaces a type picker.
  type: z.enum(['settlement', 'wilderness', 'dungeon', 'building', 'point_of_interest', 'region', 'meta', 'cosmic_landmark', 'force']).default('point_of_interest'),
  data: z.record(z.string(), z.unknown()).optional(),
  /** Canvas world coords to stamp on the new Location's data JSON so its
   *  card renders where the GM right-clicked. */
  canvasX: z.number().optional(),
  canvasY: z.number().optional(),
  /** Short narrative — the WHAT of this place. Feeds the AI cascade
   *  downward to children for lore generation. */
  description: z.string().optional(),
  /** Ambient KRMA mass — drives wallet commitment + visual prominence.
   *  See [[location-krma-reserve-2026-06-02]]. */
  krmaReserve: z.number().optional(),
  /** Climate / terrain / atmosphere — short narrative slice that cascades
   *  down to children for AI lore generation. */
  environment: z.string().optional(),
  /** Narrative population descriptor — "sparse", "bustling docks", etc. */
  population: z.string().optional(),
  /** 1-10 general threat level. */
  dangerLevel: z.number().min(1).max(10).optional(),
  /** Faction / NPC name / "contested" — who runs this place. */
  controlledBy: z.string().optional(),
  /** Free-form GM-only notes. */
  notes: z.string().optional(),
  /** Searchable tags — type hints, themes. */
  tags: z.array(z.string()).optional(),
});

export const updateLocationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.enum(['settlement', 'wilderness', 'dungeon', 'building', 'point_of_interest', 'region', 'meta', 'cosmic_landmark', 'force']).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['ACTIVE', 'PLANNING', 'HIDDEN', 'DESTROYED']).optional(),
});

const statusOnlySchema = z.object({
  status: z.enum(['ACTIVE', 'PLANNING', 'HIDDEN', 'DESTROYED']),
  /** When true, also flips every descendant Location (via located_at edges)
   *  to the same status. Used by the CRYSTALLIZE flow so a planning
   *  subtree becomes active atomically. */
  cascade: z.boolean().optional(),
});
export type UpdateLocationStatusInput = z.infer<typeof statusOnlySchema>;

// --- Default Data ---

function createDefaultLocation(_name: string): Record<string, unknown> {
  return {
    description: '',
    tags: [],
    features: [],
    connections: [],
  };
}

// --- Service Functions ---

export async function listLocations(campaignId: string) {
  return prisma.location.findMany({
    where: { campaignId },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getLocation(locationId: string, campaignId: string) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
  });

  if (!location || location.campaignId !== campaignId) {
    throw new NotFoundError('Location not found');
  }

  return location;
}

export async function createLocation(
  campaignId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof createLocationSchema>,
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(userId, userRole, campaign)) {
    throw new ForbiddenError('Only the GM can create locations');
  }

  const data = input.data ?? createDefaultLocation(input.name);
  const d = data as Record<string, unknown>;
  if (input.canvasX != null && input.canvasY != null) {
    d.canvasX = input.canvasX;
    d.canvasY = input.canvasY;
  }
  if (input.description) d.description = input.description;
  if (input.krmaReserve != null) d.krmaReserve = input.krmaReserve;
  if (input.environment) d.environment = input.environment;
  if (input.population) d.population = input.population;
  if (input.dangerLevel != null) d.dangerLevel = input.dangerLevel;
  if (input.controlledBy) d.controlledBy = input.controlledBy;
  if (input.notes) d.notes = input.notes;
  if (input.tags && input.tags.length) d.tags = input.tags;

  return prisma.location.create({
    data: {
      name: input.name,
      type: input.type ?? 'point_of_interest',
      campaignId,
      data: JSON.stringify(data),
      createdBy: userId,
      // Creation is always PLANNING — the GM authors below the
      // crystallization line, then explicitly commits to ACTIVE via the
      // crystallize gesture. Even mid-session authoring drops in draft.
      status: 'PLANNING',
    },
  });
}

export async function updateLocation(
  locationId: string,
  campaignId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof updateLocationSchema>,
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(userId, userRole, campaign)) {
    throw new ForbiddenError('Only the GM can modify locations');
  }

  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location || location.campaignId !== campaignId) {
    throw new NotFoundError('Location not found');
  }

  return prisma.location.update({
    where: { id: locationId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.data !== undefined && { data: JSON.stringify(input.data) }),
      ...(input.status !== undefined && { status: input.status }),
    },
  });
}

/**
 * Walk located_at edges to find every descendant Location of the given
 * root. Used by the crystallization cascade so committing a planning
 * subtree flips all its parts to ACTIVE atomically.
 */
async function getDescendantLocationIds(rootId: string): Promise<string[]> {
  const result: string[] = [];
  const queue: string[] = [rootId];
  const seen = new Set<string>([rootId]);
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const childEdges = await prisma.entityRelationship.findMany({
      where: { targetId: parentId, relationshipType: 'located_at', sourceType: 'LOCATION' },
      select: { sourceId: true },
    });
    for (const e of childEdges) {
      if (seen.has(e.sourceId)) continue;
      seen.add(e.sourceId);
      result.push(e.sourceId);
      queue.push(e.sourceId);
    }
  }
  return result;
}

/**
 * Status-only update with optional cascade. PLANNING ↔ ACTIVE flips
 * are crystallization gestures per the world-design pillar.
 *
 * NOTE: KRMA wallet integration is TBD — crystallization should debit
 * the summed reserves of the subtree from the GM wallet on PLANNING →
 * ACTIVE. Wallet hook lands in a follow-up; for now status flips are
 * unmetered.
 */
export async function updateLocationStatus(
  locationId: string,
  sessionUserId: string,
  sessionUserRole: string,
  input: UpdateLocationStatusInput,
) {
  const parsed = statusOnlySchema.safeParse(input);
  if (!parsed.success) throw new ForbiddenError('Invalid status payload');

  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: {
      id: true,
      name: true,
      campaign: { select: { gmUserId: true } },
    },
  });
  if (!location) throw new NotFoundError('Location not found');
  if (!canManageCampaign(sessionUserId, sessionUserRole, location.campaign)) {
    throw new ForbiddenError('Only the campaign GM can change location status');
  }

  const ids = [locationId];
  if (parsed.data.cascade) {
    const descendants = await getDescendantLocationIds(locationId);
    ids.push(...descendants);
  }

  await prisma.location.updateMany({
    where: { id: { in: ids } },
    data: { status: parsed.data.status },
  });

  return { locationId, status: parsed.data.status, affected: ids.length };
}

export async function deleteLocation(
  locationId: string,
  campaignId: string,
  userId: string,
  userRole: string,
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(userId, userRole, campaign)) {
    throw new ForbiddenError('Only the GM can delete locations');
  }

  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location || location.campaignId !== campaignId) {
    throw new NotFoundError('Location not found');
  }

  return prisma.location.delete({ where: { id: locationId } });
}
