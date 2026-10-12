/**
 * Transient-failure backoff for cloud calls (perf pass 2026-10-12).
 *
 * A 429 (rate limit), 529 / overloaded_error, or 503 from the provider is
 * weather, not a fault: back off (jittered exponential, honouring a
 * retry-after header) and try again, up to `tries` attempts in all, before
 * the error is allowed to count as a dispatch failure. Pure apart from the
 * injectable sleep.
 */

const TRANSIENT_STATUS = new Set([429, 503, 529]);

/** Is this provider error worth waiting out? */
export function isTransientProviderError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: unknown; error?: { type?: unknown; error?: { type?: unknown } }; message?: unknown };
  if (typeof e.status === 'number' && TRANSIENT_STATUS.has(e.status)) return true;
  const type = e.error?.type === 'error' ? e.error?.error?.type : e.error?.type;
  if (type === 'overloaded_error' || type === 'rate_limit_error') return true;
  const msg = typeof e.message === 'string' ? e.message : '';
  return /\b(429|529)\b|overloaded|rate[ _-]?limit/i.test(msg);
}

/** retry-after in ms when the error carries one (seconds or HTTP date). */
function retryAfterMs(err: unknown): number | null {
  const headers = (err as { headers?: unknown })?.headers;
  let raw: string | null | undefined;
  if (headers && typeof (headers as Headers).get === 'function') raw = (headers as Headers).get('retry-after');
  else if (headers && typeof headers === 'object') raw = (headers as Record<string, string | undefined>)['retry-after'];
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

export interface RetryOptions {
  /** Attempts in all (default 3). */
  tries?: number;
  /** First backoff (default 2000 ms); doubles each attempt. */
  baseMs?: number;
  /** Ceiling for any one wait (default 20 000 ms). */
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Called before each wait — logging. */
  onRetry?: (info: { attempt: number; waitMs: number; err: unknown }) => void;
}

/** Run `fn`; on a transient provider error wait and retry, up to `tries` attempts. */
export async function withTransientRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const tries = Math.max(1, opts.tries ?? 3);
  const baseMs = opts.baseMs ?? 2_000;
  const maxMs = opts.maxMs ?? 20_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const random = opts.random ?? Math.random;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= tries || !isTransientProviderError(err)) throw err;
      const backoff = baseMs * 2 ** (attempt - 1);
      const jittered = backoff * (0.5 + random()); // ±50%
      const waitMs = Math.min(maxMs, Math.max(retryAfterMs(err) ?? 0, jittered));
      opts.onRetry?.({ attempt, waitMs, err });
      await sleep(waitMs);
    }
  }
}
