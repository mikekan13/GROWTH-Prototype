/**
 * POST /api/characters/[id]/genesis/screen — the pre-submit seed screen
 * (2026-10-12). Body = the same genome the submit route takes. Assembles the
 * real genesis plan and runs the wall's screens (tone + lawfulness) on it
 * BEFORE any session opens: { clear, findings: [{ screen, category, outcome,
 * passage }], chunks }. Same permission as submit (Watcher-or-above). Thin
 * wrapper over services/character-genesis.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { isWatcherOrAbove } from '@/lib/permissions';
import { screenCharacterGenesis } from '@/services/character-genesis';

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
    const body = await request.json();
    const result = await screenCharacterGenesis({ characterId: id, input: body });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
