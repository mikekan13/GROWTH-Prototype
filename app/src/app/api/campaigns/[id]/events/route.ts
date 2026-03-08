import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { createCampaignEvent, queryCampaignEvents } from '@/services/campaign-event';
import type { TerminalEventType, TerminalActor, TerminalPayload } from '@/types/terminal';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id: campaignId } = await params;
    const sp = request.nextUrl.searchParams;

    const types = sp.get('types')?.split(',').filter(Boolean) as TerminalEventType[] | undefined;
    const after = sp.get('after') || undefined;
    const cursor = sp.get('cursor') || undefined;
    const limit = sp.get('limit') ? parseInt(sp.get('limit')!) : undefined;
    const sessionId = sp.has('sessionId') ? (sp.get('sessionId') || null) : undefined;

    const result = await queryCampaignEvents({
      campaignId,
      types,
      sessionId,
      after,
      cursor,
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const body = await request.json();

    const { type, characterId, characterName, payload } = body as {
      type: TerminalEventType;
      characterId?: string;
      characterName?: string;
      payload: TerminalPayload;
    };

    if (!type || !payload) {
      return NextResponse.json({ error: 'type and payload are required' }, { status: 400 });
    }

    const actor: TerminalActor = session.user.role === 'WATCHER' || session.user.role === 'GODHEAD' || session.user.role === 'ADMIN' ? 'gm' : 'player';

    const event = await createCampaignEvent({
      campaignId,
      type,
      actor,
      actorUserId: session.user.id,
      actorName: session.user.username,
      characterId,
      characterName,
      payload,
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
