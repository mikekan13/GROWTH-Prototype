'use client';

/**
 * Session-start loading screen (Mike 2026-10-01). Covers the self-hosted
 * core's cold start (~5 min, almost all of it weights streaming off the
 * network volume) with the Terminal's own voice instead of a dead table.
 *
 * Reads GET /api/campaigns/[id]/lane every few seconds and shows which
 * phase the cold start is in, the live worker's GPU and uptime, and a
 * progress bar against the observed cold-start time. The GM can send it to
 * the background and keep preparing; the speak bar's status strip still
 * says "warming" until the core answers. Closes itself when the core is
 * ready (or if no local core is configured at all).
 */
import { useEffect, useRef, useState } from 'react';

interface LaneView {
  status: 'ready' | 'warming' | 'offline' | 'disabled';
  phase: 'ready' | 'host' | 'loading' | 'offline' | 'disabled';
  expectedColdStartSeconds: number;
  endpoint?: {
    ready: number; initializing: number; running: number; throttled: number; unhealthy: number; queue: number;
    worker?: { id: string; gpu?: string; uptimeSeconds?: number };
  };
}

interface Props {
  campaignId: string;
  /** ISO — when the session (and the pre-warm) started; drives the elapsed clock. */
  startedAt: string;
  sessionNumber?: number;
  onReady: () => void;
  onDismiss: () => void;
}

const POLL_MS = 3000;
const AMBER = '#D07818';
const GOLD = 'rgba(255, 204, 120, 0.85)';
const GOLD_DIM = 'rgba(255, 204, 120, 0.45)';
const MONO = 'var(--font-terminal), Consolas, monospace';
const BEBAS = 'var(--font-bebas-neue), Bebas Neue, sans-serif';

function fmt(s: number): string {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return m > 0 ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`;
}

export default function SessionWarmupOverlay({ campaignId, startedAt, sessionNumber, onReady, onDismiss }: Props) {
  const [lane, setLane] = useState<LaneView | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [done, setDone] = useState(false);
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onReadyRef = useRef(onReady);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  // Elapsed clock.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll the lane.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function tick() {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/lane`);
        if (res.ok) {
          const json = (await res.json()) as LaneView;
          if (cancelled) return;
          setLane(json);
          if (json.phase === 'ready' || json.phase === 'disabled') {
            setDone(true);
            readyTimer.current = setTimeout(() => onReadyRef.current(), json.phase === 'ready' ? 1600 : 0);
            return;
          }
        }
      } catch { /* keep polling */ }
      if (!cancelled) timer = setTimeout(() => void tick(), POLL_MS);
    }
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (readyTimer.current) clearTimeout(readyTimer.current);
    };
  }, [campaignId]);

  const elapsed = Math.max(0, (now - new Date(startedAt).getTime()) / 1000);
  const expected = lane?.expectedColdStartSeconds ?? 340;
  const uptime = lane?.endpoint?.worker?.uptimeSeconds;
  const phase = lane?.phase ?? 'host';

  // Progress: the worker's own uptime is the honest clock once there is one;
  // before that, the elapsed clock creeps so the bar is never dead.
  let pct: number;
  if (done && phase === 'ready') pct = 100;
  else if (uptime != null) pct = Math.min(95, 10 + (uptime / expected) * 85);
  else pct = Math.min(10, (elapsed / 60) * 10);
  const remaining = uptime != null ? Math.max(0, expected - uptime) : null;

  const title =
    phase === 'ready' ? 'THE CORE IS AWAKE'
    : phase === 'offline' ? 'THE CORE IS UNREACHABLE'
    : phase === 'loading' ? 'WAKING THE CORE'
    : 'SUMMONING A HOST';
  const line =
    phase === 'ready' ? 'The table is live. The beings can hear you.'
    : phase === 'offline' ? 'The lane did not answer at the network level. Check the endpoint; the table still records, but no one at it will respond.'
    : phase === 'loading' ? `The persona core is loading its weights${lane?.endpoint?.worker?.gpu ? ` on an ${lane.endpoint.worker.gpu}` : ''}. Nothing to do but wait; set the scene in your head.`
    : 'The Terminal is requisitioning compute. A host usually answers within a minute.';

  const steps: Array<{ key: LaneView['phase']; label: string }> = [
    { key: 'host', label: 'host' },
    { key: 'loading', label: 'weights' },
    { key: 'ready', label: 'awake' },
  ];
  const stepIndex = phase === 'ready' ? 2 : phase === 'loading' ? 1 : 0;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.88)' }}>
      <div className="w-[520px] max-w-[92vw] overflow-hidden" style={{ backgroundColor: '#000', border: `1px solid ${AMBER}`, boxShadow: `0 0 40px ${AMBER}33` }}>
        {/* Header bar — black highlight behind amber Terminal speak */}
        <div className="px-5 py-3 flex items-baseline justify-between" style={{ borderBottom: `1px solid ${AMBER}55` }}>
          <div className="text-[11px] tracking-[0.3em] uppercase" style={{ fontFamily: MONO, color: GOLD_DIM }}>
            TERMINAL{sessionNumber ? ` · SESSION ${sessionNumber}` : ''}
          </div>
          <div className="text-[11px]" style={{ fontFamily: MONO, color: GOLD_DIM }}>{fmt(elapsed)}</div>
        </div>

        <div className="px-5 pt-5 pb-4">
          <div
            className="uppercase"
            style={{ fontFamily: BEBAS, fontSize: '34px', lineHeight: 1, color: AMBER, letterSpacing: '0.06em', animation: done ? undefined : 'glitch-unstable 6s infinite' }}
          >
            {title}
          </div>
          <p className="mt-3 text-[13px] leading-relaxed" style={{ fontFamily: MONO, color: GOLD }}>{line}</p>

          {/* Progress */}
          <div className="mt-5 h-[6px] w-full" style={{ backgroundColor: 'rgba(255, 204, 120, 0.12)' }}>
            <div className="h-full" style={{ width: `${pct}%`, backgroundColor: phase === 'offline' ? '#f7525f' : AMBER, transition: 'width 900ms linear' }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]" style={{ fontFamily: MONO, color: GOLD_DIM }}>
            <div className="flex gap-3">
              {steps.map((s, i) => (
                <span key={s.key} style={{ color: i <= stepIndex ? AMBER : GOLD_DIM, opacity: i <= stepIndex ? 1 : 0.6 }}>
                  {i < stepIndex ? '■' : i === stepIndex ? '▣' : '□'} {s.label}
                </span>
              ))}
            </div>
            <div>
              {phase === 'ready' ? 'ready'
                : remaining != null ? `~${fmt(remaining)} left · core up ${fmt(uptime ?? 0)}`
                : phase === 'loading' ? 'loading the core…'
                : lane?.endpoint ? (lane.endpoint.throttled ? 'no free host yet — retrying' : 'waiting for a host')
                : 'reading the lane…'}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: `1px solid ${AMBER}55` }}>
          <div className="text-[11px]" style={{ fontFamily: MONO, color: GOLD_DIM }}>
            The first line of the night waits for this. Everything you type meanwhile is recorded.
          </div>
          <button
            onClick={onDismiss}
            className="px-3 py-1 text-[12px] uppercase tracking-wider"
            style={{ fontFamily: BEBAS, color: '#CBD9E8', backgroundColor: 'transparent', border: '1px solid rgba(203, 217, 232, 0.35)', borderRadius: '2px' }}
          >
            Prepare meanwhile
          </button>
        </div>
      </div>
    </div>
  );
}
