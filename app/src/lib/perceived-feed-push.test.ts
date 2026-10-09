/** Perception hardening: a memory write pushes a text-free re-read to that character's readers only. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sent = vi.hoisted(() => [] as Array<{ campaignId: string; data: unknown; target?: string }>);
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn((campaignId: string, data: unknown, target?: string) => { sent.push({ campaignId, data, target }); }) }));
vi.mock('@/lib/db', () => ({
  prisma: {
    dayaEntity: {
      findUnique: async ({ where }: { where: { id: string } }) => ({
        'ent-v': { characterId: 'violet', character: { userId: 'p1', campaignId: 'c1', campaign: { gmUserId: 'gm' } } },
        'ent-r': { characterId: 'ruth', character: { userId: 'gm', campaignId: 'c1', campaign: { gmUserId: 'gm' } } },
        'ent-x': { characterId: 'loose', character: { userId: 'p9', campaignId: null, campaign: null } },
      } as Record<string, unknown>)[where.id] ?? null,
    },
  },
}));

const { pushMemoryWrittenNow, notifyMemoryWritten, PUSH_COALESCE_MS } = await import('./perceived-feed-push');

beforeEach(() => { sent.length = 0; });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('perceived-feed push', () => {
  it('goes to the owner and the campaign\'s Watcher, each alone, carrying only the character id', async () => {
    await pushMemoryWrittenNow('ent-v');
    expect(sent).toEqual([
      { campaignId: 'c1', data: { kind: 'perceived_feed_stale', characterId: 'violet' }, target: 'p1' },
      { campaignId: 'c1', data: { kind: 'perceived_feed_stale', characterId: 'violet' }, target: 'gm' },
    ]);
  });

  it('an NPC (owned by the GM) → one push; a character in no campaign → none', async () => {
    await pushMemoryWrittenNow('ent-r');
    expect(sent.map((s) => s.target)).toEqual(['gm']);
    sent.length = 0;
    await pushMemoryWrittenNow('ent-x');
    expect(sent).toEqual([]);
  });

  it('writes in one moment coalesce to one push; flag OFF → nothing at all', async () => {
    vi.useFakeTimers();
    vi.stubEnv('PERCEPTION_FEED', 'on');
    notifyMemoryWritten('ent-v'); notifyMemoryWritten('ent-v'); notifyMemoryWritten('ent-v');
    await vi.advanceTimersByTimeAsync(PUSH_COALESCE_MS + 10);
    expect(sent).toHaveLength(2); // owner + Watcher, once
    sent.length = 0;
    vi.stubEnv('PERCEPTION_FEED', '');
    vi.stubEnv('NEXT_PUBLIC_PERCEPTION_FEED', '');
    notifyMemoryWritten('ent-v');
    await vi.advanceTimersByTimeAsync(PUSH_COALESCE_MS + 10);
    expect(sent).toEqual([]);
  });
});
