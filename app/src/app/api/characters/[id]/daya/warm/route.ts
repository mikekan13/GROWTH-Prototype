import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { warmEntityCore } from '@/daya/conversation';

export const dynamic = 'force-dynamic';

// POST /api/characters/[id]/daya/warm — WP14 fire-and-forget trigger for
// the self-hosted L1 persona core's serverless worker spin-up. The test
// canvas calls this on mount, before the GM has typed anything, so a cold
// start is already underway by the time she sends her first message.
// Scoped under the character route for URL consistency with its daya/*
// siblings, but the action itself is global (the L1 endpoint, not a
// per-entity thing) — [id] isn't otherwise used. GM/ADMIN only.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    await params;
    const result = await warmEntityCore(session.user.role);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
