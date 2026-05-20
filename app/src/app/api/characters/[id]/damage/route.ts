import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { applyDamageToCharacter, applyDamageSchema } from '@/services/damage';

export const dynamic = 'force-dynamic';

// POST /api/characters/[id]/damage
//
// GM-applied damage to a character. Routes through the body container
// cascade (lib/body-damage.ts). For piercing damage, include
// `piercingTargetPath` (array of partName strings from root to target);
// other damage types ignore it and split evenly across internals.
//
// Response: { events, anyDestroyed, bodyAnatomy } — `events` is the
// per-part damage log the UI uses to animate hits.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = applyDamageSchema.parse({ ...body, characterId: id });
    const result = await applyDamageToCharacter(session.user.id, session.user.role, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
