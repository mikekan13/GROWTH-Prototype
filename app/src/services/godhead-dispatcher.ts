/**
 * GodHead Dispatcher — Event Bus for Godhead Invocations
 *
 * Services emit named events here (e.g. goal.completed). The dispatcher
 * consults a routing table to decide which godhead(s) should respond, then
 * invokes the agent runtime asynchronously. Each routing decision creates
 * a GodHeadInvocation row so the work is tracked and recoverable.
 *
 * Design rules:
 * - emit() is fire-and-forget from the caller's perspective. Services should
 *   never await dispatcher work in their happy path — the dispatcher runs
 *   the agent loop in the background and any failure surfaces in the
 *   GodHeadInvocation log, not as a thrown error from the calling service.
 * - The routing table maps event name → ordered list of godhead names. If a
 *   godhead is not registered (e.g. fresh DB) we silently skip that route.
 * - The dispatcher does NOT run during tests by default — set
 *   `GODHEAD_DISPATCHER=enabled` in env to enable. Without that env, emit()
 *   becomes a no-op so unit tests don't burn Claude tokens by accident.
 */

import 'server-only';
import { prisma } from '@/lib/db';
import { GodHeadAgent } from '@/godhead/agent';

// ── Event taxonomy ────────────────────────────────────────────────────────

export type GodHeadEvent =
  // Goal lifecycle
  | 'goal.created'
  | 'goal.completed'
  | 'goal.failed'
  | 'goal.abandoned'
  // Blueprint authoring chain
  | 'blueprint.submitted'        // Player submitted a request; Creator picks it up
  | 'blueprint.priced'           // Creator finished pricing; hand off to Kai
  | 'blueprint.evaluated'        // Kai finished evaluating; hand off to Et'herling
  | 'blueprint.unused_for_90d'   // Lady Death decay candidate
  // Character lifecycle
  | 'character.locked'           // Player locked their character; crystallization fired
  | 'character.died'             // Frequency=0 in combat or Fated Age expired
  // Session / play
  | 'session.started'
  | 'session.ended'
  // Generic GM ask
  | 'gm.request';

/**
 * Routing table — event → ordered list of godhead names (by `name` field).
 * Each event can hit multiple godheads in series. Et'herling-orchestrated
 * events list only Et'herling here; the route_to_godhead tool then fans
 * out internally.
 */
const ROUTING_TABLE: Record<GodHeadEvent, ReadonlyArray<string>> = {
  // Eth'erling is the entry point for goal events — she routes to Kai for
  // mechanical pricing and to custodians for narrative bestowal.
  'goal.created': ['Eth\'erling'],
  'goal.completed': ['Eth\'erling'],
  'goal.failed': ['Eth\'erling'],
  'goal.abandoned': ['Lady Death'],

  // Blueprint chain: Kai prices, Eth'erling synthesizes.
  'blueprint.submitted': ['Kai'],
  'blueprint.priced': ['Kai'],
  'blueprint.evaluated': ['Eth\'erling'],
  'blueprint.unused_for_90d': ['Lady Death'],

  // Death routes to Lady Death first; her process_death tool handles the
  // ledger split and Spirit Package composition.
  'character.locked': [],   // Currently a no-op route — reserved for future welcome ritual.
  'character.died': ['Lady Death'],

  // Session events broadcast to all three godheads so they can refresh
  // their working memory at session boundaries.
  'session.started': ['Kai', 'Lady Death', 'Eth\'erling'],
  'session.ended': ['Kai', 'Lady Death', 'Eth\'erling'],

  // Direct GM ask — Eth'erling triages.
  'gm.request': ['Eth\'erling'],
};

const DISPATCHER_ENABLED =
  typeof process !== 'undefined' && process.env.GODHEAD_DISPATCHER === 'enabled';

// ── Public API ────────────────────────────────────────────────────────────

export interface EmitResult {
  event: GodHeadEvent;
  enqueued: number;   // How many godheads were dispatched
  skipped: string[];  // Names looked up but not found in DB
  invocationIds: string[];
}

/**
 * Emit an event into the dispatcher. Returns a promise that resolves when
 * the invocations have been QUEUED — not when the agent loops finish. The
 * caller should not await downstream side effects.
 *
 * If GODHEAD_DISPATCHER is not 'enabled' in env, emit logs to the audit
 * trail (a GodHeadInvocation in PENDING status) but does NOT run the
 * agent loop. This is the safe default in dev/test.
 */
export async function emit(
  event: GodHeadEvent,
  payload: Record<string, unknown>,
): Promise<EmitResult> {
  const route = ROUTING_TABLE[event] ?? [];
  const result: EmitResult = { event, enqueued: 0, skipped: [], invocationIds: [] };

  for (const godheadName of route) {
    const godhead = await prisma.godHead.findUnique({ where: { name: godheadName } });
    if (!godhead) {
      result.skipped.push(godheadName);
      continue;
    }

    if (!DISPATCHER_ENABLED) {
      // Tracked but not run. Useful for replaying later or for dev visibility.
      const inv = await prisma.godHeadInvocation.create({
        data: {
          godHeadId: godhead.id,
          triggerType: event,
          triggerData: JSON.stringify(payload),
          status: 'PENDING',
          startedAt: new Date(),
        },
      });
      result.invocationIds.push(inv.id);
      result.enqueued += 1;
      continue;
    }

    // Fire-and-forget the agent loop. We don't await — the agent writes
    // its own invocation row, but we still need to surface the id, so we
    // pre-create a PENDING row and pass it through.
    const inv = await prisma.godHeadInvocation.create({
      data: {
        godHeadId: godhead.id,
        triggerType: event,
        triggerData: JSON.stringify(payload),
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });
    result.invocationIds.push(inv.id);
    result.enqueued += 1;

    // Run the agent loop in the background. We swallow errors here since
    // the agent itself records FAILED in the invocation row.
    void (async () => {
      try {
        const agent = await GodHeadAgent.load(godheadName);
        await agent.invoke(event, payload);
      } catch (err) {
        await prisma.godHeadInvocation.update({
          where: { id: inv.id },
          data: {
            status: 'FAILED',
            error: err instanceof Error ? err.message : String(err),
            finishedAt: new Date(),
          },
        }).catch(() => { /* swallow */ });
      }
    })();
  }

  return result;
}

/**
 * Re-run a previously dispatched invocation that is still PENDING. Useful
 * for replaying queued events after enabling the dispatcher.
 */
export async function replayInvocation(invocationId: string) {
  if (!DISPATCHER_ENABLED) {
    throw new Error('Cannot replay: GODHEAD_DISPATCHER is not enabled');
  }
  const inv = await prisma.godHeadInvocation.findUnique({
    where: { id: invocationId },
    include: { godHead: true },
  });
  if (!inv) throw new Error(`Invocation not found: ${invocationId}`);
  if (inv.status !== 'PENDING') {
    throw new Error(`Invocation is not pending (status=${inv.status})`);
  }
  const agent = await GodHeadAgent.load(inv.godHead.name);
  const payload = JSON.parse(inv.triggerData) as Record<string, unknown>;
  return agent.invoke(inv.triggerType, payload);
}
