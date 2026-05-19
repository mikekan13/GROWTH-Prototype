import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { NotFoundError, ForbiddenError } from '@/lib/errors';
import { canViewCharacter } from '@/lib/permissions';
import { getWalletByCharacter, getTransactionHistory } from '@/services/krma/wallet';

export const dynamic = 'force-dynamic';

// GET /api/krma/wallets/character/[id]/transactions
//
// Per-character KRMA timeline. Mirror of /api/krma/wallets/me/transactions
// but scoped to a character. Anyone who can view the character (player + GM)
// can see its KRMA flow.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const character = await prisma.character.findUnique({
      where: { id },
      include: { campaign: { select: { gmUserId: true } } },
    });
    if (!character) throw new NotFoundError('Character not found');
    if (!canViewCharacter(session.user.id, session.user.role, character)) {
      throw new ForbiddenError();
    }

    let wallet;
    try {
      wallet = await getWalletByCharacter(id);
    } catch {
      // No wallet yet = no transactions yet. Return an empty page rather
      // than 404 so the UI can render the empty state inline.
      return NextResponse.json({ transactions: [], total: 0, limit: 0, offset: 0 });
    }

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
