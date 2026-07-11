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
  | 'blueprint.published'        // T31: a blueprint entered the catalog
  | 'blueprint.unused_for_90d'   // Lady Death decay candidate
  // Character lifecycle
  | 'character.locked'           // Player locked their character; crystallization fired
  | 'character.crystallized'     // T31: wizard crossing completed — GM investment debited, sheet live
  | 'character.died'             // Frequency=0 in combat or Fated Age expired
  | 'death_save.resolved'        // T27: a Facing Death roll resolved (survive/fail/spared) — Tara's fiction beat + Thorn authorship
  | 'entity.retired'             // T31: reserved — emission point lands with T30's retire flow
  // Contracts (T13/T31)
  | 'contract.violated'          // A Terminal contract flipped to VIOLATED — Triu's verification duty
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
  // Abandonment: the custodian godhead (the one who invested Opportunities
  // into this goal) reacts contextually — see services/goal.ts abandonGoal
  // for the policy. If the goal had no custodian assigned, Eth'erling triages
  // and may delegate to Lady Death for the narrative weight.
  'goal.abandoned': ['Eth\'erling'],

  // Blueprint chain: Kai prices, Eth'erling synthesizes.
  // NOTE: routing keys are GodHead.name DB values. Lady Death's row is named
  // 'Tara Almswood' (same entity, two names — canon). The old 'Lady Death'
  // key silently skipped EVERY death event (T27 e2e caught it 2026-07-11).
  'blueprint.submitted': ['Kai'],
  'blueprint.priced': ['Kai'],
  'blueprint.evaluated': ['Eth\'erling'],
  'blueprint.published': ['Kai'],   // catalog growth is Kai's domain (tentative duty)
  'blueprint.unused_for_90d': ['Tara Almswood'],

  // Death routes to Lady Death (Tara) first; her process_death tool handles
  // the ledger split and Spirit Package composition.
  'character.locked': [],   // Currently a no-op route — reserved for future welcome ritual.
  'character.crystallized': [], // Reserved — a welcome beat may land here later.
  'entity.retired': ['Tara Almswood'], // Retirement is a soft ending — her domain. Emission lands with T30.
  'contract.violated': ['Selva'], // TRINITY (Trayman/Selva/Triu) — Triu verifies contracts (ruling 2026-07-10 #2).
  'character.died': ['Tara Almswood'],
  // T27: every resolved death save is Tara's beat — survivals she may Thorn,
  // fated-age fails she authors the escalating age-Thorn for, spares she narrates.
  'death_save.resolved': ['Tara Almswood'],

  // Session events broadcast to all three godheads so they can refresh
  // their working memory at session boundaries.
  'session.started': ['Kai', 'Tara Almswood', 'Eth\'erling'],
  'session.ended': ['Kai', 'Tara Almswood', 'Eth\'erling'],

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
        const run = await agent.invoke(event, payload);
        // The agent tracks its own invocation row; close our dispatch row
        // so it doesn't linger RUNNING forever (T32 diag found phantoms).
        await prisma.godHeadInvocation.update({
          where: { id: inv.id },
          data: {
            status: 'DONE',
            result: `dispatched — agent invocation ${run.invocationId} (${run.status})`,
            finishedAt: new Date(),
          },
        }).catch(() => { /* swallow */ });
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
