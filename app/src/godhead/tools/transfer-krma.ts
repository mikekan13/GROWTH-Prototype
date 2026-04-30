/**
 * transfer_krma — God-head transfers KRMA from its own wallet to
 * another wallet. Wraps the ledger service. Reasons are constrained
 * to a safe subset appropriate for god-head agency.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { executeTransaction } from '@/services/krma/ledger';
import { registerTool } from './registry';
import type { TransactionReason, KrmaState } from '@/types/krma';

// God-heads can invoke these reasons. Other ledger reasons
// (GENESIS_SEED, CORRECTION, death-split flow, etc.) are reserved
// for system code or the admin, not for agent action.
const ALLOWED_REASONS: TransactionReason[] = [
  'DIVINE_FAVOR',
  'STORY_INFLUENCE',
  'GROVINE_NECTAR',
  'GROVINE_NECTAR_DECLINE',
  'GROVINE_TAX',
  'SESSION_REWARD',
];

const inputSchema = z.object({
  toWalletId: z.string().describe('Destination wallet ID'),
  amount: z.string().describe('Amount as a decimal string (supports values larger than JS number can represent)'),
  reason: z.enum(ALLOWED_REASONS as [string, ...string[]]).describe('Which god-head-appropriate ledger reason applies'),
  description: z.string().describe('Human-readable explanation (shown in ledger + UI)'),
  campaignId: z.string().describe('Campaign context if applicable').optional(),
});

registerTool({
  name: 'transfer_krma',
  description: "Transfer KRMA from your wallet to another wallet. You must have enough balance. Reason is restricted to god-head-allowed types. Use this to reward, tax, or divinely favor entities in response to their actions.",
  inputSchema,
  handler: async (input, context) => {
    const { toWalletId, amount, reason, description, campaignId } =
      input as z.infer<typeof inputSchema>;

    let amountBig: bigint;
    try {
      amountBig = BigInt(amount);
    } catch {
      throw new Error(`Invalid amount: ${amount}. Pass a decimal string like "1000".`);
    }
    if (amountBig <= BigInt(0)) throw new Error('Amount must be positive');

    const godhead = await prisma.godHead.findUnique({
      where: { id: context.godHeadId },
      select: { walletId: true },
    });
    if (!godhead?.walletId) {
      throw new Error(`God-head ${context.godHeadName} has no wallet assigned`);
    }
    if (godhead.walletId === toWalletId) {
      throw new Error('Cannot transfer to your own wallet');
    }

    const fromWallet = await prisma.wallet.findUnique({
      where: { id: godhead.walletId },
      select: { balance: true, frozen: true },
    });
    if (!fromWallet) throw new Error('Your wallet could not be loaded');
    if (fromWallet.frozen) throw new Error('Your wallet is frozen');
    if (fromWallet.balance < amountBig) {
      throw new Error(
        `Insufficient balance: have ${fromWallet.balance.toString()}, need ${amountBig.toString()}`,
      );
    }

    const toWallet = await prisma.wallet.findUnique({
      where: { id: toWalletId },
      select: { id: true, walletType: true, frozen: true },
    });
    if (!toWallet) throw new Error(`Destination wallet not found: ${toWalletId}`);
    if (toWallet.frozen) throw new Error('Destination wallet is frozen');

    const record = await executeTransaction({
      fromWalletId: godhead.walletId,
      toWalletId,
      amount: amountBig,
      state: 'FLUID' as KrmaState,
      reason: reason as TransactionReason,
      description,
      metadata: { invocationId: context.invocationId, godHeadName: context.godHeadName },
      campaignId: campaignId ?? null,
      actorId: context.godHeadId,
      actorType: 'GODHEAD',
      idempotencyKey: `godhead:${context.invocationId}:${context.godHeadId}:${toWalletId}`,
    });

    return {
      transactionId: record.id,
      sequenceNumber: record.sequenceNumber.toString(),
      amount: amountBig.toString(),
      reason,
      fromWalletId: godhead.walletId,
      toWalletId,
      createdAt: record.createdAt.toISOString(),
    };
  },
});
