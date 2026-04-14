import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { checkForVisualChanges } from '@/ai/portraits/portrait-service';

/**
 * GET /api/portraits/status?characterId=xxx
 *
 * Check if a character's visual state has changed enough to warrant
 * portrait regeneration. Returns the list of visual changes detected.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const characterId = request.nextUrl.searchParams.get('characterId');

    if (!characterId) {
      return NextResponse.json({ error: 'characterId query param is required' }, { status: 400 });
    }

    const result = await checkForVisualChanges(characterId);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
