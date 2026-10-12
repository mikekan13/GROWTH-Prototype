/**
 * Table chat fits the local window (2026-10-12): history hygiene, the
 * rolling summary, the budget trim, request_tool's next-round grant and
 * system-block cache stability — through the real dispatchPrompt with the
 * DB, loaders and transport faked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const h = vi.hoisted(() => ({
  callClaude: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  campaign: { name: 'Test', gmUserId: 'gm-1', jewlChatSummary: null as string | null, jewlChatSummaryThrough: null as Date | null },
  campaignUpdate: vi.fn(async () => ({})),
  createLocation: vi.fn(async () => ({ output: { ok: true } })),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    copilotMessage: {
      create: vi.fn(async () => ({ id: 'msg-1' })),
      findMany: vi.fn(async () => h.rows),
    },
    campaign: {
      findUnique: vi.fn(async () => h.campaign),
      update: h.campaignUpdate,
    },
  },
}));
vi.mock('@/services/lawful-intake', () => ({ holdIfUnlawful: vi.fn(async () => ({ blocked: false })) }));
vi.mock('./context-assembler', () => ({
  assembleContext: vi.fn(async () => ({ campaignSummary: 'summary', tableState: '', retrievedData: '', rulesContext: '' })),
}));
vi.mock('./tools/memory', () => ({ loadJewlMemoryForCampaign: vi.fn(async () => []), formatJewlMemoryBlock: vi.fn(() => '') }));
vi.mock('./time-awareness', () => ({ loadTimeAwareness: vi.fn(async () => ({})), formatTimeAwarenessBlock: vi.fn(() => '') }));
vi.mock('./tools', () => {
  const tools = [
    { name: 'npc_speak', description: 'speak', inputSchema: z.object({ content: z.string() }), handler: vi.fn(async () => ({ output: { ok: true } })) },
    { name: 'create_location', description: 'build', inputSchema: z.object({ name: z.string() }), handler: (...a: unknown[]) => h.createLocation(...(a as [])) },
  ];
  return { listJewlTools: () => tools, getJewlTool: (n: string) => tools.find(t => t.name === n) };
});
vi.mock('@/ai/providers/stt', () => ({ transcribeAudio: vi.fn() }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn() }));
vi.mock('../providers/claude-tools', () => ({ callClaudeWithTools: h.callClaude }));
vi.mock('@/ai/network/metering', () => ({ recordAiCall: vi.fn(), estimateUsd: vi.fn(() => 0) }));
vi.mock('@/ai/network/traces', () => ({ recordTrace: vi.fn() }));

import { dispatchPrompt, handleRequestTool } from './runtime';
import { conversationalRows, tableChatHistory, rollSummary, rowsToFold, type ChatRow } from './table-history';
import { trimHistoryToBudget, laneBudget, formatCtxLine, measureCtx } from './dispatch-budget';
import { nextGrants, dispatchKindOf } from './tool-profiles';

const t0 = Date.parse('2026-10-12T12:00:00Z');
const at = (min: number) => new Date(t0 + min * 60_000);
const row = (min: number, role: string, content: string, extra: Partial<ChatRow> = {}): ChatRow => ({
  role, content, username: role === 'assistant' ? null : 'mike', createdAt: at(min), contentClass: 'fiction', icText: null, actions: null, metadata: null, ...extra,
});
const workPrompt = (min: number, content: string) =>
  row(min, 'user', content, { username: '[system]', actions: JSON.stringify({ source: 'JEWL_WORK_CYCLE' }) });

const turn = (blocks: unknown[], stopReason = 'tool_use') => ({
  stopReason, blocks, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
});

function chat(text: string) {
  return dispatchPrompt({ source: 'GM_TEXT', campaignId: 'camp-1', actorId: 'gm-1', actorName: 'Mike', actorRole: 'WATCHER', text });
}

/** findMany returns newest first; the newest row is the prompt the dispatch just saved. */
function setHistory(chrono: ChatRow[]) {
  h.rows = [...chrono, row(999, 'user', 'the prompt')].reverse() as never;
}

beforeEach(() => {
  h.callClaude.mockReset();
  h.callClaude.mockResolvedValue(turn([{ type: 'text', text: 'ok' }], 'end_turn'));
  h.campaign = { name: 'Test', gmUserId: 'gm-1', jewlChatSummary: null, jewlChatSummaryThrough: null };
  h.campaignUpdate.mockClear();
  h.createLocation.mockClear();
  setHistory([]);
});

describe('dispatch kind', () => {
  it('work cycles are WORK_CYCLE (GENESIS when replying as [genesis]); everything else is TABLE_CHAT', () => {
    expect(dispatchKindOf({ source: 'GM_TEXT' })).toBe('TABLE_CHAT');
    expect(dispatchKindOf({ source: 'TABLE_AMBIENT' })).toBe('TABLE_CHAT');
    expect(dispatchKindOf({ source: 'JEWL_WORK_CYCLE' })).toBe('WORK_CYCLE');
    expect(dispatchKindOf({ source: 'JEWL_WORK_CYCLE', replyUsername: '[genesis]' })).toBe('GENESIS');
    expect(dispatchKindOf({ source: 'JEWL_WORK_CYCLE', kind: 'GENESIS' })).toBe('GENESIS');
  });
});

describe('history hygiene', () => {
  it('genesis/work-cycle rows are excluded from table-chat history', () => {
    const rows = [
      row(1, 'user', 'hello'),
      workPrompt(2, 'BRIEF '.repeat(2000)),
      row(3, 'assistant', 'legacy cycle reply'), // unstamped reply right after a brief
      row(4, 'assistant', 'genesis report', { username: '[genesis]' }),
      row(5, 'assistant', 'stamped cycle reply', { metadata: JSON.stringify({ dispatchKind: 'WORK_CYCLE' }) }),
      row(6, 'assistant', 'hi back', { metadata: JSON.stringify({ dispatchKind: 'TABLE_CHAT' }) }),
    ];
    expect(conversationalRows(rows).map(r => r.content)).toEqual(['hello', 'hi back']);
  });

  it('keeps the newest rows by budget and clips long dumps', () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(i, i % 2 ? 'assistant' : 'user', `line ${i} `.repeat(200)));
    const { kept, older } = tableChatHistory(rows, 2_000);
    expect(kept.at(-1)!.content).toContain('line 29');
    expect(kept.length + older.length).toBe(30);
    expect(older.length).toBeGreaterThan(0);
    for (const r of kept) expect(r.content.length).toBeLessThanOrEqual(1_250);
  });

  it('the rolling summary replaces old rows, skips table rows, rolls forward and stays capped', () => {
    const older = [
      row(1, 'user', 'We open at the docks. Rain everywhere.'),
      row(2, 'assistant', 'The harbourmaster owes you money.'),
      row(3, 'user', '[ambient] pass the chips', { username: '[ambient]', contentClass: 'table' }),
    ];
    const s1 = rollSummary(null, older);
    expect(s1).toContain('mike: We open at the docks.');
    expect(s1).toContain('JEWL: The harbourmaster owes you money.');
    expect(s1).not.toContain('chips');
    const s2 = rollSummary(s1, rowsToFold([...older, row(9, 'user', 'Next: the lighthouse.')], at(3)));
    expect(s2.startsWith(s1)).toBe(true);
    expect(s2).toContain('the lighthouse');
    const long = rollSummary(null, Array.from({ length: 100 }, (_, i) => row(i, 'user', `Event number ${i} happened here.`)));
    expect(long.length).toBeLessThanOrEqual(1_200);
    expect(long).toContain('Event number 99');
  });

  it('a table dispatch sends no genesis rows, and stores + injects the summary of aged-out rows', async () => {
    const chatRows = Array.from({ length: 40 }, (_, i) => row(i, i % 2 ? 'assistant' : 'user', `Chat ${i}. ${'x'.repeat(1100)}`));
    setHistory([...chatRows.slice(0, 20), workPrompt(20.5, 'GENESIS BRIEF '.repeat(1000)), ...chatRows.slice(20)]);
    await chat('what now?');
    const call = h.callClaude.mock.calls[0][0];
    const sent = JSON.stringify(call.messages);
    expect(sent).not.toContain('GENESIS BRIEF');
    expect(sent).toContain('Chat 39.');
    expect(sent).not.toContain('Chat 0.');
    expect(call.systemPrompt).toContain('EARLIER TABLE CHAT');
    expect(call.systemPrompt).toContain('mike: Chat 0.');
    expect(h.campaignUpdate).toHaveBeenCalledTimes(1);
    const data = (h.campaignUpdate.mock.calls[0] as unknown as [{ data: { jewlChatSummary: string } }])[0].data;
    expect(data.jewlChatSummary).toContain('Chat 0.');
  });

  it('nothing new aged out → no write', async () => {
    setHistory([row(1, 'user', 'short')]);
    await chat('hi');
    expect(h.campaignUpdate).not.toHaveBeenCalled();
  });
});

describe('budget', () => {
  it('local budget = window − 8k; cloud is unbounded here', () => {
    expect(laneBudget('openai-compat', {})).toBe(32_768 - 8_192);
    expect(laneBudget('anthropic', {})).toBeGreaterThan(100_000);
  });

  it('logs every part and drops the oldest history lines until the total fits', () => {
    const parts = { system: 's'.repeat(3_600), tools: 't'.repeat(3_600), history: Array.from({ length: 10 }, (_, i) => `${i}`.repeat(3_600)), ctx: '', prompt: 'p' };
    const m = measureCtx(parts);
    expect(formatCtxLine('TABLE_CHAT', m, 5_000)).toMatch(/^\[ctx\] kind=TABLE_CHAT system=[\d.]+k tools=[\d.]+k history=[\d.]+k ctx=[\d.]+k total=[\d.]+k budget=5\.0k$/);
    const fit = trimHistoryToBudget(parts, 5_000);
    expect(fit.fits).toBe(true);
    expect(fit.measure.total).toBeLessThanOrEqual(5_000);
    expect(fit.drop).toBeGreaterThan(0);
    expect(fit.drop).toBeLessThan(10);
    // Nothing to trim → reports honestly.
    expect(trimHistoryToBudget({ ...parts, history: [] }, 100).fits).toBe(false);
  });
});

describe('request_tool — the escape hatch', () => {
  it('grants are for the next round, kept only while used, never across dispatches', () => {
    expect(nextGrants([], ['create_location'], ['request_tool'])).toEqual(['create_location']);
    expect(nextGrants(['create_location'], [], ['create_location'])).toEqual(['create_location']);
    expect(nextGrants(['create_location'], [], ['npc_speak'])).toEqual([]);
    expect(handleRequestTool({ name: 'nope' }, ['create_location']).error).toMatch(/not requestable/);
  });

  it('request_tool adds the tool to the NEXT round only; the system block is byte-identical every round', async () => {
    h.callClaude
      .mockResolvedValueOnce(turn([{ type: 'tool_use', id: 'a', name: 'request_tool', input: { name: 'create_location' } }]))
      .mockResolvedValueOnce(turn([{ type: 'tool_use', id: 'b', name: 'create_location', input: { name: 'Tavern' } }]))
      .mockResolvedValueOnce(turn([{ type: 'tool_use', id: 'c', name: 'npc_speak', input: { content: 'hm' } }]))
      .mockResolvedValueOnce(turn([{ type: 'text', text: 'built' }], 'end_turn'));
    const res = await chat('build me a tavern');
    const calls = h.callClaude.mock.calls.map(c => c[0]);
    const toolNames = calls.map(c => (c.tools as Array<{ name: string }>).map(t => t.name));
    expect(toolNames[0]).toEqual(['npc_speak', 'request_tool']);
    expect(toolNames[1]).toEqual(['npc_speak', 'request_tool', 'create_location']);
    expect(toolNames[2]).toEqual(['npc_speak', 'request_tool', 'create_location']); // used last round → kept
    expect(toolNames[3]).toEqual(['npc_speak', 'request_tool']); // unused → dropped
    expect(h.createLocation).toHaveBeenCalledTimes(1);
    expect(res.message).toBe('built');
    expect(new Set(calls.map(c => c.systemPrompt)).size).toBe(1);

    // A fresh dispatch starts without the grant.
    h.callClaude.mockReset();
    h.callClaude.mockResolvedValueOnce(turn([{ type: 'tool_use', id: 'd', name: 'create_location', input: { name: 'X' } }]))
      .mockResolvedValueOnce(turn([{ type: 'text', text: 'no' }], 'end_turn'));
    const again = await chat('again');
    expect(again.toolCalls[0].error).toMatch(/not available/);
    expect(h.createLocation).toHaveBeenCalledTimes(1);
  });

  it('a heavy tool called in the same round as its request is refused (it arrives next round)', async () => {
    h.callClaude
      .mockResolvedValueOnce(turn([
        { type: 'tool_use', id: 'a', name: 'request_tool', input: { name: 'create_location' } },
        { type: 'tool_use', id: 'b', name: 'create_location', input: { name: 'Tavern' } },
      ]))
      .mockResolvedValueOnce(turn([{ type: 'text', text: 'ok' }], 'end_turn'));
    const res = await chat('build');
    expect(res.toolCalls.map(t => [t.name, !!t.error])).toEqual([['request_tool', false], ['create_location', true]]);
    expect(h.createLocation).not.toHaveBeenCalled();
  });

  it('the system block for TABLE_CHAT is byte-identical across two dispatches with the same context', async () => {
    await chat('one');
    await chat('two');
    const [a, b] = h.callClaude.mock.calls.map(c => c[0].systemPrompt);
    expect(a).toBe(b);
  });
});
