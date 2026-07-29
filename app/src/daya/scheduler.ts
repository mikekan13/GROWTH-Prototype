/**
 * DAYA dream-tick scheduler — wake-on-trigger cadence, not a running loop.
 *
 * Dream ticks are computed on demand: computeNextDreamTick derives the next
 * due timestamp for an entity from a base interval (env
 * DAYA_DREAM_INTERVAL_MS, default 6h) modulated by pool state. A drained
 * pool produces a LONGER interval — degraded cognition dreams less often,
 * not more — never a shorter one.
 *
 * runDueDreamTicks() is a manual sweep: call it from a script or the
 * /api/daya/tick admin route. There is no background daemon/cron process in
 * this Next.js dev context — something external (a route hit, a script run)
 * has to ask "what's due?" for anything to happen, same as every other
 * trigger in src/daya/events.ts.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { currentCycleOf } from '@/services/history';
import { wake, registerHandler, type DayaTrigger, type HandlerResult } from './events';
import type { GrowthCharacter } from '@/types/growth';

const DEFAULT_DREAM_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

export function baseDreamIntervalMs(): number {
  const raw = typeof process !== 'undefined' ? process.env.DAYA_DREAM_INTERVAL_MS : undefined;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DREAM_INTERVAL_MS;
}

/**
 * v0 modulation factor from Frequency pool state (plan Ruling 20: pool
 * damage degrades cognition — shallower/rarer dreams, not a shortcut to
 * more of them). 1x at a full pool, up to 2x (double the wait) at empty.
 * Pure function — no DB.
 */
export function dreamIntervalModulation(
  frequency: { current: number; level: number } | null,
): number {
  if (!frequency || frequency.level <= 0) return 1;
  const frac = Math.max(0, Math.min(1, frequency.current / frequency.level));
  return 1 + (1 - frac); // full pool -> 1x, drained pool -> 2x
}

/**
 * Pure math: next due timestamp = anchor (last dream, or the entity's
 * creation time if it has never dreamed) + base interval * modulation.
 * Decoupled from "now" so repeated calls don't keep pushing the due date
 * out — the anchor is fixed, only the interval added to it varies with
 * pool state at computation time.
 */
export function computeNextDreamTickFromState(
  anchor: Date,
  frequency: { current: number; level: number } | null,
): Date {
  const intervalMs = baseDreamIntervalMs() * dreamIntervalModulation(frequency);
  return new Date(anchor.getTime() + intervalMs);
}

function safeParseSheet(data: string | null | undefined): Partial<GrowthCharacter> | null {
  if (!data) return null;
  try {
    return JSON.parse(data) as Partial<GrowthCharacter>;
  } catch {
    return null;
  }
}

/**
 * Next due dream tick for a character's DayaEntity. Reads Frequency
 * current/level straight off the character sheet JSON for the v0
 * modulation factor (real cognition-tier coupling is WP8's concern).
 * Throws NotFoundError-shaped if no DayaEntity exists yet — dreaming
 * requires an already-established entity, unlike stimulus/gm_intervention
 * which create one on contact.
 */
export async function computeNextDreamTick(characterId: string): Promise<Date> {
  const entity = await prisma.dayaEntity.findUnique({
    where: { characterId },
    select: { id: true, createdAt: true, character: { select: { data: true } } },
  });
  if (!entity) {
    throw new Error(`No DayaEntity for character ${characterId} — dream ticks require an established entity`);
  }

  const lastDream = await prisma.dayaMemoryEntry.findFirst({
    where: { entityId: entity.id, source: 'dream' },
    orderBy: { realTime: 'desc' },
    select: { realTime: true },
  });

  const sheet = safeParseSheet(entity.character.data);
  const frequency = sheet?.attributes?.frequency ?? null;
  const anchor = lastDream?.realTime ?? entity.createdAt;
  return computeNextDreamTickFromState(anchor, frequency);
}

// ── Dream tick handler (v0 stub — WP10 replaces) ────────────────────────

/**
 * v0 stub — WP10 replaces. Real dream consolidation (clustering memories
 * into hierarchy links, re-tagging, memories-of-memories, rumination
 * dynamics) lands with the Dream Ticks work package.
 */
export async function runDreamConsolidation(entityId: string): Promise<void> {
  void entityId;
}

async function dreamTickHandler(trigger: DayaTrigger): Promise<HandlerResult> {
  if (trigger.kind !== 'dream_tick') {
    throw new Error(`dreamTickHandler received wrong trigger kind: ${trigger.kind}`);
  }

  const entity = await prisma.dayaEntity.upsert({
    where: { characterId: trigger.entityId },
    create: { characterId: trigger.entityId },
    update: {},
    select: { id: true, character: { select: { campaignId: true } } },
  });
  const cycle = entity.character.campaignId ? await currentCycleOf(entity.character.campaignId) : 0;

  const row = await prisma.dayaMemoryEntry.create({
    data: {
      entityId: entity.id,
      narrativeCycle: cycle,
      source: 'dream',
      content: 'A dream tick ran.', // v0 marker — WP10 replaces with real consolidation narrative
      classification: JSON.stringify({ provisional: true, kind: 'tick_marker' }),
    },
  });

  await runDreamConsolidation(trigger.entityId); // v0 stub — WP10 replaces

  console.log(`[daya/scheduler] dream_tick fired for entity ${entity.id} (memory ${row.id})`);
  return { memoryEntryId: row.id };
}

registerHandler('dream_tick', dreamTickHandler);

// ── Sweep ─────────────────────────────────────────────────────────────────

export interface DreamTickSweepResult {
  fired: string[]; // characterIds that fired
  skipped: string[]; // characterIds not yet due
}

/**
 * Manual sweep across every existing DayaEntity: fires wake({kind:
 * 'dream_tick'}) for entities whose next-due timestamp has passed. Does not
 * create new DayaEntity rows — only already-established entities dream.
 */
export async function runDueDreamTicks(now: Date = new Date()): Promise<DreamTickSweepResult> {
  const entities = await prisma.dayaEntity.findMany({ select: { characterId: true } });
  const fired: string[] = [];
  const skipped: string[] = [];

  for (const e of entities) {
    const nextDue = await computeNextDreamTick(e.characterId);
    if (nextDue <= now) {
      await wake({ kind: 'dream_tick', entityId: e.characterId });
      fired.push(e.characterId);
    } else {
      skipped.push(e.characterId);
    }
  }

  return { fired, skipped };
}
