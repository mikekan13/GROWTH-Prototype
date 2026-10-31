/**
 * The dedicated text pod's lifecycle, tied to the session (Michael 2026-10-30: "set up the pod so it just starts
 * when we hit start from now. If I need it on not during a session I'll ask").
 *
 * When DAYA_L1_URL points at a RunPod POD (`https://<podId>-8000.proxy.runpod.net/...`) rather than a serverless
 * endpoint, nothing spins it up on its own: a stopped pod is a refused connection, and a running pod bills every
 * hour whether or not anyone is at the table (10-30: ~19 h unattended, ~$24). So the session owns it —
 *   session start   → resume the pod (the keep-warm loop's first tick);
 *   session end / table idle / budget spent → stop it (the keep-warm loop's release);
 *   the warm-up screen reads the pod's own state (stopped → host, booting → loading, answering → ready).
 * Outside a session the pod is started by hand only (`node ../tmp/dev-pod.mjs start`).
 *
 * Infrastructure plumbing: never throws, never meters a DayaModelCall.
 */
import 'server-only';

export type PodDesired = 'RUNNING' | 'EXITED' | 'TERMINATED' | string;
export interface PodView {
  podId: string;
  desiredStatus: PodDesired;
  costPerHr: number | null;
  gpu: string | null;
  /** Seconds since the container came up; null while no runtime exists (stopped, or still being placed on a host). */
  uptimeSeconds: number | null;
}

/** The pod id a lane URL names, or null when the lane is serverless / something else. Pure. */
export function podIdFromUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const m = url.match(/^https?:\/\/([a-z0-9]+)-\d+\.proxy\.runpod\.net(?:\/|$)/i);
  return m ? m[1] : null;
}

/** The pod the text lane runs on, or null when the lane is not a pod. */
export function textPodId(): string | null {
  return podIdFromUrl(process.env.DAYA_L1_URL);
}

/** A cold boot measured 2026-10-30: ~4.5 min from resume to the first answer on the MIG slice. */
export const POD_COLD_START_S = Number(process.env.DAYA_L1_POD_COLD_START_S ?? 270);

function headers(): Record<string, string> | null {
  const key = process.env.RUNPOD_API_KEY;
  return key ? { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } : null;
}

async function gql<T>(query: string, ms = 6000): Promise<T | null> {
  const H = headers();
  if (!H) return null;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  (t as unknown as { unref?: () => void }).unref?.();
  try {
    const r = await fetch('https://api.runpod.io/graphql', { method: 'POST', headers: H, body: JSON.stringify({ query }), signal: c.signal });
    const j = (await r.json()) as { data?: T; errors?: unknown };
    if (j.errors) console.warn('[text-pod] runpod said', JSON.stringify(j.errors).slice(0, 200));
    return j.data ?? null;
  } catch (err) {
    console.warn('[text-pod] runpod unreachable', err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** The pod as RunPod sees it. Null when the lane is not a pod or RunPod does not answer. */
export async function podView(podId: string | null = textPodId()): Promise<PodView | null> {
  if (!podId) return null;
  const d = await gql<{ pod?: { desiredStatus?: string; costPerHr?: number; runtime?: { uptimeInSeconds?: number } | null; machine?: { gpuDisplayName?: string } | null } }>(
    `query { pod(input:{podId:"${podId}"}) { desiredStatus costPerHr runtime { uptimeInSeconds } machine { gpuDisplayName } } }`,
  );
  const p = d?.pod;
  if (!p) return null;
  return {
    podId,
    desiredStatus: p.desiredStatus ?? 'UNKNOWN',
    costPerHr: typeof p.costPerHr === 'number' ? p.costPerHr : null,
    gpu: p.machine?.gpuDisplayName ?? null,
    uptimeSeconds: typeof p.runtime?.uptimeInSeconds === 'number' ? p.runtime.uptimeInSeconds : null,
  };
}

type Last = { action: 'resume' | 'stop'; at: number };
const g = globalThis as unknown as { __textPodLast?: Map<string, Last> };
const last: Map<string, Last> = g.__textPodLast ?? (g.__textPodLast = new Map());
/** Two mutations of the same kind inside this window are one (the keep-warm loop ticks every minute; HMR doubles). */
const DEBOUNCE_MS = 30_000;

function recently(podId: string, action: Last['action']): boolean {
  const l = last.get(podId);
  return !!l && l.action === action && Date.now() - l.at < DEBOUNCE_MS;
}

/** Resume the text pod if it is not running. Returns what was done. Never throws. */
export async function resumeTextPod(why: string): Promise<'resumed' | 'already-running' | 'not-a-pod' | 'failed'> {
  const podId = textPodId();
  if (!podId) return 'not-a-pod';
  if (recently(podId, 'resume')) return 'already-running';
  const view = await podView(podId);
  if (view?.desiredStatus === 'RUNNING') return 'already-running';
  last.set(podId, { action: 'resume', at: Date.now() });
  const d = await gql<{ podResume?: { id: string; desiredStatus: string } }>(`mutation { podResume(input:{podId:"${podId}", gpuCount:1}) { id desiredStatus } }`);
  if (d?.podResume?.desiredStatus === 'RUNNING') {
    console.log(`[text-pod] ${podId} resumed — ${why} (cold start ≈ ${Math.round(POD_COLD_START_S / 60)} min${view?.costPerHr != null ? `, $${view.costPerHr}/h` : ''})`);
    return 'resumed';
  }
  console.warn(`[text-pod] ${podId} resume did not take — ${why}`);
  return 'failed';
}

/** Stop the text pod if it is running (stopped = no GPU charge; the disk is kept). Never throws. */
export async function stopTextPod(why: string): Promise<'stopped' | 'already-stopped' | 'not-a-pod' | 'failed'> {
  const podId = textPodId();
  if (!podId) return 'not-a-pod';
  if (recently(podId, 'stop')) return 'already-stopped';
  const view = await podView(podId);
  if (view && view.desiredStatus !== 'RUNNING') return 'already-stopped';
  last.set(podId, { action: 'stop', at: Date.now() });
  const d = await gql<{ podStop?: { id: string; desiredStatus: string } }>(`mutation { podStop(input:{podId:"${podId}"}) { id desiredStatus } }`);
  if (d?.podStop && d.podStop.desiredStatus !== 'RUNNING') {
    const ran = view?.uptimeSeconds != null ? ` after ${Math.round(view.uptimeSeconds / 60)} min` : '';
    console.log(`[text-pod] ${podId} stopped${ran} — ${why}`);
    return 'stopped';
  }
  console.warn(`[text-pod] ${podId} stop did not take — ${why}`);
  return 'failed';
}

/** Where a pod lane is in its boot, for the warm-up screen. Pure. */
export function podPhase(view: PodView | null, probe: 'ready' | 'warming' | 'offline' | 'disabled'): 'ready' | 'host' | 'loading' | 'offline' {
  if (probe === 'ready') return 'ready';
  if (!view) return probe === 'offline' ? 'offline' : 'loading';
  if (view.desiredStatus !== 'RUNNING') return 'host'; // stopped: nothing is booting until it is resumed
  return view.uptimeSeconds == null ? 'host' : 'loading'; // placed on a host, then weights loading
}
