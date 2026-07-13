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
 * BASIS DEFINITION (flagged for Mike): a steward's basis = the sum over the
 * campaigns they run of (fluid + crystallized). It does NOT (yet) include a
 * GM's UNDEPLOYED user-wallet balance — INV-114 frames the utilization view as
 * "how much of their KRMA is deployed in their world," so the basis is the
 * in-world KRMA. If undeployed drip should also count, that's a one-line add.
 * The __PRIME__ meta campaign is excluded (it is the control room, not a booth).
 */

const PRIME_CAMPAIGN_NAME = '__PRIME__';

export interface StewardPayout {
  stewardId: string;
  stewardName: string;
  campaignIds: string[];
  liquid: number; // fluid across their campaigns (undeployed-in-world)
  locked: number; // crystallized into characters
  total: number; // liquid + locked — the payout basis
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

  // Sum each steward's in-world liquid + locked via the established economy view.
  const rows: Omit<StewardPayout, 'sharePct' | 'payout'>[] = [];
  for (const [stewardId, { name, campaignIds }] of bySteward) {
    let liquid = 0;
    let locked = 0;
    for (const campaignId of campaignIds) {
      const econ = await getCampaignEconomy(campaignId);
      liquid += Number(econ.fluid);
      locked += Number(econ.crystallized);
    }
    rows.push({ stewardId, stewardName: name, campaignIds, liquid, locked, total: liquid + locked });
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
