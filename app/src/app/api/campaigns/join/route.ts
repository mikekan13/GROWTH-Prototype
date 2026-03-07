import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { joinCampaign, joinCampaignSchema } from '@/services/campaign';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const { inviteCode } = joinCampaignSchema.parse(body);
    const result = await joinCampaign(session.user.id, inviteCode);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
