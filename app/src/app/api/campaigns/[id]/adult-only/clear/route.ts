import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { clearAdultOnly } from '@/services/maturity';

/** ADMIN clears an auto-set 18+ when no flagged content remains (2026-10-12). */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const result = await clearAdultOnly(id, session.user);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
