/**
 * POST /api/characters/[id]/complete — finish an already-BORN character:
 * open a short genesis session that runs only the completion stages she
 * still lacks (AGE / POSSESSIONS / SEEDS / WORLD_FACTS / VINES). Thin
 * wrapper over services/genesis-complete. Watcher (campaign GM) / ADMIN.
 * 409 while a genesis for her is already in flight.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { isWatcherOrAbove } from '@/lib/permissions';
import { completeCharacter } from '@/services/genesis-complete';
import { GENESIS_POST_SHEET_STAGES, type GenesisPostSheetStage } from '@/lib/genesis-stages';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isWatcherOrAbove(session.user.role)) {
      return NextResponse.json({ error: 'Watcher or above only' }, { status: 403 });
    }
    const { id } = await params;
    // ?mode=sail — "fill in the rest" (Mike 2026-10-16); default coax (ask first).
    const mode = request.nextUrl.searchParams.get('mode') === 'sail' ? 'sail' as const : 'coax' as const;
    // ?reopen=WORLD,MEMORIES — re-run those stages on a born character, keeping what was built.
    const reopen = (request.nextUrl.searchParams.get('reopen') ?? '').split(',').map(s => s.trim().toUpperCase()).filter((s): s is GenesisPostSheetStage => (GENESIS_POST_SHEET_STAGES as readonly string[]).includes(s));
    const result = await completeCharacter(id, { id: session.user.id, role: session.user.role }, { mode, ...(reopen.length ? { reopen } : {}) });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
