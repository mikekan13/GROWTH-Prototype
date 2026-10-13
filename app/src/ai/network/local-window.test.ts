import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clampMaxTokens,
  estimateMessagesTokens,
  fitToLocalWindow,
  isRetryableLocalFailure,
  LOCAL_LANE_USER_MESSAGE,
  localMaxModelLen,
  planLocalRequest,
  type LocalMessage,
} from './local-window';

vi.mock('@/lib/lawfulness-hooks', () => ({
  screenModelOutput: async (text: string) => ({ blocked: false, text }),
}));

const chars = (tokens: number) => 'x'.repeat(Math.round((tokens * 3.6) / 1.1));

describe('clamp math', () => {
  it('max_tokens = min(requested, window − prompt − 512)', () => {
    expect(clampMaxTokens(8192, 10_000, 32_768)).toBe(8192);
    expect(clampMaxTokens(8192, 24_577, 32_768)).toBe(32_768 - 24_577 - 512);
  });
  it('window comes from AI_LOCAL_MAX_MODEL_LEN, default 32768', () => {
    expect(localMaxModelLen({})).toBe(32_768);
    expect(localMaxModelLen({ AI_LOCAL_MAX_MODEL_LEN: '16384' })).toBe(16_384);
    expect(localMaxModelLen({ AI_LOCAL_MAX_MODEL_LEN: 'junk' })).toBe(32_768);
  });
});

describe('a 24k prompt + 8k request', () => {
  it('fits: prompt + max_tokens ≤ window − reserve, no trimming needed', () => {
    const msgs: LocalMessage[] = [
      { role: 'system', content: chars(18_600) },
      { role: 'user', content: chars(6_000) },
    ];
    const plan = planLocalRequest(msgs, 8192, { window: 32_768 });
    expect(plan.estPrompt).toBeGreaterThan(24_500);
    expect(plan.trimmed).toBeUndefined();
    expect(plan.clampedFrom).toBe(8192);
    expect(plan.estPrompt + plan.maxTokens).toBeLessThanOrEqual(32_768 - 512);
    expect(plan.maxTokens).toBeGreaterThanOrEqual(1024);
  });
});

describe('trim order', () => {
  const build = (): LocalMessage[] => [
    { role: 'system', content: chars(20_000) },
    { role: 'user', content: chars(3_000) },                       // old history
    { role: 'assistant', content: null, tool_calls: [{ function: { name: 'read', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'a', content: chars(3_000) },     // old tool result
    { role: 'assistant', content: chars(1_000) },
    { role: 'user', content: chars(2_000) },                       // NEWEST user
    { role: 'assistant', content: null, tool_calls: [{ function: { name: 'look', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'b', content: chars(5_000) },     // current-round tool result
  ];

  it('drops oldest history first, keeping system + newest user untouched', () => {
    const msgs = build();
    const budget = estimateMessagesTokens(msgs) - 5_000;
    const fit = fitToLocalWindow(msgs, budget);
    expect(fit.fits).toBe(true);
    expect(fit.droppedMsgs).toBeGreaterThan(0);
    expect(fit.messages[0]).toEqual(msgs[0]);
    expect(fit.messages.find(m => m.role === 'user')?.content).toBe(msgs[5].content);
    // History went before any tool result was shortened.
    expect(fit.messages.every(m => typeof m.content !== 'string' || !m.content.includes('[trimmed'))).toBe(true);
    // No orphan tool message left at the head of the history.
    expect(fit.messages[1].role).not.toBe('tool');
  });

  it('then ellipsises tool results — never the system block or newest user', () => {
    const msgs = build();
    const fit = fitToLocalWindow(msgs, 24_000);
    expect(fit.fits).toBe(true);
    expect(fit.messages[0].content).toBe(msgs[0].content);
    const users = fit.messages.filter(m => m.role === 'user');
    expect(users).toHaveLength(1);
    expect(users[0].content).toBe(msgs[5].content);
    const tool = fit.messages.find(m => m.role === 'tool')!;
    expect(tool.content).toContain('[trimmed');
    expect(fit.trimmedChars).toBeGreaterThan(0);
  });

  it('a prompt leaving < 1024 output tokens is trimmed before clamping', () => {
    const msgs = build();
    const plan = planLocalRequest(msgs, 8192, { window: 32_768 });
    expect(plan.trimmed).toBeDefined();
    expect(plan.maxTokens).toBeGreaterThanOrEqual(1024);
    expect(plan.estPrompt + plan.maxTokens).toBeLessThanOrEqual(32_768 - 512);
  });
});

describe('over budget after every trim', () => {
  it('sends with the minimum useful output instead of a useless max_tokens', () => {
    const msgs: LocalMessage[] = [
      { role: 'system', content: chars(31_000) },
      { role: 'user', content: chars(500) },
    ];
    const plan = planLocalRequest(msgs, 8192, { window: 32_768 });
    expect(plan.overBudget).toBe(true);
    expect(plan.maxTokens).toBe(1024);
    expect(plan.messages[0].content).toBe(msgs[0].content);
  });
});

describe('upstream failure classification', () => {
  it('HTML proxy body and vLLM context-length 400 are retryable; plain JSON errors are not', () => {
    expect(isRetryableLocalFailure(502, '<!DOCTYPE html><html>…')).toBe(true);
    expect(isRetryableLocalFailure(400, '{"error":"maximum context length is 32768 tokens"}')).toBe(true);
    expect(isRetryableLocalFailure(401, '{"error":"unauthorized"}')).toBe(false);
  });
});

describe('transports: HTML error body → clear message + exactly one retry', () => {
  afterEach(() => vi.unstubAllGlobals());

  const html = () => new Response('<!DOCTYPE html><html>502 Bad Gateway</html>', { status: 502 });
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it('openAiCompatChat retries once with a harder trim and succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(html()).mockResolvedValueOnce(
      ok({ choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { openAiCompatChat } = await import('./transports/openai-compat');
    const res = await openAiCompatChat({
      baseUrl: 'http://x', model: 'm', maxTokens: 8192,
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: chars(9_000) },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: 'newest' },
      ],
    });
    expect(res.text).toBe('hi');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(second.messages.at(-1).content).toBe('newest');
    expect(second.messages[0].content).toBe('sys');
  });

  it('callLocalWithTools gives up after ONE retry with the honest LocalLaneError', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => html());
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { callLocalWithTools } = await import('../providers/local-tools');
    const err = await callLocalWithTools({
      baseUrl: 'http://x', model: 'm', systemPrompt: 'sys', tools: [], maxTokens: 8192,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    } as unknown as Parameters<typeof callLocalWithTools>[0]).catch(e => e);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(err.name).toBe('LocalLaneError');
    expect(err.message).toBe('Local lane upstream error (502) — likely request too large or worker restarting');
    expect(err.userMessage).toBe(LOCAL_LANE_USER_MESSAGE);
    expect(err.status).toBe(502);
  });
});
