/**
 * KRMA Reconciliation Service
 *
 * Verifies ledger integrity: balance consistency,
 * global supply invariant, and checksum chain validity.
 */
import { prisma } from '@/lib/db';
import { computeChecksum } from './ledger';
import {
  GENESIS_SUPPLY,
  GENESIS_CHECKSUM_SEED,
  VOID_WALLET_ID,
  type ReconciliationReport,
} from '@/types/krma';

/**
 * Recompute all wallet balances from the transaction log
 * and compare against materialized balances.
 */
export async function reconcileAllBalances(): Promise<{
  discrepancies: Array<{ walletId: string; expected: bigint; actual: bigint }>;
  walletCount: number;
}> {
  // Compute expected balances from transaction log
  const expectedBalances = new Map<string, bigint>();

  // Process all transactions in sequence order
  const allTx = await prisma.krmaTransaction.findMany({
    orderBy: { sequenceNumber: 'asc' },
    select: { fromWalletId: true, toWalletId: true, amount: true, reason: true },
  });

  for (const tx of allTx) {
    const isGenesis = tx.reason === 'GENESIS_SEED' && tx.fromWalletId === VOID_WALLET_ID;

    // Debit source (skip for genesis)
    if (!isGenesis) {
      const current = expectedBalances.get(tx.fromWalletId) ?? BigInt(0);
      expectedBalances.set(tx.fromWalletId, current - tx.amount);
    }

    // Credit destination
    const current = expectedBalances.get(tx.toWalletId) ?? BigInt(0);
    expectedBalances.set(tx.toWalletId, current + tx.amount);
  }

  // Compare with materialized balances
  const wallets = await prisma.wallet.findMany({
    select: { id: true, balance: true },
  });

  const discrepancies: Array<{ walletId: string; expected: bigint; actual: bigint }> = [];
  for (const wallet of wallets) {
    const expected = expectedBalances.get(wallet.id) ?? BigInt(0);
    if (expected !== wallet.balance) {
      discrepancies.push({
        walletId: wallet.id,
        expected,
        actual: wallet.balance,
      });
    }
  }

  return { discrepancies, walletCount: wallets.length };
}

/**
 * Verify the global supply invariant:
 * SUM(all wallet balances) + totalBurned = GENESIS_SUPPLY
 *
 * Only valid after genesis has been seeded.
 */
export async function verifyGlobalInvariant(): Promise<{
  valid: boolean;
  totalInWallets: bigint;
  totalBurned: bigint;
  expected: bigint;
}> {
  const wallets = await prisma.wallet.findMany({
    select: { balance: true },
  });

  const burnLedger = await prisma.burnLedger.findUnique({
    where: { id: 'singleton' },
  });

  const totalInWallets = wallets.reduce((sum, w) => sum + w.balance, BigInt(0));
  const totalBurned = burnLedger?.totalBurned ?? BigInt(0);
  const actual = totalInWallets + totalBurned;

  return {
    valid: actual === GENESIS_SUPPLY,
    totalInWallets,
    totalBurned,
    expected: GENESIS_SUPPLY,
  };
}

/**
 * Verify the checksum chain integrity.
 * Recomputes each checksum and compares to stored value.
 */
export async function verifyChecksumChain(
  fromSequence?: bigint,
  toSequence?: bigint,
): Promise<{ valid: boolean; lastVerified: bigint; brokenAt?: bigint }> {
  const start = fromSequence ?? BigInt(1);

  const seq = await prisma.ledgerSequence.findUnique({ where: { id: 'singleton' } });
  const end = toSequence ?? (seq?.current ?? BigInt(0));

  if (end < start) {
    return { valid: true, lastVerified: BigInt(0) };
  }

  // Fetch transactions in range
  const transactions = await prisma.krmaTransaction.findMany({
    where: {
      sequenceNumber: { gte: start, lte: end },
    },
    orderBy: { sequenceNumber: 'asc' },
  });

  let previousChecksum = GENESIS_CHECKSUM_SEED;

  // If starting from > 1, get the previous checksum
  if (start > BigInt(1)) {
    const prev = await prisma.krmaTransaction.findUnique({
      where: { sequenceNumber: start - BigInt(1) },
    });
    if (prev) {
      previousChecksum = prev.checksum;
    }
  }

  let lastVerified = start - BigInt(1);

  for (const tx of transactions) {
    const expected = computeChecksum(
      tx.sequenceNumber,
      tx.fromWalletId,
      tx.toWalletId,
      tx.amount,
      tx.state,
      tx.reason,
      previousChecksum,
    );

    if (expected !== tx.checksum) {
      return { valid: false, lastVerified, brokenAt: tx.sequenceNumber };
    }

    previousChecksum = tx.checksum;
    lastVerified = tx.sequenceNumber;
  }

  return { valid: true, lastVerified };
}

/**
 * Full audit: balance reconciliation + global invariant + checksum chain.
 */
export async function fullAudit(): Promise<ReconciliationReport> {
  const [balanceCheck, invariantCheck, checksumCheck] = await Promise.all([
    reconcileAllBalances(),
    verifyGlobalInvariant(),
    verifyChecksumChain(),
  ]);

  return {
    valid: balanceCheck.discrepancies.length === 0
      && invariantCheck.valid
      && checksumCheck.valid,
    checkedAt: new Date(),
    walletCount: balanceCheck.walletCount,
    discrepancies: balanceCheck.discrepancies,
    globalInvariantHolds: invariantCheck.valid,
    totalInWallets: invariantCheck.totalInWallets,
    totalBurned: invariantCheck.totalBurned,
    checksumChainValid: checksumCheck.valid,
    brokenAtSequence: checksumCheck.brokenAt,
  };
}
