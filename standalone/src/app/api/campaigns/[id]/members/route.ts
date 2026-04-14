import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { canManageCampaign } from '@/lib/permissions';
import { ForbiddenError, NotFoundError } from '@/lib/errors';

// GM lists all campaign members (including INTERESTED)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundError('Campaign not found');
    if (!canManageCampaign(session.user.id, session.user.role, campaign)) {
      throw new ForbiddenError();
    }

    const members = await prisma.campaignMember.findMany({
      where: { campaignId: id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            role: true,
            profile: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return NextResponse.json({ members });
  } catch (error) {
    return errorResponse(error);
  }
}
