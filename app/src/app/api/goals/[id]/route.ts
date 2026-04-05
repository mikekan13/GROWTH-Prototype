import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import {
  getGoal,
  updateGoal,
  abandonGoal,
  updateGoalSchema,
} from '@/services/goal';

// GET /api/goals/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const goal = await getGoal(id, session.user.id, session.user.role);
    return NextResponse.json({ goal });
  } catch (error) {
    return errorResponse(error);
  }
}

// PATCH /api/goals/[id] — update goal fields (description, priority, resistance plan, milestones)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = updateGoalSchema.parse(body);
    const goal = await updateGoal(id, session.user.id, session.user.role, input);
    return NextResponse.json({ goal });
  } catch (error) {
    return errorResponse(error);
  }
}

// DELETE /api/goals/[id] — GM abandons a goal (carries KRMA cost, TBD)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const goal = await abandonGoal(id, session.user.id, session.user.role);
    return NextResponse.json({ goal });
  } catch (error) {
    return errorResponse(error);
  }
}
