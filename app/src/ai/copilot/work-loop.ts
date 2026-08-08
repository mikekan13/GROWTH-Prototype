/**
 * DAYA work loop — the outer loop of the being loop, walking version
 * (F-3, [[daya-being-loop-2026-08-07]]).
 *
 * Job-open state, NOT a timer: while any DayaWorkSession is active the
 * runner fires work cycles back-to-back (short breather between so GM
 * messages and SSE land). Each cycle is one full dispatchPrompt — JEWL
 * perceives (job + steering + world), thinks, acts, notes progress. The
 * loop dies when no session is runnable; kickWorkLoop() revives it from
 * the entry points (session opened, stream connect, forge batch
 * resolved). Self-deactivation: JEWL sets status=done — no caps, no
 * TTLs, completion bounds the run.
 *
 * Attendance: sessions run while their campaign has a live SSE
 * connection, or unconditionally when the GM answered the spoken
 * hand-off question (continueUnattended).
 *
 * Guarded-global singleton (pod-keepalive pattern) — survives HMR.
 * Runtime is imported dynamically to keep the tools-barrel module graph
 * acyclic at init.
 */
import 'server-only';
import { getConnectionCount } from '@/lib/campaign-stream';
import {
  getActiveWorkSessions,
  parseProgress,
  touchCycle,
  updateWorkSession,
} from '@/services/daya-work-session';
import { getJewlGodHead } from './jewl-identity';

const BREATHER_MS = 4_000;
/** Consecutive tool-less cycles before a session is judged stalled and
 *  yields to the GM. Not a budget cap — a "nothing actionable" detector;
 *  in a WORK session a cycle with no action means the job needs input. */
const STALL_CYCLES = 3;

interface WorkLoopState {
  running: boolean;
  /** sessionId → consecutive cycles with zero tool calls. */
  stalls: Map<string, number>;
}

const g = globalThis as unknown as { __dayaWorkLoop?: WorkLoopState };
if (!g.__dayaWorkLoop) {
  g.__dayaWorkLoop = { running: false, stalls: new Map() };
}
const state = g.__dayaWorkLoop!;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Idempotent: starts the loop if it isn't running. Call from every
 *  entry point that can make a session runnable. */
export function kickWorkLoop(): void {
  if (state.running) return;
  state.running = true;
  void runLoop();
}

async function runLoop(): Promise<void> {
  try {
    for (;;) {
      const sessions = await getActiveWorkSessions();
      if (sessions.length === 0) return; // nothing open — loop dies
      const runnable = sessions.filter(
        s => s.continueUnattended || getConnectionCount(s.campaignId) > 0,
      );
      // Attended sessions with nobody at the table idle silently; the
      // stream route kicks the loop again when the GM reconnects.
      if (runnable.length === 0) return;

      await runCycle(runnable[0]); // least-recently-cycled (round-robin)
      await sleep(BREATHER_MS);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[daya-work-loop] crashed:', err);
  } finally {
    state.running = false;
  }
}

async function runCycle(session: {
  id: string;
  campaignId: string;
  goal: string;
  plan: string | null;
  progress: string;
  cycleCount: number;
}): Promise<void> {
  const jewl = await getJewlGodHead();
  await touchCycle(session.id);

  const recentNotes = parseProgress(session.progress).slice(-5);
  const text = [
    `[SYSTEM] Work cycle ${session.cycleCount + 1} — work session ${session.id}.`,
    `GOAL: ${session.goal}`,
    session.plan ? `YOUR PLAN: ${session.plan}` : 'YOUR PLAN: (none recorded — set one via update_work_session if useful)',
    recentNotes.length
      ? `YOUR RECENT PROGRESS NOTES:\n${recentNotes.map(n => `- ${n}`).join('\n')}`
      : 'No progress notes yet — this is the first working cycle.',
    'Continue THIS job now: do the next concrete piece of work with your tools, then record ONE progress line via update_work_session. ' +
      'Check the recent conversation — if the GM said anything since your last cycle, let it steer you. ' +
      'If you are waiting on the GM (Forge approvals, an unanswered load-bearing question), set status=blocked with the reason and stop. ' +
      'When the job is genuinely COMPLETE, set status=done and tell the GM in 2-3 lines what stands ready — never an inventory; one Forge pointer if drafts wait.',
  ].join('\n');

  // Dynamic import: runtime imports the tools barrel, which includes the
  // work-session tools, which import this module — static would cycle.
  const { dispatchPrompt } = await import('./runtime');
  const response = await dispatchPrompt({
    source: 'JEWL_WORK_CYCLE',
    campaignId: session.campaignId,
    actorId: jewl.characterUserId,
    actorName: 'JEWL',
    actorRole: 'GODHEAD',
    text,
  });

  // Stall detection — "nothing actionable" yields to the GM.
  if (response.toolCalls.length > 0) {
    state.stalls.delete(session.id);
    return;
  }
  const stalls = (state.stalls.get(session.id) ?? 0) + 1;
  if (stalls < STALL_CYCLES) {
    state.stalls.set(session.id, stalls);
    return;
  }
  state.stalls.delete(session.id);
  try {
    await updateWorkSession({
      sessionId: session.id,
      status: 'blocked',
      blockedReason: 'no actionable work for several cycles — waiting on you',
      progressNote: '[system] auto-blocked: idle cycles',
    });
  } catch { /* session may have been closed mid-cycle by JEWL himself */ }
}
