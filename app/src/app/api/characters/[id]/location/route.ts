/**
 * POST /api/characters/[id]/location — set or clear a character's
 * location (located_at edge). Used by the canvas drop-into-folder
 * gesture; the same service the move_character_to_location JEWL tool
 * uses, so UI drops and JEWL moves stay one mechanism.
 * Thin wrapper: parse → validate → service → response.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { moveCharacterToLocation } from '@/services/character-location';

const inputSchema = z.object({
  locationId: z.string().min(1).nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id: characterId } = await params;
    const body = await request.json();
    const { locationId } = inputSchema.parse(body);
    const result = await moveCharacterToLocation(session.user.id, session.user.role, {
      characterId,
      locationId,
    });
    return NextResponse.json({ result });
  } catch (error) {
    return errorResponse(error);
  }
}
