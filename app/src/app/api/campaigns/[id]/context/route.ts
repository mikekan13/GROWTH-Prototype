import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { NotFoundError, ForbiddenError } from '@/lib/errors';
import { prisma } from '@/lib/db';
import { isAdminRole } from '@/lib/permissions';

/**
 * Lightweight campaign context — name, world context, and known entity
 * names. Powers the wizard's "Generate" prompt and any future AI-assisted
 * authoring that needs cheap world grounding without hitting the full
 * EntityContextService.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        worldContext: true,
        gmUserId: true,
        members: { select: { userId: true } },
      },
    });
    if (!campaign) throw new NotFoundError('Campaign not found');

    const isGM = campaign.gmUserId === session.user.id;
    const isMember = campaign.members.some(m => m.userId === session.user.id);
    if (!isGM && !isMember && !isAdminRole(session.user.role)) {
      throw new ForbiddenError('Not a member of this campaign');
    }

    const entities = await prisma.character.findMany({
      where: { campaignId: id, entityType: { not: 'GODHEAD' }, status: { in: ['APPROVED', 'ACTIVE'] } },
      select: { id: true, name: true, entityType: true },
      take: 24,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        worldContext: campaign.worldContext,
      },
      entities,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
