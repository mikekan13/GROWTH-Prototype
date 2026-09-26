import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { correctCanon } from '@/services/reconciliation';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  canonEventId: z.string().min(1),
  narration: z.string().min(1).max(4000),
  reason: z.string().max(500).optional(),
});

// POST /api/campaigns/[id]/canon/correct — the Watcher corrects a canon event
// beings already lived (Mike 09-26: canon is fluid till it isn't). Keeps the
// previous version, re-renders every involved memory through its being's
// mirror, and returns the REACH of the rewrite.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const input = bodySchema.parse(await request.json());
    const result = await correctCanon(campaignId, { userId: session.user.id, username: session.user.username, role: session.user.role }, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
