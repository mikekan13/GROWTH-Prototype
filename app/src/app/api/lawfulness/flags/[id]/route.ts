import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getFlagWithReferent } from '@/services/lawfulness';

export const dynamic = 'force-dynamic';

// GET /api/lawfulness/flags/[id] — ADMIN only: the flag + the flagged row's
// text, fetched by pointer (the flag never stores text).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    return NextResponse.json(await getFlagWithReferent(id, { id: session.user.id, role: session.user.role }));
  } catch (error) {
    return errorResponse(error);
  }
}
