/**
 * read_wallet — Look up any wallet's balance + recent transactions.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerTool } from './registry';

const inputSchema = z.object({
  walletId: z.string().describe('The wallet ID to look up'),
  transactionLimit: z.number().describe('How many recent transactions to include (max 50)').optional(),
});

registerTool({
  name: 'read_wallet',
  description: 'Read a wallet: current balance, type, owner, and recent transactions. Use this to understand an entity\'s KRMA state before acting on the economy.',
  inputSchema,
  handler: async (input) => {
    const { walletId, transactionLimit } = input as z.infer<typeof inputSchema>;
    const take = Math.min(Math.max(transactionLimit ?? 10, 1), 50);

    const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new Error(`Wallet not found: ${walletId}`);

    const txs = await prisma.krmaTransaction.findMany({
      where: { OR: [{ fromWalletId: walletId }, { toWalletId: walletId }] },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        sequenceNumber: true,
        fromWalletId: true,
        toWalletId: true,
        amount: true,
        state: true,
        reason: true,
        description: true,
        actorId: true,
        actorType: true,
        campaignId: true,
        createdAt: true,
      },
    });

    return {
      id: wallet.id,
      walletType: wallet.walletType,
      label: wallet.label,
      balance: wallet.balance.toString(),
      campaignId: wallet.campaignId,
      characterId: wallet.characterId,
      frozen: wallet.frozen,
      ownerId: wallet.ownerId,
      recentTransactions: txs.map(t => ({
        id: t.id,
        sequence: t.sequenceNumber.toString(),
        direction: t.fromWalletId === walletId ? 'out' : 'in',
        counterpartyWalletId: t.fromWalletId === walletId ? t.toWalletId : t.fromWalletId,
        amount: t.amount.toString(),
        state: t.state,
        reason: t.reason,
        description: t.description,
        actorId: t.actorId,
        actorType: t.actorType,
        campaignId: t.campaignId,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  },
});
