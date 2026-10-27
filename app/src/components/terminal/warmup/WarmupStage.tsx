'use client';

/**
 * The black novel view as the session-start loading screen (Mike 2026-10-26). It sits ON TOP of the live in-session
 * feed and glitches away toward it as `progress` climbs 0 → 1: the black layer is cut into horizontal bands, each with
 * its own threshold; bands past their threshold are masked out (the light in-session look shows through), the ones
 * left jitter sideways and split red/teal (VISUAL-DESIGN-SPEC: chaotic cosmic-glitch for a reality-layer transition).
 * At 1 nothing is left. CSS-driven: the mask is a hard-stop gradient rebuilt a few times a second; the jitter and the
 * colour split are keyframes. Reduced motion: a plain fade, no shake.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { bandStates } from './lane-progress';

const BANDS = 28;
const TICK_MS = 120;

const STAGE_CSS = `
@keyframes ws-shake{0%{transform:translateX(0)}20%{transform:translateX(calc(var(--ws-j,0) * -1px))}40%{transform:translateX(calc(var(--ws-j,0) * 1.4px))}60%{transform:translateX(calc(var(--ws-j,0) * -0.6px))}80%{transform:translateX(calc(var(--ws-j,0) * 0.9px))}100%{transform:translateX(0)}}
@keyframes ws-split{0%,100%{text-shadow:none}30%{text-shadow:calc(var(--ws-s,0) * 1px) 0 rgba(247,82,95,.75),calc(var(--ws-s,0) * -1px) 0 rgba(34,171,148,.75)}65%{text-shadow:calc(var(--ws-s,0) * -1px) 0 rgba(247,82,95,.6),calc(var(--ws-s,0) * 1px) 0 rgba(34,171,148,.6)}}
.ws{position:absolute;inset:0;z-index:20;background:#000;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;animation:ws-shake .42s steps(5,end) infinite}
.ws > *{animation:ws-split .84s steps(4,end) infinite}
@media (prefers-reduced-motion: reduce){.ws,.ws > *{animation:none}}
`;

function bandMask(states: boolean[]): string {
  const h = 100 / states.length;
  const stops: string[] = [];
  states.forEach((on, i) => stops.push(`${on ? '#000' : 'transparent'} ${(i * h).toFixed(3)}% ${((i + 1) * h).toFixed(3)}%`));
  return `linear-gradient(to bottom, ${stops.join(', ')})`;
}

export default function WarmupStage({ progress, children }: { progress: number; children: React.ReactNode }) {
  const [tick, setTick] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useMemo(() => (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) || false, []);

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(t);
  }, [reduced]);

  // Read from the newest line, as the live feed does.
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [children]);

  const p = Math.min(1, Math.max(0, progress));
  const noise = (i: number) => { const x = Math.sin((i + 1) * 78.233 + tick * 37.719) * 43758.5453; return x - Math.floor(x); };
  const states = useMemo(() => (reduced ? [] : bandStates(BANDS, p, noise)), [reduced, p, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const intensity = 0.25 + 0.75 * p;
  const mask = reduced ? undefined : bandMask(states);
  const style: React.CSSProperties & Record<string, string | number | undefined> = {
    '--ws-j': Math.round(3 + 14 * intensity),
    '--ws-s': Math.round(1 + 3 * intensity),
    WebkitMaskImage: mask,
    maskImage: mask,
    opacity: reduced ? 1 - p : 1,
  };

  return (
    <div ref={ref} className="ws" style={style} data-warmup-stage data-progress={p.toFixed(3)} aria-busy="true">
      <style>{STAGE_CSS}</style>
      {children}
    </div>
  );
}
