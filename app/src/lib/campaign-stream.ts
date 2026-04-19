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
    sendToConnection(conn, payload);
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
