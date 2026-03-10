import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { canManageCampaign } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { getWalletByCampaign } from '@/services/krma/wallet';
import { ForbiddenError, NotFoundError } from '@/lib/errors';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;

    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundError('Campaign not found');
    if (!canManageCampaign(session.user.id, session.user.role, campaign)) {
      throw new ForbiddenError('Only the campaign GM can view campaign balance');
    }

    const wallet = await getWalletByCampaign(campaignId);
    return NextResponse.json({
      campaignId,
      balance: wallet.balance.toString(),
      walletId: wallet.id,
      frozen: wallet.frozen,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
