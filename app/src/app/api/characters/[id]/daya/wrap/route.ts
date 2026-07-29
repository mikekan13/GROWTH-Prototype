import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { wrapCharacterAsDaya } from '@/daya/authoring';

export const dynamic = 'force-dynamic';

// POST /api/characters/[id]/daya/wrap — create/enable the 1:1 DayaEntity
// substrate for an existing Character (spec §2). Idempotent. GM/ADMIN only.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const result = await wrapCharacterAsDaya(id, session.user.role);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
