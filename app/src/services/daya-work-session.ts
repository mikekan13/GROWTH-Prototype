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
import { isProdsBlocked, warnQuestionOutsideProd } from '@/lib/genesis-question';
import { isGateBlocked } from '@/lib/genesis-stages';

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
  /** 'coax' (default): stages open with questions; 'sail': fill in the rest. */
  mode?: 'coax' | 'sail';
}) {
  const session = await prisma.dayaWorkSession.create({
    data: {
      campaignId: opts.campaignId,
      goal: opts.goal,
      plan: opts.plan,
      ...(opts.stage ? { stage: opts.stage } : {}),
      ...(opts.mode ? { mode: opts.mode } : {}),
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
  // Blocked-on-prod (2026-10-12): a genesis waiting on the GM's prods stays
  // waiting until he has decided every OPEN prod — nobody but the decide
  // path wakes it, and nothing closes it.
  if (session.status === 'blocked' && isProdsBlocked(session.blockedReason)
    && (opts.status === 'active' || opts.status === 'done')) {
    const open = await prisma.genesisProd.count({ where: { sessionId: session.id, status: 'OPEN' } });
    if (open > 0) {
      if (opts.status === 'done') {
        throw new ValidationError(`${open} prod${open === 1 ? '' : 's'} still wait on the GM — the session resumes when he decides; never close it.`);
      }
      opts = { ...opts, status: undefined };
    }
  }
  // A question to the GM belongs in raise_prod, never a blocked reason.
  if (opts.status === 'blocked' && session.goal.startsWith('Character genesis') && !isProdsBlocked(opts.blockedReason)) {
    warnQuestionOutsideProd(session.id, opts.blockedReason, 'blocked reason');
  }

  const data: Record<string, unknown> = {};
  const stageNotes: string[] = [];
  // Completion stages (2026-10-12, order 2026-10-16): a genesis in a
  // build-phase stage that says "done" walks to the next stage its character
  // still lacks (AGE → APPEARANCE → WORLD → MEMORIES → VINES → PORTRAIT);
  // only after the last one is she Born.
  if (opts.status === 'done' && session.goal.startsWith('Character genesis')) {
    const stages = await import('./genesis-stages');
    if (stages.isBuildPhaseStage(session.stage)) {
      const { parseGenesisGoal } = await import('./character-genesis-progress');
      const characterId = parseGenesisGoal(session.goal)?.characterId;
      let next: string | null = null;
      try {
        next = characterId ? await stages.advanceGenesisStage(characterId, session.stage!) : null;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[daya-work-session] stage advance failed:', err);
        next = stages.nextGenesisStage(session.stage, null, { portraitGate: stages.portraitGateOn() });
      }
      if (next) {
        data.stage = next;
        stageNotes.push(`[system] stage ${session.stage} complete → ${next}`);
        opts = { ...opts, status: session.status === 'active' ? undefined : 'active' };
      }
    }
  }
  if (opts.progressNote || stageNotes.length) {
    const notes = parseProgress(session.progress);
    if (opts.progressNote) notes.push(opts.progressNote);
    notes.push(...stageNotes);
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
  else if (opts.progressNote || stageNotes.length) emit(session.campaignId, 'progress', updated, opts.progressNote ?? stageNotes[0]);

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
  })).filter(s => s.stage !== 'PRODDING' // prods wait on the GM's answers / Build, not the Forge
    && !isProdsBlocked(s.blockedReason) // blocked-on-prod resumes on the GM's decisions
    && !isGateBlocked(s.blockedReason)); // gates reopen from the designer (genesis-gates.ts)
  for (const session of blocked) {
    await updateWorkSession({
      sessionId: session.id,
      status: 'active',
      progressNote: '[system] blocker resolved — resuming',
    });
  }
  return blocked.length;
}
