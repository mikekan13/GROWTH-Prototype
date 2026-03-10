import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { canManageCampaign } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { getWalletByCampaign, getTransactionHistory } from '@/services/krma/wallet';
import { ForbiddenError, NotFoundError } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;

    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundError('Campaign not found');
    if (!canManageCampaign(session.user.id, session.user.role, campaign)) {
      throw new ForbiddenError('Only the campaign GM can view campaign transactions');
    }

    const wallet = await getWalletByCampaign(campaignId);

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
