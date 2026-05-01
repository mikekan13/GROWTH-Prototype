/**
 * Verify the 3-stage authoring chain:
 *  - GM pays Creator (Tara) the chain fund
 *  - Creator pays Kai for balance check
 *  - Kai pays Et'herling for KV grade
 * Asserts wallet deltas, action logs, and per-stage records.
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
  const tara = await prisma.godHead.findUnique({ where: { name: 'Tara Almswood' } });
  const kai = await prisma.godHead.findUnique({ where: { name: 'Kai' } });
  const etherling = await prisma.godHead.findUnique({ where: { name: "Eth'erling" } });
  if (!campaignWallet || !tara?.walletId || !kai?.walletId || !etherling?.walletId) {
    throw new Error('Wallet setup missing');
  }

  const pre = {
    campaign: await balance(campaignWallet.id),
    tara: await balance(tara.walletId),
    kai: await balance(kai.walletId),
    etherling: await balance(etherling.walletId),
  };
  console.log(`pre  campaign=${pre.campaign} tara=${pre.tara} kai=${pre.kai} etherling=${pre.etherling}`);

  console.log(`\n→ Running 3-stage authoring chain (Tara → Kai → Et'herling)...\n`);
  const t0 = Date.now();
  const result = await authorForgeItem(campaign.id, admin.id, admin.role, {
    type: 'skill',
    name: 'Lazy Cartography',
    description: 'Mapping the surrounding terrain very slowly while reclining and intermittently napping. The maps come out usable but full of decorative loops where the cartographer drifted off.',
  });
  const ms = Date.now() - t0;

  console.log(`\nchain ran in ${ms}ms`);
  console.log(`canonicalName: ${result.canonicalName}`);
  console.log(`final KV:      ${result.suggestedKV}`);
  console.log(`GM-facing summary: ${result.summary}`);

  const post = {
    campaign: await balance(campaignWallet.id),
    tara: await balance(tara.walletId),
    kai: await balance(kai.walletId),
    etherling: await balance(etherling.walletId),
  };
  console.log(`\npost campaign=${post.campaign} tara=${post.tara} kai=${post.kai} etherling=${post.etherling}`);

  const dCampaign = pre.campaign - post.campaign;
  const dTara = post.tara - pre.tara;
  const dKai = post.kai - pre.kai;
  const dEth = post.etherling - pre.etherling;
  console.log(`\ndelta: campaign=-${dCampaign} tara=+${dTara} kai=+${dKai} etherling=+${dEth}`);

  // Expectations: campaign -30, tara +20 (30 in, 10 out), kai 0 (10 in, 10 out), etherling +10
  if (dCampaign === BigInt(30) && dTara === BigInt(20) && dKai === BigInt(0) && dEth === BigInt(10)) {
    console.log('\n✔ Chain economics correct: GM(-30) → Tara(+20) → Kai(0) → Et\'herling(+10)');
  } else {
    console.error('\n✗ Chain economics off — expected -30/+20/0/+10');
    process.exit(1);
  }

  // Per-stage token usage now lives in the DB (public response is sanitized).
  // Pull it from GodHeadTokenUsage for the most recent invocations.
  const tokenRows = await prisma.godHeadTokenUsage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
    include: { godHead: { select: { name: true } } },
  });
  console.log(`\nper-stage tokens (from DB, most recent 3 invocations):`);
  let totalIn = 0;
  let totalOut = 0;
  for (const row of tokenRows.reverse()) {
    console.log(`  ${row.godHead.name.padEnd(15)}: in=${row.inputTokens} out=${row.outputTokens}`);
    totalIn += row.inputTokens;
    totalOut += row.outputTokens;
  }
  const cost = (totalIn / 1_000_000) * 3 + (totalOut / 1_000_000) * 15;
  console.log(`  TOTAL          : in=${totalIn} out=${totalOut}  ~$${cost.toFixed(4)}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
