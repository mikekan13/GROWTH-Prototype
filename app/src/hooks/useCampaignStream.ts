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

// ── Shared connection (one EventSource per campaign per tab) ─────────────
//
// Several components subscribe to the same campaign stream (canvas, JEWL chip,
// death-save dialog...). Each used to open its own EventSource, i.e. its own
// long-lived HTTP/1.1 socket. Browsers cap sockets per host at 6 across ALL
// tabs, so two or three campaign tabs filled the pool and every other request
// queued forever — in dev the first casualty was the app/layout chunk
// ("ChunkLoadError: Loading chunk app/layout failed (timeout)", 2026-10-11).
// Hook instances now share one refcounted EventSource per campaignId.

interface StreamListener {
  onOpen: () => void;
  onEvent: (event: CampaignStreamEvent) => void;
  onError: () => void;
}

interface SharedStream {
  es: EventSource;
  listeners: Set<StreamListener>;
  open: boolean;
  users: ConnectedUser[];
}

const sharedStreams = new Map<string, SharedStream>();

function acquireStream(campaignId: string, listener: StreamListener): { shared: SharedStream; release: () => void } {
  let shared = sharedStreams.get(campaignId);
  if (!shared) {
    const es = new EventSource(`/api/campaigns/${campaignId}/stream`);
    const s: SharedStream = { es, listeners: new Set(), open: false, users: [] };
    es.onopen = () => {
      s.open = true;
      for (const l of [...s.listeners]) l.onOpen();
    };
    es.onmessage = (e: MessageEvent) => {
      let event: CampaignStreamEvent;
      try {
        event = JSON.parse(e.data);
      } catch {
        return; // Ignore malformed events
      }
      const { data } = event;
      if (data.kind === 'state_sync') s.users = data.connectedUsers;
      if (data.kind === 'connection') {
        if (data.status === 'connected') {
          if (!s.users.some(u => u.userId === data.userId)) {
            s.users = [...s.users, { userId: data.userId, username: data.username, role: data.role }];
          }
        } else {
          s.users = s.users.filter(u => u.userId !== data.userId);
        }
      }
      // A being speaking at the table (U2c, 2026-10-06): start / partial /
      // retract / final for one utterance. Re-broadcast ONCE per tab as a
      // window event so the terminal's growing line can listen without the
      // whole campaign tree re-rendering on every partial.
      if (data.kind === 'being_speaking') {
        window.dispatchEvent(new CustomEvent('growth:being-speaking', { detail: data }));
      }
      for (const l of [...s.listeners]) l.onEvent(event);
    };
    es.onerror = () => {
      s.open = false;
      for (const l of [...s.listeners]) l.onError();
      // EventSource auto-reconnects with exponential backoff
    };
    sharedStreams.set(campaignId, s);
    shared = s;
  }
  const s = shared;
  s.listeners.add(listener);
  return {
    shared: s,
    release: () => {
      s.listeners.delete(listener);
      if (s.listeners.size === 0) {
        s.es.close();
        if (sharedStreams.get(campaignId) === s) sharedStreams.delete(campaignId);
      }
    },
  };
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

    let sharedRef: SharedStream | null = null;
    const listener: StreamListener = {
      onOpen: () => {
        setConnected(true);
        onConnectRef.current?.();
      },
      onEvent: (event) => {
        const { data } = event;
        if ((data.kind === 'state_sync' || data.kind === 'connection') && sharedRef) {
          setConnectedUsers(sharedRef.users);
        }
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
      },
      onError: () => {
        setConnected(false);
        onDisconnectRef.current?.();
      },
    };

    const { shared, release } = acquireStream(campaignId, listener);
    sharedRef = shared;
    // Joining an already-open shared stream: catch up on its state.
    if (shared.open) {
      setConnected(true);
      setConnectedUsers(shared.users);
      onConnectRef.current?.();
    }

    return () => {
      release();
      setConnected(false);
    };
  }, [campaignId, enabled]);

  return { connected, connectedUsers, on };
}
