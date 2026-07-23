import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { executeCast, castRequestSchema } from '@/services/magic-cast-ops';

export const dynamic = 'force-dynamic';

// POST /api/characters/[id]/cast
//
// Resolve a magic cast server-side (r-2026-07-22-01). Body:
//  { schools, method: 'wild'|'woven', dr, manaSpent?, associatedSkillName?,
//    spellName? } — for a known Woven spell, pass spell.dr.total as `dr`,
//    spell.manaCost as `manaSpent`, and map castingMethod 'weaving'→'woven'.
// Dice roll server-side (crypto RNG); mana is deducted from magic.mana;
// result broadcasts as a cast_result SSE event (Monkey Paw + system-review
// flags included). Response: { characterId, plan, rolls, resolution,
// manaRemaining, spellName }.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();

    const input = castRequestSchema.parse({ ...body, characterId: id });
    const result = await executeCast(session.user.id, session.user.role, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
