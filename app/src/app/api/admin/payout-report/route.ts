import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { isAdminRole } from '@/lib/permissions';
import { ForbiddenError } from '@/lib/errors';
import { computePayoutReport } from '@/services/krma/payout-report';

export const dynamic = 'force-dynamic';

// GET /api/admin/payout-report?pool=<distributable pool>
//
// ADMIN-only. Snapshots each GM steward's total KRMA (liquid + locked, INV-114)
// and their fair share of the distributable pool. The pool (real dollars) is an
// input — this endpoint never touches money, only computes shares. JEWL/system
// wallets are structurally excluded (INV-70).
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (!isAdminRole(session.user.role)) throw new ForbiddenError('Admin only');
    const poolParam = request.nextUrl.searchParams.get('pool');
    const pool = poolParam != null ? Number(poolParam) : 0;
    const report = await computePayoutReport(pool);
    return NextResponse.json({ report, generatedAt: new Date().toISOString() });
  } catch (error) {
    return errorResponse(error);
  }
}
