/**
 * DAYA work sessions — DAYA v0.x walking version of "keep existing" (F-3).
 *
 * A DayaWorkSession is a durable job JEWL works across message
 * boundaries. The outer loop (`ai/copilot/work-loop.ts`) fires work
 * cycles while a session is active; JEWL closes it himself when the job
 * is done — self-deactivation bounds the run (ruling 2026-08-07: no
 * caps, no TTLs; completion is the stop condition). `blocked` means
 * waiting on the GM; the forge-batch watch reactivates.
 *
 * See memory `daya-being-loop-2026-08-07` + the F-3 spec in daya-specs/.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { broadcastEvent } from '@/lib/campaign-stream';
import { NotFoundError, ValidationError } from '@/lib/errors';

export type WorkSessionStatus = 'active' | 'blocked' | 'done' | 'cancelled';

const MAX_PROGRESS_NOTES = 200;

export function parseProgress(json: string): string[] {
  try {
    const arr: unknown = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((n): n is string => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

function emit(
  campaignId: string,
  phase: 'opened' | 'progress' | 'blocked' | 'done' | 'cancelled',
  session: { id: string; goal: string },
  note?: string,
): void {
  try {
    broadcastEvent(campaignId, {
      kind: 'daya_work_session',
      phase,
      sessionId: session.id,
      goal: session.goal,
      note,
    });
  } catch { /* presence is best-effort — never break the work itself */ }
}

export async function openWorkSession(opts: {
  campaignId: string;
  goal: string;
  plan?: string;
  continueUnattended?: boolean;
  createdBy: string;
  /** Genesis opens in 'PRODDING' (JEWL asks the GM before building). */
  stage?: string;
}) {
  const session = await prisma.dayaWorkSession.create({
    data: {
      campaignId: opts.campaignId,
      goal: opts.goal,
      plan: opts.plan,
      ...(opts.stage ? { stage: opts.stage } : {}),
      continueUnattended: opts.continueUnattended ?? false,
      createdBy: opts.createdBy,
    },
  });
  emit(opts.campaignId, 'opened', session);
  return session;
}

export async function updateWorkSession(opts: {
  sessionId: string;
  progressNote?: string;
  plan?: string;
  status?: WorkSessionStatus;
  blockedReason?: string;
}) {
  const session = await prisma.dayaWorkSession.findUnique({ where: { id: opts.sessionId } });
  if (!session) throw new NotFoundError('Work session not found');
  if (session.status === 'done' || session.status === 'cancelled') {
    throw new ValidationError(`Work session is already ${session.status}`);
  }
  // Genesis is a dialogue (2026-10-12): nothing ends a session that is still
  // asking the GM — only the GM's Build moves it past PRODDING.
  if (session.stage === 'PRODDING' && opts.status === 'done') {
    throw new ValidationError('Genesis is still in the prod stage — the GM has not pressed Build. Raise prods or end the round; never close it.');
  }

  const data: Record<string, unknown> = {};
  if (opts.progressNote) {
    const notes = parseProgress(session.progress);
    notes.push(opts.progressNote);
    data.progress = JSON.stringify(notes.slice(-MAX_PROGRESS_NOTES));
  }
  if (opts.plan !== undefined) data.plan = opts.plan;
  if (opts.status && opts.status !== session.status) {
    data.status = opts.status;
    if (opts.status === 'done' || opts.status === 'cancelled') data.endedAt = new Date();
    if (opts.status === 'blocked') data.blockedReason = opts.blockedReason ?? 'waiting on the GM';
    if (opts.status === 'active') data.blockedReason = null;
  }

  const updated = await prisma.dayaWorkSession.update({
    where: { id: session.id },
    data,
  });

  // Born → awake (2026-10-12): a genesis reaching its final stage wakes the
  // character so the table loop can voice her. Before the status line, so
  // "is born" is true when it is said. Best-effort — never blocks Born.
  if (opts.status === 'done' && session.status !== 'done' && session.goal.startsWith('Character genesis')) {
    try {
      const { awakenGenesisCharacter } = await import('./character-genesis-born');
      await awakenGenesisCharacter(session.goal);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[daya-work-session] born character not awakened:', err);
    }
  }

  // Genesis transitions get one short in-voice JEWL line in the GM's chat
  // (the overlay carries progress; the Log carries the report). Best-effort.
  if (opts.status && opts.status !== session.status && opts.status !== 'active'
    && session.goal.startsWith('Character genesis')) {
    void import('./character-genesis-progress')
      .then(m => m.announceGenesisStatus(updated))
      .catch(err => {
        // eslint-disable-next-line no-console
        console.error('[daya-work-session] genesis status line failed:', err);
      });
  }

  if (opts.status === 'blocked') emit(session.campaignId, 'blocked', updated, updated.blockedReason ?? undefined);
  else if (opts.status === 'done') emit(session.campaignId, 'done', updated, opts.progressNote);
  else if (opts.status === 'cancelled') emit(session.campaignId, 'cancelled', updated);
  else if (opts.progressNote) emit(session.campaignId, 'progress', updated, opts.progressNote);

  return updated;
}

/** Stamp a cycle start — the loop's bookkeeping, not JEWL's. */
export async function touchCycle(sessionId: string) {
  return prisma.dayaWorkSession.update({
    where: { id: sessionId },
    data: { cycleCount: { increment: 1 }, lastCycleAt: new Date() },
  });
}

/** All active sessions across campaigns, least-recently-cycled first
 *  (round-robin ordering for the outer loop). */
export async function getActiveWorkSessions() {
  const sessions = await prisma.dayaWorkSession.findMany({
    where: { status: 'active' },
  });
  return sessions.sort((a, b) => {
    const ta = a.lastCycleAt?.getTime() ?? 0; // never-cycled first
    const tb = b.lastCycleAt?.getTime() ?? 0;
    return ta - tb;
  });
}

export async function listWorkSessions(campaignId: string, includeClosed = false) {
  return prisma.dayaWorkSession.findMany({
    where: {
      campaignId,
      ...(includeClosed ? {} : { status: { in: ['active', 'blocked'] } }),
    },
    orderBy: { startedAt: 'desc' },
    take: 20,
  });
}

/** Forge batch resolved (or similar unblock) — put blocked sessions back
 *  to work. Returns how many resumed. */
export async function resumeBlockedWorkSessions(campaignId: string): Promise<number> {
  const blocked = (await prisma.dayaWorkSession.findMany({
    where: { campaignId, status: 'blocked' },
  })).filter(s => s.stage !== 'PRODDING'); // prods wait on the GM's answers / Build, not the Forge
  for (const session of blocked) {
    await updateWorkSession({
      sessionId: session.id,
      status: 'active',
      progressNote: '[system] blocker resolved — resuming',
    });
  }
  return blocked.length;
}
