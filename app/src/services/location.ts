import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';
import { writeHistory, currentCycleOf } from '@/services/history';

// --- Schemas ---

/** Hard ceiling on any single KRMA quantity: the total supply (100B).
 *  KRMA conservation means no reserve, wallet, or commitment can ever
 *  exceed it — seeded data had Location reserves at 10^18. Real
 *  enforcement (debit vs GM wallet capacity at crystallization) is a
 *  separate build; this is the physics floor. */
export const KRMA_TOTAL_SUPPLY = 100_000_000_000;

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
   *  See [[location-krma-reserve-2026-06-02]]. Bounded by total supply:
   *  nothing in the economy can exceed 100B KRMA. */
  krmaReserve: z.number().min(0).max(KRMA_TOTAL_SUPPLY).optional(),
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

  const created = await prisma.location.create({
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

  // Per-object perspective history (r-2026-06-09-07): the place logs its
  // own genesis.
  const cycle = await currentCycleOf(campaignId);
  await writeHistory(campaignId, cycle, [{
    subjectType: 'location',
    subjectId: created.id,
    type: 'created',
    summary: `${created.name} was drafted into the world (planning layer)`,
    actorId: userId,
  }]);

  return created;
}

/**
 * Set or clear the parent of a Location via the located_at edge. A Location
 * has AT MOST one parent (single physical containment). When parentId is
 * null, the Location becomes a top-level entity. When non-null, the old
 * parent edge is removed and a new one written in a transaction.
 *
 * Used by the canvas's drag-folder-into-folder gesture and (eventually) by
 * JEWL when the GM asks to move a place. Note: this is strict containment;
 * the partial-containment primitive (intersects / roots_in) is unbuilt.
 */
export async function setLocationParent(
  campaignId: string,
  userId: string,
  userRole: string,
  locationId: string,
  parentId: string | null,
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(userId, userRole, campaign)) {
    throw new ForbiddenError('Only the GM can re-parent locations');
  }

  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location || location.campaignId !== campaignId) {
    throw new NotFoundError('Location not found in this campaign');
  }

  if (parentId) {
    if (parentId === locationId) {
      throw new Error('A Location cannot be its own parent');
    }
    const parent = await prisma.location.findUnique({ where: { id: parentId } });
    if (!parent || parent.campaignId !== campaignId) {
      throw new NotFoundError('Parent location not found in this campaign');
    }
  }

  // Capture the old parent for the perspective log before the swap.
  const oldEdge = await prisma.entityRelationship.findFirst({
    where: { sourceId: locationId, sourceType: 'LOCATION', relationshipType: 'located_at' },
    select: { targetId: true },
  });

  const result = await prisma.$transaction(async (tx) => {
    // Drop any existing located_at edges from this Location.
    await tx.entityRelationship.deleteMany({
      where: {
        sourceId: locationId,
        sourceType: 'LOCATION',
        relationshipType: 'located_at',
      },
    });
    if (parentId) {
      await tx.entityRelationship.create({
        data: {
          campaignId,
          sourceId: locationId,
          sourceType: 'LOCATION',
          targetId: parentId,
          targetType: 'LOCATION',
          relationshipType: 'located_at',
          strength: 5,
        },
      });
    }
    return { locationId, parentId };
  });

  // One event, three perspectives (r-2026-06-09-07): the moved place, the
  // place it left, the place it joined.
  const ids = [locationId, oldEdge?.targetId, parentId].filter((x): x is string => !!x);
  const names = new Map(
    (await prisma.location.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }))
      .map(l => [l.id, l.name]),
  );
  const childName = names.get(locationId) ?? 'A place';
  const cycle = await currentCycleOf(campaignId);
  const perspectives = [];
  perspectives.push({
    subjectType: 'location' as const,
    subjectId: locationId,
    type: 'edited',
    summary: parentId
      ? `${childName} now lies within ${names.get(parentId) ?? 'another place'}`
      : `${childName} stands on its own (no parent)`,
    actorId: userId,
  });
  if (oldEdge?.targetId && oldEdge.targetId !== parentId) {
    perspectives.push({
      subjectType: 'location' as const,
      subjectId: oldEdge.targetId,
      type: 'departure',
      summary: `${childName} is no longer within ${names.get(oldEdge.targetId) ?? 'this place'}`,
      actorId: userId,
    });
  }
  if (parentId) {
    perspectives.push({
      subjectType: 'location' as const,
      subjectId: parentId,
      type: 'arrival',
      summary: `${childName} now lies within ${names.get(parentId) ?? 'this place'}`,
      actorId: userId,
    });
  }
  await writeHistory(campaignId, cycle, perspectives);

  return result;
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

  const updated = await prisma.location.update({
    where: { id: locationId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.data !== undefined && { data: JSON.stringify(input.data) }),
      ...(input.status !== undefined && { status: input.status }),
    },
  });

  // Perspective history (r-2026-06-09-07). Status-only flips log through
  // updateLocationStatus; field edits log here.
  if (input.name !== undefined || input.data !== undefined) {
    const cycle = await currentCycleOf(campaignId);
    await writeHistory(campaignId, cycle, [{
      subjectType: 'location',
      subjectId: locationId,
      type: 'edited',
      summary: input.name !== undefined && input.name !== location.name
        ? `${location.name} is now known as ${input.name}`
        : `${updated.name} was revised`,
      actorId: userId,
    }]);
  }

  return updated;
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

  // Perspective history: each affected place logs its own status flip —
  // crystallization is a moment in a place's life (r-2026-06-09-07).
  const campaignRow = await prisma.location.findUnique({ where: { id: locationId }, select: { campaignId: true } });
  if (campaignRow) {
    const cycle = await currentCycleOf(campaignRow.campaignId);
    const affected = await prisma.location.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const verb = parsed.data.status === 'ACTIVE' ? 'crystallized into the active world'
      : parsed.data.status === 'PLANNING' ? 'dissolved back to the planning layer'
      : parsed.data.status === 'DESTROYED' ? 'was destroyed'
      : 'was hidden';
    await writeHistory(campaignRow.campaignId, cycle, affected.map(l => ({
      subjectType: 'location' as const,
      subjectId: l.id,
      type: 'status_change',
      summary: `${l.name} ${verb}`,
      actorId: sessionUserId,
    })));
  }

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

  // Active ≠ draft (ruling r-2026-06-09-09): drafts delete freely, but a
  // crystallized place is part of the in-fiction world — it must be
  // dissolved (returned below the line, with its KRMA settlement) before
  // it can be removed.
  if (location.status === 'ACTIVE') {
    throw new ValidationError(
      'This place is crystallized. Dissolve it back to the planning layer first — active world-pieces cannot be deleted outright.',
    );
  }

  return prisma.location.delete({ where: { id: locationId } });
}
