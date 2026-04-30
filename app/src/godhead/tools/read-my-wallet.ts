/**
 * read_my_wallet — Convenience: read the invoking agent's own wallet.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerTool } from './registry';

const inputSchema = z.object({});

registerTool({
  name: 'read_my_wallet',
  description: 'Read your own KRMA wallet — balance, label, and recent transactions. Use this before proposing a transfer to confirm you have the funds.',
  inputSchema,
  handler: async (_input, context) => {
    const godhead = await prisma.godHead.findUnique({
      where: { id: context.godHeadId },
      select: { walletId: true },
    });
    if (!godhead?.walletId) {
      throw new Error(`God-head ${context.godHeadName} has no wallet assigned`);
    }

    const wallet = await prisma.wallet.findUnique({ where: { id: godhead.walletId } });
    if (!wallet) throw new Error(`Wallet ${godhead.walletId} not found`);

    const txs = await prisma.krmaTransaction.findMany({
      where: { OR: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }] },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        fromWalletId: true,
        toWalletId: true,
        amount: true,
        state: true,
        reason: true,
        description: true,
        createdAt: true,
      },
    });

    return {
      id: wallet.id,
      walletType: wallet.walletType,
      label: wallet.label,
      balance: wallet.balance.toString(),
      frozen: wallet.frozen,
      recentTransactions: txs.map(t => ({
        id: t.id,
        direction: t.fromWalletId === wallet.id ? 'out' : 'in',
        counterpartyWalletId: t.fromWalletId === wallet.id ? t.toWalletId : t.fromWalletId,
        amount: t.amount.toString(),
        state: t.state,
        reason: t.reason,
        description: t.description,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  },
});
