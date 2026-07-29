/**
 * WP12 — time-skip (spec §6, Ruling 15). Exercised once per Phase-1 exit.
 *
 * Mike (as Godhead) frames a skipped stretch ("a week passes"); she states
 * what she tried to do about her top vine (the existing vine_tick coarse
 * Spirit-lite call, WP9 ensemble.ts's `vineTickHandler` — no new call shape,
 * reused as-is); the World Adjudicator resolves it (adjudicator.ts's
 * `resolveIntent`, same JSON contract every other 'Do:' path uses); the
 * result is delivered back through `adjudication_result` exactly like a
 * live 'Do:' outcome, which is what stamps it as a lived memory (Body inward
 * sensation + a possible cascade wake, per ensemble.ts's salience gate). A
 * dream tick may optionally thicken it afterward (dream.ts's
 * runDreamConsolidation, re-exported by scheduler.ts).
 *
 * Side-effect import of ./ensemble is required for the same reason
 * conversation.ts needs it: nothing else in the production import graph
 * registers the real vine_tick/adjudication_result handlers over the WP3
 * stubs.
 */
import 'server-only';
import '@/daya/ensemble';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { isWatcherOrAbove } from '@/lib/permissions';
import { currentCycleOf } from '@/services/history';
import { wake, isDayaEnabled } from './events';
import { resolveIntent, type AdjudicationResult } from './adjudicator';
import { runDreamConsolidation } from './scheduler';
import { DayaTierUnavailableError, type DayaClientOverrides } from './model-client';

export type TimeSkipStatus = 'ok' | 'disabled' | 'dormant' | 'no_active_vine' | 'core_offline';

export interface TimeSkipResult {
  status: TimeSkipStatus;
  statedIntent?: string;
  adjudication?: AdjudicationResult;
  dreamed?: boolean;
  detail?: string;
}

/**
 * Runs one time-skip pass for a wrapped, ACTIVE entity with at least one
 * ACTIVE goal. `alsoDream` runs a dream-tick consolidation pass afterward
 * (spec: "a dream tick may thicken it") — off by default since it's an
 * optional thickening step, not part of the core skip.
 */
export async function runTimeSkip(
  characterId: string,
  actorRole: string,
  overrides: DayaClientOverrides = {},
  alsoDream = false,
): Promise<TimeSkipResult> {
  if (!isWatcherOrAbove(actorRole)) {
    throw new ForbiddenError('GM/ADMIN only — time-skip is a Godhead-framed Watcher-console-and-above action');
  }

  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { id: true, campaignId: true },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!character.campaignId) throw new NotFoundError('Character has no campaign — cannot adjudicate a time-skip');

  if (!isDayaEnabled()) return { status: 'disabled' };

  const entity = await prisma.dayaEntity.findUnique({ where: { characterId } });
  if (!entity || entity.status !== 'ACTIVE') return { status: 'dormant' };

  try {
    const vineResult = await wake({ kind: 'vine_tick', entityId: characterId }, overrides);
    if (!vineResult.ran || vineResult.action?.kind !== 'vine_summary' || !vineResult.action.content) {
      return { status: 'no_active_vine' };
    }
    const statedIntent = vineResult.action.content;

    const cycle = await currentCycleOf(character.campaignId);
    const adjudication = await resolveIntent(
      { campaignId: character.campaignId, entityCharacterId: characterId, intent: statedIntent, cycle },
      overrides,
    );

    // Delivering the outcome as an adjudication_result is what stamps it as
    // a lived memory (Body inward sensation, possible spirit cascade) — the
    // exact same path a live 'Do:' outcome takes (ensemble.ts §"adjudication_
    // result pipeline").
    await wake(
      { kind: 'adjudication_result', entityId: characterId, payload: adjudication as unknown as Record<string, unknown> },
      overrides,
    );

    let dreamed = false;
    if (alsoDream) {
      await runDreamConsolidation(characterId, overrides);
      dreamed = true;
    }

    return { status: 'ok', statedIntent, adjudication, dreamed };
  } catch (err) {
    if (err instanceof DayaTierUnavailableError) {
      return { status: 'core_offline', detail: err.message };
    }
    throw err;
  }
}
