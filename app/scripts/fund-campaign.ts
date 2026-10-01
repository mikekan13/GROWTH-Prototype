/**
 * Fund a campaign's wallet with KRMA from the Terminal reserve.
 * Idempotent — re-running tops up to the target balance.
 *
 * Run: npx tsx scripts/fund-campaign.ts <campaignId> [amount]
 *   amount defaults to 100000
 */

import { config } from 'dotenv';
config();

import { prisma } from '../src/lib/db';
import { executeTransaction } from '../src/services/krma/ledger';

const campaignId = process.argv[2];
const TARGET = process.argv[3] ? BigInt(process.argv[3]) : BigInt(100_000);

async function main() {
  if (!campaignId) {
    console.error('Usage: npx tsx scripts/fund-campaign.ts <campaignId> [amount]');
    process.exit(1);
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error(`Campaign ${campaignId} not found.`);

  const campaignWallet = await prisma.wallet.findFirst({
    where: { campaignId: campaign.id, ownerType: 'CAMPAIGN' },
  });
  if (!campaignWallet) throw new Error(`Campaign wallet for "${campaign.name}" not found.`);

  const terminalReserve = await prisma.wallet.findFirst({
    where: { walletType: 'RESERVE', label: 'Terminal' },
  });
  if (!terminalReserve) throw new Error('Terminal reserve wallet not found. Run seed-genesis.ts first.');

  const current = campaignWallet.balance;
  const need = TARGET > current ? TARGET - current : BigInt(0);

  if (need === BigInt(0)) {
    console.log(`"${campaign.name}" already has ${current.toString()} KRMA (target: ${TARGET.toString()}). No top-up.`);
    return;
  }

  const record = await executeTransaction({
    fromWalletId: terminalReserve.id,
    toWalletId: campaignWallet.id,
    amount: need,
    state: 'FLUID',
    reason: 'CAMPAIGN_FUND',
    description: `Initial fund for "${campaign.name}" — top up to ${TARGET.toString()} KRMA`,
    metadata: { source: 'fund-campaign.ts' },
    campaignId: campaign.id,
    actorId: 'SYSTEM',
    actorType: 'SYSTEM',
    idempotencyKey: `fund-campaign:${campaign.id}:${TARGET.toString()}`,
  });

  console.log(`✔ Funded "${campaign.name}": +${need.toString()} KRMA`);
  console.log(`  Tx: ${record.id} (seq ${record.sequenceNumber.toString()})`);
  console.log(`  Campaign wallet: ${campaignWallet.id}`);
  console.log(`  New balance: ${(current + need).toString()}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
