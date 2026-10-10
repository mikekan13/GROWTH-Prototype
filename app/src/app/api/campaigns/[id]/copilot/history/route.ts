import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getCopilotHistory } from '@/ai/copilot/copilot-service';
import { requireCampaignMember } from '@/services/campaign-access';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requireCampaignMember(id, session.user);
    // Private per user — only the viewer's own turns + JEWL's replies to them.
    const messages = await getCopilotHistory(id, session.user);
    return NextResponse.json({ messages });
  } catch (error) {
    return errorResponse(error);
  }
}
