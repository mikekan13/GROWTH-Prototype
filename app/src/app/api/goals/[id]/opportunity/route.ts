import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { declareOpportunity } from '@/services/goal';

export const dynamic = 'force-dynamic';

// POST /api/goals/[id]/opportunity — declare the O of GROwth for this goal.
// Either the GM or the goal owner may fire this. Logs a campaign event +
// fires godhead-dispatcher emit('goal.opportunity').
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const result = await declareOpportunity(session.user.id, session.user.role, {
      goalId: id,
      description: body.description,
      narrative: body.narrative,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
