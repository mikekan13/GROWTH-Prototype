/**
 * Unit 7 — one audit line per cloud call, none for local, never any text.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('@/ai/network/metering', () => ({ recordAiCall: vi.fn(), estimateUsd: vi.fn(() => 0) }));
vi.mock('@/ai/network/transports/anthropic', async (orig) => {
  const real = await orig<typeof import('../transports/anthropic')>();
  return { ...real, getAnthropicClient: () => ({ messages: { create: h.create } }) };
});

import { routedChatText } from '../chat';
import { WallViolationError } from '../errors';
import { cloudAuditLine } from '../audit';
import type { AnthropicMessagesClient } from '../transports/anthropic';
import { callClaudeWithTools } from '@/ai/providers/claude-tools';

const client = () => ({ messages: { create: h.create } }) as unknown as AnthropicMessagesClient;
const SECRET = 'the lamp-maker Orrin hides the ledger under the third stair';
const LOCAL_VARS = ['AI_LOCAL_BASE_URL', 'DAYA_L1_URL'];
let saved: Record<string, string | undefined> = {};
let info: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;

const lines = (spy: ReturnType<typeof vi.spyOn>, tag: string) =>
  (spy.mock.calls as unknown[][]).map((c) => c.join(' ')).filter((l: string) => l.includes(tag));

beforeEach(() => {
  saved = Object.fromEntries(LOCAL_VARS.map((k) => [k, process.env[k]]));
  for (const k of LOCAL_VARS) delete process.env[k];
  info = vi.spyOn(console, 'info').mockImplementation(() => {});
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  h.create.mockReset();
  h.create.mockResolvedValue({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'ok' }],
    usage: { input_tokens: 2, output_tokens: 1 },
  });
});
afterEach(() => {
  info.mockRestore();
  warn.mockRestore();
  vi.unstubAllGlobals();
  for (const k of LOCAL_VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('[wall→cloud] audit line', () => {
  it('has the grep-able shape', () => {
    expect(cloudAuditLine({ caller: 'c', lane: 'godhead', contentClass: 'fiction', bytesIn: 12, chunksToned: 0 }))
      .toBe('[wall→cloud] caller=c lane=godhead class=fiction bytes_in=12 toned=no chunks_toned=0 campaign=-');
  });

  it('routedChatText: exactly one line per cloud call, with sizes, never text', async () => {
    await routedChatText({ caller: 'unit7', lane: 'godhead', contentClass: 'fiction', campaignId: 'camp-9' }, { system: 'sys', user: SECRET }, { anthropicClient: client() });
    await routedChatText({ caller: 'unit7', lane: 'godhead', contentClass: 'fiction', campaignId: 'camp-9' }, { system: 'sys', user: SECRET }, { anthropicClient: client() });
    const got = lines(info, '[wall→cloud]');
    expect(got).toHaveLength(2);
    expect(got[0]).toContain('caller=unit7');
    expect(got[0]).toContain('class=fiction');
    expect(got[0]).toContain(`bytes_in=${Buffer.byteLength('sys' + SECRET)}`);
    expect(got[0]).toContain('campaign=camp-9');
    expect(got.join('\n')).not.toContain('Orrin');
  });

  it('routedChatText: no line for the local lane', async () => {
    process.env.AI_LOCAL_BASE_URL = 'http://local.test/v1';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: {} }), { status: 200 })));
    await routedChatText({ caller: 'unit7', lane: 'local', contentClass: 'table' }, { system: 'sys', user: 'brb' });
    expect(lines(info, '[wall→cloud]')).toHaveLength(0);
    expect(h.create).not.toHaveBeenCalled();
  });

  it('the tool-use transport: one line per round sent', async () => {
    const opts = {
      systemPrompt: 'sys',
      messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: SECRET }] }],
      tools: [],
      audit: { caller: 'tool-unit7', lane: 'judgment', contentClass: 'fiction' as const, campaignId: 'camp-9', tally: { toned: 2 } },
    };
    await callClaudeWithTools(opts);
    await callClaudeWithTools(opts);
    const got = lines(info, '[wall→cloud]');
    expect(got).toHaveLength(2);
    expect(got[0]).toContain('caller=tool-unit7 lane=judgment class=fiction');
    expect(got[0]).toContain('toned=yes chunks_toned=2');
    expect(got.join('\n')).not.toContain('Orrin');
  });
});

describe('[wall✗] refusal line', () => {
  it('a refused call logs once, names caller + class + reason, never text, never a cloud line', async () => {
    await expect(routedChatText({ caller: 'unit7', lane: 'godhead', contentClass: 'real' }, { system: '', user: SECRET }))
      .rejects.toBeInstanceOf(WallViolationError);
    const got = lines(warn, '[wall✗]');
    expect(got).toEqual(['[wall✗] caller=unit7 class=real reason=no-local-lane']);
    expect(lines(info, '[wall→cloud]')).toHaveLength(0);
  });

  it('a table marker in fiction is refused with its reason', async () => {
    await expect(routedChatText({ caller: 'unit7', lane: 'godhead', contentClass: 'fiction' }, { system: '', user: `[ambient] ${SECRET}` }))
      .rejects.toBeInstanceOf(WallViolationError);
    const got = lines(warn, '[wall✗]');
    expect(got).toHaveLength(1);
    expect(got[0]).toMatch(/^\[wall✗\] caller=unit7 class=fiction reason=table-marker/);
    expect(got[0]).not.toContain('Orrin');
    expect(h.create).not.toHaveBeenCalled();
  });
});
