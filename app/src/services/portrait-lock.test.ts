import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  gen: null as null | { id: string; characterId: string; imagePath: string },
  update: vi.fn(async () => ({})),
  lockPersona: vi.fn(async () => {}),
  exists: true,
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    character: { findUnique: vi.fn(async () => ({ id: 'c1' })), update: h.update },
    portraitGeneration: { findUnique: vi.fn(async () => h.gen) },
  },
}));
vi.mock('@/ai/portraits/portrait-service', () => ({ lockPersona: h.lockPersona }));
vi.mock('fs/promises', () => ({
  default: { access: vi.fn(async () => { if (!h.exists) throw new Error('ENOENT'); }) },
}));

const { lockPortrait, normalizeOwnedPortraitPath } = await import('./portrait-lock');

describe('lockPortrait', () => {
  beforeEach(() => { h.gen = null; h.exists = true; h.update.mockClear(); h.lockPersona.mockClear(); });

  it('sets Character.portrait from imagePath when no generation row exists', async () => {
    const r = await lockPortrait({ characterId: 'c1', imagePath: 'portraits\\c1\\faces\\a.png' });
    expect(r).toEqual({ via: 'image', portrait: '/portraits/c1/faces/a.png' });
    expect(h.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { portrait: '/portraits/c1/faces/a.png' } });
    expect(h.lockPersona).not.toHaveBeenCalled();
  });

  it('keeps the PortraitGeneration path working', async () => {
    h.gen = { id: 'g1', characterId: 'c1', imagePath: 'portraits/c1/g1.png' };
    const r = await lockPortrait({ characterId: 'c1', generationId: 'g1' });
    expect(r.via).toBe('generation');
    expect(h.lockPersona).toHaveBeenCalledWith('g1', 'c1');
  });

  it('falls back to imagePath when the generationId has no row', async () => {
    const r = await lockPortrait({ characterId: 'c1', generationId: 'nope', imagePath: '/portraits/c1/a.png' });
    expect(r.via).toBe('image');
  });

  it('rejects URLs, traversal, other characters, non-images; requires one identifier', async () => {
    for (const bad of ['https://evil.com/a.png', '/portraits/c1/../c2/a.png', '/portraits/c2/a.png', '/portraits/c1/a.txt', '/etc/a.png']) {
      await expect(lockPortrait({ characterId: 'c1', imagePath: bad })).rejects.toThrow();
    }
    await expect(lockPortrait({ characterId: 'c1' })).rejects.toThrow();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('404s when the file is missing', async () => {
    h.exists = false;
    await expect(lockPortrait({ characterId: 'c1', imagePath: '/portraits/c1/a.png' })).rejects.toThrow(/does not exist/);
  });

  it('normalizes paths', () => {
    expect(normalizeOwnedPortraitPath('c1', 'portraits/c1/body/x.webp')).toBe('/portraits/c1/body/x.webp');
  });
});
