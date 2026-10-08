/**
 * Campaign membership gate (Mike 2026-10-08). Read routes for a campaign's
 * events, changelog and sessions call this so only the campaign's GM, its
 * members and ADMIN can read them. The rule itself lives in
 * `lib/permissions.ts#canViewCampaign`; this file only fetches the facts.
 */

import 'server-only';
import { prisma } from '@/lib/db';
import { NotFoundError, ForbiddenError } from '@/lib/errors';
import { canViewCampaign } from '@/lib/permissions';

export async function requireCampaignMember(
  campaignId: string,
  user: { id: string; role: string },
): Promise<{ id: string; gmUserId: string }> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, gmUserId: true },
  });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (canViewCampaign(user.id, user.role, campaign, false)) return campaign;
  const member = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId, userId: user.id } },
    select: { id: true },
  });
  if (!canViewCampaign(user.id, user.role, campaign, !!member)) {
    throw new ForbiddenError('Not a campaign member');
  }
  return campaign;
}
