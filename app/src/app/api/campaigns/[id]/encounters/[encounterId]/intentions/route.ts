import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { declareIntentions, declareIntentionsSchema } from '@/services/encounter';

export const dynamic = 'force-dynamic';

// POST /api/campaigns/[id]/encounters/[encounterId]/intentions — declare a
// participant's per-pillar intentions for the next round (owner or GM).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; encounterId: string }> }) {
  try {
    const session = await requireAuth();
    const { encounterId } = await params;
    const input = declareIntentionsSchema.parse(await request.json());
    const encounter = await declareIntentions(
      encounterId,
      { userId: session.user.id, username: session.user.username, role: session.user.role },
      input,
    );
    return NextResponse.json({ encounter });
  } catch (error) {
    return errorResponse(error);
  }
}
