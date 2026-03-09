import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';

// --- Schemas ---

export const createCampaignItemSchema = z.object({
  name: z.string().min(1, 'Item name required').max(200),
  type: z.enum(['weapon', 'armor', 'accessory', 'consumable', 'tool', 'artifact', 'prima_materia', 'misc']).default('misc'),
  data: z.record(z.string(), z.unknown()).optional(),
  holderId: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
});

export const updateCampaignItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.enum(['weapon', 'armor', 'accessory', 'consumable', 'tool', 'artifact', 'prima_materia', 'misc']).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  holderId: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'DESTROYED', 'CONSUMED', 'LOST']).optional(),
});

// --- Default Data ---

function createDefaultItem(): Record<string, unknown> {
  return {
    description: '',
    condition: 4,
    weightLevel: 1,
    techLevel: 4,
    tags: [],
  };
}

// --- Service Functions ---

export async function listCampaignItems(campaignId: string) {
  return prisma.campaignItem.findMany({
    where: { campaignId },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getCampaignItem(itemId: string, campaignId: string) {
  const item = await prisma.campaignItem.findUnique({
    where: { id: itemId },
  });

  if (!item || item.campaignId !== campaignId) {
    throw new NotFoundError('Item not found');
  }

  return item;
}

export async function createCampaignItem(
  campaignId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof createCampaignItemSchema>,
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(userId, userRole, campaign)) {
    throw new ForbiddenError('Only the GM can create items');
  }

  const data = input.data ?? createDefaultItem();

  return prisma.campaignItem.create({
    data: {
      name: input.name,
      type: input.type ?? 'misc',
      campaignId,
      data: JSON.stringify(data),
      holderId: input.holderId ?? null,
      locationId: input.locationId ?? null,
      createdBy: userId,
    },
  });
}

export async function updateCampaignItem(
  itemId: string,
  campaignId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof updateCampaignItemSchema>,
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(userId, userRole, campaign)) {
    throw new ForbiddenError('Only the GM can modify items');
  }

  const item = await prisma.campaignItem.findUnique({ where: { id: itemId } });
  if (!item || item.campaignId !== campaignId) {
    throw new NotFoundError('Item not found');
  }

  return prisma.campaignItem.update({
    where: { id: itemId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.data !== undefined && { data: JSON.stringify(input.data) }),
      ...(input.holderId !== undefined && { holderId: input.holderId }),
      ...(input.locationId !== undefined && { locationId: input.locationId }),
      ...(input.status !== undefined && { status: input.status }),
    },
  });
}

export async function deleteCampaignItem(
  itemId: string,
  campaignId: string,
  userId: string,
  userRole: string,
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(userId, userRole, campaign)) {
    throw new ForbiddenError('Only the GM can delete items');
  }

  const item = await prisma.campaignItem.findUnique({ where: { id: itemId } });
  if (!item || item.campaignId !== campaignId) {
    throw new NotFoundError('Item not found');
  }

  return prisma.campaignItem.delete({ where: { id: itemId } });
}
