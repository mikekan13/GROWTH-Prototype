import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { acceptPortrait } from '@/ai/portraits/portrait-service';

/**
 * POST /api/portraits/accept
 *
 * Accept a generated portrait as the character's current portrait.
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

    await acceptPortrait(generationId, characterId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
