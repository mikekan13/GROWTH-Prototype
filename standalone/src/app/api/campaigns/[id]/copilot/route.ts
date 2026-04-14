import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { sendCopilotMessage } from '@/ai/copilot/copilot-service';
import { prisma } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const body = await request.json();
    const message = String(body.message || '').trim();
    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }
    if (message.length > 2000) {
      return NextResponse.json({ error: 'Message too long (max 2000 chars)' }, { status: 400 });
    }

    // Verify access: must be GM or campaign member
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

    const response = await sendCopilotMessage(
      id,
      session.user.id,
      session.user.username,
      session.user.role,
      message,
    );

    return NextResponse.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}
