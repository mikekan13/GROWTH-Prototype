import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { ForbiddenError } from '@/lib/errors';
import { canManageContracts } from '@/lib/permissions';
import { evaluateAllActive } from '@/services/contracts';

/** Periodic sweep trigger (admin/cron). Evaluates every ACTIVE contract. */
export async function POST() {
  try {
    const session = await requireAuth();
    if (!canManageContracts(session.user.role)) {
      throw new ForbiddenError('Contracts are ADMIN-only');
    }
    const results = await evaluateAllActive('SWEEP');
    return NextResponse.json({
      evaluated: results.length,
      violated: results.filter((r) => r.violated).map((r) => r.contractId),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
