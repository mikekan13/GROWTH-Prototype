/** POST /npcs/sketch → 202 + characterId at once; GET .../status flips PENDING → DONE (2026-10-12). */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  user: { id: 'gm', role: 'WATCHER', username: 'gm' },
  created: [] as Array<Record<string, unknown>>,
  release: null as null | (() => void),
}));

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn(async () => ({ user: h.user })) }));
vi.mock('@/lib/db', () => ({
  prisma: {
    campaign: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 'c1' ? { id: 'c1', gmUserId: 'gm' } : null)) },
    forgeItem: { findFirst: vi.fn(async () => null) },
    character: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { h.created.push(data); return { id: data.id }; }),
      update: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => null),
    },
    dayaEntity: { findFirst: vi.fn(async () => null) },
    entityRelationship: { findFirst: vi.fn(async () => null) },
  },
}));
// The model call is held open until the test releases it — proves the 202 does not wait.
vi.mock('@/ai/network/chat', () => ({
  routedChatText: vi.fn(() => new Promise((resolve) => {
    h.release = () => resolve({
      text: JSON.stringify({ name: 'Wenna', persona: 'Ferrywoman.', voice: 'Terse.', memories: ['The flood year.', 'Her first crossing.', 'The toll she never collected.'], attributes: { clout: 3 }, skills: [] }),
      model: 'm', usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, lane: {},
    });
  })),
}));
vi.mock('@/services/lawful-intake', () => ({ assertLawfulInput: vi.fn(async () => undefined) }));
vi.mock('@/services/krma/wallet', () => ({ getCampaignEconomy: vi.fn(async () => ({ fluid: BigInt(5000) })) }));
vi.mock('@/services/krma/crystallization', () => ({ crystallizeEntity: vi.fn(async () => ({})) }));
vi.mock('@/services/canvas-placement', () => ({ snapCharacterToLocation: vi.fn() }));
vi.mock('@/services/maturity', () => ({ assertMayEnterCampaign: vi.fn(), REMOVED_STATUS: 'REMOVED' }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn() }));
vi.mock('@/daya/authoring', () => ({
  wrapCharacterAsDaya: vi.fn(async () => ({})),
  updateDayaAuthoring: vi.fn(async () => ({})),
  seedEntityMemories: vi.fn(async () => []),
  setDayaStatus: vi.fn(async () => ({ status: 'ACTIVE' })),
}));

const { POST } = await import('./route');
const { GET } = await import('./[characterId]/status/route');
const { awaitSketch, __resetSketchJobs } = await import('@/services/sketch-genesis');

function post(campaignId: string, body: unknown) {
  const req = new Request(`http://x/api/campaigns/${campaignId}/npcs/sketch`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return POST(req as any, { params: Promise.resolve({ id: campaignId }) });
}
function status(campaignId: string, characterId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return GET(new Request('http://x') as any, { params: Promise.resolve({ id: campaignId, characterId }) });
}

describe('POST /api/campaigns/[id]/npcs/sketch', () => {
  beforeEach(() => { __resetSketchJobs(); h.created.length = 0; h.release = null; h.user = { id: 'gm', role: 'WATCHER', username: 'gm' }; });

  it('returns 202 + characterId before the model answers; status flips PENDING → DONE', async () => {
    const res = await post('c1', { seedText: 'a ferrywoman who hates bridges' });
    expect(res.status).toBe(202);
    const { characterId, status: s0 } = await res.json() as { characterId: string; status: string };
    expect(s0).toBe('PENDING');
    expect(characterId).toBeTruthy();
    expect(h.created).toHaveLength(0);

    expect((await (await status('c1', characterId)).json()).status).toBe('PENDING');
    // Let the background job reach the model, then answer it.
    for (let i = 0; i < 50 && !h.release; i++) await new Promise((r) => setImmediate(r));
    h.release!();
    await awaitSketch(characterId);
    const after = await (await status('c1', characterId)).json() as { status: string; summary: string };
    expect(after.status).toBe('DONE');
    expect(after.summary).toMatch(/Wenna/);
    expect(h.created[0]).toMatchObject({ id: characterId, entityType: 'NPC', genesisTier: 'SKETCH' });
  });

  it('a Trailblazer and another Watcher get 403; an empty seed is 400; a missing campaign 404', async () => {
    h.user = { id: 'p1', role: 'TRAILBLAZER', username: 'p1' };
    expect((await post('c1', { seedText: 'x' })).status).toBe(403);
    h.user = { id: 'w2', role: 'WATCHER', username: 'w2' };
    expect((await post('c1', { seedText: 'x' })).status).toBe(403);
    h.user = { id: 'gm', role: 'WATCHER', username: 'gm' };
    expect((await post('c1', { seedText: '' })).status).toBe(400);
    expect((await post('nope', { seedText: 'x' })).status).toBe(404);
  });

  it('status of an unknown sketch is 404; a Trailblazer asking is 403', async () => {
    expect((await status('c1', 'nope')).status).toBe(404);
    h.user = { id: 'p1', role: 'TRAILBLAZER', username: 'p1' };
    expect((await status('c1', 'nope')).status).toBe(403);
  });
});
