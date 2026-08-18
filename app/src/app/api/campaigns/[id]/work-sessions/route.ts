/**
 * GET /api/campaigns/[id]/work-sessions — JEWL's open jobs for this
 * campaign (active + blocked), for the copilot overlay's live "what he's
 * doing now" strip. GM-only: session goals and notes are Watcher-side
 * content. Thin wrapper over services/daya-work-session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { canManageCampaign } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { listWorkSessions, parseProgress } from '@/services/daya-work-session';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { gmUserId: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }
    if (!canManageCampaign(session.user.id, session.user.role, campaign)) {
      return NextResponse.json({ sessions: [] });
    }

    const sessions = await listWorkSessions(campaignId);
    return NextResponse.json({
      sessions: sessions.map(s => {
        const progress = parseProgress(s.progress);
        return {
          id: s.id,
          status: s.status,
          goal: s.goal,
          cycleCount: s.cycleCount,
          blockedReason: s.blockedReason,
          lastNote: progress.length > 0 ? progress[progress.length - 1] : null,
          lastCycleAt: s.lastCycleAt,
        };
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
