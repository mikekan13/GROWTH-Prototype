import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { learnSpell, learnSpellSchema } from '@/services/spell-grant';

export const dynamic = 'force-dynamic';

// POST /api/characters/[id]/spells
//
// GM teaches an authored Woven spell (ForgeItem type 'spell') to the
// character — the confirm step of the player→GM→godhead pipeline
// (r-2026-07-22-01 #5). Body: { forgeItemId }. Rejects spells whose
// mechanics (dr, manaCost) haven't been authored yet. No KRMA movement
// (spell-learning pricing is a pending Mike ruling — see NEEDS-MIKE).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();

    const input = learnSpellSchema.parse({ ...body, characterId: id });
    const result = await learnSpell(session.user.id, session.user.role, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
