import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { completeGoal, failGoal, setGoalDormant, reactivateGoal } from '@/services/goal';

export const dynamic = 'force-dynamic';

const transitionSchema = z.object({
  to: z.enum(['COMPLETED', 'FAILED', 'DORMANT', 'ACTIVE']),
});

// POST /api/goals/[id]/transition — GM lifecycle transitions (T34).
// COMPLETED/FAILED route through the godhead dispatcher (goal.completed /
// goal.failed → the T32 chain); DORMANT/ACTIVE are plain state moves.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const { to } = transitionSchema.parse(body);

    const goal = to === 'COMPLETED' ? await completeGoal(id, session.user.id, session.user.role)
      : to === 'FAILED' ? await failGoal(id, session.user.id, session.user.role)
      : to === 'DORMANT' ? await setGoalDormant(id, session.user.id, session.user.role)
      : await reactivateGoal(id, session.user.id, session.user.role);

    return NextResponse.json({ goal });
  } catch (error) {
    return errorResponse(error);
  }
}
