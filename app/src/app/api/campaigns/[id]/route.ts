import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getCampaignDetail, updateCampaign, updateCampaignSchema } from '@/services/campaign';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const campaign = await getCampaignDetail(id, session.user.id, session.user.role);
    return NextResponse.json({ campaign });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = updateCampaignSchema.parse(body);
    const campaign = await updateCampaign(id, session.user.id, session.user.role, input);
    return NextResponse.json({ campaign });
  } catch (error) {
    return errorResponse(error);
  }
}
