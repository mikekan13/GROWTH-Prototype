import 'server-only';
import { prisma } from '@/lib/db';
import { getCampaignEconomy } from './wallet';

/**
 * Booth-rental payout report (T15, INV-114).
 *
 * Monthly payouts to GM stewards are computed on their TOTAL KRMA — liquid
 * (fluid, undeployed in the campaign wallet) PLUS locked (crystallized into
 * characters). The liquid/locked split is only a utilization view for the GM +
 * JEWL; the payout BASIS is the total (INV-114). The distributable pool (real
 * dollars) lives OUTSIDE this system and is passed in as a parameter — this
 * service only computes each steward's fair SHARE of it.
 *
 * INV-70: JEWL / godhead / system wallets never appear here — the basis is GM
 * stewards' campaign economies only, so JEWL's wallet is structurally excluded.
 *
 * BASIS DEFINITION (RULED r-2026-07-23-07): payout is determined by the TOTAL
 * TKV in a GM's orbit — "everything, crystallized or otherwise; ALL KRMA is
 * accounted for during payouts." Basis = undeployed user-wallet balance +
 * in-world fluid + crystallized. (Supersedes the T15 interim choice that
 * excluded the undeployed wallet.)
 * The __PRIME__ meta campaign is excluded (it is the control room, not a booth).
 */

const PRIME_CAMPAIGN_NAME = '__PRIME__';

export interface StewardPayout {
  stewardId: string;
  stewardName: string;
  campaignIds: string[];
  walletLiquid: number; // undeployed user-wallet balance (r-2026-07-23-07)
  liquid: number; // fluid across their campaigns (deployed, not yet crystallized)
  locked: number; // crystallized into characters
  total: number; // walletLiquid + liquid + locked — the payout basis
  sharePct: number; // 0..100, share of the grand total
  payout: number; // sharePct/100 × distributablePool (rounded)
}

export interface PayoutReport {
  distributablePool: number;
  grandTotalKrma: number; // sum of all stewards' totals (the denominator)
  stewards: StewardPayout[];
  /** ISO timestamp is stamped by the caller (Date is unavailable to some runtimes). */
}

/**
 * Compute the payout report for the given distributable pool. Pure read over
 * the ledger-derived wallet balances — writes nothing.
 */
export async function computePayoutReport(distributablePool: number): Promise<PayoutReport> {
  if (!Number.isFinite(distributablePool) || distributablePool < 0) {
    throw new Error('distributablePool must be a non-negative number');
  }

  // GM stewards = users who run at least one non-Prime campaign.
  const campaigns = await prisma.campaign.findMany({
    where: { name: { not: PRIME_CAMPAIGN_NAME } },
    select: { id: true, gmUserId: true, gmUser: { select: { username: true } } },
  });

  // Group campaigns by steward.
  const bySteward = new Map<string, { name: string; campaignIds: string[] }>();
  for (const c of campaigns) {
    const entry = bySteward.get(c.gmUserId) ?? { name: c.gmUser?.username ?? 'Unknown', campaignIds: [] };
    entry.campaignIds.push(c.id);
    bySteward.set(c.gmUserId, entry);
  }

  // Sum each steward's TOTAL orbit: undeployed wallet + in-world liquid + locked.
  const rows: Omit<StewardPayout, 'sharePct' | 'payout'>[] = [];
  for (const [stewardId, { name, campaignIds }] of bySteward) {
    const userWallet = await prisma.wallet.findUnique({ where: { ownerId: stewardId } });
    const walletLiquid = Number(userWallet?.balance ?? BigInt(0));
    let liquid = 0;
    let locked = 0;
    for (const campaignId of campaignIds) {
      const econ = await getCampaignEconomy(campaignId);
      liquid += Number(econ.fluid);
      locked += Number(econ.crystallized);
    }
    rows.push({
      stewardId, stewardName: name, campaignIds,
      walletLiquid, liquid, locked,
      total: walletLiquid + liquid + locked,
    });
  }

  const grandTotalKrma = rows.reduce((sum, r) => sum + r.total, 0);

  const stewards: StewardPayout[] = rows
    .map(r => {
      const sharePct = grandTotalKrma > 0 ? (r.total / grandTotalKrma) * 100 : 0;
      const payout = grandTotalKrma > 0 ? Math.round((r.total / grandTotalKrma) * distributablePool) : 0;
      return { ...r, sharePct, payout };
    })
    .sort((a, b) => b.total - a.total);

  return { distributablePool, grandTotalKrma, stewards };
}
