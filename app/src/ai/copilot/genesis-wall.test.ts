/**
 * Genesis crosses only through the wall (unit 5, Mike 2026-10-12).
 *
 * The path under test is the real one: buildGenesisPlan (the brief that
 * carries the backstory) → buildWorkCycleText (what one work cycle hands
 * JEWL) → dispatchPrompt (source JEWL_WORK_CYCLE, class fiction) → route()
 * → toneFilter → assertNoTableContent → the tool-use transport. Only the DB,
 * the context loaders and the transport are faked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  callClaude: vi.fn(),
  toned: [] as string[],
  tableState: '',
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    copilotMessage: {
      create: vi.fn(async () => ({ id: 'msg-1' })),
      findMany: vi.fn(async () => []),
    },
    campaign: { findUnique: vi.fn(async () => ({ name: 'Test', gmUserId: 'gm-1' })) },
  },
}));
vi.mock('./context-assembler', () => ({
  assembleContext: vi.fn(async () => ({ campaignSummary: 'summary', tableState: h.tableState, retrievedData: '', rulesContext: '' })),
}));
vi.mock('./tools/memory', () => ({
  loadJewlMemoryForCampaign: vi.fn(async () => []),
  formatJewlMemoryBlock: vi.fn(() => ''),
}));
vi.mock('./time-awareness', () => ({
  loadTimeAwareness: vi.fn(async () => ({})),
  formatTimeAwarenessBlock: vi.fn(() => ''),
}));
vi.mock('./tools', () => ({ listJewlTools: () => [], getJewlTool: () => undefined }));
vi.mock('./prompts/system', () => ({
  buildJewlSystemPrompt: () => 'SYSTEM',
  formatToolErrorAsRupture: (m: string) => m,
  DEFAULT_REGISTER: {},
}));
vi.mock('@/ai/providers/stt', () => ({ transcribeAudio: vi.fn() }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn() }));
vi.mock('../providers/claude-tools', () => ({ callClaudeWithTools: h.callClaude }));
vi.mock('@/ai/network/metering', () => ({ recordAiCall: vi.fn(), estimateUsd: vi.fn(() => 0) }));
vi.mock('@/ai/network/traces', () => ({ recordTrace: vi.fn() }));
vi.mock('@/ai/network/tone-filter', () => ({
  toneFilter: (t: string) => { h.toned.push(t); return t; },
  // Stand-in softening: proves the sent text is the filter's output.
  toneFilterAsync: async (t: string) => { h.toned.push(t); return t.replace(/GRAPHIC/g, 'SOFTENED'); },
}));

import { dispatchPrompt } from './runtime';
import { buildWorkCycleText } from './work-cycle-text';
import { buildGenesisPlan } from '@/services/character-genesis-plan';
import { WallViolationError, workCycleLane, resolveLane } from '@/ai/network';

const LOCAL_VARS = ['AI_LOCAL_BASE_URL', 'DAYA_L1_URL', 'JEWL_WORK_CYCLE_LANE', 'AI_JUDGMENT_MODEL', 'ANTHROPIC_MODEL'];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(LOCAL_VARS.map((k) => [k, process.env[k]]));
  for (const k of LOCAL_VARS) delete process.env[k];
  h.callClaude.mockReset();
  h.callClaude.mockResolvedValue({
    stopReason: 'end_turn',
    blocks: [{ type: 'text', text: 'working' }],
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
  });
  h.toned.length = 0;
  h.tableState = '';
});
afterEach(() => {
  for (const k of LOCAL_VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const BACKSTORY = 'Mara grew up on the salt flats, apprenticed to a lamp-maker until the fire took the shop and her brother with it.';

function genesisCycle(backstory: string) {
  const plan = buildGenesisPlan({ backstory }, 'Mara', 'char-1');
  const text = buildWorkCycleText(
    { id: 'ws-1', goal: 'Character genesis: Mara [char-1]', plan, cycleCount: 0 },
    '',
    [],
  );
  return dispatchPrompt({
    source: 'JEWL_WORK_CYCLE',
    campaignId: 'camp-1',
    actorId: 'jewl',
    actorName: 'JEWL',
    actorRole: 'GODHEAD',
    text,
  });
}

describe('genesis work cycles cross only through the wall', () => {
  it('the work-cycle lane stays Sonnet (judgment) — cloud = Soul does the heavy lifting', () => {
    expect(workCycleLane()).toBe('judgment');
    expect(resolveLane(workCycleLane()).model).toMatch(/sonnet/);
  });

  it('the backstory reaches cloud only after toneFilter', async () => {
    await genesisCycle(BACKSTORY);
    expect(h.callClaude).toHaveBeenCalledTimes(1);
    expect(h.toned.some((t) => t.includes(BACKSTORY))).toBe(true);
    const sent = JSON.stringify(h.callClaude.mock.calls[0][0].messages);
    expect(sent).toContain('salt flats');
  });

  it.each([
    ['an [ambient] line', `${BACKSTORY}\n[ambient] pass the chips, my mom is calling`],
    ['a pasted table row', `${BACKSTORY}\n{"username":"x","content":"y","source":"TABLE_AMBIENT"}`],
  ])('a genesis plan carrying %s cannot reach cloud', async (_label, backstory) => {
    await expect(genesisCycle(backstory)).rejects.toBeInstanceOf(WallViolationError);
    expect(h.callClaude).not.toHaveBeenCalled();
  });

  it('a table row in the system context block is withheld before cloud', async () => {
    h.tableState = ['Mara: HP 9/12, at the lamp shop', '[ambient] my kid just got home, one sec', 'Orrin: asleep'].join('\n');
    await genesisCycle(BACKSTORY);
    expect(h.callClaude).toHaveBeenCalledTimes(1);
    const system: string = h.callClaude.mock.calls[0][0].systemPrompt;
    expect(system).not.toContain('my kid');
    expect(system).toContain('[withheld: table talk]');
    expect(system).toContain('Orrin: asleep');
  });

  it('a graphic passage in the system context block crosses toned', async () => {
    h.tableState = 'Mara: scarred — GRAPHIC detail of the burn';
    await genesisCycle(BACKSTORY);
    expect(h.toned.some((t) => t.includes('GRAPHIC detail of the burn'))).toBe(true);
    const system: string = h.callClaude.mock.calls[0][0].systemPrompt;
    expect(system).toContain('SOFTENED detail of the burn');
    expect(system).not.toContain('GRAPHIC');
  });
});
