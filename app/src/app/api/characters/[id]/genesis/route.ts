/**
 * POST /api/characters/[id]/genesis — submit a character's genome
 * (backstory + appearance) to JEWL for gestation. Thin wrapper over
 * services/character-genesis. Watcher-or-above for the walking version.
 * A run already in flight for the character answers 409.
 *
 * GET — live genesis progress for the loading screen (stage ladder, counts,
 * timing; process only). Campaign GM / ADMIN only. Thin wrapper over
 * services/character-genesis-progress.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { isWatcherOrAbove } from '@/lib/permissions';
import { submitCharacterGenesis } from '@/services/character-genesis';
import { getGenesisProgress } from '@/services/character-genesis-progress';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const progress = await getGenesisProgress({ characterId: id, user: session.user });
    return NextResponse.json(progress);
  } catch (error) {
    return errorResponse(error);
  }
}

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
    const result = await submitCharacterGenesis({
      characterId: id,
      input: body,
      actorId: session.user.id,
      actorRole: session.user.role,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
