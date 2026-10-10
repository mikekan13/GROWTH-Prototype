import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { declareCanon } from '@/services/canon';

export const dynamic = 'force-dynamic';

const schema = z.object({
  narration: z.string().min(1).max(2000),
  kind: z.string().max(40).optional(),
  actorId: z.string().nullable().optional(),
  targetId: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
  /** Character ids who perceive it; omitted = every ACTIVE being in the campaign. */
  witnessIds: z.array(z.string()).max(100).optional(),
});

// POST /api/campaigns/[id]/canon/declare — the Watcher declares a fact.
// Recorded once as canon; every witness perceives it (engine-authored memory
// with truthRef); touched goals reach their custodians' vines.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const input = schema.parse(await request.json());
    const result = await declareCanon(campaignId, { userId: session.user.id, username: session.user.username, role: session.user.role }, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
