import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { lockPersona } from '@/ai/portraits/portrait-service';

/**
 * POST /api/portraits/lock
 *
 * Lock a portrait as the character's permanent identity anchor (Persona Lock).
 * All future generations will use PuLID to maintain the same face.
 * Body: { generationId, characterId }
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();
    const { generationId, characterId } = body;

    if (!generationId || !characterId) {
      return NextResponse.json(
        { error: 'generationId and characterId are required' },
        { status: 400 },
      );
    }

    await lockPersona(generationId, characterId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
