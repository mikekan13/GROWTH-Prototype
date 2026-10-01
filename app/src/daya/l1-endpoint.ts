/**
 * Lane readiness for the session-start loading screen (Mike 2026-10-01:
 * "we should also just have a loading screen for when a GM starts a session
 * that can run during the cold start").
 *
 * Combines two views of the self-hosted L1 core:
 *   - the chat probe (`l1Status`) — the only thing that proves the model
 *     answers; it is also what triggers a serverless worker to spin up;
 *   - the RunPod endpoint's own view (health counts + the live worker's GPU
 *     and uptime) — so the screen can say WHERE in the ~5-minute cold start
 *     we are instead of showing a spinner.
 *
 * The probe enqueues a 1-token job that waits in the queue until the worker
 * is up, so it is rate-limited here (one per PROBE_EVERY_MS while warming);
 * the RunPod reads are cheap REST/GraphQL calls and run on every request.
 * Never throws. Infrastructure plumbing — never meters a DayaModelCall.
 */
import 'server-only';
import { l1Status, type L1Status } from './l1-warm';

export type LanePhase = 'ready' | 'host' | 'loading' | 'offline' | 'disabled';

export interface LaneReadiness {
  status: L1Status;
  phase: LanePhase;
  /** Observed on 2026-10-01: ~340 s from first request to first answer, almost all of it weights streaming off the network volume. */
  expectedColdStartSeconds: number;
  endpoint?: {
    ready: number;
    initializing: number;
    running: number;
    throttled: number;
    unhealthy: number;
    queue: number;
    worker?: { id: string; gpu?: string; uptimeSeconds?: number };
  };
  probedAt: string;
}

const PROBE_EVERY_MS = Number(process.env.DAYA_L1_PROBE_EVERY_MS ?? 15_000);
const READY_CACHE_MS = 60_000;
export const EXPECTED_COLD_START_S = Number(process.env.DAYA_L1_COLD_START_S ?? 340);

type Cache = { status: L1Status; at: number };
const g = globalThis as unknown as { __l1ProbeCache?: Cache };

function endpointId(): string | null {
  const url = process.env.DAYA_L1_URL ?? '';
  return (url.match(/\/v2\/([^/]+)\//) ?? [])[1] ?? null;
}

async function probeCached(): Promise<L1Status> {
  const now = Date.now();
  const c = g.__l1ProbeCache;
  if (c && now - c.at < (c.status === 'ready' ? READY_CACHE_MS : PROBE_EVERY_MS)) return c.status;
  const status = await l1Status();
  g.__l1ProbeCache = { status, at: now };
  return status;
}

async function endpointView(): Promise<LaneReadiness['endpoint'] | undefined> {
  const id = endpointId();
  const key = process.env.RUNPOD_API_KEY;
  if (!id || !key) return undefined;
  const H = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const withTimeout = (ms: number) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    (t as unknown as { unref?: () => void }).unref?.();
    return c.signal;
  };
  try {
    const health = (await (await fetch(`https://api.runpod.ai/v2/${id}/health`, { headers: H, signal: withTimeout(4000) })).json()) as {
      workers?: Record<string, number>; jobs?: { inQueue?: number };
    };
    const w = health.workers ?? {};
    const out: NonNullable<LaneReadiness['endpoint']> = {
      ready: w.ready ?? 0, initializing: w.initializing ?? 0, running: w.running ?? 0,
      throttled: w.throttled ?? 0, unhealthy: w.unhealthy ?? 0, queue: health.jobs?.inQueue ?? 0,
    };
    const ep = (await (await fetch(`https://rest.runpod.io/v1/endpoints/${id}?includeWorkers=true`, { headers: H, signal: withTimeout(4000) })).json()) as {
      workers?: Array<{ id: string; lastStatusChange?: string }>;
    };
    const live = (ep.workers ?? []).filter((x) => !/Exited/.test(x.lastStatusChange ?? ''));
    // Workers are pods under the hood; GraphQL is the only place their GPU + uptime show.
    for (const x of live) {
      const q = `{ pod(input:{podId:"${x.id}"}) { machine { gpuDisplayName } runtime { uptimeInSeconds } } }`;
      const r = (await (await fetch(`https://api.runpod.io/graphql`, {
        method: 'POST', headers: H, body: JSON.stringify({ query: q }), signal: withTimeout(4000),
      })).json()) as { data?: { pod?: { machine?: { gpuDisplayName?: string }; runtime?: { uptimeInSeconds?: number } } } };
      const p = r.data?.pod;
      if (p?.runtime) { out.worker = { id: x.id, gpu: p.machine?.gpuDisplayName, uptimeSeconds: p.runtime.uptimeInSeconds }; break; }
    }
    return out;
  } catch {
    return undefined;
  }
}

export async function laneReadiness(): Promise<LaneReadiness> {
  const [status, endpoint] = await Promise.all([probeCached(), endpointView()]);
  let phase: LanePhase;
  if (status === 'ready') phase = 'ready';
  else if (status === 'disabled') phase = 'disabled';
  else if (status === 'offline') phase = 'offline';
  else phase = endpoint?.worker?.uptimeSeconds != null || (endpoint?.running ?? 0) > 0 ? 'loading' : 'host';
  return { status, phase, expectedColdStartSeconds: EXPECTED_COLD_START_S, endpoint, probedAt: new Date().toISOString() };
}
