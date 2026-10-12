/**
 * 429 / 529 backoff (perf pass 2026-10-12).
 */
import { describe, it, expect, vi } from 'vitest';
import { withTransientRetry, isTransientProviderError } from './retry';

const e429 = Object.assign(new Error('429 rate_limit_error'), { status: 429 });
const e529 = Object.assign(new Error('Overloaded'), { status: 529, error: { type: 'error', error: { type: 'overloaded_error' } } });

describe('isTransientProviderError', () => {
  it('knows the weather', () => {
    expect(isTransientProviderError(e429)).toBe(true);
    expect(isTransientProviderError(e529)).toBe(true);
    expect(isTransientProviderError(Object.assign(new Error('bad'), { status: 400 }))).toBe(false);
    expect(isTransientProviderError(new Error('credit balance is too low'))).toBe(false);
  });
});

describe('withTransientRetry', () => {
  it('a mocked 429 then success: waits (jittered) and returns the success', async () => {
    const fn = vi.fn().mockRejectedValueOnce(e429).mockResolvedValueOnce('ok');
    const sleep = vi.fn(async () => {});
    await expect(withTransientRetry(fn, { sleep, random: () => 0.5 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000); // base 2000 × (0.5 + 0.5)
  });

  it('gives up after 3 tries and throws the last error', async () => {
    const fn = vi.fn().mockRejectedValue(e529);
    const sleep = vi.fn(async () => {});
    await expect(withTransientRetry(fn, { sleep })).rejects.toBe(e529);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('never retries a real failure', async () => {
    const bad = Object.assign(new Error('invalid request'), { status: 400 });
    const fn = vi.fn().mockRejectedValue(bad);
    await expect(withTransientRetry(fn, { sleep: async () => {} })).rejects.toBe(bad);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('honours retry-after (capped)', async () => {
    const withHeader = Object.assign(new Error('429'), { status: 429, headers: { 'retry-after': '7' } });
    const fn = vi.fn().mockRejectedValueOnce(withHeader).mockResolvedValueOnce(1);
    const sleep = vi.fn(async () => {});
    await withTransientRetry(fn, { sleep, random: () => 0 });
    expect(sleep).toHaveBeenCalledWith(7000);
  });
});
