import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { ForbiddenError } from '@/lib/errors';
import { isAdminRole } from '@/lib/permissions';
import { sweepUnusedBlueprints } from '@/services/forge';

/** T31 daily sweep trigger (admin/cron): flag published-but-never-used
 *  blueprints and route them to Lady Death for decay review. */
export async function POST() {
  try {
    const session = await requireAuth();
    if (!isAdminRole(session.user.role)) {
      throw new ForbiddenError('Sweep is admin-only');
    }
    const result = await sweepUnusedBlueprints();
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
