import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { crystallizeEntity, crystallizeSchema, getCampaignCrystallizedPool, getCrystallizedEntityIds } from '@/services/krma/crystallization';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const body = await request.json();
    const input = crystallizeSchema.parse(body);

    const entry = await crystallizeEntity(
      session.user.id,
      session.user.role,
      campaignId,
      input,
    );

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id: campaignId } = await params;

    const [pool, crystallizedIds] = await Promise.all([
      getCampaignCrystallizedPool(campaignId),
      getCrystallizedEntityIds(campaignId),
    ]);

    return NextResponse.json({
      totalKV: pool.totalKV,
      entityCount: pool.entityCount,
      crystallizedEntityIds: [...crystallizedIds],
      ledger: pool.entries,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
