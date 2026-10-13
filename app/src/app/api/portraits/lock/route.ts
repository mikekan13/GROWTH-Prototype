import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { lockPortrait, lockPortraitSchema } from '@/services/portrait-lock';

/**
 * POST /api/portraits/lock
 *
 * Lock a portrait as the character's permanent identity anchor and set
 * Character.portrait (what canvas cards read).
 * Body: { characterId, generationId?, imagePath? } - at least one of
 * generationId / imagePath. imagePath is a stored path such as
 * "/portraits/<characterId>/faces/<id>.png" (designer generations have no
 * PortraitGeneration row).
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const input = lockPortraitSchema.parse(await request.json());
    const result = await lockPortrait(input);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
