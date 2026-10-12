/**
 * A god-head's tool loop crosses to Claude only through the wall (unit 6):
 * route() picks the lane, and a trigger carrying table content never reaches
 * the tool-use transport.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ callClaude: vi.fn() }));

vi.mock('@/lib/db', () => ({
  prisma: {
    godHeadInvocation: { create: vi.fn(async () => ({ id: 'inv-1' })), update: vi.fn(async () => ({})) },
    godHeadMemory: { findMany: vi.fn(async () => []) },
    godHeadTokenUsage: { create: vi.fn(async () => ({})) },
    godHeadActionLog: { create: vi.fn(async () => ({})) },
  },
}));
vi.mock('@/ai/providers/claude-tools', () => ({ callClaudeWithTools: h.callClaude }));

import { GodHeadAgent } from './agent';

const identity = {
  id: 'gh-1', name: 'Kai', domain: 'balance', pillar: 'Soul', systemPrompt: 'You are Kai.',
  temperature: 0.5, defaultModel: null, walletId: null, characterId: 'c-1',
};

beforeEach(() => {
  delete process.env.AI_LOCAL_BASE_URL;
  delete process.env.DAYA_L1_URL;
  h.callClaude.mockReset();
  h.callClaude.mockResolvedValue({
    stopReason: 'end_turn',
    blocks: [{ type: 'text', text: 'done' }],
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
  });
});

describe('GodHeadAgent — through the wall', () => {
  it('a fiction trigger runs on the cloud tool transport', async () => {
    const res = await new GodHeadAgent(identity).invoke('goal_created', { goal: 'Find the lost bell' });
    expect(res.status).toBe('DONE');
    expect(h.callClaude).toHaveBeenCalledTimes(1);
  });

  it('a trigger carrying an [ambient] line never reaches the transport', async () => {
    const res = await new GodHeadAgent(identity).invoke('goal_created', { goal: '[ambient] my phone is dying' });
    expect(res.status).toBe('FAILED');
    expect(h.callClaude).not.toHaveBeenCalled();
  });
});
