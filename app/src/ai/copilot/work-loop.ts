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
import { getCampaignEconomy } from '@/services/krma/wallet';
import { getConnectionCount } from '@/lib/campaign-stream';
import {
  getActiveWorkSessions,
  parseProgress,
  touchCycle,
  updateWorkSession,
} from '@/services/daya-work-session';
import { getJewlGodHead } from './jewl-identity';
import {
  GENESIS_CHAT_USERNAME,
  isGenesisGoal,
  logGenesisReport,
} from '@/services/character-genesis-progress';
import { WallViolationError } from '@/ai/network/errors';
import { planWorkCycle, type CycleProd } from './work-cycle-text';
import { watchSeedWithheld, seedWithheldNotes } from '@/services/genesis-seed-screen';

const BREATHER_MS = 4_000;
/** Consecutive tool-less cycles before a session is judged stalled and
 *  yields to the GM. Not a budget cap — a "nothing actionable" detector;
 *  in a WORK session a cycle with no action means the job needs input. */
const STALL_CYCLES = 3;
/** Consecutive DISPATCH CRASHES (provider down, out of credits, context
 *  blowout) before the session auto-blocks with the real error instead of
 *  burning cycles against a dead API (found live 2026-08-21: out-of-credit
 *  400s racked six silent cycles). */
const MAX_DISPATCH_FAILURES = 3;

interface WorkLoopState {
  running: boolean;
  /** sessionId → consecutive cycles with zero tool calls. */
  stalls: Map<string, number>;
  /** sessionId → consecutive dispatch crashes. */
  dispatchFailures: Map<string, number>;
}

const g = globalThis as unknown as { __dayaWorkLoop?: WorkLoopState };
if (!g.__dayaWorkLoop) {
  g.__dayaWorkLoop = { running: false, stalls: new Map(), dispatchFailures: new Map() };
}
if (!g.__dayaWorkLoop.dispatchFailures) {
  // HMR-survivor state from before this field existed.
  g.__dayaWorkLoop.dispatchFailures = new Map();
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

/** Log + note any tone-filter withholds that hit this genesis cycle's seed. Never throws. */
async function flushSeedWithheld(
  watch: ReturnType<typeof watchSeedWithheld> | null,
  session: { id: string; progress: string },
): Promise<void> {
  if (!watch) return;
  try {
    const events = watch.stop();
    if (!events.length) return;
    for (const note of seedWithheldNotes(session.id, events, parseProgress(session.progress))) {
      await updateWorkSession({ sessionId: session.id, progressNote: note });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[daya-work-loop] seed-withheld note failed:', err instanceof Error ? err.message : err);
  }
}

async function runCycle(session: {
  id: string;
  campaignId: string;
  goal: string;
  plan: string | null;
  progress: string;
  cycleCount: number;
  stage?: string | null;
}): Promise<void> {
  const jewl = await getJewlGodHead();
  await touchCycle(session.id);

  // Treasury awareness (Mike, 2026-08-25): JEWL should know the campaign's
  // KRMA pool — it tells him what he's working with. Context only: the
  // density band and internal block balance stay the sizing law.
  let treasuryLine = '';
  try {
    const eco = await getCampaignEconomy(session.campaignId);
    treasuryLine = `CAMPAIGN TREASURY: ${eco.fluid} fluid / ${eco.crystallized} crystallized / ${eco.total} total KRMA. Context, not spendable headroom — the density band remains your sizing law.`;
  } catch { /* treasury is context, never a blocker */ }

  const recentNotes = parseProgress(session.progress).slice(-5);
  // Genesis is a dialogue (2026-10-12): a PRODDING cycle only asks the GM
  // (prod tools only); after Build the GM's decisions ride in the plan.
  let prods: CycleProd[] = [];
  if (isGenesisGoal(session.goal)) {
    try {
      const { listSessionProds } = await import('@/services/genesis-prods');
      prods = await listSessionProds(session.id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[daya-work-loop] prods not loaded:', err);
      if (session.stage === 'PRODDING') return; // never ask blind — try again next pass
    }
  }
  const { text, allowedTools } = planWorkCycle(session, prods, treasuryLine, recentNotes);

  // Dynamic import: runtime imports the tools barrel, which includes the
  // work-session tools, which import this module — static would cycle.
  const { dispatchPrompt } = await import('./runtime');
  // Genesis is chat-quiet (Mike 2026-10-11): the cycle's full reply goes to
  // the Log as a genesis report; the chat gets one status line per
  // transition (daya-work-session → announceGenesisStatus).
  const genesis = isGenesisGoal(session.goal);
  // Never silent again (2026-10-12): a withhold on the seed is logged and
  // surfaced in the genesis overlay's feed (fixed-format progress note).
  const seedWatch = genesis ? watchSeedWithheld(session.id) : null;
  let response;
  try {
    response = await dispatchPrompt({
      source: 'JEWL_WORK_CYCLE',
      campaignId: session.campaignId,
      actorId: jewl.characterUserId,
      actorName: 'JEWL',
      actorRole: 'GODHEAD',
      text,
      ...(allowedTools ? { allowedTools } : {}),
      ...(genesis ? { replyUsername: GENESIS_CHAT_USERNAME, toneRef: { table: 'DayaWorkSession', id: session.id } } : {}),
    });
    await flushSeedWithheld(seedWatch, session);
    state.dispatchFailures.delete(session.id);
    if (genesis) {
      try {
        await logGenesisReport({
          campaignId: session.campaignId,
          goal: session.goal,
          message: response.message,
          cycle: session.cycleCount + 1,
          jewlUserId: jewl.characterUserId,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[daya-work-loop] genesis report not logged:', err);
      }
    }
  } catch (err) {
    await flushSeedWithheld(seedWatch, session);
    const msg = err instanceof Error ? err.message : String(err);
    // The wall refused the cycle (its plan or context carries table/real
    // content): retrying cannot help — block now and say why, without text.
    if (err instanceof WallViolationError) {
      state.dispatchFailures.delete(session.id);
      try {
        await updateWorkSession({
          sessionId: session.id,
          status: 'blocked',
          blockedReason: 'The work cycle carries table or real-life content, which never leaves the table. Edit the plan/backstory and resume.',
          progressNote: '[system] auto-blocked: the wall refused the cycle (table/real content)',
        });
      } catch { /* session may have been closed mid-cycle */ }
      return;
    }
    const fails = (state.dispatchFailures.get(session.id) ?? 0) + 1;
    state.dispatchFailures.set(session.id, fails);
    // eslint-disable-next-line no-console
    console.error(`[daya-work-loop] dispatch failed (${fails}/${MAX_DISPATCH_FAILURES}) for ${session.id}: ${msg.slice(0, 200)}`);
    if (fails >= MAX_DISPATCH_FAILURES) {
      state.dispatchFailures.delete(session.id);
      try {
        await updateWorkSession({
          sessionId: session.id,
          status: 'blocked',
          blockedReason: `AI provider failing — ${msg.slice(0, 240)}`,
          progressNote: '[system] auto-blocked: repeated dispatch failures (provider down or out of credits)',
        });
      } catch { /* session may have been closed mid-cycle */ }
    }
    return; // never rethrow — one sick session must not kill the loop
  }

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
