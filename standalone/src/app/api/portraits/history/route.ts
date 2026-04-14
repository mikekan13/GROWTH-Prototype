import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getPortraitHistory } from '@/ai/portraits/portrait-service';

/**
 * GET /api/portraits/history?characterId=xxx
 *
 * Get all portrait generations for a character, most recent first.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const characterId = request.nextUrl.searchParams.get('characterId');

    if (!characterId) {
      return NextResponse.json({ error: 'characterId query param is required' }, { status: 400 });
    }

    const history = await getPortraitHistory(characterId);
    return NextResponse.json({ portraits: history });
  } catch (error) {
    return errorResponse(error);
  }
}
