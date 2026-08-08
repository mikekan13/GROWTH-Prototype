/**
 * POST /api/characters/[id]/genesis — submit a character's genome
 * (backstory + appearance) to JEWL for gestation. Thin wrapper over
 * services/character-genesis. Watcher-or-above for the walking version.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { isWatcherOrAbove } from '@/lib/permissions';
import { submitCharacterGenesis } from '@/services/character-genesis';

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
