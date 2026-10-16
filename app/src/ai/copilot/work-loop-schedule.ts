/**
 * Which work sessions the DAYA work loop starts on a tick (perf pass
 * 2026-10-12). Pure.
 *
 * - Runnable = background (continueUnattended, or any character genesis —
 *   genesis is background by default) OR attended (a live SSE connection on
 *   its campaign).
 * - Up to `concurrency` cycles in flight at once (JEWL_WORK_CONCURRENCY,
 *   default 3 — JEWL is a swarm, Mike 2026-10-16: many things at once); a
 *   session already in flight or cooling down (its breather, or a
 *   transient-provider pause) waits.
 * - One character never runs twice at once (the per-character guard).
 * - Order is the caller's: least-recently-cycled first (round-robin). That
 *   is the fairness law too: a parent genesis that has waited longest goes
 *   before the child geneses it spawned (genesis-spawn.ts) — children never
 *   starve the parent, and a never-cycled session goes first of all.
 */
import { isGenesisGoal, parseGenesisGoal } from '@/services/character-genesis-progress';

export interface SchedulableSession {
  id: string;
  campaignId: string;
  goal: string;
  continueUnattended: boolean;
}

export const DEFAULT_WORK_CONCURRENCY = 3;
export const MAX_WORK_CONCURRENCY = 8;

export function workConcurrency(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.JEWL_WORK_CONCURRENCY);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_WORK_CONCURRENCY) : DEFAULT_WORK_CONCURRENCY;
}

/** Background sessions run with nobody at the table. */
export function isBackgroundSession(s: Pick<SchedulableSession, 'goal' | 'continueUnattended'>): boolean {
  return s.continueUnattended || isGenesisGoal(s.goal);
}

/** The thing two cycles must never work at once: the character a genesis
 *  builds, else the session itself. */
export function sessionSubjectKey(s: Pick<SchedulableSession, 'id' | 'goal'>): string {
  const g = parseGenesisGoal(s.goal);
  return g ? `character:${g.characterId}` : `session:${s.id}`;
}

export interface ScheduleInput<S extends SchedulableSession> {
  sessions: S[];
  /** Ids of sessions with a cycle running now. */
  inFlight: { keys(): Iterable<string>; readonly size: number };
  /** sessionId → epoch ms before which it may not start. */
  cooldownUntil: ReadonlyMap<string, number>;
  now: number;
  concurrency: number;
  attended: (campaignId: string) => boolean;
}

export interface SchedulePlan<S> {
  start: S[];
  /** Runnable sessions left waiting (no slot, cooling, or subject busy). */
  waiting: number;
  /** Earliest cooldown end among runnable sessions, when any is cooling. */
  nextWakeAt?: number;
}

export function pickSessionsToStart<S extends SchedulableSession>(input: ScheduleInput<S>): SchedulePlan<S> {
  const inFlightIds = new Set<string>(input.inFlight.keys());
  const busySubjects = new Set(
    input.sessions.filter(s => inFlightIds.has(s.id)).map(sessionSubjectKey),
  );
  let slots = Math.max(0, input.concurrency - inFlightIds.size);
  const start: S[] = [];
  let waiting = 0;
  let nextWakeAt: number | undefined;
  for (const s of input.sessions) {
    if (inFlightIds.has(s.id)) continue;
    if (!isBackgroundSession(s) && !input.attended(s.campaignId)) continue; // idles until the GM is back
    const until = input.cooldownUntil.get(s.id) ?? 0;
    if (until > input.now) {
      waiting++;
      nextWakeAt = nextWakeAt === undefined ? until : Math.min(nextWakeAt, until);
      continue;
    }
    const subject = sessionSubjectKey(s);
    if (slots === 0 || busySubjects.has(subject)) {
      waiting++;
      continue;
    }
    start.push(s);
    busySubjects.add(subject);
    slots--;
  }
  return { start, waiting, ...(nextWakeAt !== undefined ? { nextWakeAt } : {}) };
}
