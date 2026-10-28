import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { REMOVED_STATUS } from '@/services/maturity';
import { canEnterAdultCampaign } from '@/lib/permissions';
import { loadCanvasCampaign, assembleCanvasModelFor } from '@/services/canvas-model';

export const dynamic = 'force-dynamic';

// GET /api/campaigns/[id]/canvas-model — the same picture the campaign page renders (nodes, tethers,
// folders, parent graph, names), served as data so an open canvas re-fetches instead of re-running the
// page (Mike 2026-10-27: no reloads). Access: ADMIN/GODHEAD, the GM, or a joined member — the page's rule.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const campaign = await loadCanvasCampaign(id);
    if (!campaign) throw new NotFoundError('Campaign not found');
    const isAdmin = session.user.role === 'GODHEAD' || session.user.role === 'ADMIN';
    const isGM = campaign.gmUserId === session.user.id;
    const isMember = campaign.members.some(m => m.userId === session.user.id && !['INTERESTED', 'REJECTED', REMOVED_STATUS].includes(m.status));
    if (!canEnterAdultCampaign(session.user, campaign)) throw new ForbiddenError('This table is 18+');
    if (!isAdmin && !isGM && !isMember) throw new ForbiddenError('Not a member of this campaign');
    // Fog of war: a Trailblazer gets the map as their character last knew it.
    const model = await assembleCanvasModelFor(campaign, session.user);
    return NextResponse.json(model, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
