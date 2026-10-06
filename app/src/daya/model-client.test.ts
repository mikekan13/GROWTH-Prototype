/**
 * WP14 — unit tests for the L1/L2 auth header + cold-start timeout behavior
 * in model-client.ts. Exercises callOpenAiCompatible() directly (exported
 * for exactly this reason) so these stay DB-free — chat()'s
 * prisma.dayaModelCall.create() write is out of scope here and covered by
 * the scripts/test-daya-wp*.ts acceptance scripts against a real DB instead.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { callOpenAiCompatible, parseSseLines, tierProvider, tierAvailability, DayaWarmingTimeoutError, type DayaFetch } from './model-client';

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

// ── U2b-1: streaming ──────────────────────────────────────────────────────

const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
const piece = (content: string) => sse({ choices: [{ delta: { content } }], usage: null });
const usageChunk = (prompt_tokens: number, completion_tokens: number) => sse({ choices: [], usage: { prompt_tokens, completion_tokens } });

function streamOf(chunks: string[], opts: { hangAfter?: boolean; signal?: AbortSignal } = {}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) { controller.enqueue(encoder.encode(chunks[i++])); return; }
      if (!opts.hangAfter) { controller.close(); return; }
      return new Promise<void>((_resolve, reject) => {
        opts.signal?.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })));
      });
    },
  });
}

function streamResponse(chunks: string[], opts: { hangAfter?: boolean; signal?: AbortSignal } = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => { throw new Error('a streamed call must not read json()'); },
    text: async () => '',
    body: streamOf(chunks, opts),
  };
}

describe('parseSseLines', () => {
  it('reads text pieces, the usage chunk and [DONE]', () => {
    const { events, rest } = parseSseLines(piece('Who') + piece(' is') + usageChunk(900, 2) + 'data: [DONE]\n\n');
    expect(events).toEqual([{ delta: 'Who' }, { delta: ' is' }, { usage: { tokensIn: 900, tokensOut: 2 } }, { done: true }]);
    expect(rest).toBe('');
  });
  it('hands back a line cut mid-chunk and finishes it on the next call', () => {
    const whole = piece('there?');
    const first = parseSseLines(whole.slice(0, 20));
    expect(first.events).toEqual([]);
    expect(parseSseLines(first.rest + whole.slice(20)).events).toEqual([{ delta: 'there?' }]);
  });
  it('ignores comments, other fields, role-only and reasoning-only chunks, and broken JSON', () => {
    const text = [
      ': keep-alive',
      'event: message',
      sse({ choices: [{ delta: { role: 'assistant' } }] }).trim(),
      sse({ choices: [{ delta: { reasoning_content: 'thinking…' } }] }).trim(),
      'data: {not json',
      sse({ choices: [{ delta: { content: 'ok' } }] }).trim(),
      '',
    ].join('\r\n');
    expect(parseSseLines(text).events).toEqual([{ delta: 'ok' }]);
  });
  it('surfaces an error chunk', () => {
    expect(parseSseLines(sse({ error: { message: 'worker died' } })).events[0].error).toContain('worker died');
  });
});

describe('callOpenAiCompatible — streamed', () => {
  const savedEnv = { ...process.env };
  beforeEach(() => {
    process.env.DAYA_L1_URL = 'http://mock-l1.local';
    process.env.DAYA_L1_MODEL = 'mock-model';
    delete process.env.DAYA_L1_TIMEOUT_MS;
    delete process.env.DAYA_DISABLE_THINKING;
  });
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('a call with no onToken sends neither stream nor stop (the request is unchanged)', async () => {
    let sent: Record<string, unknown> = {};
    const fetchImpl: DayaFetch = async (_url, init) => { sent = JSON.parse(init.body); return okResponse('plain'); };
    const result = await callOpenAiCompatible('L1', BASE_PARAMS, fetchImpl);
    expect(Object.keys(sent).sort()).toEqual(['chat_template_kwargs', 'max_tokens', 'messages', 'model', 'temperature']);
    expect(result).toEqual({ text: 'plain', tokensIn: 1, tokensOut: 1, model: 'mock-model' });
  });

  it('asks for a stream with usage, keeps thinking off and the system-only demotion, and passes stop through', async () => {
    let sent: Record<string, unknown> = {};
    const fetchImpl: DayaFetch = async (_url, init) => { sent = JSON.parse(init.body); return streamResponse([piece('hi'), 'data: [DONE]\n\n']); };
    await callOpenAiCompatible('L1', { ...BASE_PARAMS, messages: [{ role: 'system', content: 'be her' }], stop: ['\n'], onToken: () => {} }, fetchImpl);
    expect(sent.stream).toBe(true);
    expect(sent.stream_options).toEqual({ include_usage: true });
    expect(sent.stop).toEqual(['\n']);
    expect(sent.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(sent.messages).toEqual([{ role: 'user', content: 'be her' }]);
  });

  it('delivers pieces in order as they arrive, across awkward chunk boundaries, and meters from the usage chunk', async () => {
    const wire = piece('Who') + piece(' is') + piece(' there?') + usageChunk(912, 4) + 'data: [DONE]\n\n';
    const chunks = [wire.slice(0, 17), wire.slice(17, 90), wire.slice(90)];
    const seen: string[] = [];
    const result = await callOpenAiCompatible('L1', { ...BASE_PARAMS, onToken: (d) => { seen.push(d); } }, async () => streamResponse(chunks));
    expect(seen).toEqual(['Who', ' is', ' there?']);
    expect(result).toMatchObject({ text: 'Who is there?', tokensIn: 912, tokensOut: 4, model: 'mock-model', stopped: false });
    expect(result.ttftMs).toBeGreaterThanOrEqual(0);
  });

  it('a final line with no trailing newline is still read', async () => {
    const result = await callOpenAiCompatible('L1', { ...BASE_PARAMS, onToken: () => {} }, async () => streamResponse([piece('end').trimEnd()]));
    expect(result.text).toBe('end');
  });

  it('onToken returning false stops the generation; what arrived is kept and still metered', async () => {
    const seen: string[] = [];
    const result = await callOpenAiCompatible(
      'L1',
      { ...BASE_PARAMS, onToken: (d) => { seen.push(d); return seen.length === 2 ? false : undefined; } },
      async () => streamResponse([piece('one'), piece(' two'), piece(' three'), usageChunk(10, 3)]),
    );
    expect(seen).toEqual(['one', ' two']);
    expect(result).toMatchObject({ text: 'one two', stopped: true, tokensIn: 0, tokensOut: 2 });
  });

  it('an error chunk mid-stream fails the call', async () => {
    await expect(
      callOpenAiCompatible('L1', { ...BASE_PARAMS, onToken: () => {} }, async () => streamResponse([piece('half'), sse({ error: 'worker died' })])),
    ).rejects.toThrow(/worker died/);
  });

  it('the timeout keeps running while the body is still arriving', async () => {
    process.env.DAYA_L1_TIMEOUT_MS = '40';
    const fetchImpl: DayaFetch = async (_url, init) => streamResponse([piece('half')], { hangAfter: true, signal: init.signal });
    await expect(callOpenAiCompatible('L1', { ...BASE_PARAMS, onToken: () => {} }, fetchImpl)).rejects.toBeInstanceOf(DayaWarmingTimeoutError);
  });

  it('a transport with no readable body falls back to one whole piece', async () => {
    const seen: string[] = [];
    const result = await callOpenAiCompatible('L1', { ...BASE_PARAMS, onToken: (d) => { seen.push(d); } }, async () => okResponse('whole line'));
    expect(seen).toEqual(['whole line']);
    expect(result.text).toBe('whole line');
  });
});
