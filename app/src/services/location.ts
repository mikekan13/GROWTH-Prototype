import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';

// --- Schemas ---

export const createLocationSchema = z.object({
  name: z.string().min(1, 'Location name required').max(200),
  type: z.enum(['settlement', 'wilderness', 'dungeon', 'building', 'point_of_interest', 'region']).default('point_of_interest'),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const updateLocationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.enum(['settlement', 'wilderness', 'dungeon', 'building', 'point_of_interest', 'region']).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['ACTIVE', 'HIDDEN', 'DESTROYED']).optional(),
});

// --- Default Data ---

function createDefaultLocation(name: string): Record<string, unknown> {
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

  return prisma.location.create({
    data: {
      name: input.name,
      type: input.type ?? 'point_of_interest',
      campaignId,
      data: JSON.stringify(data),
      createdBy: userId,
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
