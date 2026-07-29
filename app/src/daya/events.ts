/**
 * DAYA event bus — wake-on-trigger lifecycle for the persona harness beneath
 * AI-controlled character sheets.
 *
 * An entity is a persistent state store plus processes that wake on
 * triggers — there is no idle loop, no polling agent, no background thread.
 * wake() is the single entry point; every trigger kind gets a registered
 * handler that runs to completion and returns control. Nothing runs between
 * events.
 *
 * Follows the services/godhead-dispatcher.ts convention: gated on an env
 * flag, audit-first when disabled. Unlike that dispatcher's module-load
 * cached flag, isDayaEnabled() re-reads process.env on every call so tests
 * can toggle DAYA_ENABLED in-process without re-importing the module.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { currentCycleOf } from '@/services/history';
import { ingestStimulus } from './memory';
import type { DayaClientOverrides } from './model-client';

// ── Trigger taxonomy ─────────────────────────────────────────────────────

/**
 * `entityId` on every trigger identifies the entity by its Character id
 * (characterId) — the same handle used by services/daya-affect.ts — not a
 * pre-existing DayaEntity.id. This is what lets stimulus/gm_intervention
 * create the DayaEntity on first contact (create-if-missing, same pattern
 * as daya-affect's ensureDayaEntity).
 */
export type DayaTrigger =
  | { kind: 'stimulus'; entityId: string; source: string; content: string }
  | { kind: 'dream_tick'; entityId: string }
  | { kind: 'adjudication_result'; entityId: string; payload: Record<string, unknown> }
  | { kind: 'vine_tick'; entityId: string }
  | { kind: 'gm_intervention'; entityId: string; content: string };

export type DayaTriggerKind = DayaTrigger['kind'];

export function isDayaEnabled(): boolean {
  return typeof process !== 'undefined' && process.env.DAYA_ENABLED === 'enabled';
}

// ── Handler registry ─────────────────────────────────────────────────────

export interface HandlerResult {
  memoryEntryId?: string;
  /** What the entity actually did, when a handler resolved one (WP9
   * ensemble) — optional so WP1-WP7 handlers that never set it stay valid.
   * `content` carries plain-language detail specific to `kind` (spoken
   * words, a physical intent, an attended subject, or a held/flagged
   * gm_intervention phrase); absent for `rest`. */
  action?: { kind: string; content?: string };
}

/**
 * `overrides` (DayaClientOverrides) is optional and threaded through for
 * testability only — it lets a test drive a handler with mocked model
 * transports without wake() reaching a real network. Production callers
 * omit it. Handlers that don't need it (e.g. dream_tick's v0 stub) satisfy
 * this type unchanged — TypeScript allows a function taking fewer
 * parameters to stand in for one that takes more (optional) parameters.
 */
export type DayaTriggerHandler = (
  trigger: DayaTrigger,
  overrides?: DayaClientOverrides,
) => Promise<HandlerResult | void>;

const HANDLERS: Partial<Record<DayaTriggerKind, DayaTriggerHandler>> = {};

/**
 * Register a handler for a trigger kind. Later registrations overwrite
 * earlier ones — modules (e.g. scheduler.ts for 'dream_tick') self-register
 * on import, mirroring the static-table style of the godhead dispatcher's
 * ROUTING_TABLE without hardcoding cross-module imports here.
 */
export function registerHandler(kind: DayaTriggerKind, handler: DayaTriggerHandler): void {
  HANDLERS[kind] = handler;
}

// ── Shared helpers ───────────────────────────────────────────────────────

/** Create-if-missing DayaEntity for a character (mirrors daya-affect.ts). */
async function ensureDayaEntity(
  characterId: string,
): Promise<{ id: string; campaignId: string | null }> {
  const entity = await prisma.dayaEntity.upsert({
    where: { characterId },
    create: { characterId },
    update: {},
    select: { id: true, character: { select: { campaignId: true } } },
  });
  return { id: entity.id, campaignId: entity.character.campaignId };
}

// ── Default handlers: stimulus + gm_intervention ────────────────────────
// Tags via the meta-memory tagger (src/daya/memory.ts) and applies the OOC
// residency check: OOC content is processed but never persisted.

async function ingestHandler(
  trigger: Extract<DayaTrigger, { kind: 'stimulus' | 'gm_intervention' }>,
  overrides: DayaClientOverrides = {},
): Promise<HandlerResult> {
  const { id: daId, campaignId } = await ensureDayaEntity(trigger.entityId);
  const cycle = campaignId ? await currentCycleOf(campaignId) : 0;
  const source = trigger.kind === 'gm_intervention' ? 'gm_intervention' : trigger.source;

  const result = await ingestStimulus(
    {
      entityId: daId,
      cycle,
      source,
      content: trigger.content,
    },
    overrides,
  );

  if (!result.persisted) {
    console.log(`[daya/events] ${trigger.kind} classified OOC — not persisted for entity ${daId}`);
    return {};
  }

  console.log(`[daya/events] ${trigger.kind} ingested for entity ${daId} (memory ${result.memoryEntryId})`);
  return { memoryEntryId: result.memoryEntryId };
}

// v0 stubs — src/daya/ensemble.ts (WP9) registers its own handlers for
// 'stimulus', 'gm_intervention', 'adjudication_result', and 'vine_tick' at
// import time, which overwrite these (later registration wins — see
// registerHandler's docstring). These remain as the safe fallback for any
// caller that imports events.ts without importing ensemble.ts.
registerHandler('stimulus', (t, overrides) =>
  ingestHandler(t as Extract<DayaTrigger, { kind: 'stimulus' }>, overrides),
);
registerHandler('gm_intervention', (t, overrides) =>
  ingestHandler(t as Extract<DayaTrigger, { kind: 'gm_intervention' }>, overrides),
);

// adjudication_result and vine_tick are log-only stubs in WP3 — their real
// ingestion belongs to the systems that produce them (WP7 World Adjudicator,
// WP9 ensemble / WP8 mechanics integration).
registerHandler('adjudication_result', async (trigger) => {
  if (trigger.kind !== 'adjudication_result') return;
  console.log(`[daya/events] adjudication_result stub — entity ${trigger.entityId}`, trigger.payload);
});
registerHandler('vine_tick', async (trigger) => {
  if (trigger.kind !== 'vine_tick') return;
  console.log(`[daya/events] vine_tick stub — entity ${trigger.entityId}`);
});

// ── Disabled-state audit ─────────────────────────────────────────────────

/**
 * PENDING-audit stopgap for when DAYA_ENABLED is off. The godhead dispatcher
 * mirrors this with a persisted GodHeadInvocation(status: PENDING) row —
 * there is no DAYA-equivalent audit table yet (none of the WP1/WP3 schema
 * covers a generic pending-trigger log), and this WP may not touch
 * prisma/schema.prisma. Conservative choice: log-only, synthetic id, no
 * DB write. NEEDS-FABLE: a DayaEventLog (or similar) table for a real
 * persisted PENDING-audit trail, analogous to GodHeadInvocation.
 */
function writePendingAudit(trigger: DayaTrigger): string {
  const auditId = `pending-${trigger.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.log(`[daya/events] DAYA_ENABLED is off — trigger audited, not run: ${auditId}`, {
    kind: trigger.kind,
    entityId: trigger.entityId,
  });
  return auditId;
}

// ── Public API ────────────────────────────────────────────────────────────

export interface WakeResult {
  trigger: DayaTriggerKind;
  ran: boolean; // true if a handler actually executed (vs. audit-only)
  auditId?: string; // set when DAYA is disabled — see writePendingAudit
  memoryEntryId?: string; // id of the DayaMemoryEntry written, if any
  action?: HandlerResult['action']; // what the entity did, when the handler resolved one
}

/**
 * Entry point for every trigger. When DAYA_ENABLED !== 'enabled', wake()
 * writes a PENDING audit trail and returns without running any handler —
 * the safe default in dev/test, mirroring GODHEAD_DISPATCHER's gate.
 *
 * `overrides` (DayaClientOverrides) is optional and exists solely so tests
 * can drive a full wake with mocked model transports; production callers
 * omit it and the registered handler's real chat()/routeAndChat() calls run
 * against the configured tiers.
 */
export async function wake(trigger: DayaTrigger, overrides?: DayaClientOverrides): Promise<WakeResult> {
  if (!isDayaEnabled()) {
    const auditId = writePendingAudit(trigger);
    return { trigger: trigger.kind, ran: false, auditId };
  }

  const handler = HANDLERS[trigger.kind];
  if (!handler) {
    console.warn(`[daya/events] no handler registered for trigger kind "${trigger.kind}"`);
    return { trigger: trigger.kind, ran: false };
  }

  const result = await handler(trigger, overrides);
  return { trigger: trigger.kind, ran: true, memoryEntryId: result?.memoryEntryId, action: result?.action };
}

/**
 * Convenience wrapper for delivering a stimulus — used by the session loop
 * once it exists; for now scripts drive it directly.
 */
export function deliverStimulus(
  entityId: string,
  source: string,
  content: string,
  overrides?: DayaClientOverrides,
): Promise<WakeResult> {
  return wake({ kind: 'stimulus', entityId, source, content }, overrides);
}
