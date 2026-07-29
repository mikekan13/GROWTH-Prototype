/**
 * WP14 — unit tests for the L1/L2 auth header + cold-start timeout behavior
 * in model-client.ts. Exercises callOpenAiCompatible() directly (exported
 * for exactly this reason) so these stay DB-free — chat()'s
 * prisma.dayaModelCall.create() write is out of scope here and covered by
 * the scripts/test-daya-wp*.ts acceptance scripts against a real DB instead.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { callOpenAiCompatible, tierProvider, tierAvailability, DayaWarmingTimeoutError, type DayaFetch } from './model-client';

const BASE_PARAMS = {
  tier: 'L1' as const,
  subsystem: 'test',
  messages: [{ role: 'user' as const, content: 'hi' }],
};

function okResponse(text = 'hi') {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
    text: async () => '',
  };
}

describe('callOpenAiCompatible (WP14 auth header + timeout)', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    process.env.DAYA_L1_URL = 'http://mock-l1.local';
    process.env.DAYA_L1_MODEL = 'mock-model';
    delete process.env.DAYA_L1_API_KEY;
    delete process.env.DAYA_L1_TIMEOUT_MS;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('sends no Authorization header when DAYA_L1_API_KEY is unset (unchanged for the current always-on pod)', async () => {
    let seenHeaders: Record<string, string> | undefined;
    const fetchImpl: DayaFetch = async (_url, init) => {
      seenHeaders = init.headers;
      return okResponse();
    };
    await callOpenAiCompatible('L1', BASE_PARAMS, fetchImpl);
    expect(seenHeaders?.Authorization).toBeUndefined();
  });

  it('sends a Bearer Authorization header when DAYA_L1_API_KEY is set (RunPod serverless)', async () => {
    process.env.DAYA_L1_API_KEY = 'secret-token';
    let seenHeaders: Record<string, string> | undefined;
    const fetchImpl: DayaFetch = async (_url, init) => {
      seenHeaders = init.headers;
      return okResponse();
    };
    await callOpenAiCompatible('L1', BASE_PARAMS, fetchImpl);
    expect(seenHeaders?.Authorization).toBe('Bearer secret-token');
  });

  it('sends the L2-specific key on L2 calls, independent of L1', async () => {
    process.env.DAYA_L2_URL = 'http://mock-l2.local';
    process.env.DAYA_L2_MODEL = 'mock-l2-model';
    process.env.DAYA_L2_API_KEY = 'l2-token';
    process.env.DAYA_L1_API_KEY = 'l1-token';
    let seenHeaders: Record<string, string> | undefined;
    const fetchImpl: DayaFetch = async (_url, init) => {
      seenHeaders = init.headers;
      return okResponse();
    };
    await callOpenAiCompatible('L2', { ...BASE_PARAMS, tier: 'L2' }, fetchImpl);
    expect(seenHeaders?.Authorization).toBe('Bearer l2-token');
    delete process.env.DAYA_L2_URL;
    delete process.env.DAYA_L2_MODEL;
    delete process.env.DAYA_L2_API_KEY;
  });

  it('throws the typed DayaWarmingTimeoutError (not a raw abort) when the request times out mid cold-start', async () => {
    process.env.DAYA_L1_TIMEOUT_MS = '50';
    const fetchImpl: DayaFetch = (_url, init) =>
      new Promise((resolve, reject) => {
        const t = setTimeout(() => resolve(okResponse()), 5000);
        init.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
        });
      });

    await expect(callOpenAiCompatible('L1', BASE_PARAMS, fetchImpl)).rejects.toBeInstanceOf(DayaWarmingTimeoutError);
  });

  it('a slow-but-eventually-answering call within the timeout window still succeeds (the 4-minute default is what lets a real cold start complete)', async () => {
    process.env.DAYA_L1_TIMEOUT_MS = '2000';
    const fetchImpl: DayaFetch = (_url, _init) =>
      new Promise((resolve) => setTimeout(() => resolve(okResponse('she answers once warm')), 30));

    const result = await callOpenAiCompatible('L1', BASE_PARAMS, fetchImpl);
    expect(result.text).toBe('she answers once warm');
  });

  it('propagates a genuine network failure unchanged — never mistaken for a timeout', async () => {
    const boom = new Error('ECONNREFUSED');
    const fetchImpl: DayaFetch = async () => {
      throw boom;
    };
    await expect(callOpenAiCompatible('L1', BASE_PARAMS, fetchImpl)).rejects.toBe(boom);
  });
});

describe('tierProvider / tierAvailability (Claude-backed persona tier)', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.DAYA_L1_PROVIDER;
    delete process.env.DAYA_L2_PROVIDER;
    delete process.env.DAYA_L1_URL;
    delete process.env.DAYA_L1_MODEL;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('defaults to openai transport when DAYA_L1_PROVIDER is unset', () => {
    expect(tierProvider('L1')).toBe('openai');
  });

  it('reads anthropic transport from DAYA_L1_PROVIDER, per tier', () => {
    process.env.DAYA_L1_PROVIDER = 'anthropic';
    expect(tierProvider('L1')).toBe('anthropic');
    expect(tierProvider('L2')).toBe('openai');
  });

  it('L1 availability follows ANTHROPIC_API_KEY when Claude-backed, even with no DAYA_L1_URL', () => {
    process.env.DAYA_L1_PROVIDER = 'anthropic';
    expect(tierAvailability().L1).toBe(false);
    process.env.ANTHROPIC_API_KEY = 'k';
    expect(tierAvailability().L1).toBe(true);
  });

  it('L1 availability still follows the self-hosted envs on the default transport', () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    expect(tierAvailability().L1).toBe(false);
    process.env.DAYA_L1_URL = 'http://mock-l1.local';
    process.env.DAYA_L1_MODEL = 'mock-model';
    expect(tierAvailability().L1).toBe(true);
  });
});
