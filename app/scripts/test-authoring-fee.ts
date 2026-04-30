/**
 * Verify authoring fee fires: read pre-balances, call authorForgeItem
 * (real Kai LLM call), read post-balances, assert the 10 KRMA moved.
 *
 * Run: npx tsx scripts/test-authoring-fee.ts (with shim)
 */

import { config } from 'dotenv';
config();

import { prisma } from '../src/lib/db';
import { authorForgeItem } from '../src/services/forge-authoring';

async function balance(walletId: string): Promise<bigint> {
  const w = await prisma.wallet.findUnique({ where: { id: walletId }, select: { balance: true } });
  return w?.balance ?? BigInt(-1);
}

async function main() {
  const campaign = await prisma.campaign.findFirst({ where: { name: 'The Prime Campaign' } });
  if (!campaign) throw new Error('Prime Campaign not found');

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) throw new Error('No ADMIN user');

  const campaignWallet = await prisma.wallet.findFirst({
    where: { campaignId: campaign.id, ownerType: 'CAMPAIGN' },
  });
  const kai = await prisma.godHead.findUnique({ where: { name: 'Kai' } });
  if (!campaignWallet || !kai?.walletId) throw new Error('Wallet setup missing');

  const beforeCampaign = await balance(campaignWallet.id);
  const beforeKai = await balance(kai.walletId);
  console.log(`pre  campaign=${beforeCampaign} kai=${beforeKai}`);

  console.log(`\n→ Authoring a tiny test skill via Kai...\n`);
  const result = await authorForgeItem(campaign.id, admin.id, admin.role, {
    type: 'skill',
    name: 'Idle Whistling',
    description: 'A trivial cosmetic skill: producing pleasant whistled tunes while at rest. No combat use.',
  });
  console.log(`canonicalName: ${result.canonicalName}`);
  console.log(`suggestedKV:   ${result.suggestedKV}`);
  console.log(`reasoning:     ${result.godheadReasoning.slice(0, 200)}…`);

  const afterCampaign = await balance(campaignWallet.id);
  const afterKai = await balance(kai.walletId);
  console.log(`\npost campaign=${afterCampaign} kai=${afterKai}`);

  const campaignDelta = beforeCampaign - afterCampaign;
  const kaiDelta = afterKai - beforeKai;
  console.log(`\ndelta: campaign=-${campaignDelta} kai=+${kaiDelta}`);

  if (campaignDelta === BigInt(10) && kaiDelta === BigInt(10)) {
    console.log('✔ Authoring fee fired correctly');
  } else {
    console.error('✗ Expected 10 KRMA to move; check ledger');
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
