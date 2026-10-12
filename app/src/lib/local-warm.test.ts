import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { warmLocalLane, _resetLocalWarm } from './local-warm';

describe('warmLocalLane', () => {
  const saved = { ...process.env };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    _resetLocalWarm();
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, body: null });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    process.env.AI_LOCAL_BASE_URL = 'https://example.test/v1/';
    process.env.AI_LOCAL_MODEL = 'growth-local';
    process.env.AI_LOCAL_API_KEY = 'k';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = { ...saved };
  });

  it('is a no-op when AI_LOCAL_BASE_URL is unset', () => {
    delete process.env.AI_LOCAL_BASE_URL;
    warmLocalLane('c1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends one minimal chat request', () => {
    warmLocalLane('c1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/v1/chat/completions');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('growth-local');
    expect(body.max_tokens).toBe(1);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(init.headers.Authorization).toBe('Bearer k');
  });

  it('dedupes per campaign within 10 minutes', () => {
    const t0 = 1_000_000;
    warmLocalLane('c1', t0);
    warmLocalLane('c1', t0 + 5 * 60_000);
    warmLocalLane('c2', t0 + 5 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    warmLocalLane('c1', t0 + 10 * 60_000 + 1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('swallows fetch failures', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    expect(() => warmLocalLane('c1')).not.toThrow();
    await new Promise(r => setTimeout(r, 0));
  });

  it('swallows a synchronous fetch throw', () => {
    fetchMock.mockImplementationOnce(() => { throw new Error('sync'); });
    expect(() => warmLocalLane('c1')).not.toThrow();
  });
});
