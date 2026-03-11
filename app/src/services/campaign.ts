import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ConflictError, ValidationError } from '@/lib/errors';
import { isWatcherOrAbove, isAdminRole, canManageCampaign } from '@/lib/permissions';
import { createCampaignWallet } from '@/services/krma/wallet';

// --- Schemas ---

export const createCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name required').max(100),
  genre: z.string().max(50).optional(),
  description: z.string().max(2000).optional(),
  worldContext: z.string().max(5000).optional(),
  customPrompts: z.array(z.string().max(500)).max(20).optional(),
});

export const joinCampaignSchema = z.object({
  inviteCode: z.string().min(1, 'Invite code required').max(20),
});

export const updateCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name required').max(100).optional(),
  description: z.string().max(2000).optional(),
  worldContext: z.string().max(5000).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']).optional(),
  maxTrailblazers: z.number().int().min(1).max(50).optional(),
  customPrompts: z.array(z.string().max(500)).max(20).optional(),
});

// --- Service Functions ---

export async function listCampaigns(userId: string) {
  const [gmCampaigns, playerCampaigns] = await Promise.all([
    prisma.campaign.findMany({
      where: { gmUserId: userId },
      include: { _count: { select: { characters: true, members: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.campaign.findMany({
      where: { members: { some: { userId } } },
      include: {
        gmUser: { select: { username: true } },
        characters: { where: { userId }, select: { id: true, name: true } },
      },
    }),
  ]);
  return { gmCampaigns, playerCampaigns };
}

export async function createCampaign(userId: string, userRole: string, input: z.infer<typeof createCampaignSchema>) {
  if (!isWatcherOrAbove(userRole)) {
    throw new ForbiddenError('Only Watchers can create campaigns');
  }

  const inviteCode = crypto.randomBytes(4).toString('hex');
  const campaign = await prisma.campaign.create({
    data: {
      name: input.name,
      genre: input.genre,
      description: input.description,
      worldContext: input.worldContext,
      customPrompts: input.customPrompts ? JSON.stringify(input.customPrompts) : null,
      gmUserId: userId,
      inviteCode,
    },
  });

  // Create KRMA wallet for the campaign
  await createCampaignWallet(campaign.id);

  return campaign;
}

export async function getCampaignDetail(campaignId: string, userId: string, userRole: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      characters: {
        include: {
          user: { select: { username: true } },
          backstory: { select: { status: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      members: {
        include: { user: { select: { id: true, username: true } } },
        orderBy: { joinedAt: 'desc' },
      },
    },
  });

  if (!campaign) throw new NotFoundError('Campaign not found');
  if (campaign.gmUserId !== userId && !isAdminRole(userRole)) {
    throw new ForbiddenError();
  }

  return campaign;
}

export async function joinCampaign(userId: string, inviteCode: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { inviteCode: inviteCode.trim() },
    include: { _count: { select: { members: true } } },
  });

  if (!campaign) throw new NotFoundError('Invalid invite code');
  if (campaign.status !== 'ACTIVE') throw new ValidationError('Campaign is not active');
  if (campaign._count.members >= campaign.maxTrailblazers) throw new ValidationError('Campaign is full');
  if (campaign.gmUserId === userId) throw new ValidationError('You are the GM of this campaign');

  const existing = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId: campaign.id, userId } },
  });
  if (existing) throw new ConflictError('You are already in this campaign');

  const member = await prisma.campaignMember.create({
    data: { campaignId: campaign.id, userId },
  });

  return { campaign: { id: campaign.id, name: campaign.name }, member };
}

export async function updateCampaign(
  campaignId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof updateCampaignSchema>,
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');

  if (!canManageCampaign(userId, userRole, campaign)) {
    throw new ForbiddenError('Only the GM or admin can edit this campaign');
  }

  // If reducing seats, check current member count
  if (input.maxTrailblazers !== undefined) {
    const memberCount = await prisma.campaignMember.count({ where: { campaignId } });
    if (input.maxTrailblazers < memberCount) {
      throw new ValidationError(`Cannot reduce seats below current member count (${memberCount})`);
    }
  }

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.worldContext !== undefined && { worldContext: input.worldContext }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.maxTrailblazers !== undefined && { maxTrailblazers: input.maxTrailblazers }),
      ...(input.customPrompts !== undefined && { customPrompts: JSON.stringify(input.customPrompts) }),
    },
  });

  return updated;
}

export async function regenerateInviteCode(campaignId: string, userId: string, userRole: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');

  if (!canManageCampaign(userId, userRole, campaign)) {
    throw new ForbiddenError('Only the GM or admin can regenerate the invite code');
  }

  const newCode = crypto.randomBytes(4).toString('hex');
  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: { inviteCode: newCode },
  });

  return { inviteCode: updated.inviteCode };
}
