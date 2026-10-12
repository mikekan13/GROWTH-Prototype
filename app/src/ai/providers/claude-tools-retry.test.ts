/**
 * The JEWL tool-loop round backs off on a 429 instead of failing the
 * dispatch (perf pass 2026-10-12).
 */
import { describe, it, expect, vi } from 'vitest';

const create = vi.fn();
vi.mock('@/ai/network/transports/anthropic', () => ({ getAnthropicClient: () => ({ messages: { create } }) }));
vi.mock('@/ai/network/config', () => ({ judgmentModel: () => 'test-model' }));
vi.mock('@/ai/network/audit', () => ({ auditCloudCall: vi.fn(), utf8Bytes: () => 0 }));
vi.mock('@/ai/network/retry', async (orig) => {
  const real = await orig<typeof import('@/ai/network/retry')>();
  // Same policy, no real waiting.
  return { ...real, withTransientRetry: <T>(fn: () => Promise<T>, o: object = {}) => real.withTransientRetry(fn, { ...o, sleep: async () => {} }) };
});

import { callClaudeWithTools } from './claude-tools';

describe('callClaudeWithTools', () => {
  it('a mocked 429 then success → the round succeeds; SDK retries off', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    create
      .mockRejectedValueOnce(Object.assign(new Error('429 Too Many Requests'), { status: 429 }))
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 1, output_tokens: 1 } });
    const r = await callClaudeWithTools({
      systemPrompt: 'sys', messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }], tools: [],
      audit: { caller: 't', lane: 'cloud', contentClass: 'FICTION' as never },
    });
    expect(r.blocks).toEqual([{ type: 'text', text: 'hi' }]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0][1]).toMatchObject({ maxRetries: 0 });
    // The cached prefix is untouched: system block still carries cache_control.
    expect(create.mock.calls[1][0].system[0].cache_control).toEqual({ type: 'ephemeral' });
  });
});
