import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { adjustMana, adjustManaSchema } from '@/services/mana';

export const dynamic = 'force-dynamic';

// POST /api/characters/[id]/mana
//
// GM/ADMIN narrative mana adjustment (r-2026-07-23-05 — mana is narratively
// gained; no regen loop exists). Body: { delta, maxDelta?, note? }.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();

    const input = adjustManaSchema.parse({ ...body, characterId: id });
    const result = await adjustMana(session.user.id, session.user.role, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
