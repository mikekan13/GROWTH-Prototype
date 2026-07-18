import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { setCustodian } from '@/services/goal';

export const dynamic = 'force-dynamic';

const custodianSchema = z.object({
  custodianId: z.string().min(1),
});

// PATCH /api/goals/[id]/custodian — GM override of the goal's custodian
// godhead (T34). Auto-assignment stays with the Council Router / adopt_goal.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const { custodianId } = custodianSchema.parse(body);
    const goal = await setCustodian(id, session.user.id, session.user.role, custodianId);
    return NextResponse.json({ goal });
  } catch (error) {
    return errorResponse(error);
  }
}
