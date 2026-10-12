/** sketch_npc JEWL tool: registered, delegates to startSketch with the dispatch's actor, returns id + one line. */
import { describe, it, expect, vi } from 'vitest';

const startSketch = vi.fn(async () => ({ characterId: 'npc-1', status: 'PENDING' as const }));
vi.mock('@/services/sketch-genesis', () => ({ startSketch: (...a: unknown[]) => startSketch(...(a as [])) }));

const { sketchNpcTool } = await import('./sketch-npc');
const { getJewlTool } = await import('./registry');

describe('sketch_npc', () => {
  it('is registered and hands the Watcher\'s identity + seed text to the service', async () => {
    expect(getJewlTool('sketch_npc')).toBe(sketchNpcTool);
    const res = await sketchNpcTool.handler({ seedText: 'a grumpy innkeeper' }, { campaignId: 'c1', actorId: 'gm', actorRole: 'WATCHER' });
    expect(startSketch).toHaveBeenCalledWith('c1', { id: 'gm', role: 'WATCHER' }, { seedText: 'a grumpy innkeeper' });
    expect(res.output).toMatchObject({ ok: true, characterId: 'npc-1', status: 'PENDING' });
    expect(String((res.output as { summary: string }).summary)).toMatch(/grumpy innkeeper/);
  });

  it('rejects an empty seed before calling the service', async () => {
    startSketch.mockClear();
    await expect(sketchNpcTool.handler({ seedText: '' }, { campaignId: 'c1', actorId: 'gm', actorRole: 'WATCHER' })).rejects.toThrow();
    expect(startSketch).not.toHaveBeenCalled();
  });
});
