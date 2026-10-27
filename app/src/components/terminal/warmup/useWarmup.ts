'use client';

/**
 * Session-start warm-up (Mike 2026-10-26): replaces the old modal overlay. When a session is active and the lane
 * (GET /api/campaigns/[id]/lane) is not ready, the Terminal stays in the black novel view and glitches toward the
 * in-session look as `progress` climbs 0 → 1; at ready the transition completes and `mode` goes back to 'idle'.
 *
 *   idle        nothing to wait for (lane ready / disabled at the first look, or the session is over)
 *   warming     the speak bar is locked; `progress` follows the lane (lane-progress.ts)
 *   finishing   progress reached 1: the last glitch-out, then idle
 *
 * Once per active session. `dismiss()` (the GM's "prepare meanwhile") ends the wait early.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { laneTarget, stepProgress, type LaneLike } from './lane-progress';

export type WarmupMode = 'idle' | 'warming' | 'finishing';
export interface WarmupState {
  mode: WarmupMode;
  progress: number;
  phase: LaneLike['phase'] | null;
  /** The worker's GPU, when the lane says so (for the plain offline/loading line). */
  gpu: string | null;
  dismiss: () => void;
}

const POLL_MS = 3000;
const TICK_MS = 100;
const FINISH_MS = 1100;

/** A session this young is assumed to be warming from the moment it exists (the lane's first answer can be slow). */
const FRESH_SESSION_MS = 8 * 60_000;

export function useWarmup(campaignId: string, session: { id: string; startedAt?: string } | null): WarmupState {
  const [mode, setMode] = useState<WarmupMode>('idle');
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<LaneLike['phase'] | null>(null);
  const [gpu, setGpu] = useState<string | null>(null);
  const doneFor = useRef<string | null>(null);
  const laneRef = useRef<LaneLike | null>(null);
  const phaseSince = useRef(Date.now());
  const progressRef = useRef(0);
  const modeRef = useRef<WarmupMode>('idle');
  modeRef.current = mode;
  const sessionId = session?.id ?? null;
  const startedAt = session?.startedAt;

  const dismiss = useCallback(() => { doneFor.current = sessionId; setMode('idle'); setProgress(0); progressRef.current = 0; }, [sessionId]);

  // One look when a session becomes active; then poll while warming.
  useEffect(() => {
    if (!sessionId) { doneFor.current = null; setMode('idle'); setProgress(0); progressRef.current = 0; return; }
    if (doneFor.current === sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let first = true;
    // Start at once (progress 0) for a session that has just begun; the first lane answer then moves it or ends it.
    const age = startedAt ? Date.now() - new Date(startedAt).getTime() : 0;
    const fresh = !startedAt || (age >= -60_000 && age < FRESH_SESSION_MS);
    if (fresh && modeRef.current === 'idle') { phaseSince.current = Date.now(); laneRef.current = null; progressRef.current = 0; setProgress(0); setMode('warming'); }
    const endNow = () => { doneFor.current = sessionId; setMode('idle'); setProgress(0); progressRef.current = 0; };

    async function poll() {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/lane`);
        if (res.ok) {
          const lane = (await res.json()) as LaneLike & { endpoint?: { worker?: { gpu?: string } } };
          if (cancelled) return;
          if (laneRef.current?.phase !== lane.phase) phaseSince.current = Date.now();
          laneRef.current = lane;
          setPhase(lane.phase);
          setGpu(lane.endpoint?.worker?.gpu ?? null);
          if (first) {
            first = false;
            if (!fresh && lane.phase !== 'ready' && lane.phase !== 'disabled') { phaseSince.current = Date.now(); setMode('warming'); }
            if (!fresh && (lane.phase === 'ready' || lane.phase === 'disabled')) { doneFor.current = sessionId; return; } // reload of a live session: nothing to wait for
          }
          if (lane.phase === 'ready' || lane.phase === 'disabled') return; // the ticker below finishes the climb
        } else if (first) {
          endNow(); // GM-only lane (403) or unavailable: no wait, the speak bar's own strip still covers it
          return;
        }
      } catch { if (first) { endNow(); return; } }
      if (!cancelled) timer = setTimeout(() => void poll(), POLL_MS);
    }
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [sessionId, startedAt, campaignId]);

  // Smooth the climb; at 1, hold the final glitch-out briefly, then idle.
  useEffect(() => {
    if (mode !== 'warming') return;
    let last = Date.now();
    const t = setInterval(() => {
      const now = Date.now();
      const target = laneTarget(laneRef.current, now - phaseSince.current);
      const next = stepProgress(progressRef.current, target, target === 1 ? (now - last) * 4 : now - last);
      last = now;
      progressRef.current = next;
      setProgress(next);
      if (next >= 0.999 && target === 1) { progressRef.current = 1; setProgress(1); setMode('finishing'); }
    }, TICK_MS);
    return () => clearInterval(t);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'finishing') return;
    const t = setTimeout(() => { doneFor.current = sessionId; setMode('idle'); setProgress(0); progressRef.current = 0; }, FINISH_MS);
    return () => clearTimeout(t);
  }, [mode, sessionId]);

  return { mode, progress, phase, gpu, dismiss };
}
