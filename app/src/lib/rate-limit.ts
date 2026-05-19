/**
 * Rate Limit — sliding-window in-memory token bucket.
 *
 * Production replacement: drop in a Redis-backed implementation that uses
 * INCR + EXPIRE. The interface is just `check(key, limit, windowMs)`.
 *
 * Per-server-instance only — multi-instance deployments need shared state.
 * Acceptable for dev and single-node beta.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  /** Suggested HTTP retry-after header value, in seconds. */
  retryAfterSec: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const allowed = bucket.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/**
 * Convenience: pull a stable client identifier from a Next.js request.
 * Falls back to a header chain; if all are missing, returns 'anonymous'
 * which is fine for dev (and will rate-limit the dev server as a unit).
 */
export function getClientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return 'anonymous';
}

// Test helper
export function _resetRateLimitForTests(): void {
  buckets.clear();
}
