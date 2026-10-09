import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { createCampaignEvent, queryCampaignEvents } from '@/services/campaign-event';
import { requireCampaignMember, requireEventPoster } from '@/services/campaign-access';
import { feedViewerFor, queryPerceivedFeed, viewAsViewer } from '@/services/perceived-feed';
import { broadcastEvent } from '@/lib/campaign-stream';
import { postInspectFromChat } from '@/services/inspection';
import type { TerminalEventType, TerminalActor, TerminalPayload, TerminalEvent } from '@/types/terminal';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    await requireCampaignMember(campaignId, session.user);
    const sp = request.nextUrl.searchParams;

    const types = sp.get('types')?.split(',').filter(Boolean) as TerminalEventType[] | undefined;
    const after = sp.get('after') || undefined;
    const cursor = sp.get('cursor') || undefined;
    const limit = sp.get('limit') ? parseInt(sp.get('limit')!) : undefined;
    const sessionId = sp.has('sessionId') ? (sp.get('sessionId') || null) : undefined;

    // Perception unit 9 (PERCEPTION_FEED): a Trailblazer reads their character's memory, filtered HERE —
    // truth text of an unperceived line never leaves the server. Flag off / Watcher / ADMIN: unchanged.
    // Unit 10: `viewAs=<characterId>` — the Watcher (or ADMIN) reads the feed exactly as that character's
    // memory, through the same path; anyone else asking for another character's view → 403.
    const viewAs = sp.get('viewAs') || undefined;
    const viewer = viewAs ? await viewAsViewer(campaignId, session.user, viewAs) : await feedViewerFor(campaignId, session.user);
    if (viewer.mode === 'perceived') {
      const page = await queryPerceivedFeed({ campaignId, viewer, types, sessionId, after, cursor, limit });
      return NextResponse.json(viewAs ? { ...page, viewAs: viewer.characterId } : page);
    }

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

    const { type, characterId: askedCharacterId, characterName: askedCharacterName, payload } = body as {
      type: TerminalEventType;
      characterId?: string;
      characterName?: string;
      payload: TerminalPayload;
    };

    if (!type || !payload) {
      return NextResponse.json({ error: 'type and payload are required' }, { status: 400 });
    }

    // Security (2026-10-09): members only; the campaign's GM/ADMIN posts for anyone, everyone else only for
    // their own character (name from the record, not the request).
    const poster = await requireEventPoster(campaignId, session.user, askedCharacterId, askedCharacterName);
    const { characterId, characterName } = poster;
    const actor: TerminalActor = poster.isGM ? 'gm' : 'player';

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

    // Broadcast to all SSE-connected clients in this campaign
    const terminalEvent: TerminalEvent = {
      id: `ev-${event.id}`,
      type: event.type as TerminalEventType,
      timestamp: event.createdAt instanceof Date ? event.createdAt.toISOString() : String(event.createdAt),
      campaignId,
      actor,
      actorUserId: session.user.id,
      actorName: session.user.username,
      characterId: characterId || undefined,
      characterName: characterName || undefined,
      sessionId: event.sessionId || undefined,
      payload,
    };
    broadcastEvent(campaignId, { kind: 'terminal_event', event: terminalEvent });

    // Perception unit 11: a player's "I inspect the sword (with my swordsmanship)" posts an inspect intent
    // to the planning board (best-effort; the chat line itself is unchanged).
    if (type === 'chat' && actor === 'player' && characterId && payload.kind === 'chat') {
      void postInspectFromChat(campaignId, session.user, characterId, payload.message);
    }

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
