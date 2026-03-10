/**
 * Dice Event Bus — Pub/sub for roll results.
 *
 * Uses window CustomEvent so events work across dynamic import chunks.
 * (next/dynamic with ssr:false creates separate bundles — module-level
 * singletons would be duplicated. Window events are truly global.)
 *
 * Subscribers: Terminal log, 3D dice overlay, roll history, future AI Oracle.
 * The DiceService emits after every roll. Subscribers react independently.
 */

import type { RollResult } from '@/types/dice';

const EVENT_NAME = 'growth:dice-roll';

type DiceEventHandler = (result: RollResult) => void;

class DiceEventBus {
  /** Subscribe to roll events. Returns unsubscribe function. */
  subscribe(handler: DiceEventHandler): () => void {
    if (typeof window === 'undefined') return () => {};

    const listener = (e: Event) => {
      const result = (e as CustomEvent<RollResult>).detail;
      try {
        handler(result);
      } catch {
        // Don't let a broken subscriber kill the pipeline
      }
    };

    window.addEventListener(EVENT_NAME, listener);
    return () => { window.removeEventListener(EVENT_NAME, listener); };
  }

  /** Emit a roll result to all subscribers. */
  emit(result: RollResult): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: result }));
  }
}

export const diceEvents = new DiceEventBus();
