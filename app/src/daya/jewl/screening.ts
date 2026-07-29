/**
 * T15 tap — server-side in-flight screening stub (Addendum B3).
 *
 * The Jewel Doctrine: JEWL reads everything crossing the trusted boundary,
 * retains nothing on its own account. Phase 1 stands up the CHOKE POINT
 * (wired into `daya/sanitize.ts`'s `stripAndForward`, the single place every
 * outbound-bound payload already passes through) without building the real
 * behavior yet: `screen()` is a stateless pass-through — it inspects nothing
 * persistently, writes nothing, and always returns `{action: 'pass'}`.
 *
 * TODO (future, NOT Phase 1): pattern-flagging + GM routing off a verdict of
 * 'flag'/'restrict' is its own project-sized piece of work (the full JEWL
 * always-listening vision — see memory note jewl-full-vision). This stub
 * only reserves the seam so that work has exactly one call site to extend
 * rather than needing to thread a new parameter through every caller.
 */
import 'server-only';

export type ScreenAction = 'pass' | 'flag' | 'restrict';

export interface ScreenVerdict {
  action: ScreenAction;
  reasonTag?: string;
}

export interface ScreenContext {
  /** DayaEntity.id this chunk is on behalf of, if known. */
  entityId?: string;
  /** Which subsystem/call site is screening (audit-friendly, content-free). */
  subsystem?: string;
}

/**
 * Stateless full-stream screening choke point. Phase 1: always passes,
 * retains NOTHING — no DB write, no in-memory accumulation across calls.
 * `streamChunk` is accepted (not inspected) so the real implementation can
 * later read it without changing this function's call sites.
 */
export function screen(streamChunk: string, ctx: ScreenContext = {}): ScreenVerdict {
  void streamChunk;
  void ctx;
  return { action: 'pass' };
}
