/**
 * KRMA Ledger Service — Core Transaction Engine
 *
 * ALL KRMA mutations flow through this service. No other code directly
 * writes to KrmaTransaction or updates Wallet.balance.
 *
 * Properties: append-only, checksummed, idempotent, atomic.
 */
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { ValidationError, InsufficientBalanceError, LedgerIntegrityError, NotFoundError } from '@/lib/errors';
import {
  VOID_WALLET_ID,
  GENESIS_CHECKSUM_SEED,
  type KrmaState,
  type TransactionReason,
  type ActorType,
  type TransactionMetadata,
  type TransactionRecord,
} from '@/types/krma';

// ── Validation Schema ──

export const createTransactionSchema = z.object({
  fromWalletId: z.string().min(1),
  toWalletId: z.string().min(1),
  amount: z.bigint().positive('Amount must be positive'),
  state: z.string() as z.ZodType<KrmaState>,
  reason: z.string() as z.ZodType<TransactionReason>,
  description: z.string().default(''),
  metadata: z.record(z.string(), z.unknown()).default({}),
  campaignId: z.string().nullish(),
  actorId: z.string().min(1),
  actorType: z.string().default('SYSTEM') as z.ZodType<ActorType>,
  idempotencyKey: z.string().nullish(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

// ── Checksum Computation ──

export function computeChecksum(
  sequenceNumber: bigint,
  fromWalletId: string,
  toWalletId: string,
  amount: bigint,
  state: string,
  reason: string,
  previousChecksum: string,
): string {
  const data = [
    sequenceNumber.toString(),
    fromWalletId,
    toWalletId,
    amount.toString(),
    state,
    reason,
    previousChecksum,
  ].join('||');

  return crypto.createHash('sha256').update(data).digest('hex');
}

// ── Core Transaction Execution ──

/**
 * Execute a single KRMA transaction atomically.
 * This is the ONLY write path for KRMA mutations.
 */
export async function executeTransaction(input: CreateTransactionInput): Promise<TransactionRecord> {
  const validated = createTransactionSchema.parse(input);
  const isGenesis = validated.reason === 'GENESIS_SEED' && validated.fromWalletId === VOID_WALLET_ID;

  return await prisma.$transaction(async (tx) => {
    // 1. Idempotency check
    if (validated.idempotencyKey) {
      const existing = await tx.krmaTransaction.findUnique({
        where: { idempotencyKey: validated.idempotencyKey },
      });
      if (existing) {
        return toTransactionRecord(existing);
      }
    }

    // 2. Validate source wallet (skip for genesis — no source)
    if (!isGenesis) {
      const sourceWallet = await tx.wallet.findUnique({
        where: { id: validated.fromWalletId },
      });
      if (!sourceWallet) throw new NotFoundError(`Source wallet not found: ${validated.fromWalletId}`);
      if (sourceWallet.frozen) throw new ValidationError('Source wallet is frozen');
      if (sourceWallet.balance < validated.amount) {
        throw new InsufficientBalanceError(
          `Wallet ${validated.fromWalletId} has ${sourceWallet.balance}, needs ${validated.amount}`
        );
      }
    }

    // 3. Validate destination wallet
    const destWallet = await tx.wallet.findUnique({
      where: { id: validated.toWalletId },
    });
    if (!destWallet) throw new NotFoundError(`Destination wallet not found: ${validated.toWalletId}`);
    if (destWallet.frozen) throw new ValidationError('Destination wallet is frozen');

    // 4. Increment sequence number atomically
    const seq = await tx.ledgerSequence.update({
      where: { id: 'singleton' },
      data: { current: { increment: 1 } },
    });
    const sequenceNumber = seq.current;

    // 5. Get previous checksum
    let previousChecksum = GENESIS_CHECKSUM_SEED;
    if (sequenceNumber > BigInt(1)) {
      const prev = await tx.krmaTransaction.findUnique({
        where: { sequenceNumber: sequenceNumber - BigInt(1) },
      });
      if (!prev) throw new LedgerIntegrityError(`Missing transaction at sequence ${sequenceNumber - BigInt(1)}`);
      previousChecksum = prev.checksum;
    }

    // 6. Compute checksum
    const checksum = computeChecksum(
      sequenceNumber,
      validated.fromWalletId,
      validated.toWalletId,
      validated.amount,
      validated.state,
      validated.reason,
      previousChecksum,
    );

    // 7. Create transaction record
    const txRecord = await tx.krmaTransaction.create({
      data: {
        sequenceNumber,
        fromWalletId: validated.fromWalletId,
        toWalletId: validated.toWalletId,
        amount: validated.amount,
        state: validated.state,
        reason: validated.reason,
        description: validated.description,
        metadata: JSON.stringify(validated.metadata),
        campaignId: validated.campaignId ?? null,
        actorId: validated.actorId,
        actorType: validated.actorType,
        checksum,
        idempotencyKey: validated.idempotencyKey ?? null,
      },
    });

    // 8. Update balances
    if (!isGenesis) {
      await tx.wallet.update({
        where: { id: validated.fromWalletId },
        data: { balance: { decrement: validated.amount } },
      });
    }
    await tx.wallet.update({
      where: { id: validated.toWalletId },
      data: { balance: { increment: validated.amount } },
    });

    return toTransactionRecord(txRecord);
  });
}

/**
 * Execute multiple transactions atomically in a single DB transaction.
 * Each gets its own sequence number and checksum, chained in order.
 * Used for death splits and other compound operations.
 */
export async function executeBatch(inputs: CreateTransactionInput[]): Promise<TransactionRecord[]> {
  if (inputs.length === 0) throw new ValidationError('Batch cannot be empty');

  return await prisma.$transaction(async (tx) => {
    const results: TransactionRecord[] = [];

    for (const input of inputs) {
      const validated = createTransactionSchema.parse(input);
      const isGenesis = validated.reason === 'GENESIS_SEED' && validated.fromWalletId === VOID_WALLET_ID;

      // Idempotency check
      if (validated.idempotencyKey) {
        const existing = await tx.krmaTransaction.findUnique({
          where: { idempotencyKey: validated.idempotencyKey },
        });
        if (existing) {
          results.push(toTransactionRecord(existing));
          continue;
        }
      }

      // Validate source
      if (!isGenesis) {
        const sourceWallet = await tx.wallet.findUnique({
          where: { id: validated.fromWalletId },
        });
        if (!sourceWallet) throw new NotFoundError(`Source wallet not found: ${validated.fromWalletId}`);
        if (sourceWallet.frozen) throw new ValidationError('Source wallet is frozen');
        if (sourceWallet.balance < validated.amount) {
          throw new InsufficientBalanceError(
            `Wallet ${validated.fromWalletId} has ${sourceWallet.balance}, needs ${validated.amount}`
          );
        }
      }

      // Validate destination
      const destWallet = await tx.wallet.findUnique({
        where: { id: validated.toWalletId },
      });
      if (!destWallet) throw new NotFoundError(`Destination wallet not found: ${validated.toWalletId}`);
      if (destWallet.frozen) throw new ValidationError('Destination wallet is frozen');

      // Sequence number
      const seq = await tx.ledgerSequence.update({
        where: { id: 'singleton' },
        data: { current: { increment: 1 } },
      });
      const sequenceNumber = seq.current;

      // Previous checksum
      let previousChecksum = GENESIS_CHECKSUM_SEED;
      if (sequenceNumber > BigInt(1)) {
        // Check our batch results first (for chaining within the batch)
        const prevInBatch = results.find(r => r.sequenceNumber === sequenceNumber - BigInt(1));
        if (prevInBatch) {
          previousChecksum = prevInBatch.checksum;
        } else {
          const prev = await tx.krmaTransaction.findUnique({
            where: { sequenceNumber: sequenceNumber - BigInt(1) },
          });
          if (!prev) throw new LedgerIntegrityError(`Missing transaction at sequence ${sequenceNumber - BigInt(1)}`);
          previousChecksum = prev.checksum;
        }
      }

      // Checksum
      const checksum = computeChecksum(
        sequenceNumber,
        validated.fromWalletId,
        validated.toWalletId,
        validated.amount,
        validated.state,
        validated.reason,
        previousChecksum,
      );

      // Create record
      const txRecord = await tx.krmaTransaction.create({
        data: {
          sequenceNumber,
          fromWalletId: validated.fromWalletId,
          toWalletId: validated.toWalletId,
          amount: validated.amount,
          state: validated.state,
          reason: validated.reason,
          description: validated.description,
          metadata: JSON.stringify(validated.metadata),
          campaignId: validated.campaignId ?? null,
          actorId: validated.actorId,
          actorType: validated.actorType,
          checksum,
          idempotencyKey: validated.idempotencyKey ?? null,
        },
      });

      // Update balances
      if (!isGenesis) {
        await tx.wallet.update({
          where: { id: validated.fromWalletId },
          data: { balance: { decrement: validated.amount } },
        });
      }
      await tx.wallet.update({
        where: { id: validated.toWalletId },
        data: { balance: { increment: validated.amount } },
      });

      results.push(toTransactionRecord(txRecord));
    }

    return results;
  });
}

// ── Query Functions ──

export async function getTransaction(id: string): Promise<TransactionRecord | null> {
  const tx = await prisma.krmaTransaction.findUnique({ where: { id } });
  return tx ? toTransactionRecord(tx) : null;
}

export async function getTransactionBySequence(sequenceNumber: bigint): Promise<TransactionRecord | null> {
  const tx = await prisma.krmaTransaction.findUnique({ where: { sequenceNumber } });
  return tx ? toTransactionRecord(tx) : null;
}

export async function getLatestSequenceNumber(): Promise<bigint> {
  const seq = await prisma.ledgerSequence.findUnique({ where: { id: 'singleton' } });
  return seq?.current ?? BigInt(0);
}

// ── Helpers ──

interface RawTransaction {
  id: string;
  sequenceNumber: bigint;
  fromWalletId: string;
  toWalletId: string;
  amount: bigint;
  state: string;
  reason: string;
  description: string;
  metadata: string;
  campaignId: string | null;
  actorId: string;
  actorType: string;
  checksum: string;
  idempotencyKey: string | null;
  createdAt: Date;
}

function toTransactionRecord(raw: RawTransaction): TransactionRecord {
  let metadata: TransactionMetadata = {};
  try {
    metadata = JSON.parse(raw.metadata) as TransactionMetadata;
  } catch {
    // metadata stays empty object
  }
  return {
    id: raw.id,
    sequenceNumber: raw.sequenceNumber,
    fromWalletId: raw.fromWalletId,
    toWalletId: raw.toWalletId,
    amount: raw.amount,
    state: raw.state,
    reason: raw.reason,
    description: raw.description,
    metadata,
    campaignId: raw.campaignId,
    actorId: raw.actorId,
    actorType: raw.actorType,
    checksum: raw.checksum,
    idempotencyKey: raw.idempotencyKey,
    createdAt: raw.createdAt,
  };
}
