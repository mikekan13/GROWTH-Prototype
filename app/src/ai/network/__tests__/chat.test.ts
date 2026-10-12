import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/ai/network/metering', () => ({ recordAiCall: vi.fn(), estimateUsd: vi.fn(() => 0) }));

import { routedChatText } from '../chat';
import { WallViolationError } from '../errors';
import type { AnthropicMessagesClient } from '../transports/anthropic';

const LOCAL_VARS = ['AI_LOCAL_BASE_URL', 'DAYA_L1_URL'];
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = Object.fromEntries(LOCAL_VARS.map((k) => [k, process.env[k]]));
  for (const k of LOCAL_VARS) delete process.env[k];
});
afterEach(() => {
  for (const k of LOCAL_VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function fakeClient() {
  const create = vi.fn(async () => ({
    content: [{ type: 'text', text: 'ok' }],
    usage: { input_tokens: 3, output_tokens: 1 },
  }));
  return { client: { messages: { create } } as unknown as AnthropicMessagesClient, create };
}

describe('routedChatText — the routed door', () => {
  it('carries a multi-turn fiction conversation (with an image) to the cloud lane', async () => {
    const { client, create } = fakeClient();
    const res = await routedChatText(
      { caller: 't', lane: 'godhead', contentClass: 'fiction' },
      {
        system: 'sys',
        messages: [
          { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA' } }, { type: 'text', text: 'a ruined keep' }] },
          { role: 'assistant', content: 'noted' },
          { role: 'user', content: 'go on' },
        ],
      },
      { anthropicClient: client },
    );
    expect(res.text).toBe('ok');
    expect(res.lane.crossesWall).toBe(true);
    const sent = (create.mock.calls[0] as unknown[])[0] as { messages: unknown[] };
    expect(sent.messages).toHaveLength(3);
    expect(JSON.stringify(sent.messages)).toContain('a ruined keep');
  });

  it.each(['table', 'real'] as const)('%s never reaches the client when no local lane is live', async (c) => {
    const { client, create } = fakeClient();
    await expect(routedChatText({ caller: 't', lane: 'godhead', contentClass: c }, { system: '', user: 'hi' }, { anthropicClient: client }))
      .rejects.toBeInstanceOf(WallViolationError);
    expect(create).not.toHaveBeenCalled();
  });

  it('fiction carrying an [ambient] line is refused before the client', async () => {
    const { client, create } = fakeClient();
    await expect(routedChatText(
      { caller: 't', lane: 'godhead', contentClass: 'fiction' },
      { system: '', messages: [{ role: 'user', content: 'scene\n[ambient] my kid is home' }] },
      { anthropicClient: client },
    )).rejects.toBeInstanceOf(WallViolationError);
    expect(create).not.toHaveBeenCalled();
  });
});
