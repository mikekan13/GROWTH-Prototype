/**
 * Campaign SSE Stream — Real-time event endpoint.
 *
 * Clients connect via EventSource. The connection stays open and receives
 * events as they happen (dice rolls, skill checks, state changes, chat).
 *
 * Auth: session cookie (sent automatically by EventSource).
 * One connection per browser tab. Multiple tabs = multiple connections
 * (deduplicated by userId for presence tracking).
 */

import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  addConnection,
  removeConnection,
  getConnectedUsers,
  broadcastEvent,
} from '@/lib/campaign-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id: campaignId } = await params;
  const connectionId = crypto.randomUUID();
  const { user } = session;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Register this connection
      addConnection({
        id: connectionId,
        campaignId,
        userId: user.id,
        username: user.username,
        role: user.role,
        controller,
        connectedAt: new Date(),
      });

      // Send state sync to the new connection (just this client)
      const encoder = new TextEncoder();
      const syncPayload = JSON.stringify({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        campaignId,
        data: {
          kind: 'state_sync',
          connectedUsers: getConnectedUsers(campaignId),
        },
      });
      controller.enqueue(encoder.encode(`data: ${syncPayload}\n\n`));

      // Broadcast join to everyone else
      broadcastEvent(campaignId, {
        kind: 'connection',
        userId: user.id,
        username: user.username,
        role: user.role,
        status: 'connected',
      });
    },

    cancel() {
      const wasLastConnection = removeConnection(campaignId, connectionId);

      // Only broadcast disconnect if this was the user's last tab
      if (wasLastConnection) {
        broadcastEvent(campaignId, {
          kind: 'connection',
          userId: user.id,
          username: user.username,
          role: user.role,
          status: 'disconnected',
        });
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
