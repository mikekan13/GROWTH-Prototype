/**
 * POST /api/campaigns/[id]/genesis/[sessionId]/build { confirmLeaveOpen? } —
 * the GM presses Build: genesis leaves the prod stage and JEWL gestates.
 * Unanswered prods need confirmLeaveOpen and become open threads. Campaign
 * GM / ADMIN only. Thin wrapper over services/genesis-prods.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { buildGenesis } from '@/services/genesis-prods';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id, sessionId } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await buildGenesis({ campaignId: id, sessionId, user: session.user, body });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
