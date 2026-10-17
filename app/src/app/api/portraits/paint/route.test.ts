/** POST /api/portraits/paint: validation, the seed gate, the refs gate, DRESS FIRST, the happy path (provider + brief mocked). */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  seedSet: true,
  refs: { face: '/portraits/ch1/faces/p.png', body: '/portraits/ch1/bodies/b.png' } as { face: string; body: string } | null,
  equipped: 1,
  painted: [] as unknown[],
  briefCalls: [] as unknown[],
  lawful: [] as string[],
}));

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn(async () => ({ user: { id: 'gm', role: 'WATCHER' } })) }));
vi.mock('@/services/seed-pick', async () => {
  const { SeedRequiredError } = await import('@/lib/errors');
  return { assertSeedSetForPortrait: vi.fn(async () => { if (!h.seedSet) throw new SeedRequiredError('Set a seed first'); }) };
});
vi.mock('@/services/portrait-brief', async () => {
  const { ValidationError } = await import('@/lib/errors');
  return {
    DRESS_FIRST_MESSAGE: 'Nothing is equipped. Dress the character first.',
    readPortraitRefs: vi.fn(async () => { if (!h.refs) throw new ValidationError('Approve the face and render the body before painting the portrait.'); return h.refs; }),
    buildPortraitBrief: vi.fn(async (id: string, opts: unknown) => {
      h.briefCalls.push(opts);
      return {
        brief: { setting: 's', pose: 'p', expression: 'e', clothes: 'c', marks: 'm', light: 'l', prompt: 'A painted character illustration of the person in <image1> with the body in <image2>, c.', hash: 'h', at: 'now', byJewl: true },
        inputs: { equipped: new Array(h.equipped).fill({}) },
        reused: false, modelCalled: true,
      };
    }),
  };
});
vi.mock('@/ai/portraits/portrait-service', () => ({
  assertLawfulImageJob: vi.fn(async (job: { prompt: string }) => { h.lawful.push(job.prompt); }),
  resolvePortraitMood: vi.fn(async () => 'growth'),
}));
vi.mock('@/ai/portraits/providers', () => ({
  getLocalProvider: () => ({
    renderPortrait: vi.fn(async (characterId: string, brief: { prompt: string }, refs: unknown) => {
      h.painted.push({ characterId, brief, refs });
      return { success: true, imagePath: '/portraits/ch1/portrait/.thumbs/x.webp', thumbnailPath: '/t.webp', metadata: { seed: 99, generationTimeMs: 5, model: 'qwen-image-2.1-int8', prompt: 'p', steps: 25, cfg: 1 } };
    }),
  }),
}));

const { POST } = await import('./route');
const { DRESS_FIRST_MESSAGE } = await import('@/services/portrait-brief');
const req = (body: unknown) => new Request('http://x/api/portraits/paint', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }) as unknown as Parameters<typeof POST>[0];

beforeEach(() => { h.seedSet = true; h.refs = { face: '/portraits/ch1/faces/p.png', body: '/portraits/ch1/bodies/b.png' }; h.equipped = 1; h.painted = []; h.briefCalls = []; h.lawful = []; });

describe('POST /api/portraits/paint', () => {
  it('400 on malformed JSON, a missing characterId, or a non-numeric seed', async () => {
    expect((await POST(req('{nope'))).status).toBe(400);
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req({ characterId: 'ch1', seed: 'x' }))).status).toBe(400);
    expect(h.painted).toHaveLength(0);
  });
  it('409 until the seed is set', async () => {
    h.seedSet = false;
    const res = await POST(req({ characterId: 'ch1' }));
    expect(res.status).toBe(409);
    expect(h.painted).toHaveLength(0);
  });
  it('400 until the face is approved and the body exists', async () => {
    h.refs = null;
    const res = await POST(req({ characterId: 'ch1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Approve the face/);
    expect(h.painted).toHaveLength(0);
  });
  it('400 DRESS FIRST when nothing is equipped — the portrait paints what is worn', async () => {
    h.equipped = 0;
    const res = await POST(req({ characterId: 'ch1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(DRESS_FIRST_MESSAGE);
    expect(h.painted).toHaveLength(0);
  });
  it('paints: brief (reused unless force) → lawfulness on the brief prompt → provider with face, body, seed, mood → JSON', async () => {
    const res = await POST(req({ characterId: 'ch1', seed: 5, force: true }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.imagePath).toBe('/portraits/ch1/portrait/.thumbs/x.webp');
    expect(j.brief).toMatchObject({ pose: 'p', byJewl: true, reused: false });
    expect(j.metadata.seed).toBe(99);
    expect(h.briefCalls[0]).toEqual({ force: true });
    expect(h.lawful[0]).toContain('<image1>');
    expect(h.painted[0]).toMatchObject({ characterId: 'ch1', refs: { face: '/portraits/ch1/faces/p.png', body: '/portraits/ch1/bodies/b.png', seed: 5, mood: 'growth' } });
  });
});
