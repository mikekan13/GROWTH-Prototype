import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { applyDamageToCharacter, applyDamageSchema } from '@/services/damage';
import { applyAttributeDamage, applyAttributeDamageSchema } from '@/services/character-attribute';

export const dynamic = 'force-dynamic';

// POST /api/characters/[id]/damage
//
// GM-applied damage to a character. Two modes:
//  - default (body): routes through the body container cascade
//    (lib/body-damage.ts). For piercing damage, include `piercingTargetPath`
//    (array of partName strings from root to target); other damage types
//    ignore it and split evenly across internals.
//    Response: { events, anyDestroyed, bodyAnatomy }.
//  - { mode: 'attribute', targetAttribute, amount }: Affinity Cycle path —
//    depletes the attribute pool with auto depletion-conditions; overflow
//    spills into current Frequency (INV-43: Deplete, never Spend);
//    Frequency 0 fires the death trigger (T25).
//    Response: { characterId, changes, frequencyDepleted }.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();

    if (body?.mode === 'attribute') {
      const input = applyAttributeDamageSchema.parse({ ...body, characterId: id });
      const result = await applyAttributeDamage(session.user.id, session.user.role, input);
      return NextResponse.json({
        characterId: result.characterId,
        changes: result.changes,
        frequencyDepleted: result.frequencyDepleted,
      });
    }

    const input = applyDamageSchema.parse({ ...body, characterId: id });
    const result = await applyDamageToCharacter(session.user.id, session.user.role, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
