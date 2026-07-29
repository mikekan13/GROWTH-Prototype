import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { isAdminRole } from '@/lib/permissions';
import { ForbiddenError } from '@/lib/errors';
import { runDueDreamTicks } from '@/daya/scheduler';

export const dynamic = 'force-dynamic';

// POST /api/daya/tick — ADMIN-only manual sweep. Runs any due DAYA dream
// ticks (src/daya/scheduler.ts) and returns which entities fired. There is
// no background daemon — this route (or a script) is the only thing that
// advances the dream-tick clock in this Next.js dev context.
export async function POST() {
  try {
    const session = await requireAuth();
    if (!isAdminRole(session.user.role)) throw new ForbiddenError('Admin only');
    const result = await runDueDreamTicks();
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
