import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { isWatcherOrAbove } from '@/lib/permissions';
// SkillGovernor type used indirectly via SKILL_GOVERNORS
import { SKILL_GOVERNORS } from '@/types/growth';

// ── Forge Item Types ──────────────────────────────────────────────────────

export const FORGE_ITEM_TYPES = ['skill', 'item', 'nectar', 'blossom', 'thorn'] as const;
export type ForgeItemType = typeof FORGE_ITEM_TYPES[number];

// ── Zod Schemas ───────────────────────────────────────────────────────────

const skillGovernorSchema = z.enum(SKILL_GOVERNORS as unknown as [string, ...string[]]);

const forgeSkillDataSchema = z.object({
  governors: z.array(skillGovernorSchema).min(1, 'At least one governor required'),
  description: z.string().max(500).optional(),
});

const forgeDamageSchema = z.object({
  piercing: z.number().min(0).default(0),
  slashing: z.number().min(0).default(0),
  heat: z.number().min(0).default(0),
  decay: z.number().min(0).default(0),
  cold: z.number().min(0).default(0),
  bashing: z.number().min(0).default(0),
  energy: z.number().min(0).default(0),
}).optional();

const forgePrimaMateriaSchema = z.object({
  school: z.string().max(100),
  level: z.number().int().min(1).max(10),
  stable: z.boolean(),
  charges: z.number().int().min(0).optional(),
}).optional();

const forgeItemDataSchema = z.object({
  // Core properties
  description: z.string().max(500).optional(),
  material: z.string().max(100).optional(),
  techLevel: z.number().int().min(1).max(10).optional(),
  weightLevel: z.number().int().min(0).max(10).optional(),
  condition: z.number().int().min(1).max(4).optional(),
  rarity: z.enum(['common', 'uncommon', 'rare', 'very_rare', 'legendary', 'artifact']).optional(),
  value: z.number().min(0).optional(),
  notes: z.string().max(1000).optional(),
  // Item sub-type (weapon, armor, etc.)
  itemType: z.enum(['weapon', 'armor', 'accessory', 'consumable', 'tool', 'artifact', 'prima_materia', 'misc']).optional(),
  // Weapon fields
  damage: forgeDamageSchema,
  range: z.enum(['melee', 'short', 'medium', 'long']).optional(),
  weaponProperties: z.array(z.string().max(100)).max(20).optional(),
  targetAttribute: z.string().max(50).optional(),
  // Armor fields
  armorLayer: z.enum(['clothing', 'lightArmor', 'heavyArmor']).optional(),
  resistance: z.number().min(0).optional(),
  coveredParts: z.array(z.string().max(50)).max(20).optional(),
  // Material modifiers
  materialModifiers: z.array(z.string().max(100)).max(20).optional(),
  // Prima Materia
  primaMateria: forgePrimaMateriaSchema,
  // Tags
  tags: z.array(z.string().max(50)).max(20).optional(),
  // Legacy field
  properties: z.array(z.string().max(100)).max(20).optional(),
});

const forgeTraitDataSchema = z.object({
  description: z.string().max(500),
  mechanicalEffect: z.string().max(300).optional(),
  source: z.string().max(200).optional(),
});

// Data schema depends on type
function validateForgeData(type: string, data: unknown) {
  switch (type) {
    case 'skill': return forgeSkillDataSchema.parse(data);
    case 'item': return forgeItemDataSchema.parse(data);
    case 'nectar':
    case 'blossom':
    case 'thorn': return forgeTraitDataSchema.parse(data);
    default: throw new ValidationError(`Unknown forge item type: ${type}`);
  }
}

export const createForgeItemSchema = z.object({
  type: z.enum(FORGE_ITEM_TYPES),
  name: z.string().min(1, 'Name required').max(100),
  data: z.record(z.string(), z.unknown()),
});

export const updateForgeItemSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const createPlayerRequestSchema = z.object({
  type: z.enum(FORGE_ITEM_TYPES),
  name: z.string().min(1, 'Name required').max(100),
  data: z.record(z.string(), z.unknown()),
});

export const updatePlayerRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const resolvePlayerRequestSchema = z.object({
  status: z.enum(['approved', 'denied', 'modified']),
  gmNotes: z.string().max(1000).optional(),
  modifiedData: z.record(z.string(), z.unknown()).optional(),
  modifiedName: z.string().min(1).max(100).optional(),
});

// ── Permission Helpers ────────────────────────────────────────────────────

async function assertCampaignGM(campaignId: string, userId: string, userRole: string) {
  if (!isWatcherOrAbove(userRole)) throw new ForbiddenError();
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  if (!campaign) throw new NotFoundError('Campaign');
  if (campaign.gmUserId !== userId) throw new ForbiddenError('Only the campaign GM can do this');
  return campaign;
}

async function assertCampaignMember(campaignId: string, userId: string) {
  const membership = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId, userId } },
  });
  if (!membership) {
    // Also check if they're the GM
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
    if (!campaign) throw new NotFoundError('Campaign');
    if (campaign.gmUserId !== userId) throw new ForbiddenError('Not a member of this campaign');
  }
}

// ── ForgeItem Service ─────────────────────────────────────────────────────

export async function listForgeItems(
  campaignId: string,
  userId: string,
  userRole: string,
  filters?: { type?: string; status?: string }
) {
  await assertCampaignMember(campaignId, userId);

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  const isGM = campaign?.gmUserId === userId;

  const where: Record<string, unknown> = { campaignId };
  if (filters?.type) where.type = filters.type;

  // Players only see published items
  if (!isGM) {
    where.status = 'published';
  } else if (filters?.status) {
    where.status = filters.status;
  }

  const items = await prisma.forgeItem.findMany({
    where,
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });

  return items.map(item => ({
    ...item,
    data: JSON.parse(item.data),
  }));
}

export async function getForgeItem(itemId: string, userId: string, _userRole: string) {
  const item = await prisma.forgeItem.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError('Forge item');

  await assertCampaignMember(item.campaignId, userId);

  const campaign = await prisma.campaign.findUnique({ where: { id: item.campaignId }, select: { gmUserId: true } });
  const isGM = campaign?.gmUserId === userId;

  if (!isGM && item.status !== 'published') {
    throw new ForbiddenError('This item is not yet published');
  }

  return { ...item, data: JSON.parse(item.data) };
}

export async function createForgeItem(
  campaignId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof createForgeItemSchema>
) {
  await assertCampaignGM(campaignId, userId, userRole);

  // Validate type-specific data
  const validatedData = validateForgeData(input.type, input.data);

  const item = await prisma.forgeItem.create({
    data: {
      campaignId,
      type: input.type,
      name: input.name,
      status: 'draft',
      data: JSON.stringify(validatedData),
      createdBy: userId,
    },
  });

  return { ...item, data: validatedData };
}

export async function updateForgeItem(
  itemId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof updateForgeItemSchema>
) {
  const item = await prisma.forgeItem.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError('Forge item');

  await assertCampaignGM(item.campaignId, userId, userRole);

  const updateData: Record<string, unknown> = {};
  if (input.name) updateData.name = input.name;
  if (input.data) {
    const validatedData = validateForgeData(item.type, input.data);
    updateData.data = JSON.stringify(validatedData);
  }

  const updated = await prisma.forgeItem.update({
    where: { id: itemId },
    data: updateData,
  });

  return { ...updated, data: JSON.parse(updated.data) };
}

export async function publishForgeItem(itemId: string, userId: string, userRole: string) {
  const item = await prisma.forgeItem.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError('Forge item');

  await assertCampaignGM(item.campaignId, userId, userRole);

  const updated = await prisma.forgeItem.update({
    where: { id: itemId },
    data: { status: 'published' },
  });

  return { ...updated, data: JSON.parse(updated.data) };
}

export async function unpublishForgeItem(itemId: string, userId: string, userRole: string) {
  const item = await prisma.forgeItem.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError('Forge item');

  await assertCampaignGM(item.campaignId, userId, userRole);

  const updated = await prisma.forgeItem.update({
    where: { id: itemId },
    data: { status: 'draft' },
  });

  return { ...updated, data: JSON.parse(updated.data) };
}

export async function deleteForgeItem(itemId: string, userId: string, userRole: string) {
  const item = await prisma.forgeItem.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError('Forge item');

  await assertCampaignGM(item.campaignId, userId, userRole);

  if (item.status === 'published') {
    throw new ValidationError('Cannot delete a published item. Unpublish it first.');
  }

  await prisma.forgeItem.delete({ where: { id: itemId } });
  return { deleted: true };
}

// ── PlayerRequest Service ─────────────────────────────────────────────────

export async function listPlayerRequests(
  campaignId: string,
  userId: string,
  userRole: string,
  filters?: { status?: string }
) {
  await assertCampaignMember(campaignId, userId);

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  const isGM = campaign?.gmUserId === userId;

  const where: Record<string, unknown> = { campaignId };
  if (!isGM) where.requesterId = userId; // Players only see their own requests
  if (filters?.status) where.status = filters.status;

  const requests = await prisma.playerRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return requests.map(r => ({
    ...r,
    data: JSON.parse(r.data),
  }));
}

export async function createPlayerRequest(
  campaignId: string,
  userId: string,
  input: z.infer<typeof createPlayerRequestSchema>
) {
  await assertCampaignMember(campaignId, userId);

  // Validate type-specific data
  const validatedData = validateForgeData(input.type, input.data);

  const request = await prisma.playerRequest.create({
    data: {
      campaignId,
      requesterId: userId,
      type: input.type,
      name: input.name,
      status: 'pending',
      data: JSON.stringify(validatedData),
    },
  });

  return { ...request, data: validatedData };
}

export async function updatePlayerRequest(
  requestId: string,
  userId: string,
  input: z.infer<typeof updatePlayerRequestSchema>
) {
  const request = await prisma.playerRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError('Request');

  // Only the requester can edit, and only while pending
  if (request.requesterId !== userId) throw new ForbiddenError('Not your request');
  if (request.status !== 'pending') throw new ValidationError('Can only edit pending requests');

  const updateData: Record<string, unknown> = {};
  if (input.name) updateData.name = input.name;
  if (input.data) {
    const validatedData = validateForgeData(request.type, input.data);
    updateData.data = JSON.stringify(validatedData);
  }

  const updated = await prisma.playerRequest.update({
    where: { id: requestId },
    data: updateData,
  });

  return { ...updated, data: JSON.parse(updated.data) };
}

export async function resolvePlayerRequest(
  requestId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof resolvePlayerRequestSchema>
) {
  const request = await prisma.playerRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError('Request');

  await assertCampaignGM(request.campaignId, userId, userRole);

  if (request.status !== 'pending') {
    throw new ValidationError('Request has already been resolved');
  }

  const updateData: Record<string, unknown> = {
    status: input.status,
    gmNotes: input.gmNotes || null,
  };

  // On approve or modify: create a ForgeItem from the request
  if (input.status === 'approved' || input.status === 'modified') {
    const requestData = JSON.parse(request.data);
    const finalName = input.modifiedName || request.name;
    const finalData = input.modifiedData
      ? validateForgeData(request.type, input.modifiedData)
      : requestData;

    const forgeItem = await prisma.forgeItem.create({
      data: {
        campaignId: request.campaignId,
        type: request.type,
        name: finalName,
        status: 'draft', // GM still needs to publish
        data: JSON.stringify(finalData),
        createdBy: userId,
      },
    });

    updateData.forgeItemId = forgeItem.id;
  }

  const updated = await prisma.playerRequest.update({
    where: { id: requestId },
    data: updateData,
  });

  return { ...updated, data: JSON.parse(updated.data) };
}
