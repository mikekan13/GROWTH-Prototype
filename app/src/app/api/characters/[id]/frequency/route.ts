import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { executeFrequencyOp, frequencyOpSchema } from '@/services/frequency';

export const dynamic = 'force-dynamic';

// POST /api/characters/[id]/frequency — execute Spend or Deplete.
// Burn lives at /api/characters/[id]/burn because it carries a preview pass.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = frequencyOpSchema.parse({ ...body, characterId: id });
    const result = await executeFrequencyOp(session.user.id, session.user.role, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
