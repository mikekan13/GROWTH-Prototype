/** POST /api/portraits/generate waits for the seed (Mike 2026-10-12): 409 before, OK after. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ charData: '{}', generated: 0 }));

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn(async () => ({ user: { id: 'gm', role: 'WATCHER' } })) }));
vi.mock('@/lib/db', () => ({
  prisma: { character: { findUnique: vi.fn(async () => ({ data: h.charData })) } },
}));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn() }));
vi.mock('@/ai/network', () => ({ routedChatText: vi.fn() }));
vi.mock('@/ai/portraits/style-profile', () => ({
  loadCharacterBackstory: vi.fn(async () => 'A long enough story — she grew up by the river and left at seventeen for the city.'),
  deriveStyleProfile: vi.fn(async () => null),
}));
vi.mock('@/ai/portraits/portrait-service', () => ({
  generatePortrait: vi.fn(async () => {
    h.generated++;
    return { success: true, imagePath: '/p.png', thumbnailPath: '/t.png', metadata: { seed: 1, generationTimeMs: 1, model: 'm', prompt: 'p', negativePrompt: '' } };
  }),
  generateFromDescription: vi.fn(),
}));

const { POST } = await import('./route');
const req = (body: unknown) => new Request('http://x/api/portraits/generate', { method: 'POST', body: JSON.stringify(body) }) as unknown as Parameters<typeof POST>[0];

describe('POST /api/portraits/generate — seed gate', () => {
  beforeEach(() => { h.generated = 0; });

  it('refuses with a clear 409 until the seed is set', async () => {
    h.charData = JSON.stringify({ creation: { seed: { baseFateDie: 'd6' } } });
    const res = await POST(req({ characterId: 'ch1' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Set a seed first/);
    expect(h.generated).toBe(0);
  });

  it('generates once the seed is set', async () => {
    h.charData = JSON.stringify({ creation: { seed: { name: 'Human', baseFateDie: 'd6' }, seedPick: { pickedBy: 'jewl' } } });
    const res = await POST(req({ characterId: 'ch1' }));
    expect(res.status).toBe(200);
    expect(h.generated).toBe(1);
  });
});
