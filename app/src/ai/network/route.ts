/**
 * ai/network/route — pick the lane, enforce the wall.
 *
 * route() turns a TaskDescriptor into a ResolvedLane using three signals
 * (design-intent doc, "build shape"):
 *   (a) content maturity flags — flagged generation prefers the local lane
 *       when it is live (privacy + latitude);
 *   (b) privacy class — 'sensitive' content may NOT cross the wall to a
 *       cloud transport; it routes local or the call fails closed;
 *   (c) task weight — the caller's requested lane (judgment/classify/grunt).
 *
 * enforceWall() is the structural seam: cloud-bound payloads that carry a
 * sensitivity classification must pass assertClean() (daya/sanitize) or the
 * dispatch is refused — a hard fail, never a soft warning. INV-119: no real
 * names/emails/account identifiers in cloud prompts.
 */

import 'server-only';
import { assertClean, stripAndForward } from '@/daya/sanitize';
import { resolveLane, localLane } from './config';
import type { ResolvedLane, TaskDescriptor } from './types';

export class WallViolationError extends Error {
  constructor(message: string, public readonly hits: string[] = []) {
    super(message);
    this.name = 'WallViolationError';
  }
}

/** Resolve the lane for a task. Never silently downgrades privacy: a
 *  sensitive task with no live local lane throws rather than leaking. */
export function route(task: TaskDescriptor): ResolvedLane {
  const localLive = localLane() !== null;

  // (b) privacy overrides everything: sensitive content stays inside the wall.
  if (task.privacy === 'sensitive') {
    if (!localLive) {
      throw new WallViolationError(
        `Task '${task.caller}' carries sensitive content but the local lane is not configured — refusing to route to a cloud transport (fail-closed).`,
      );
    }
    return resolveLane('local');
  }

  // (a) mature-flagged generation prefers local latitude when available.
  if ((task.maturityFlags?.length ?? 0) > 0 && localLive) {
    return resolveLane('local');
  }

  // (c) the caller's requested lane.
  return resolveLane(task.lane);
}

/**
 * The wall seam for cloud-bound consult payloads: strip identifiers, then
 * hard-verify nothing survived. Returns the cleaned text. Throws
 * WallViolationError when the sweep still finds an identifier — the caller
 * must reroute local or abort, never send.
 *
 * Dev-era note: JEWL's own judgment lane runs privacy 'trusted-dev' (Mike's
 * ruling — the boundary is player-sensitive DATA, not capability) and does
 * not pass through here. This seam is for consult-shaped payloads carrying
 * classified-sensitive content.
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
