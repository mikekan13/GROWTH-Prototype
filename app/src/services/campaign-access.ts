/**
 * Campaign membership gate (Mike 2026-10-08). Read routes for a campaign's
 * events, changelog and sessions call this so only the campaign's GM, its
 * members and ADMIN can read them. The rule itself lives in
 * `lib/permissions.ts#canViewCampaign`; this file only fetches the facts.
 */

import 'server-only';
import { prisma } from '@/lib/db';
import { NotFoundError, ForbiddenError } from '@/lib/errors';
import { canViewCampaign, canManageCampaign, canPostAsCharacter } from '@/lib/permissions';

/**
 * Table-line posting gate (2026-10-09, POST /events). Only a campaign member
 * (GM, member, ADMIN) may post. The campaign's GM/ADMIN posts as 'gm' for any
 * character (unchanged). Anyone else posts as 'player', and only for their OWN
 * character in this campaign — the character name is taken from the record,
 * never from the request.
 */
export async function requireEventPoster(
  campaignId: string,
  user: { id: string; role: string },
  characterId: string | undefined,
  characterName: string | undefined,
): Promise<{ isGM: boolean; characterId: string | undefined; characterName: string | undefined }> {
  const campaign = await requireCampaignMember(campaignId, user);
  if (canManageCampaign(user.id, user.role, campaign)) return { isGM: true, characterId, characterName };
  if (!characterId) return { isGM: false, characterId: undefined, characterName: undefined };
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { id: true, name: true, userId: true, campaignId: true },
  });
  if (!character || !canPostAsCharacter(user.id, user.role, campaign, character)) {
    throw new ForbiddenError('You can only post for your own character');
  }
  return { isGM: false, characterId: character.id, characterName: character.name };
}

/**
 * Campaign GM gate (2026-10-08): only the campaign's own GM/Watcher and ADMIN
 * (rule: `lib/permissions.ts#canManageCampaign`) may run the table — start or
 * end its session. A member or another Watcher gets 403.
 */
export async function requireCampaignGM(
  campaignId: string,
  user: { id: string; role: string },
): Promise<{ id: string; gmUserId: string }> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, gmUserId: true },
  });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(user.id, user.role, campaign)) {
    throw new ForbiddenError('Only the campaign GM can do this');
  }
  return campaign;
}

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
