/**
 * Prime Campaign Helpers — the cosmic top-level ADMIN-only campaign that
 * holds all godhead characters AND, in time, "campaign card" canvas
 * objects representing every other campaign in the metaverse.
 *
 * Per Mike 2026-05-24: "It is the prime campaign. There will be special
 * tools only for this campaign and it will act as the control for the
 * entire metaverse. The whole game."
 *
 * Marker: the campaign whose `name === PRIME_CAMPAIGN_NAME`. Treat ANY
 * such campaign as admin-only. Access guard: `assertPrimeCampaignAccess()`.
 */

import { prisma } from './db';
import { ForbiddenError } from './errors';
import { isAdminRole } from './permissions';

export const PRIME_CAMPAIGN_NAME = '__PRIME__';
export const PRIME_CAMPAIGN_DISPLAY = '{0.G} Prime Campaign';

export async function getPrimeCampaign() {
  return prisma.campaign.findFirst({ where: { name: PRIME_CAMPAIGN_NAME } });
}

export function isPrimeCampaign(c: { name: string } | null | undefined): boolean {
  return !!c && c.name === PRIME_CAMPAIGN_NAME;
}

/**
 * Throws if userRole is not admin AND the campaign is the prime-campaign.
 * Pass through (no-op) for non-prime campaigns. Call this at the top of any
 * service / route that resolves a campaign by id.
 */
export function assertPrimeCampaignAccess(
  campaign: { name: string } | null | undefined,
  userRole: string,
): void {
  if (isPrimeCampaign(campaign) && !isAdminRole(userRole)) {
    throw new ForbiddenError('Prime campaign is admin-only');
  }
}

export async function isPrimeCampaignId(campaignId: string | null | undefined): Promise<boolean> {
  if (!campaignId) return false;
  const c = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { name: true } });
  return isPrimeCampaign(c);
}

/**
 * Prime Campaign's wallet IS the Terminal reserve (the big 75B KRMA pool).
 * Per Mike 2026-05-25: "The prime campaign KRMA wallet is the terminal.
 * It is the big reserve." Same wallet, unified concept — the cosmic
 * control surface holds the cosmic pool.
 *
 * Implementation: the wallet stays `walletType: 'RESERVE'` + `label: 'Terminal'`
 * so the subscription service's `getReserveWallet('Terminal')` and other
 * legacy callers keep working unchanged. The migration also stamps the
 * Terminal reserve with `campaignId = prime.id` so queries by campaign
 * find it too.
 */
export async function getPrimeWallet() {
  return prisma.wallet.findFirst({ where: { walletType: 'RESERVE', label: 'Terminal' } });
}
