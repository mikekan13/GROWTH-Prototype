import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { executeAdvancement, advancementRequestSchema } from '@/services/advancement-ops';

export const dynamic = 'force-dynamic';

// POST /api/characters/[id]/advancement — apply trainable upgrade picks
// (r-2026-07-15-01). All-or-nothing; spends max Frequency, no ledger.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = advancementRequestSchema.parse({ ...body, characterId: id });
    const result = await executeAdvancement(session.user.id, session.user.role, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
