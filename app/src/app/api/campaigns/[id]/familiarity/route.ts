import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listFamiliarityForWatcher, setFamiliarityByWatcher } from '@/services/familiarity';

/**
 * What one being knows (perception unit 4) — read-only, Watcher-only debug view.
 * GM of the campaign or ADMIN (services/campaign-access requireCampaignGM).
 *   GET ?perceiverId=<DayaEntity id | characterId>
 *     → { perceiverId, characterId, nowCycle, rows: [{ subjectId, subjectName, subjectKind, aspectKind,
 *          score (stored), fidelity, current (faded to now), currentFidelity, lastSource, lastCycle, updatedAt }] }
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const perceiverId = request.nextUrl.searchParams.get('perceiverId') ?? '';
    return NextResponse.json(await listFamiliarityForWatcher(id, session.user, perceiverId));
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * The Watcher declares what a being knows ("they know each other") — GM of the campaign or ADMIN.
 *   PUT { perceiverId (DayaEntity id | characterId), subjectId, aspectKind? = 'identity', level: 0–5 }
 *     → the stored row (lastSource 'watcher'); the perceiver's cached feed lines naming the subject re-label.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    return NextResponse.json(await setFamiliarityByWatcher(id, session.user, body));
  } catch (error) {
    return errorResponse(error);
  }
}
