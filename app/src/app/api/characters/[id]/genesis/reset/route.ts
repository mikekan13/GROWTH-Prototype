/**
 * POST /api/characters/[id]/genesis/reset — strip what the OLD post-sheet
 * genesis produced (items, deeds, places, facts, goals, seeds, wealth,
 * stamps) and, unless `?open=0`, open the new walk at her first missing
 * stage (services/genesis-complete). Watcher (campaign GM) / ADMIN.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { isWatcherOrAbove } from '@/lib/permissions';
import { resetCompletionStages } from '@/services/genesis-reset';
import { completeCharacter } from '@/services/genesis-complete';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isWatcherOrAbove(session.user.role)) return NextResponse.json({ error: 'Watcher or above only' }, { status: 403 });
    const { id } = await params;
    const actor = { id: session.user.id, role: session.user.role };
    const reset = await resetCompletionStages(id, actor);
    const open = request.nextUrl.searchParams.get('open') !== '0';
    const mode = request.nextUrl.searchParams.get('mode') === 'sail' ? 'sail' as const : 'coax' as const;
    const completion = open ? await completeCharacter(id, actor, { mode }) : null;
    return NextResponse.json({ reset, completion });
  } catch (error) {
    return errorResponse(error);
  }
}
