/**
 * WP12 — the 1:1 conversation surface (spec §3).
 *
 * Thin: Mike's message enters as a `stimulus` trigger (events.ts's
 * deliverStimulus) -> the WP9 ensemble -> her Say:/Do:/Attend:/Rest renders
 * back. No new console — this is the plumbing a chat component calls.
 *
 * Side-effect import of ./ensemble is required here: events.ts's `wake()`
 * only runs whatever handler is currently registered for a trigger kind, and
 * nothing in the production import graph otherwise imports ensemble.ts (only
 * the WP9+ test scripts do, deliberately, to exercise the real pipeline) —
 * without this import, a production stimulus would silently fall through to
 * the WP3 ingest-only stub and never produce a spoken/acted response.
 */
import 'server-only';
import '@/daya/ensemble';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { isWatcherOrAbove } from '@/lib/permissions';
import { deliverStimulus, isDayaEnabled, type WakeResult } from './events';
import { DayaTierUnavailableError, DayaWarmingTimeoutError, type DayaClientOverrides } from './model-client';
import { warmL1, type L1Status, type L1WarmOverrides } from './l1-warm';

export type ConverseStatus = 'ok' | 'disabled' | 'dormant' | 'core_offline' | 'warming';

export interface ConverseResult {
  status: ConverseStatus;
  action?: WakeResult['action'];
  memoryEntryId?: string;
  /** Human-readable detail for the 'core_offline'/'warming' states — never
   * surfaced as a raw error, just a plain note about what's going on. */
  detail?: string;
}

/**
 * Sends one message to a wrapped, ACTIVE DAYA entity and returns what she
 * did. Degrades gracefully (spec §5): DAYA_ENABLED off -> 'disabled';
 * entity missing/not ACTIVE -> 'dormant'; L1 endpoint unreachable/unset ->
 * 'core_offline'; L1 reachable but slow/cold (WP14, our own request
 * timeout firing rather than a connection failure — a serverless worker
 * spinning up from zero) -> 'warming' (never a raw thrown error, never
 * rerouted to cloud tier C — the router already fails locally, this just
 * surfaces the state).
 */
export async function converseWithEntity(
  characterId: string,
  actorRole: string,
  message: string,
  overrides: DayaClientOverrides = {},
): Promise<ConverseResult> {
  if (!isWatcherOrAbove(actorRole)) {
    throw new ForbiddenError('GM/ADMIN only — the persona-harness conversation surface is Watcher-console-and-above');
  }

  const character = await prisma.character.findUnique({ where: { id: characterId }, select: { id: true } });
  if (!character) throw new NotFoundError('Character not found');

  if (!isDayaEnabled()) {
    return { status: 'disabled' };
  }

  const entity = await prisma.dayaEntity.findUnique({ where: { characterId } });
  if (!entity || entity.status !== 'ACTIVE') {
    return { status: 'dormant' };
  }

  try {
    const result = await deliverStimulus(characterId, 'dialogue', message, overrides);
    return { status: 'ok', action: result.action, memoryEntryId: result.memoryEntryId };
  } catch (err) {
    // Order matters: DayaWarmingTimeoutError extends AppError, not
    // DayaTierUnavailableError, so this must be checked first — a cold
    // start is "still reachable, just not answered yet," never
    // 'core_offline'.
    if (err instanceof DayaWarmingTimeoutError) {
      return { status: 'warming', detail: err.message };
    }
    if (err instanceof DayaTierUnavailableError) {
      return { status: 'core_offline', detail: err.message };
    }
    throw err;
  }
}

/**
 * WP14 — GM/ADMIN-gated wrapper around l1-warm.ts's warmL1(), for the
 * "call this the moment the persona canvas mounts" trigger. Separate from
 * converseWithEntity because warming the L1 core is infrastructure, not a
 * per-entity action — it needs no characterId, just the caller's role.
 */
export async function warmEntityCore(actorRole: string, overrides: L1WarmOverrides = {}): Promise<{ status: L1Status }> {
  if (!isWatcherOrAbove(actorRole)) {
    throw new ForbiddenError('GM/ADMIN only — the persona-harness conversation surface is Watcher-console-and-above');
  }
  const status = await warmL1(overrides);
  return { status };
}
