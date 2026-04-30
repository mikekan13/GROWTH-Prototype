/**
 * Fund the Prime Campaign with KRMA from the Terminal reserve.
 * Idempotent — re-running tops up to the target balance.
 *
 * Run: npx tsx scripts/fund-prime-campaign.ts [amount]
 *   amount defaults to 100000
 */

import { config } from 'dotenv';
config();

import { prisma } from '../src/lib/db';
import { executeTransaction } from '../src/services/krma/ledger';

const TARGET = process.argv[2] ? BigInt(process.argv[2]) : BigInt(100_000);

async function main() {
  const campaign = await prisma.campaign.findFirst({
    where: { name: 'The Prime Campaign' },
  });
  if (!campaign) throw new Error('Prime Campaign not found. Run seed-campaign.ts first.');

  const campaignWallet = await prisma.wallet.findFirst({
    where: { campaignId: campaign.id, ownerType: 'CAMPAIGN' },
  });
  if (!campaignWallet) throw new Error('Prime Campaign wallet not found.');

  const terminalReserve = await prisma.wallet.findFirst({
    where: { walletType: 'RESERVE', label: 'Terminal' },
  });
  if (!terminalReserve) throw new Error('Terminal reserve wallet not found. Run seed-genesis.ts first.');

  const current = campaignWallet.balance;
  const need = TARGET > current ? TARGET - current : BigInt(0);

  if (need === BigInt(0)) {
    console.log(`Prime Campaign already has ${current.toString()} KRMA (target: ${TARGET.toString()}). No top-up.`);
    return;
  }

  const record = await executeTransaction({
    fromWalletId: terminalReserve.id,
    toWalletId: campaignWallet.id,
    amount: need,
    state: 'FLUID',
    reason: 'CAMPAIGN_FUND',
    description: `Initial fund for The Prime Campaign — top up to ${TARGET.toString()} KRMA`,
    metadata: { source: 'fund-prime-campaign.ts' },
    campaignId: campaign.id,
    actorId: 'SYSTEM',
    actorType: 'SYSTEM',
    idempotencyKey: `fund-prime-campaign:${TARGET.toString()}`,
  });

  console.log(`✔ Funded Prime Campaign: +${need.toString()} KRMA`);
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
