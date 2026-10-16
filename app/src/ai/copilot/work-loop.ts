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
 * connection, or unconditionally when BACKGROUND — the GM answered the
 * spoken hand-off question (continueUnattended), or it is a character
 * genesis (background by default, perf pass 2026-10-12).
 *
 * Concurrency (2026-10-12): up to JEWL_WORK_CONCURRENCY (default 2) cycles
 * run at once, never two on one character; each session takes its own
 * breather between cycles. SQLite single-writer holds: every write is a
 * small transaction under the WAL + busy timeout (lib/db).
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
import { warnQuestionOutsideProd } from '@/lib/genesis-question';
import { isGateStage } from '@/lib/genesis-stages';
import { planWorkCycle, type CycleProd, type CycleCatalog, type CycleDrafting, type CompletionContext } from './work-cycle-text';
import { rejectedShapes } from '@/services/block-archetype';
import { prisma } from '@/lib/db';
import { pickSessionsToStart, workConcurrency } from './work-loop-schedule';
import { getGlobalCatalogSnapshot } from '@/services/forge';
import { isTransientProviderError } from '@/ai/network/retry';
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

/** A cycle that failed on provider weather (429 / 529 / overloaded, after the
 *  per-round backoff) pauses its session this long — never counted toward
 *  the auto-block. */
const TRANSIENT_COOLDOWN_MS = 30_000;

interface WorkLoopState {
  running: boolean;
  /** sessionId → consecutive cycles with zero tool calls. */
  stalls: Map<string, number>;
  /** sessionId → consecutive dispatch crashes. */
  dispatchFailures: Map<string, number>;
  /** sessionId → the cycle running now (concurrent, perf pass 2026-10-12). */
  inFlight: Map<string, Promise<void>>;
  /** sessionId → epoch ms before which it may not start (breather / transient pause). */
  cooldownUntil: Map<string, number>;
  /** Resolves the scheduler's current wait (a kick or a finished cycle). */
  wake?: () => void;
}

const g = globalThis as unknown as { __dayaWorkLoop?: WorkLoopState };
if (!g.__dayaWorkLoop) {
  g.__dayaWorkLoop = { running: false, stalls: new Map(), dispatchFailures: new Map(), inFlight: new Map(), cooldownUntil: new Map() };
}
// HMR-survivor state from before these fields existed.
g.__dayaWorkLoop.dispatchFailures ??= new Map();
g.__dayaWorkLoop.inFlight ??= new Map();
g.__dayaWorkLoop.cooldownUntil ??= new Map();
const state = g.__dayaWorkLoop!;

/** One shared dynamic import of the runtime — concurrent cycles await the
 *  same promise instead of racing their own module loads. */
let runtimeModule: Promise<typeof import('./runtime')> | undefined;
const loadRuntime = () => (runtimeModule ??= import('./runtime'));

/** Idempotent: starts the loop if it isn't running (or wakes it). Call from
 *  every entry point that can make a session runnable. */
export function kickWorkLoop(): void {
  if (state.running) {
    state.wake?.();
    return;
  }
  state.running = true;
  void runLoop();
}

/**
 * One scheduling pass: start every session that may run now, up to
 * JEWL_WORK_CONCURRENCY in flight (default 2). Background sessions
 * (continueUnattended, every genesis) run with no SSE connection open;
 * attended ones only while their campaign has one. Never two cycles on one
 * character. Exported for tests.
 */
export async function workLoopTick(now = Date.now()): Promise<{ started: string[]; waiting: number; nextWakeAt?: number; open: number }> {
  const sessions = await getActiveWorkSessions();
  const plan = pickSessionsToStart({
    sessions,
    inFlight: state.inFlight,
    cooldownUntil: state.cooldownUntil,
    now,
    concurrency: workConcurrency(),
    attended: campaignId => getConnectionCount(campaignId) > 0,
  });
  for (const s of plan.start) {
    const p = runCycle(s)
      .catch(err => {
        // eslint-disable-next-line no-console
        console.error(`[daya-work-loop] cycle crashed for ${s.id}:`, err);
      })
      .finally(() => {
        state.inFlight.delete(s.id);
        const until = state.cooldownUntil.get(s.id) ?? 0;
        state.cooldownUntil.set(s.id, Math.max(until, Date.now() + BREATHER_MS));
        state.wake?.();
      });
    state.inFlight.set(s.id, p);
  }
  return { started: plan.start.map(s => s.id), waiting: plan.waiting, nextWakeAt: plan.nextWakeAt, open: sessions.length };
}

async function runLoop(): Promise<void> {
  try {
    for (;;) {
      const tick = await workLoopTick();
      if (state.inFlight.size === 0 && tick.started.length === 0 && tick.nextWakeAt === undefined) {
        // Nothing open, or only attended sessions with nobody at the table:
        // the loop dies; the stream route / entry points kick it again.
        return;
      }
      // Sleep until a cycle finishes, a kick arrives, or a cooldown ends.
      const waitMs = tick.nextWakeAt !== undefined
        ? Math.max(50, tick.nextWakeAt - Date.now())
        : BREATHER_MS;
      await new Promise<void>(resolve => {
        const t = setTimeout(resolve, waitMs);
        state.wake = () => { clearTimeout(t); resolve(); };
      });
      state.wake = undefined;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[daya-work-loop] crashed:', err);
  } finally {
    state.running = false;
    state.wake = undefined;
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
  // Player gates (Mike 2026-10-16): APPEARANCE and PORTRAIT are not JEWL's to
  // do. The session waits on the person at the designer; no model call.
  if (isGenesisGoal(session.goal) && isGateStage(session.stage)) {
    const { holdOrPassGate } = await import('@/services/genesis-gates');
    await holdOrPassGate(session.id);
    return;
  }
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
  // Catalog-first only when there IS a catalog (perf pass 2026-10-12): a
  // genesis build cycle learns up front what stock exists; near-empty →
  // search_catalog is withheld and JEWL drafts directly.
  let catalog: CycleCatalog | null = null;
  let drafting: CycleDrafting | null = null;
  if (isGenesisGoal(session.goal) && session.stage !== 'PRODDING') {
    try {
      catalog = await getGlobalCatalogSnapshot();
    } catch { /* unknown catalog → the ordinary catalog-first cycle */ }
    // Blocks are campaign-agnostic archetypes (Mike 2026-10-12): the law,
    // this campaign's reusable blocks, and every shape already rejected.
    try {
      const blocks = await prisma.forgeItem.findMany({
        where: { campaignId: session.campaignId, status: { in: ['published', 'draft'] } },
        select: { type: true, name: true },
        orderBy: { updatedAt: 'desc' },
        take: 40,
      });
      drafting = { campaignBlocks: blocks, rejected: rejectedShapes(parseProgress(session.progress)) };
    } catch { drafting = { rejected: rejectedShapes(parseProgress(session.progress)) }; }
    try {
      const { loadPendingFeedback } = await import('@/services/genesis-redraft');
      drafting.feedback = await loadPendingFeedback(session.campaignId, session.id, jewl.characterUserId);
    } catch { /* feedback also rides in the progress notes */ }
  }
  // The WORLD stage (2026-10-16; was SEEDS / WORLD_FACTS) reads the GM's own
  // typed world messages (fiction by the wall) as its sources.
  let completion: CompletionContext | null = null;
  if (isGenesisGoal(session.goal) && session.stage === 'WORLD') {
    try {
      const { loadGmWorldMessages } = await import('@/services/genesis-stages');
      completion = { worldMessages: await loadGmWorldMessages(session.campaignId) };
    } catch { completion = null; }
  }
  const { text, allowedTools, excludedTools, stageTools } = planWorkCycle(session, prods, treasuryLine, recentNotes, catalog, drafting, completion);

  // Dynamic import: runtime imports the tools barrel, which includes the
  // work-session tools, which import this module — static would cycle.
  const { dispatchPrompt } = await loadRuntime();
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
      ...(excludedTools ? { excludedTools } : {}),
      ...(stageTools ? { stageTools } : {}),
      kind: genesis ? 'GENESIS' : 'WORK_CYCLE',
      ...(genesis ? { replyUsername: GENESIS_CHAT_USERNAME, toneRef: { table: 'DayaWorkSession', id: session.id } } : {}),
    });
    await flushSeedWithheld(seedWatch, session);
    state.dispatchFailures.delete(session.id);
    if (genesis) {
      // A question belongs in raise_prod, never in the report (2026-10-12).
      warnQuestionOutsideProd(session.id, response.message, `cycle ${session.cycleCount + 1}`);
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
    // Provider weather (429 / 529 / overloaded) survived the per-round
    // backoff: pause this session, never count it toward the auto-block.
    if (isTransientProviderError(err)) {
      state.cooldownUntil.set(session.id, Date.now() + TRANSIENT_COOLDOWN_MS);
      // eslint-disable-next-line no-console
      console.warn(`[daya-work-loop] transient provider error for ${session.id} — pausing ${TRANSIENT_COOLDOWN_MS / 1000}s: ${msg.slice(0, 160)}`);
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
