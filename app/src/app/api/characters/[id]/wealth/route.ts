import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { readWealth } from '@/services/wealth';
import { lifeBudget } from '@/services/life-budget';

export const dynamic = 'force-dynamic';

/** Her wealth ledger (cash + income) and her life budget (Mike 2026-10-16). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const actor = { id: session.user.id, role: session.user.role };
    const wealth = await readWealth(id, actor);
    const budget = await lifeBudget(id);
    return NextResponse.json({ wealth, budget });
  } catch (error) {
    return errorResponse(error);
  }
}
