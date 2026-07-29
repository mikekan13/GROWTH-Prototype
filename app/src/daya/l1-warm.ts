/**
 * WP14 — readiness/warm-up helper for the self-hosted L1 persona core.
 *
 * Moving L1 to serverless billing (scale-to-zero, per-request) means the
 * first request of a session can hit a cold worker spin-up (~2-3 min).
 * This module gives the app a cheap way to (a) proactively kick that
 * spin-up off the moment a GM opens the persona-harness surface, before
 * she's typed anything, and (b) report a coarse status so the UI can show
 * an in-world "waking up" state instead of a raw error or a silent hang.
 *
 * Deliberately network-cheap and side-effect-free beyond the probe itself:
 * never throws, never writes a DayaModelCall metering row (this is
 * infrastructure plumbing, not entity cognition — model-client.ts's chat()
 * remains the only path that meters real calls), and is safe to call on
 * every canvas mount or poll tick.
 */
import 'server-only';
import { tierProvider } from './model-client';
import type { DayaFetch, DayaFetchResponse } from './model-client';

export type L1Status = 'ready' | 'warming' | 'offline' | 'disabled';

export interface L1WarmOverrides {
  fetchImpl?: DayaFetch;
}

/** Short probe timeout — deliberately much shorter than model-client's
 * generous DAYA_L1_TIMEOUT_MS (240s default). This probe only needs to
 * tell "answered fast" (ready) from "still reachable but slow" (warming)
 * from "not reachable at all" (offline); it never needs to wait out an
 * entire cold start. */
const DEFAULT_STATUS_TIMEOUT_MS = 5000;

function defaultFetch(url: string, init: Parameters<DayaFetch>[1]) {
  return fetch(url, init) as unknown as Promise<DayaFetchResponse>;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message));
}

/**
 * One cheap probe shared by warmL1/l1Status: a max_tokens:1 chat-completion
 * fired at the configured L1 endpoint. The request itself is what triggers
 * a serverless worker to spin up — there's no separate "ping" API on an
 * OpenAI-compatible server, so the warm trigger and the status check are
 * the same call. Never throws.
 */
async function probeL1(overrides: L1WarmOverrides): Promise<L1Status> {
  // A Claude-backed L1 (DAYA_L1_PROVIDER=anthropic) has no cold start to
  // probe — the API is either configured or it isn't.
  if (tierProvider('L1') === 'anthropic') {
    return process.env.ANTHROPIC_API_KEY ? 'ready' : 'disabled';
  }

  const url = process.env.DAYA_L1_URL;
  const model = process.env.DAYA_L1_MODEL;
  if (!url || !model) return 'disabled';

  const fetchImpl: DayaFetch = overrides.fetchImpl ?? defaultFetch;
  const timeoutMs = Number(process.env.DAYA_L1_STATUS_TIMEOUT_MS ?? DEFAULT_STATUS_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = process.env.DAYA_L1_API_KEY;
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const res = await fetchImpl(`${url.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
      signal: controller.signal,
    });
    // Reachable but non-2xx (e.g. a queued/503 from the serverless
    // gateway while a worker boots) still reads as "warming", not
    // "offline" — offline is reserved for a genuine network-level failure.
    return res.ok ? 'ready' : 'warming';
  } catch (err) {
    if (isAbortError(err)) return 'warming'; // our own short probe timeout fired — still reachable, just slow
    return 'offline'; // real network-level failure (refused/DNS/etc.)
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fire this the moment a GM opens the persona-harness canvas, before she's
 * typed anything, so a serverless worker starts spinning up in the
 * background. Safe to await for its resulting status; never throws.
 */
export function warmL1(overrides: L1WarmOverrides = {}): Promise<L1Status> {
  return probeL1(overrides);
}

/** Read-only status check — same probe, for polling from the UI while
 * warming. */
export function l1Status(overrides: L1WarmOverrides = {}): Promise<L1Status> {
  return probeL1(overrides);
}
