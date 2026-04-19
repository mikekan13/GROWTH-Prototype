/**
 * Pending Skill Checks — Server-side in-memory store.
 *
 * Holds state between the SD roll (GM initiates) and the effort wager
 * (player responds). Each check has a timeout after which it auto-resolves
 * with 0 effort.
 *
 * Uses globalThis to survive Next.js HMR.
 */

import 'server-only';

export interface PendingCheck {
  id: string;
  campaignId: string;
  /** The character being checked */
  characterId: string;
  characterName: string;
  /** The player who owns this character */
  targetUserId: string;
  /** Skill info */
  skillName?: string;
  skillLevel: number;
  isSkilled: boolean;
  /** The governor attribute for unskilled checks */
  attributeName: string;
  /** Dice — SD is rolled on initiate, FD is rolled on wager commit */
  fateDie: string;
  sdDie: string;
  sdResult: number;
  dr: number;
  difficultyHint: 'blue' | 'purple' | 'red';
  /** Available governors for effort wager */
  availableGovernors: Array<{
    name: string;
    current: number;
    pillar: 'body' | 'spirit' | 'soul';
  }>;
  maxUsefulEffort: number;
  /** Whether to show DR to players in the result */
  revealDR: boolean;
  /** If this is part of a contested check, link to the other half */
  contestedWith?: {
    defenderCharacterId: string;
    defenderCharacterName: string;
    defenderUserId: string;
    defenderSkillName?: string;
    defenderAttributeName?: string;
    defenderSkillLevel: number;
    defenderIsSkilled: boolean;
    defenderGovernors: string[];
    defenderFateDie: string;
  };
  /** Metadata */
  requestedBy: string;
  createdAt: number;
  /** Auto-resolve timeout handle */
  timeoutHandle: ReturnType<typeof setTimeout>;
}

// ── Global Singleton ──────────────────────────────────────────────────────

const globalForChecks = globalThis as typeof globalThis & {
  __pendingChecks?: Map<string, PendingCheck>;
};

if (!globalForChecks.__pendingChecks) {
  globalForChecks.__pendingChecks = new Map();
}

const checks = globalForChecks.__pendingChecks;

// ── Operations ────────────────────────────────────────────────────────────

export function storePendingCheck(check: PendingCheck): void {
  checks.set(check.id, check);
}

export function getPendingCheck(checkId: string): PendingCheck | undefined {
  return checks.get(checkId);
}

export function removePendingCheck(checkId: string): PendingCheck | undefined {
  const check = checks.get(checkId);
  if (check) {
    clearTimeout(check.timeoutHandle);
    checks.delete(checkId);
  }
  return check;
}

/** Get all pending checks for a specific player in a campaign */
export function getPendingChecksForUser(campaignId: string, userId: string): PendingCheck[] {
  const result: PendingCheck[] = [];
  for (const check of checks.values()) {
    if (check.campaignId === campaignId && check.targetUserId === userId) {
      result.push(check);
    }
  }
  return result;
}
