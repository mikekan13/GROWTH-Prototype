/**
 * WP14 — unit tests for l1-warm.ts's readiness probe. All DB-free: this
 * module never touches prisma, only the injected fetchImpl.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { l1Status, warmL1 } from './l1-warm';
import type { DayaFetch } from './model-client';

function okResponse() {
  return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
}

describe('l1Status / warmL1 (WP14)', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    process.env.DAYA_L1_URL = 'http://mock-l1.local';
    process.env.DAYA_L1_MODEL = 'mock-model';
    delete process.env.DAYA_L1_PROVIDER;
    delete process.env.DAYA_L1_API_KEY;
    delete process.env.DAYA_L1_STATUS_TIMEOUT_MS;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('Claude-backed L1 (DAYA_L1_PROVIDER=anthropic) reports ready without probing — no cold start exists', async () => {
    process.env.DAYA_L1_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'k';
    let probed = false;
    const fetchImpl: DayaFetch = async () => {
      probed = true;
      return okResponse();
    };
    expect(await l1Status({ fetchImpl })).toBe('ready');
    expect(probed).toBe(false);
  });

  it('Claude-backed L1 without ANTHROPIC_API_KEY reports disabled', async () => {
    process.env.DAYA_L1_PROVIDER = 'anthropic';
    delete process.env.ANTHROPIC_API_KEY;
    expect(await l1Status()).toBe('disabled');
  });

  it('reports disabled when DAYA_L1_URL is unset', async () => {
    delete process.env.DAYA_L1_URL;
    expect(await l1Status()).toBe('disabled');
  });

  it('reports disabled when DAYA_L1_MODEL is unset', async () => {
    delete process.env.DAYA_L1_MODEL;
    expect(await l1Status()).toBe('disabled');
  });

  it('reports ready on a quick 200', async () => {
    const fetchImpl: DayaFetch = async () => okResponse();
    expect(await l1Status({ fetchImpl })).toBe('ready');
  });

  it('reports warming when the probe times out — reachable, just slow/queued/cold', async () => {
    process.env.DAYA_L1_STATUS_TIMEOUT_MS = '30';
    const fetchImpl: DayaFetch = (_url, init) =>
      new Promise((resolve, reject) => {
        const t = setTimeout(() => resolve(okResponse()), 5000);
        init.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    expect(await l1Status({ fetchImpl })).toBe('warming');
  });

  it('reports warming on a reachable-but-non-2xx response (e.g. a queued 503 from the serverless gateway)', async () => {
    const fetchImpl: DayaFetch = async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => 'queued' });
    expect(await l1Status({ fetchImpl })).toBe('warming');
  });

  it('reports offline on a genuine network-level failure (refused/DNS/etc.), not a timeout', async () => {
    const fetchImpl: DayaFetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    expect(await l1Status({ fetchImpl })).toBe('offline');
  });

  it('never throws even when the fetchImpl throws something unexpected', async () => {
    const fetchImpl: DayaFetch = async () => {
      throw new TypeError('boom');
    };
    await expect(l1Status({ fetchImpl })).resolves.toBe('offline');
  });

  it('warmL1 sends the Bearer auth header when DAYA_L1_API_KEY is set, same as model-client', async () => {
    process.env.DAYA_L1_API_KEY = 'tok';
    let seenHeaders: Record<string, string> | undefined;
    const fetchImpl: DayaFetch = async (_url, init) => {
      seenHeaders = init.headers;
      return okResponse();
    };
    await warmL1({ fetchImpl });
    expect(seenHeaders?.Authorization).toBe('Bearer tok');
  });

  it('warmL1 sends no Authorization header when DAYA_L1_API_KEY is unset', async () => {
    let seenHeaders: Record<string, string> | undefined;
    const fetchImpl: DayaFetch = async (_url, init) => {
      seenHeaders = init.headers;
      return okResponse();
    };
    await warmL1({ fetchImpl });
    expect(seenHeaders?.Authorization).toBeUndefined();
  });
});
