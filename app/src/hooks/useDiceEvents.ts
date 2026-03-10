/**
 * React hooks for subscribing to dice roll events.
 * Used by the 3D dice overlay and terminal log components.
 */

'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import type { RollResult } from '@/types/dice';
import { diceEvents } from '@/lib/dice-events';

/**
 * Subscribe to all dice roll events. The callback fires for every roll
 * processed by DiceService.
 */
export function useDiceEvents(onRoll: (result: RollResult) => void): void {
  const callbackRef = useRef(onRoll);
  callbackRef.current = onRoll;

  useEffect(() => {
    const handler = (result: RollResult) => callbackRef.current(result);
    return diceEvents.subscribe(handler);
  }, []);
}

/**
 * Accumulate recent roll results in a queue. Useful for the 3D overlay
 * which needs to animate one roll at a time.
 *
 * Uses a ref as the source of truth (synchronous reads) with state
 * for triggering re-renders.
 */
export function useDiceQueue(): {
  queue: RollResult[];
  dequeue: () => RollResult | undefined;
  clear: () => void;
} {
  const queueRef = useRef<RollResult[]>([]);
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick(n => n + 1), []);

  useDiceEvents(useCallback((result: RollResult) => {
    queueRef.current = [...queueRef.current, result];
    rerender();
  }, [rerender]));

  const dequeue = useCallback((): RollResult | undefined => {
    if (queueRef.current.length === 0) return undefined;
    const first = queueRef.current[0];
    queueRef.current = queueRef.current.slice(1);
    rerender();
    return first;
  }, [rerender]);

  const clear = useCallback(() => {
    queueRef.current = [];
    rerender();
  }, [rerender]);

  return { queue: queueRef.current, dequeue, clear };
}
