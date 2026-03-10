import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getWalletByOwner } from '@/services/krma/wallet';

export async function GET() {
  try {
    const session = await requireAuth();
    const wallet = await getWalletByOwner(session.user.id);
    return NextResponse.json({
      wallet: {
        id: wallet.id,
        walletType: wallet.walletType,
        balance: wallet.balance.toString(),
        frozen: wallet.frozen,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
