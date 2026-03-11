/**
 * Godhead Dice Injection Registry
 * SERVER-ONLY — never import from client code.
 *
 * Allows the Godhead (admin) or future AI Oracle to silently override die results
 * before they reach players. All injections are audit-logged.
 *
 * Security: injection data never reaches clients. The `injected` flag on RollResult
 * is only visible in Terminal Admin view. Registry is only accessible via
 * authenticated API routes (/api/dice/inject).
 */
import 'server-only';

import type { RollRequest, DiceInjection, InjectionFilter } from '@/types/dice';

// ── Filter Matching ───────────────────────────────────────────────────────

function filterMatches(filter: InjectionFilter, request: RollRequest): boolean {
  switch (filter.type) {
    case 'next_roll':
      return true;

    case 'character': {
      const src = request.source;
      if ('characterId' in src) {
        return src.characterId === filter.characterId;
      }
      // contested rolls: match either side
      if (src.type === 'contested') {
        return src.attackerId === filter.characterId || src.defenderId === filter.characterId;
      }
      return false;
    }

    case 'roll_source':
      return request.source.type === filter.sourceType;

    case 'skill': {
      const src = request.source;
      if (src.type === 'skill_check') {
        return src.skillName.toLowerCase() === filter.skillName.toLowerCase();
      }
      return false;
    }

    case 'custom':
      return filter.predicate(request);

    default:
      return false;
  }
}

// ── Registry ──────────────────────────────────────────────────────────────

class DiceInjectionRegistry {
  private injections: Map<string, DiceInjection> = new Map();
  private auditLog: Array<{ timestamp: number; injectionId: string; rollId: string; reason: string }> = [];

  /** Register an injection. Returns the injection ID. */
  register(injection: DiceInjection): string {
    this.injections.set(injection.id, injection);
    return injection.id;
  }

  /** Remove an injection by ID. */
  remove(id: string): boolean {
    return this.injections.delete(id);
  }

  /** Clear all injections. */
  clear(): void {
    this.injections.clear();
  }

  /** List all active injections (for Godhead admin view). */
  list(): DiceInjection[] {
    this.pruneExpired();
    return Array.from(this.injections.values());
  }

  /** Get audit log entries. */
  getAuditLog(): typeof this.auditLog {
    return [...this.auditLog];
  }

  /**
   * Apply matching injections to a roll's natural results.
   * Called by DiceService after generating crypto-random values.
   *
   * @param request - The roll request
   * @param naturalValues - Array of natural die values (one per DieSpec)
   * @param maxValues - Array of max possible values per die
   * @returns Modified values + injection metadata
   */
  apply(
    request: RollRequest,
    naturalValues: number[],
    maxValues: number[],
  ): { values: number[]; wasInjected: boolean; injectionIds: string[] } {
    this.pruneExpired();

    const values = [...naturalValues];
    let wasInjected = false;
    const injectionIds: string[] = [];
    const toRemove: string[] = [];

    // Sort by priority (lower first, higher overrides)
    const sorted = Array.from(this.injections.values())
      .sort((a, b) => a.priority - b.priority);

    for (const injection of sorted) {
      if (!filterMatches(injection.filter, request)) continue;

      wasInjected = true;
      injectionIds.push(injection.id);

      // Apply the override
      switch (injection.override.type) {
        case 'set_values':
          for (let i = 0; i < values.length && i < injection.override.values.length; i++) {
            values[i] = Math.max(1, Math.min(maxValues[i], injection.override.values[i]));
          }
          break;

        case 'clamp_min':
          for (let i = 0; i < values.length; i++) {
            if (maxValues[i] > 0) { // Skip flat bonuses
              values[i] = Math.max(injection.override.min, values[i]);
            }
          }
          break;

        case 'clamp_max':
          for (let i = 0; i < values.length; i++) {
            if (maxValues[i] > 0) {
              values[i] = Math.min(injection.override.max, values[i]);
            }
          }
          break;

        // set_total, ensure_success, ensure_failure, add_modifier
        // are handled at the DiceService level (they affect totals, not individual dice)
      }

      // Audit log
      this.auditLog.push({
        timestamp: Date.now(),
        injectionId: injection.id,
        rollId: request.id,
        reason: injection.reason,
      });

      // Remove one-shot injections
      if (injection.oneShot) {
        toRemove.push(injection.id);
      }
    }

    for (const id of toRemove) {
      this.injections.delete(id);
    }

    return { values, wasInjected, injectionIds };
  }

  /**
   * Check if any injection would force success/failure for this request.
   * Called by DiceService to handle ensure_success/ensure_failure overrides.
   */
  getOutcomeOverride(request: RollRequest): 'success' | 'failure' | null {
    for (const injection of this.injections.values()) {
      if (!filterMatches(injection.filter, request)) continue;
      if (injection.override.type === 'ensure_success') return 'success';
      if (injection.override.type === 'ensure_failure') return 'failure';
    }
    return null;
  }

  /**
   * Get any total override for this request.
   */
  getTotalOverride(request: RollRequest): number | null {
    for (const injection of this.injections.values()) {
      if (!filterMatches(injection.filter, request)) continue;
      if (injection.override.type === 'set_total') return injection.override.total;
    }
    return null;
  }

  /**
   * Get any hidden modifier for this request.
   */
  getHiddenModifier(request: RollRequest): number {
    let bonus = 0;
    for (const injection of this.injections.values()) {
      if (!filterMatches(injection.filter, request)) continue;
      if (injection.override.type === 'add_modifier') {
        bonus += injection.override.bonus;
      }
    }
    return bonus;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [id, injection] of this.injections) {
      if (injection.expiresAt && injection.expiresAt <= now) {
        this.injections.delete(id);
      }
    }
  }
}

/** Singleton injection registry. Server-side only. */
export const injectionRegistry = new DiceInjectionRegistry();
