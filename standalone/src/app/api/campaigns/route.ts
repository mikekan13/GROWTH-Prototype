import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listCampaigns, createCampaign, createCampaignSchema } from '@/services/campaign';

export async function GET() {
  try {
    const session = await requireAuth();
    const result = await listCampaigns(session.user.id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const input = createCampaignSchema.parse(body);
    const campaign = await createCampaign(session.user.id, session.user.role, input);
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
