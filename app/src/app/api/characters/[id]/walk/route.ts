/**
 * POST /api/characters/[id]/walk — the Watcher walks a character somewhere by
 * name ("the door", "Violet", "Kitchenette"): the way is found on the real map,
 * the token moves along it on every canvas (2026-10-27). Thin wrapper.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { walkCharacter, walkInputSchema } from '@/services/being-movement';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id: characterId } = await params;
    const input = walkInputSchema.parse(await request.json());
    const report = await walkCharacter(session.user.id, session.user.role, characterId, input);
    return NextResponse.json({ report });
  } catch (error) {
    return errorResponse(error);
  }
}
