/**
 * Seed the KRMA Genesis — creates reserve wallets and seeds the initial supply.
 *
 * This script should only be run ONCE. It is idempotent — running it again
 * will detect existing genesis and skip.
 *
 * Usage: npx tsx scripts/seed-genesis.ts
 */
import { prisma } from '../src/lib/db';
import { createSystemWallet } from '../src/services/krma/wallet';
import { executeTransaction } from '../src/services/krma/ledger';
import {
  GENESIS_SUPPLY,
  GENESIS_DISTRIBUTION,
  SYSTEM_WALLETS,
  VOID_WALLET_ID,
  BURN_CAP,
} from '../src/types/krma';

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  GRO.WTH KRMA Genesis Seeding');
  console.log('═══════════════════════════════════════');
  console.log();

  // Check if genesis has already run
  const existingSeq = await prisma.ledgerSequence.findUnique({ where: { id: 'singleton' } });
  if (existingSeq && existingSeq.current > BigInt(0)) {
    console.log(`Genesis already seeded (${existingSeq.current} transactions exist). Skipping.`);
    return;
  }

  // Ensure LedgerSequence singleton exists
  await prisma.ledgerSequence.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', current: BigInt(0) },
    update: {},
  });

  // Ensure BurnLedger singleton exists
  await prisma.burnLedger.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', totalBurned: BigInt(0), cap: BURN_CAP },
    update: {},
  });

  console.log('✓ Ledger infrastructure initialized');

  // Create system wallets
  const burnSink = await createSystemWallet('BURN', SYSTEM_WALLETS.BURN_SINK);
  console.log(`✓ Burn Sink wallet: ${burnSink.id}`);

  const ladyDeath = await createSystemWallet('LADY_DEATH', SYSTEM_WALLETS.LADY_DEATH);
  console.log(`✓ Lady Death wallet: ${ladyDeath.id}`);

  // Create reserve wallets and seed them
  console.log();
  console.log('Seeding reserve wallets...');
  console.log(`Total supply: ${GENESIS_SUPPLY.toLocaleString()} KRMA`);
  console.log();

  let totalSeeded = BigInt(0);

  for (const [key, config] of Object.entries(GENESIS_DISTRIBUTION)) {
    const wallet = await createSystemWallet('RESERVE', config.label);

    // Seed the wallet with its genesis allocation
    await executeTransaction({
      fromWalletId: VOID_WALLET_ID,
      toWalletId: wallet.id,
      amount: config.amount,
      state: 'FLUID',
      reason: 'GENESIS_SEED',
      description: `Genesis: ${config.label} reserve (${config.percentage}%)`,
      metadata: {
        reserve: key,
        percentage: config.percentage,
        genesisSupply: GENESIS_SUPPLY.toString(),
      },
      actorId: 'SYSTEM',
      actorType: 'GODHEAD',
    });

    totalSeeded += config.amount;
    console.log(`  ${config.label.padEnd(10)} ${config.percentage.toString().padStart(6)}%  ${config.amount.toLocaleString().padStart(20)} KRMA  [${wallet.id}]`);
  }

  console.log(`  ${'─'.repeat(55)}`);
  console.log(`  ${'TOTAL'.padEnd(10)} ${'100'.padStart(6)}%  ${totalSeeded.toLocaleString().padStart(20)} KRMA`);

  // Verify
  if (totalSeeded !== GENESIS_SUPPLY) {
    console.error(`\n✗ ERROR: Seeded ${totalSeeded} but expected ${GENESIS_SUPPLY}`);
    process.exit(1);
  }

  // Create wallet for existing GODHEAD user if they don't have one
  const godhead = await prisma.user.findFirst({
    where: { role: 'GODHEAD' },
    include: { wallet: true },
  });

  if (godhead && !godhead.wallet) {
    await prisma.wallet.create({
      data: {
        ownerId: godhead.id,
        walletType: 'USER',
        ownerType: 'USER',
        balance: BigInt(0),
      },
    });
    console.log(`\n✓ Created wallet for GODHEAD user: ${godhead.username}`);
  } else if (godhead?.wallet) {
    // Ensure existing wallet has walletType set
    if (!godhead.wallet.walletType || godhead.wallet.walletType === 'USER') {
      console.log(`\n✓ GODHEAD user "${godhead.username}" already has a wallet`);
    }
  }

  console.log('\n═══════════════════════════════════════');
  console.log('  Genesis complete. The ledger lives.');
  console.log('═══════════════════════════════════════');
}

main()
  .catch((err) => {
    console.error('Genesis failed:', err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
