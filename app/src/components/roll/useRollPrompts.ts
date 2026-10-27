"use client";

/**
 * useRollPrompts — the roll popup's queue (Mike 2026-10-26). The canvas's SSE handler relays a table roll's
 * `effort_wager_prompt` (the ones carrying `tableRoll`) as a window event; this hook shows them one at a time, posts
 * the answer to the existing wager route, and fires the server-rolled Fate Die through the dice overlay
 * (`growth:spawn-die-in-hand` with `serverValue`, the same server-driven path the canvas wager modal uses).
 * The card itself arrives through the feed (terminal_event / perceived_feed_stale); nothing is posted from here.
 */
import { useCallback, useEffect, useState } from 'react';
import type { RollAnswer, RollPrompt } from './RollPopup';

export const ROLL_PROMPT_EVENT = 'growth:roll-prompt';

export function useRollPrompts(campaignId: string, onNote?: (note: string) => void) {
  const [queue, setQueue] = useState<RollPrompt[]>([]);
  const [answering, setAnswering] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const prompt = (e as CustomEvent).detail as RollPrompt | undefined;
      if (!prompt?.tableRoll || !prompt.checkId) return;
      setQueue((q) => (q.some((p) => p.checkId === prompt.checkId) ? q : [...q, prompt]));
    };
    window.addEventListener(ROLL_PROMPT_EVENT, handler);
    return () => window.removeEventListener(ROLL_PROMPT_EVENT, handler);
  }, []);

  const current = queue[0] ?? null;
  const drop = useCallback((checkId: string) => setQueue((q) => q.filter((p) => p.checkId !== checkId)), []);

  const throwDie = useCallback(async (answer: RollAnswer, at: { x: number; y: number }) => {
    if (!current || answering) return;
    setAnswering(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/skill-check/wager`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkId: current.checkId, wagers: answer.wagers, ...(answer.dr !== undefined ? { dr: answer.dr } : {}), ...(answer.aiChose ? { aiChose: true } : {}) }),
      });
      if (res.ok) {
        const data = (await res.json()) as { fdResult?: number };
        if (current.fateDie && typeof data.fdResult === 'number') {
          window.dispatchEvent(new CustomEvent('growth:spawn-die-in-hand', { detail: { dieType: current.fateDie, screenX: at.x, screenY: at.y, serverValue: data.fdResult } }));
        }
      } else if (res.status === 404) {
        onNote?.('That roll was already settled.');
      } else {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        onNote?.(j.error ?? 'The roll was not accepted');
        return; // leave the popup open: a rejected wager can be retried
      }
      drop(current.checkId);
    } catch (err) {
      onNote?.(err instanceof Error ? err.message : String(err));
    } finally {
      setAnswering(false);
    }
  }, [current, answering, campaignId, drop, onNote]);

  const expire = useCallback(() => { if (current) drop(current.checkId); }, [current, drop]);

  return { current, answering, throwDie, expire };
}
