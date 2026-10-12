/**
 * DAYA's tiered client crosses to Claude only through the wall (unit 6):
 * the Claude-backed path is routedChatText, decided by the content class.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: { dayaModelCall: { create: vi.fn(async () => ({})) } } }));
vi.mock('@/ai/network/metering', () => ({ recordAiCall: vi.fn(), estimateUsd: vi.fn(() => 0) }));

import { chat, type AnthropicLike } from './model-client';
import { WallViolationError } from '@/ai/network';

const VARS = ['AI_LOCAL_BASE_URL', 'DAYA_L1_URL', 'DAYA_L1_PROVIDER'];
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
  for (const k of VARS) delete process.env[k];
});
afterEach(() => {
  for (const k of VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function fake() {
  const create = vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 2, output_tokens: 1 } }));
  return { client: { messages: { create } } as unknown as AnthropicLike, create };
}

describe('model-client — the Claude tier goes through route()', () => {
  it('fiction on tier C reaches the client', async () => {
    const { client, create } = fake();
    const res = await chat({ tier: 'C', subsystem: 't', contentClass: 'fiction', messages: [{ role: 'user', content: 'the keep at dusk' }] }, { anthropicClient: client });
    expect(res.text).toBe('ok');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it.each(['table', 'real'] as const)('%s on tier C never reaches the client (no local lane → refused)', async (c) => {
    const { client, create } = fake();
    await expect(chat({ tier: 'C', subsystem: 't', contentClass: c, messages: [{ role: 'user', content: 'brb' }] }, { anthropicClient: client }))
      .rejects.toBeInstanceOf(WallViolationError);
    expect(create).not.toHaveBeenCalled();
  });

  it('a Claude-backed L1 tier is gated the same way', async () => {
    process.env.DAYA_L1_PROVIDER = 'anthropic';
    const { client, create } = fake();
    await expect(chat({ tier: 'L1', subsystem: 't', contentClass: 'table', messages: [{ role: 'user', content: 'brb' }] }, { anthropicClient: client }))
      .rejects.toBeInstanceOf(WallViolationError);
    expect(create).not.toHaveBeenCalled();
  });
});
