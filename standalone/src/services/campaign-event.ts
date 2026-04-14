/**
 * Campaign Event Service — Business logic for the Campaign Terminal event stream.
 *
 * Handles creation and querying of campaign events (dice rolls, chat, commands,
 * game events, AI messages). Character state changes continue to flow through
 * the existing ChangeLog system — the Terminal merges both at display time.
 */

import { prisma } from '@/lib/db';
import type { TerminalEventType, TerminalActor, TerminalPayload, GameSessionInfo } from '@/types/terminal';

// ── Types ──────────────────────────────────────────────────────────────────

interface CreateEventInput {
  campaignId: string;
  type: TerminalEventType;
  actor: TerminalActor;
  actorUserId: string;
  actorName: string;
  characterId?: string;
  characterName?: string;
  payload: TerminalPayload;
}

interface QueryEventsParams {
  campaignId: string;
  types?: string[];
  sessionId?: string | null;
  after?: string;
  cursor?: string;
  limit?: number;
}

// ── Event CRUD ─────────────────────────────────────────────────────────────

/**
 * Create a campaign event. Auto-assigns to the active session if one exists.
 */
export async function createCampaignEvent(input: CreateEventInput) {
  // Find active session for this campaign
  const activeSession = await prisma.gameSession.findFirst({
    where: { campaignId: input.campaignId, endedAt: null },
    orderBy: { number: 'desc' },
  });

  const event = await prisma.campaignEvent.create({
    data: {
      campaignId: input.campaignId,
      sessionId: activeSession?.id || null,
      type: input.type,
      actor: input.actor,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      characterId: input.characterId || null,
      characterName: input.characterName || null,
      payload: JSON.stringify(input.payload),
    },
  });

  return event;
}

/**
 * Query campaign events with filters and cursor pagination.
 */
export async function queryCampaignEvents(params: QueryEventsParams) {
  const where: Record<string, unknown> = {
    campaignId: params.campaignId,
  };

  if (params.types?.length) {
    where.type = { in: params.types };
  }

  // sessionId filtering: null = between sessions, string = specific session
  if (params.sessionId !== undefined) {
    where.sessionId = params.sessionId;
  }

  if (params.after) {
    where.createdAt = { gt: new Date(params.after) };
  }

  if (params.cursor) {
    where.createdAt = {
      ...(where.createdAt as Record<string, Date> || {}),
      lt: new Date(params.cursor),
    };
  }

  const limit = Math.min(params.limit || 50, 200);

  const rows = await prisma.campaignEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const entries = rows.slice(0, limit);

  return {
    events: entries.map(row => ({
      id: row.id,
      campaignId: row.campaignId,
      sessionId: row.sessionId,
      type: row.type as TerminalEventType,
      actor: row.actor as TerminalActor,
      actorUserId: row.actorUserId,
      actorName: row.actorName,
      characterId: row.characterId,
      characterName: row.characterName,
      payload: JSON.parse(row.payload),
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? entries[entries.length - 1].createdAt.toISOString() : null,
  };
}

// ── Session Management ─────────────────────────────────────────────────────

/**
 * Start a new game session. Returns the session info.
 */
export async function startSession(campaignId: string, name?: string): Promise<GameSessionInfo> {
  // End any active session first
  const active = await prisma.gameSession.findFirst({
    where: { campaignId, endedAt: null },
    orderBy: { number: 'desc' },
  });
  if (active) {
    await prisma.gameSession.update({
      where: { id: active.id },
      data: { endedAt: new Date() },
    });
  }

  // Get next session number
  const lastSession = await prisma.gameSession.findFirst({
    where: { campaignId },
    orderBy: { number: 'desc' },
  });
  const nextNumber = (lastSession?.number || 0) + 1;

  const session = await prisma.gameSession.create({
    data: {
      campaignId,
      number: nextNumber,
      name: name || null,
    },
  });

  return {
    id: session.id,
    number: session.number,
    name: session.name,
    startedAt: session.startedAt.toISOString(),
    endedAt: null,
  };
}

/**
 * End the current active session.
 */
export async function endSession(campaignId: string): Promise<GameSessionInfo | null> {
  const active = await prisma.gameSession.findFirst({
    where: { campaignId, endedAt: null },
    orderBy: { number: 'desc' },
  });

  if (!active) return null;

  const updated = await prisma.gameSession.update({
    where: { id: active.id },
    data: { endedAt: new Date() },
  });

  return {
    id: updated.id,
    number: updated.number,
    name: updated.name,
    startedAt: updated.startedAt.toISOString(),
    endedAt: updated.endedAt!.toISOString(),
  };
}

/**
 * Get all sessions for a campaign.
 */
export async function listSessions(campaignId: string): Promise<GameSessionInfo[]> {
  const sessions = await prisma.gameSession.findMany({
    where: { campaignId },
    orderBy: { number: 'asc' },
  });

  return sessions.map(s => ({
    id: s.id,
    number: s.number,
    name: s.name,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() || null,
  }));
}

/**
 * Get the active session for a campaign (if any).
 */
export async function getActiveSession(campaignId: string): Promise<GameSessionInfo | null> {
  const active = await prisma.gameSession.findFirst({
    where: { campaignId, endedAt: null },
    orderBy: { number: 'desc' },
  });

  if (!active) return null;

  return {
    id: active.id,
    number: active.number,
    name: active.name,
    startedAt: active.startedAt.toISOString(),
    endedAt: null,
  };
}
