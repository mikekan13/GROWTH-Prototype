/**
 * Campaign Stream — Server-side SSE connection manager.
 *
 * Tracks active SSE connections per campaign and provides broadcast
 * utilities. Uses globalThis to survive Next.js HMR in development.
 *
 * This is the server-side half of the real-time system. Client-side
 * connects via useCampaignStream hook → EventSource.
 */

import 'server-only';
import type { CampaignStreamEvent, StreamEventData } from '@/types/campaign-events';

// ── Connection Type ───────────────────────────────────────────────────────

interface SSEConnection {
  id: string;
  campaignId: string;
  userId: string;
  username: string;
  role: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  connectedAt: Date;
  /**
   * Perception unit 9 (PERCEPTION_FEED): this connection reads its character's perceived feed, not the
   * truth record. Set at connect (services/perceived-feed feedViewerFor). `characterId` = its character (null = none yet).
   */
  perceived?: { characterId: string | null };
}

/**
 * What a connection receives for an event (pure). The truth-record connections get everything unchanged.
 * A perceived-feed connection never receives another being's text or results:
 *   - terminal_event: its own (its character's line, or its own account's) and session markers in full;
 *     anything else is NOT sent — the line reaches it, if perceived, through its feed, read when the
 *     character's memory row is written (the targeted `perceived_feed_stale` push, lib/perceived-feed-push);
 *   - being_speaking (the growing line): never;
 *   - check / cast / death-save / wager / check-request results: only its own character's;
 *   - character_update of another: the refresh signal without the name;
 *   - jewl_working: the phase/tool only (its label names what was built); DAYA work sessions: never.
 * Everything else (connection presence, heartbeats, its own targeted nudges, portrait / focus ids) passes.
 */
export function deliveryFor(conn: Pick<SSEConnection, 'userId' | 'perceived'>, event: CampaignStreamEvent): CampaignStreamEvent | null {
  if (!conn.perceived) return event;
  const data = event.data;
  const mine = (characterId: string | null | undefined) => !!conn.perceived?.characterId && characterId === conn.perceived.characterId;
  const withData = (d: CampaignStreamEvent['data']): CampaignStreamEvent => ({ ...event, data: d });
  switch (data.kind) {
    case 'being_speaking':
    case 'daya_work_session':
      return null;
    case 'terminal_event': {
      const te = data.event;
      const own = mine(te.characterId) || (te.actorUserId === conn.userId && te.actor === 'player');
      const p = te.payload as { kind?: string; eventType?: string };
      const sessionMarker = p.kind === 'game_event' && typeof p.eventType === 'string' && p.eventType.startsWith('session_');
      return own || sessionMarker ? event : null;
    }
    case 'check_result':
    case 'cast_result':
    case 'death_save':
    case 'effort_wager_submit':
      return mine(data.characterId) ? event : null;
    case 'skill_check_request':
      return mine(data.targetCharacterId) ? event : null;
    case 'effort_wager_prompt':
      // Only ever sent to the one player being asked (targetUserId); untargeted → not this viewer's to read.
      return event.targetUserId === conn.userId ? event : null;
    case 'character_update':
      return mine(data.characterId) ? event : withData({ ...data, characterName: '' });
    case 'jewl_working':
      return withData({ kind: 'jewl_working', phase: data.phase, ...(data.tool ? { tool: data.tool } : {}) });
    default:
      return event;
  }
}

// ── Global Singleton (survives HMR) ───────────────────────────────────────

const globalForStream = globalThis as typeof globalThis & {
  __campaignConnections?: Map<string, Map<string, SSEConnection>>;
  __heartbeatInterval?: ReturnType<typeof setInterval>;
};

if (!globalForStream.__campaignConnections) {
  globalForStream.__campaignConnections = new Map();
}

const connections = globalForStream.__campaignConnections;

// ── Connection Management ─────────────────────────────────────────────────

function getCampaignPool(campaignId: string): Map<string, SSEConnection> {
  if (!connections.has(campaignId)) {
    connections.set(campaignId, new Map());
  }
  return connections.get(campaignId)!;
}

export function addConnection(conn: SSEConnection): void {
  getCampaignPool(conn.campaignId).set(conn.id, conn);
}

export function removeConnection(campaignId: string, connectionId: string): boolean {
  const pool = connections.get(campaignId);
  if (!pool) return false;

  const conn = pool.get(connectionId);
  if (!conn) return false;

  pool.delete(connectionId);

  // Clean up empty campaign pools
  if (pool.size === 0) {
    connections.delete(campaignId);
  }

  // Return true if this was the user's last connection (for disconnect broadcast)
  for (const c of (connections.get(campaignId)?.values() ?? [])) {
    if (c.userId === conn.userId) return false;
  }
  return true;
}

export function getConnectedUsers(campaignId: string): Array<{
  userId: string;
  username: string;
  role: string;
}> {
  const pool = connections.get(campaignId);
  if (!pool) return [];

  const seen = new Set<string>();
  const users: Array<{ userId: string; username: string; role: string }> = [];

  for (const conn of pool.values()) {
    if (!seen.has(conn.userId)) {
      seen.add(conn.userId);
      users.push({ userId: conn.userId, username: conn.username, role: conn.role });
    }
  }

  return users;
}

export function getConnectionCount(campaignId?: string): number {
  if (campaignId) {
    return connections.get(campaignId)?.size ?? 0;
  }
  let total = 0;
  for (const pool of connections.values()) {
    total += pool.size;
  }
  return total;
}

// ── Broadcasting ──────────────────────────────────────────────────────────

const encoder = new TextEncoder();

function sendToConnection(conn: SSEConnection, payload: string): boolean {
  try {
    conn.controller.enqueue(encoder.encode(payload));
    return true;
  } catch {
    // Connection is dead — remove it
    const pool = connections.get(conn.campaignId);
    pool?.delete(conn.id);
    if (pool?.size === 0) connections.delete(conn.campaignId);
    return false;
  }
}

/**
 * Broadcast a full event to all (or targeted) connections in a campaign.
 */
export function broadcast(campaignId: string, event: CampaignStreamEvent): void {
  const pool = connections.get(campaignId);
  if (!pool) return;

  const payload = `data: ${JSON.stringify(event)}\n\n`;

  for (const conn of pool.values()) {
    if (event.targetUserId && conn.userId !== event.targetUserId) continue;
    if (!conn.perceived) { sendToConnection(conn, payload); continue; }
    const out = deliveryFor(conn, event);
    if (out) sendToConnection(conn, out === event ? payload : `data: ${JSON.stringify(out)}\n\n`);
  }
}

/**
 * Convenience: build and broadcast an event from just the data payload.
 */
export function broadcastEvent(
  campaignId: string,
  data: StreamEventData,
  targetUserId?: string,
): void {
  broadcast(campaignId, {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    campaignId,
    targetUserId,
    data,
  });
}

// ── Heartbeat ─────────────────────────────────────────────────────────────

if (!globalForStream.__heartbeatInterval) {
  globalForStream.__heartbeatInterval = setInterval(() => {
    const heartbeat = encoder.encode(`: heartbeat\n\n`);

    for (const pool of connections.values()) {
      for (const [id, conn] of pool) {
        try {
          conn.controller.enqueue(heartbeat);
        } catch {
          pool.delete(id);
        }
      }
    }
  }, 30_000);
}
