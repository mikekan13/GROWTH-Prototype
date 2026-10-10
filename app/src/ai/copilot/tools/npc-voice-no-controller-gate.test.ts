/**
 * The AI/GM controller toggle is gone (Mike 2026-10-09; table-rhythm ruling 3:
 * every entity runs the loop, GM voicing = override). npc_speak / npc_act must
 * voice an NPC whatever its old GodHead.aiActionMode says, and must not
 * require a GodHead row at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const npc = { id: 'npc1', name: 'Ruth', entityType: 'NPC', campaignId: 'camp1', status: 'ACTIVE' };
const godHeadFindFirst = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    character: { findUnique: vi.fn(async () => npc) },
    godHead: { findFirst: godHeadFindFirst },
  },
}));
vi.mock('@/services/campaign-event', () => ({
  createCampaignEvent: vi.fn(async () => ({ id: 'ev1' })),
}));
vi.mock('@/ai/copilot/jewl-identity', () => ({
  getJewlGodHead: vi.fn(async () => ({ characterUserId: 'jewl-user' })),
}));
vi.mock('./registry', () => ({ registerJewlTool: vi.fn() }));
vi.mock('./resolve-character', () => ({ resolveCharacterRef: vi.fn() }));

const { npcSpeakTool } = await import('./npc-speak');
const { npcActTool } = await import('./actors');
const ctx = { campaignId: 'camp1' } as never;

beforeEach(() => { godHeadFindFirst.mockReset(); });

describe('npc voicing ignores the removed controller setting', () => {
  for (const godhead of [null, { aiActionMode: false, name: 'Ruth' }]) {
    const label = godhead ? 'aiActionMode=false (old "GM" setting)' : 'no GodHead row';
    it(`npc_speak voices the NPC with ${label}`, async () => {
      godHeadFindFirst.mockResolvedValue(godhead);
      const res = await npcSpeakTool.handler({ npcCharacterId: 'npc1', content: 'Hello.' }, ctx);
      expect(res.output).toMatchObject({ eventId: 'ev1', npcCharacterId: 'npc1', spoke: 'Hello.' });
    });
    it(`npc_act acts for the NPC with ${label}`, async () => {
      godHeadFindFirst.mockResolvedValue(godhead);
      const res = await npcActTool.handler({ npcCharacterId: 'npc1', action: 'Ruth looks up.' }, ctx);
      expect(res.output).toMatchObject({ eventId: 'ev1', npcCharacterId: 'npc1', action: 'Ruth looks up.' });
    });
  }
});
