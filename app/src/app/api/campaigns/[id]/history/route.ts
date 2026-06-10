import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';
import { queryHistory, type HistorySubjectType } from '@/services/history';

/** Per-object perspective history (ruling r-2026-06-09-07).
 *  ?subjectType=location&subjectId=...&limit=50&beforeCycle=12.5
 *  Players see only 'public' entries; the GM sees everything. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundError('Campaign not found');
    const gmView = canManageCampaign(session.user.id, session.user.role, campaign);

    const sp = request.nextUrl.searchParams;
    const subjectType = sp.get('subjectType') as HistorySubjectType | null;
    const entries = await queryHistory(id, {
      subjectType: subjectType ?? undefined,
      subjectId: sp.get('subjectId') ?? undefined,
      gmView,
      limit: sp.get('limit') ? Number(sp.get('limit')) : undefined,
      beforeCycle: sp.get('beforeCycle') ? Number(sp.get('beforeCycle')) : undefined,
    });
    return NextResponse.json({ entries });
  } catch (error) {
    return errorResponse(error);
  }
}
