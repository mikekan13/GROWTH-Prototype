/**
 * Session-start warm-up progress (Mike 2026-10-26): where the pod's cold start is, as 0..1, from the lane JSON
 * (GET /api/campaigns/[id]/lane). Pure.
 *
 *   host     0.00 – 0.30   a host is being requisitioned, eased over time so the bar visibly moves
 *   loading  0.30 – 0.95   weights streaming; the worker's own uptime/expected is the honest clock when there is one,
 *                          otherwise eased over time in the phase; worker counts nudge it (ready worker → 0.95)
 *   ready    1.00
 *   disabled 1.00          no local core at all: straight to the in-session look
 *   offline  null          unknown — the bar holds where it is, the state is shown plainly
 */
export interface LaneLike {
  phase: 'ready' | 'host' | 'loading' | 'offline' | 'disabled';
  expectedColdStartSeconds?: number;
  endpoint?: { ready?: number; initializing?: number; running?: number; worker?: { uptimeSeconds?: number } };
}

export function laneTarget(lane: LaneLike | null, sincePhaseMs: number): number | null {
  if (!lane) return 0.02 + 0.08 * (1 - Math.exp(-Math.max(0, sincePhaseMs) / 20_000)); // no answer yet: a slow crawl so it is never dead
  switch (lane.phase) {
    case 'ready':
    case 'disabled':
      return 1;
    case 'offline':
      return null;
    case 'host': {
      const eased = 1 - Math.exp(-Math.max(0, sincePhaseMs) / 45_000);
      return 0.02 + 0.28 * eased;
    }
    case 'loading': {
      const expected = lane.expectedColdStartSeconds ?? 340;
      const uptime = lane.endpoint?.worker?.uptimeSeconds;
      let frac: number;
      if (uptime != null) frac = Math.min(1, uptime / expected);
      else frac = 1 - Math.exp(-Math.max(0, sincePhaseMs) / (expected * 1000 / 2.5));
      if ((lane.endpoint?.initializing ?? 0) > 0) frac = Math.max(frac, 0.05);
      if ((lane.endpoint?.ready ?? 0) > 0) frac = 1;
      return 0.3 + 0.65 * frac;
    }
  }
}

/** The "Pattern Stability" readout: left climbs −100 → 0, right falls +100 → 0 as progress goes 0 → 1. */
export function patternStability(progress: number): { left: number; right: number; remaining: number } {
  const p = Math.min(1, Math.max(0, progress));
  const n = Math.round(100 * (1 - p));
  return { left: n === 0 ? 0 : -n, right: n, remaining: 1 - p };
}

/**
 * The Pattern Stability bar: it shrinks from BOTH ENDS toward the centre as the numbers close — no swing, no bounce.
 * Percent of the track: `left` is where it starts, `width` how long it is; both 0-length at the centre when done.
 */
export function barSpan(progress: number): { left: number; width: number } {
  const p = Math.min(1, Math.max(0, progress));
  const width = (1 - p) * 100;
  return { left: (100 - width) / 2, width };
}

/** One smoothing step: ease toward the target, never backwards, at least a visible crawl while behind. */
export function stepProgress(current: number, target: number | null, dtMs: number): number {
  if (target === null || target <= current) return current;
  const ease = 1 - Math.exp(-dtMs / 900);
  const crawl = (dtMs / 1000) * 0.002;
  return Math.min(target, current + Math.max((target - current) * ease, crawl));
}

/**
 * Which horizontal bands of the black layer are still standing at this progress. Each band has its own
 * threshold; bands near theirs flicker with `noise` (0..1, changing each tick) — the glitch. Pure.
 */
export function bandStates(count: number, progress: number, noise: (i: number) => number): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i < count; i++) {
    const h = Math.sin((i + 1) * 12.9898) * 43758.5453;
    const threshold = 0.04 + 0.94 * (h - Math.floor(h)); // stable per band
    const jitter = (noise(i) - 0.5) * 0.12;
    out.push(progress < 1 && progress + jitter < threshold);
  }
  return out;
}
