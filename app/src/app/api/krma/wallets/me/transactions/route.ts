import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getWalletByOwner, getTransactionHistory } from '@/services/krma/wallet';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const wallet = await getWalletByOwner(session.user.id);

    const sp = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(sp.get('limit') || '20'), 100);
    const offset = parseInt(sp.get('offset') || '0');
    const reason = sp.get('reason') || undefined;

    const { transactions, total } = await getTransactionHistory(wallet.id, { limit, offset, reason });

    return NextResponse.json({
      transactions: transactions.map(tx => ({
        ...tx,
        sequenceNumber: tx.sequenceNumber.toString(),
        amount: tx.amount.toString(),
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
