import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { runRound } from '@/services/encounter';

export const dynamic = 'force-dynamic';

// POST /api/campaigns/[id]/encounters/[encounterId]/round — run ONE round
// through the simulation (GM/ADMIN). Undeclared participants are planned by
// their branch; consequences land per slot; the round is recorded as canon.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; encounterId: string }> }) {
  try {
    const session = await requireAuth();
    const { encounterId } = await params;
    const encounter = await runRound(
      encounterId,
      { userId: session.user.id, username: session.user.username, role: session.user.role },
    );
    return NextResponse.json({ encounter });
  } catch (error) {
    return errorResponse(error);
  }
}
