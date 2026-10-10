import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { isAdminRole } from '@/lib/permissions';
import { ForbiddenError } from '@/lib/errors';
import { probeEntityIdsForCampaign, probeMetricsForCampaign, runProbeSweep } from '@/daya/probes';

export const dynamic = 'force-dynamic';

const q = z.object({ campaignId: z.string().min(1) });

// GET /api/daya/probes?campaignId=… — drift-from-self + divergence metrics (ADMIN).
// Responses themselves are never returned here: they may carry a protagonist's story.
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (!isAdminRole(session.user.role)) throw new ForbiddenError('Admin only');
    const { campaignId } = q.parse(Object.fromEntries(request.nextUrl.searchParams));
    return NextResponse.json(await probeMetricsForCampaign(campaignId));
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/daya/probes { campaignId } — run one sweep over the campaign's beings (ADMIN).
// 503 with laneStatus when the local lane is not ready (the call warms it — retry).
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (!isAdminRole(session.user.role)) throw new ForbiddenError('Admin only');
    const { campaignId } = q.parse(await request.json());
    const ids = await probeEntityIdsForCampaign(campaignId);
    const result = await runProbeSweep(ids);
    return NextResponse.json(result, { status: result.status === 'ok' ? 200 : 503 });
  } catch (error) {
    return errorResponse(error);
  }
}
