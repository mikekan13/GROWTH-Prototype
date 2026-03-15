import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';

// --- Schemas ---

export const listingFiltersSchema = z.object({
  search: z.string().max(200).optional(),
  genre: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const updateListingSchema = z.object({
  listingStatus: z.enum(['UNLISTED', 'LISTED', 'CLOSED']).optional(),
  listingDescription: z.string().max(5000).optional(),
  listingTags: z.array(z.string().max(50)).max(10).optional(),
  requiredFields: z.array(z.string().max(100)).max(20).optional(),
});

export const applySchema = z.object({
  responses: z.array(z.object({
    promptId: z.string(),
    prompt: z.string(),
    response: z.string().max(5000),
  })).max(20),
});

// --- Service Functions ---

export async function listListedCampaigns(filters?: z.infer<typeof listingFiltersSchema>) {
  const { search, genre, page = 1, limit = 20 } = filters || {};

  const where: Record<string, unknown> = {
    listingStatus: 'LISTED',
    status: 'ACTIVE',
  };

  if (genre) {
    where.genre = genre;
  }

  // For SQLite, we use contains for basic text search
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { listingDescription: { contains: search } },
    ];
  }

  const [campaigns, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      select: {
        id: true,
        name: true,
        genre: true,
        listingDescription: true,
        listingTags: true,
        maxTrailblazers: true,
        createdAt: true,
        gmUser: {
          select: { username: true },
        },
        _count: {
          select: { members: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.campaign.count({ where }),
  ]);

  return {
    campaigns: campaigns.map(c => ({
      id: c.id,
      name: c.name,
      genre: c.genre,
      description: c.listingDescription,
      tags: c.listingTags ? JSON.parse(c.listingTags) as string[] : [],
      gmUsername: c.gmUser.username,
      memberCount: c._count.members,
      maxTrailblazers: c.maxTrailblazers,
      createdAt: c.createdAt,
    })),
    total,
    page,
    limit,
  };
}

export async function getCampaignListing(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      name: true,
      genre: true,
      description: true,
      listingStatus: true,
      listingDescription: true,
      listingTags: true,
      requiredFields: true,
      applicationTemplate: true,
      maxTrailblazers: true,
      status: true,
      createdAt: true,
      gmUser: {
        select: {
          username: true,
          role: true,
          profile: true,
          watcherProfile: true,
        },
      },
      _count: {
        select: { members: true },
      },
    },
  });

  if (!campaign) throw new NotFoundError('Campaign not found');

  // Parse GM profile for public display (strip topicsToAvoid)
  const gmProfile = campaign.gmUser.profile ? JSON.parse(campaign.gmUser.profile) : null;
  if (gmProfile) delete gmProfile.topicsToAvoid;

  return {
    id: campaign.id,
    name: campaign.name,
    genre: campaign.genre,
    description: campaign.listingDescription || campaign.description,
    listingStatus: campaign.listingStatus,
    tags: campaign.listingTags ? JSON.parse(campaign.listingTags) as string[] : [],
    requiredFields: campaign.requiredFields ? JSON.parse(campaign.requiredFields) as string[] : [],
    applicationTemplate: campaign.applicationTemplate ? JSON.parse(campaign.applicationTemplate) : null,
    memberCount: campaign._count.members,
    maxTrailblazers: campaign.maxTrailblazers,
    status: campaign.status,
    createdAt: campaign.createdAt,
    gm: {
      username: campaign.gmUser.username,
      profile: gmProfile,
      watcherProfile: campaign.gmUser.watcherProfile ? JSON.parse(campaign.gmUser.watcherProfile) : null,
    },
  };
}

export async function updateListing(
  campaignId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof updateListingSchema>,
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(userId, userRole, campaign)) {
    throw new ForbiddenError('Only the GM can manage the listing');
  }

  const validated = updateListingSchema.parse(input);

  const data: Record<string, unknown> = {};
  if (validated.listingStatus !== undefined) data.listingStatus = validated.listingStatus;
  if (validated.listingDescription !== undefined) data.listingDescription = validated.listingDescription;
  if (validated.listingTags !== undefined) data.listingTags = JSON.stringify(validated.listingTags);
  if (validated.requiredFields !== undefined) data.requiredFields = JSON.stringify(validated.requiredFields);

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data,
  });

  return {
    listingStatus: updated.listingStatus,
    listingDescription: updated.listingDescription,
    listingTags: updated.listingTags ? JSON.parse(updated.listingTags) : [],
    requiredFields: updated.requiredFields ? JSON.parse(updated.requiredFields) : [],
  };
}

const DEFAULT_CAMPAIGN_PROMPTS = [
  { id: 'campaign-1', prompt: 'What excites you about this campaign specifically?', required: true, category: 'interest' },
  { id: 'campaign-2', prompt: 'What kind of character concept are you considering?', required: false, category: 'character' },
  { id: 'campaign-3', prompt: 'Is there anything else you\'d like the Watcher to know?', required: false, category: 'other' },
];

export async function applyToCampaign(
  campaignId: string,
  userId: string,
  input: z.infer<typeof applySchema>,
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { _count: { select: { members: true } } },
  });

  if (!campaign) throw new NotFoundError('Campaign not found');
  if (campaign.listingStatus !== 'LISTED') throw new ValidationError('Campaign is not accepting applications');
  if (campaign.status !== 'ACTIVE') throw new ValidationError('Campaign is not active');
  if (campaign._count.members >= campaign.maxTrailblazers) throw new ValidationError('Campaign is full');
  if (campaign.gmUserId === userId) throw new ValidationError('You cannot apply to your own campaign');

  // Check not already a member
  const existing = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId, userId } },
  });
  if (existing) throw new ConflictError('You are already a member of this campaign');

  // Get user profile for snapshot
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { profile: true },
  });

  const validated = applySchema.parse(input);

  // Create member + application atomically
  const result = await prisma.$transaction(async (tx) => {
    const member = await tx.campaignMember.create({
      data: { campaignId, userId },
    });

    const application = await tx.campaignApplication.create({
      data: {
        campaignId,
        memberId: member.id,
        responses: JSON.stringify(validated.responses),
        profileSnapshot: user?.profile || null,
        status: 'SUBMITTED',
      },
    });

    return { member, application };
  });

  return result;
}

export function getDefaultCampaignPrompts() {
  return DEFAULT_CAMPAIGN_PROMPTS;
}
