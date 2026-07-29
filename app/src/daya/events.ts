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
}

export type DayaTriggerHandler = (trigger: DayaTrigger) => Promise<HandlerResult | void>;

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

// ── v0 tagging stub (WP4 Tagger replaces) ───────────────────────────────

/**
 * v0 stub — WP4 Tagger replaces. Assigns provisional zeroed valence/arousal/
 * salience so ingest rows aren't left with meaningless nulls; the real
 * Tagger reads stimulus content plus the entity's stats and produces
 * stat-informed values (recall gating depends on this later).
 */
export function tagStimulus(entry: { content: string }): {
  valence: number;
  arousal: number;
  salience: number;
} {
  void entry;
  return { valence: 0, arousal: 0, salience: 0 };
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
// Phase 1 stub: log + write a DayaMemoryEntry ingest row. Real tagging
// (valence/salience/classification) arrives with WP4's Tagger — see
// tagStimulus() above.

async function ingestHandler(
  trigger: Extract<DayaTrigger, { kind: 'stimulus' | 'gm_intervention' }>,
): Promise<HandlerResult> {
  const { id: daId, campaignId } = await ensureDayaEntity(trigger.entityId);
  const cycle = campaignId ? await currentCycleOf(campaignId) : 0;
  const tags = tagStimulus({ content: trigger.content });
  const source = trigger.kind === 'gm_intervention' ? 'gm_intervention' : trigger.source;

  const row = await prisma.dayaMemoryEntry.create({
    data: {
      entityId: daId,
      narrativeCycle: cycle,
      source,
      content: trigger.content,
      valence: tags.valence,
      arousal: tags.arousal,
      salience: tags.salience,
      classification: JSON.stringify({ provisional: true }), // v0 — WP4 Tagger replaces
    },
  });

  console.log(`[daya/events] ${trigger.kind} ingested for entity ${daId} (memory ${row.id})`);
  return { memoryEntryId: row.id };
}

registerHandler('stimulus', (t) => ingestHandler(t as Extract<DayaTrigger, { kind: 'stimulus' }>));
registerHandler('gm_intervention', (t) =>
  ingestHandler(t as Extract<DayaTrigger, { kind: 'gm_intervention' }>),
);

// adjudication_result and vine_tick are log-only stubs in WP3 — their real
// ingestion belongs to the systems that produce them (WP7 World Adjudicator,
// WP8 mechanics integration / vine progress).
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
}

/**
 * Entry point for every trigger. When DAYA_ENABLED !== 'enabled', wake()
 * writes a PENDING audit trail and returns without running any handler —
 * the safe default in dev/test, mirroring GODHEAD_DISPATCHER's gate.
 */
export async function wake(trigger: DayaTrigger): Promise<WakeResult> {
  if (!isDayaEnabled()) {
    const auditId = writePendingAudit(trigger);
    return { trigger: trigger.kind, ran: false, auditId };
  }

  const handler = HANDLERS[trigger.kind];
  if (!handler) {
    console.warn(`[daya/events] no handler registered for trigger kind "${trigger.kind}"`);
    return { trigger: trigger.kind, ran: false };
  }

  const result = await handler(trigger);
  return { trigger: trigger.kind, ran: true, memoryEntryId: result?.memoryEntryId };
}

/**
 * Convenience wrapper for delivering a stimulus — used by the session loop
 * once it exists; for now scripts drive it directly.
 */
export function deliverStimulus(
  entityId: string,
  source: string,
  content: string,
): Promise<WakeResult> {
  return wake({ kind: 'stimulus', entityId, source, content });
}
