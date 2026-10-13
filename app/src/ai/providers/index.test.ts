import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/ai/network/metering', () => ({ recordAiCall: vi.fn(), estimateUsd: vi.fn(() => 0) }));

import { getAIProvider } from './index';
import { PodProvider } from './pod';
import { ClaudeProvider } from './claude';
import { OllamaProvider } from './ollama';

const POD_URL = 'https://api.runpod.ai/v2/testendpoint/openai/v1';
const ENV = ['AI_PROVIDER', 'AI_LOCAL_BASE_URL', 'DAYA_L1_URL', 'AI_LOCAL_MODEL', 'DAYA_L1_MODEL', 'AI_LOCAL_API_KEY', 'DAYA_L1_API_KEY', 'RUNPOD_API_KEY', 'OLLAMA_URL', 'OLLAMA_BASE_URL'];
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const TASK = { caller: 'test', contentClass: 'fiction' as const };

describe('getAIProvider — no local Ollama by default (2026-10-13)', () => {
  it('AI_PROVIDER unset → the pod lane, and the request never touches localhost', async () => {
    process.env.AI_LOCAL_BASE_URL = POD_URL;
    process.env.AI_LOCAL_MODEL = 'growth-local';
    const provider = getAIProvider(TASK);
    expect(provider).toBeInstanceOf(PodProvider);

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ model: 'growth-local', choices: [{ message: { content: 'hello' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const text = await provider.generateText('say hi', { maxTokens: 16 });
    expect(text).toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${POD_URL}/chat/completions`);
    expect(url).not.toMatch(/localhost|127\.0\.0\.1|11434/);
    expect(JSON.parse(String(init.body)).model).toBe('growth-local');
  });

  it('AI_PROVIDER unset and no pod configured → a clear error, no localhost call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(getAIProvider(TASK).generateText('x')).rejects.toThrow(/Local lane not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('AI_PROVIDER=claude → ClaudeProvider; AI_PROVIDER=ollama → OllamaProvider (opt-in)', () => {
    process.env.AI_PROVIDER = 'claude';
    expect(getAIProvider(TASK)).toBeInstanceOf(ClaudeProvider);
    process.env.AI_PROVIDER = 'ollama';
    expect(getAIProvider(TASK)).toBeInstanceOf(OllamaProvider);
  });
});
