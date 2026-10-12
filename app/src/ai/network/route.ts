/**
 * ai/network/route — pick the lane, enforce the wall.
 *
 * THE RULING (Mike 2026-10-12): cloud models (Claude) are the Soul pillar —
 * heavy reasoning. The local model is the Spirit pillar — the live table and
 * the GATEKEEPER. Every task declares a ContentClass:
 *   fiction → the requested lane; a cloud lane gets the text only after
 *             enforceWall (identifier strip) and toneFilter (local tone-down).
 *   table   → the local lane, or WallViolationError. Never cloud.
 *   real    → the local lane, or WallViolationError. Never cloud.
 *
 * route() turns a TaskDescriptor into a ResolvedLane using three signals:
 *   (a) content class — table/real never cross (above);
 *   (b) content maturity flags — flagged generation prefers the local lane
 *       when it is live;
 *   (c) task weight — the caller's requested lane.
 *
 * enforceWall() is the identifier seam (INV-119: no real names/emails/
 * account identifiers in cloud prompts). prepareCloudText() is what a
 * fiction payload passes on its way to a cloud lane.
 */

import 'server-only';
import { assertClean, stripAndForward } from '@/daya/sanitize';
import { resolveLane, localLane } from './config';
import { toneFilterAsync } from './tone-filter';
import { WallViolationError } from './errors';
import { assertNoTableContent, type RowLike } from './table-guard';
import { mayCrossWall, type ResolvedLane, type TaskDescriptor } from './types';

export { WallViolationError };

/** Resolve the lane for a task. Never silently downgrades the wall: table or
 *  real content with no live local lane throws rather than leaking. When the
 *  caller hands over its prompt (`payload`) and the lane is cloud, the payload
 *  must carry no table/real content (assertNoTableContent) or this throws. */
export function route(task: TaskDescriptor, payload?: Array<string | RowLike | null | undefined>): ResolvedLane {
  const lane = pickLane(task);
  if (lane.crossesWall && payload?.length) assertNoTableContent(payload, task.caller);
  return lane;
}

function pickLane(task: TaskDescriptor): ResolvedLane {
  const localLive = localLane() !== null;

  // (a) the content class overrides everything: table/real stay inside.
  if (!mayCrossWall(task.contentClass)) {
    if (!localLive) {
      throw new WallViolationError(
        `Task '${task.caller}' carries ${task.contentClass} content but the local lane is not configured — refusing to route to a cloud transport (fail-closed).`,
      );
    }
    return resolveLane('local');
  }

  // (b) mature-flagged generation prefers local latitude when available.
  if ((task.maturityFlags?.length ?? 0) > 0 && localLive) {
    return resolveLane('local');
  }

  // (c) the caller's requested lane.
  return resolveLane(task.lane);
}

/**
 * The identifier seam: strip identifiers, then hard-verify nothing survived.
 * Returns the cleaned text. Throws WallViolationError when the sweep still
 * finds an identifier — the caller must reroute local or abort, never send.
 */
export function enforceWall(text: string, identifiers: string[]): string {
  const { text: stripped } = stripAndForward(text, identifiers);
  const sweep = assertClean(stripped, identifiers);
  if (!sweep.clean) {
    throw new WallViolationError(
      `Sanitize sweep failed — identifiers survived stripping: ${sweep.hits.join(', ')}`,
      sweep.hits,
    );
  }
  return stripped;
}

/**
 * What one piece of a payload passes before it is sent on `lane`. Inside the
 * wall (local) it is returned unchanged. On a cloud lane: the task must be
 * fiction, then enforceWall, then the tone filter — AWAITED, so the first
 * send of a graphic passage crosses softened, never as the placeholder.
 */
export async function prepareCloudText(
  task: Pick<TaskDescriptor, 'caller' | 'contentClass' | 'campaignId'>,
  lane: ResolvedLane,
  text: string,
  identifiers: string[] = [],
): Promise<string> {
  if (!lane.crossesWall) return text;
  if (!mayCrossWall(task.contentClass)) {
    throw new WallViolationError(`Task '${task.caller}' tried to send ${task.contentClass} content on cloud lane '${lane.lane}'.`);
  }
  assertNoTableContent([text], task.caller);
  return toneFilterAsync(enforceWall(text, identifiers), { caller: task.caller, campaignId: task.campaignId });
}
