import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { laneReadiness } from '@/daya/l1-endpoint';
import { keepaliveStatus } from '@/daya/l1-keepalive';

export const dynamic = 'force-dynamic';

// GET /api/campaigns/[id]/lane — where the self-hosted core is in its cold
// start, for the session-start loading screen. GM-only infra truth; never
// part of the table record. Polling this also keeps the spin-up requested.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    if (session.user.role !== 'ADMIN' && session.user.role !== 'GODHEAD' && session.user.role !== 'WATCHER') {
      return NextResponse.json({ error: 'GM only' }, { status: 403 });
    }
    const { id: campaignId } = await params;
    const lane = await laneReadiness();
    return NextResponse.json({ ...lane, keepalive: keepaliveStatus(campaignId) });
  } catch (error) {
    return errorResponse(error);
  }
}
