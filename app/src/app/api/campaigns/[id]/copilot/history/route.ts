import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getCopilotHistory } from '@/ai/copilot/copilot-service';
import { prisma } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Verify access
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const isGM = campaign.gmUserId === session.user.id;
    if (!isGM) {
      const member = await prisma.campaignMember.findUnique({
        where: { campaignId_userId: { campaignId: id, userId: session.user.id } },
      });
      if (!member) {
        return NextResponse.json({ error: 'Not a campaign member' }, { status: 403 });
      }
    }

    const messages = await getCopilotHistory(id);
    return NextResponse.json({ messages });
  } catch (error) {
    return errorResponse(error);
  }
}
