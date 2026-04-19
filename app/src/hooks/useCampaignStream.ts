/**
 * Campaign Stream Hook — Client-side SSE connection.
 *
 * Connects to /api/campaigns/[id]/stream and provides:
 * - Connection status
 * - Connected user list (auto-updated)
 * - Event subscription by kind (typed)
 * - Auto-reconnection (built into EventSource)
 *
 * Usage:
 *   const { connected, connectedUsers, on } = useCampaignStream({ campaignId });
 *
 *   useEffect(() => on('check_result', (data) => {
 *     console.log(data.characterName, data.success ? 'passed' : 'failed');
 *   }), [on]);
 */

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type {
  CampaignStreamEvent,
  StreamEventData,
} from '@/types/campaign-events';

// ── Types ─────────────────────────────────────────────────────────────────

type ConnectedUser = { userId: string; username: string; role: string };

type KindHandler<K extends StreamEventData['kind']> = (
  data: Extract<StreamEventData, { kind: K }>,
  envelope: CampaignStreamEvent,
) => void;

interface UseCampaignStreamOptions {
  campaignId: string;
  enabled?: boolean;
  onEvent?: (event: CampaignStreamEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

interface UseCampaignStreamReturn {
  connected: boolean;
  connectedUsers: ConnectedUser[];
  /** Subscribe to events of a specific kind. Returns unsubscribe function. */
  on: <K extends StreamEventData['kind']>(kind: K, handler: KindHandler<K>) => () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useCampaignStream({
  campaignId,
  enabled = true,
  onEvent,
  onConnect,
  onDisconnect,
}: UseCampaignStreamOptions): UseCampaignStreamReturn {
  const [connected, setConnected] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([]);

  const eventSourceRef = useRef<EventSource | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlersRef = useRef<Map<string, Set<(data: any, env: CampaignStreamEvent) => void>>>(new Map());

  // Keep callback refs fresh without re-triggering effect
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onConnectRef = useRef(onConnect);
  onConnectRef.current = onConnect;
  const onDisconnectRef = useRef(onDisconnect);
  onDisconnectRef.current = onDisconnect;

  // ── Subscribe to a specific event kind ──────────────────────────────────

  const on = useCallback(<K extends StreamEventData['kind']>(
    kind: K,
    handler: KindHandler<K>,
  ): (() => void) => {
    if (!handlersRef.current.has(kind)) {
      handlersRef.current.set(kind, new Set());
    }
    handlersRef.current.get(kind)!.add(handler);

    return () => {
      handlersRef.current.get(kind)?.delete(handler);
    };
  }, []);

  // ── SSE Connection Lifecycle ────────────────────────────────────────────

  useEffect(() => {
    if (!enabled || !campaignId) return;

    const es = new EventSource(`/api/campaigns/${campaignId}/stream`);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
      onConnectRef.current?.();
    };

    es.onmessage = (e: MessageEvent) => {
      let event: CampaignStreamEvent;
      try {
        event = JSON.parse(e.data);
      } catch {
        return; // Ignore malformed events
      }

      const { data } = event;

      // ── Built-in handlers ─────────────────────────────────────────────

      if (data.kind === 'state_sync') {
        setConnectedUsers(data.connectedUsers);
      }

      if (data.kind === 'connection') {
        if (data.status === 'connected') {
          setConnectedUsers(prev => {
            if (prev.some(u => u.userId === data.userId)) return prev;
            return [...prev, { userId: data.userId, username: data.username, role: data.role }];
          });
        } else {
          setConnectedUsers(prev => prev.filter(u => u.userId !== data.userId));
        }
      }

      // ── Dispatch to subscribers ───────────────────────────────────────

      onEventRef.current?.(event);

      const kindHandlers = handlersRef.current.get(data.kind);
      if (kindHandlers) {
        for (const handler of kindHandlers) {
          try {
            handler(data, event);
          } catch {
            // Don't let a broken subscriber crash the bus
          }
        }
      }
    };

    es.onerror = () => {
      setConnected(false);
      onDisconnectRef.current?.();
      // EventSource auto-reconnects with exponential backoff
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, [campaignId, enabled]);

  return { connected, connectedUsers, on };
}
