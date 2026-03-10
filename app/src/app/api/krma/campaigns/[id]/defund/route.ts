import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { defundCampaign, fundCampaignSchema } from '@/services/krma/wallet';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const body = await request.json();
    const input = fundCampaignSchema.parse(body);

    const tx = await defundCampaign(
      session.user.id,
      session.user.role,
      campaignId,
      BigInt(input.amount),
      input.idempotencyKey,
    );

    return NextResponse.json({
      transaction: {
        id: tx.id,
        sequenceNumber: tx.sequenceNumber.toString(),
        amount: tx.amount.toString(),
        reason: tx.reason,
      },
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
