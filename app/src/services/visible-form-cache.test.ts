import { describe, it, expect, vi, beforeEach } from 'vitest';

// One in-memory world shared by services/visible-form (render + cache) and services/reconciliation (correctCanon).
const w = vi.hoisted(() => ({
  memories: [] as Array<{ id: string; entityId: string; truthRef: string | null; chain: string; noticed: boolean; perceivedVia: string; visibleForm: string | null; source: string; content: string; classification: string }>,
  events: [] as Array<{ id: string; campaignId: string; kind: string; narration: string; detail: string; actorId: string | null; sourceType: string | null }>,
  memoryUpdates: 0,
}));

vi.mock('@/lib/db', () => {
  const inIds = (where: { id?: { in?: string[] } } | undefined, id: string) => !where?.id?.in || where.id.in.includes(id);
  const prisma = {
    campaign: { findUnique: async () => ({ gmUserId: 'gm', currentCycle: 1 }) },
    dayaEntity: { findUnique: async ({ where }: { where: { characterId: string } }) => (where.characterId === 'violet' ? { id: 'ent-v' } : null) },
    character: { findMany: async () => [{ id: 'violet', name: 'Violet', data: '{}', entityType: 'PLAYER_CHARACTER' }, { id: 'ruth', name: 'Ruth', data: JSON.stringify({ _npc: { appearance: 'Tall woman in a coat' } }), entityType: 'NPC' }] },
    campaignItem: { findMany: async () => [] },
    location: { findMany: async () => [] },
    familiarity: { findMany: async () => [{ subjectId: 'ruth', aspectKind: 'identity', score: 0.7, lastCycle: null }] },
    vineEntry: { count: async () => 0 },
    canonRevision: { create: async () => ({ id: 'rev1' }) },
    canonEvent: {
      findUnique: async ({ where }: { where: { id: string } }) => w.events.find((e) => e.id === where.id) ?? null,
      findMany: async ({ where }: { where: { id?: { in?: string[] } } }) => w.events.filter((e) => inIds(where, e.id)),
      update: async ({ where, data }: { where: { id: string }; data: { narration: string; detail: string } }) => Object.assign(w.events.find((e) => e.id === where.id)!, data),
      count: async () => 0,
    },
    dayaMemoryEntry: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        if (where.OR) return w.memories.map((m) => ({ ...m, entity: { characterId: 'violet' } }));
        if (typeof where.truthRef === 'string') return w.memories.filter((m) => m.truthRef === where.truthRef);
        if (where.truthRef) return [];
        return w.memories.filter((m) => inIds(where as { id?: { in?: string[] } }, m.id) && (!where.entityId || m.entityId === where.entityId));
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { w.memoryUpdates++; return Object.assign(w.memories.find((m) => m.id === where.id)!, data); },
      updateMany: async ({ where, data }: { where: { id: { in: string[] } }; data: Record<string, unknown> }) => {
        const hit = w.memories.filter((m) => where.id.in.includes(m.id));
        hit.forEach((m) => Object.assign(m, data));
        return { count: hit.length };
      },
    },
  };
  return { prisma };
});
vi.mock('@/services/history', () => ({ currentCycleOf: async () => 1 }));
vi.mock('@/ai/network', () => ({ route: vi.fn(), anthropicChatText: vi.fn(), openAiCompatChat: vi.fn(), recordAiCall: vi.fn() }));
vi.mock('@/daya/perceive', () => ({ perceive: vi.fn(async () => ({ prose: 'You see the door slam.', fidelityLevel: 4, distortions: [], observer: {} })) }));
vi.mock('@/daya/model-client', () => ({ chat: vi.fn(), DayaTierUnavailableError: class extends Error {}, DayaWarmingTimeoutError: class extends Error {} }));
vi.mock('@/services/bridge', () => ({ bridgeContinuity: vi.fn() }));
vi.mock('@/services/location', () => ({ createLocation: vi.fn() }));
vi.mock('@/services/character-location', () => ({ moveCharacterToLocation: vi.fn() }));
vi.mock('@/services/krma/ledger', () => ({ executeTransaction: vi.fn() }));
vi.mock('@/services/krma/wallet', () => ({ getCampaignEconomy: vi.fn() }));
vi.mock('@/services/canvas-placement', () => ({ placeNewLocation: vi.fn(), snapCharacterToLocation: vi.fn() }));
vi.mock('@/lib/defaults', () => ({ createDefaultCharacter: vi.fn() }));

import { renderViewerFeed } from './visible-form';
import { correctCanon } from './reconciliation';

beforeEach(() => {
  w.memoryUpdates = 0;
  w.events = [{ id: 'ev1', campaignId: 'c1', kind: 'declaration', narration: 'Ruth opens the door.', detail: '{}', actorId: null, sourceType: 'gm' }];
  w.memories = [
    { id: 'm1', entityId: 'ent-v', truthRef: 'ev1', chain: JSON.stringify({ truthRefs: ['ev1'] }), noticed: true, perceivedVia: '["sight","hearing"]', visibleForm: null, source: 'perception', content: 'You see Ruth open the door.', classification: '{}' },
    { id: 'm2', entityId: 'ent-v', truthRef: 'ev1', chain: '{}', noticed: false, perceivedVia: '["hearing"]', visibleForm: null, source: 'perception', content: 'a creak', classification: '{}' },
  ];
});

const text = (f: Awaited<ReturnType<typeof renderViewerFeed>>, id: string) => {
  const r = f.get(id)?.rows[0];
  return r && r.type === 'narration' ? r.text : null;
};

describe('visible form cache', () => {
  it('renders once, then serves the cache without a model call; unnoticed rows have no feed line', async () => {
    const rewrite = vi.fn(async () => null);
    const first = await renderViewerFeed('c1', 'violet', ['m1', 'm2', 'nope'], { rewrite });
    expect(text(first, 'm1')).toBe('Ruth opens the door.'); // Ruth at F3 (0.7) → her name
    expect(first.get('m2')).toBeNull();
    expect(first.get('nope')).toBeNull();
    expect(w.memories[0].visibleForm).toContain('"sig"');
    const writes = w.memoryUpdates;
    const again = await renderViewerFeed('c1', 'violet', ['m1'], { rewrite });
    expect(again.get('m1')).toEqual(first.get('m1'));
    expect(w.memoryUpdates).toBe(writes);
  });

  it('a canon correction clears the cache and the next read renders the corrected truth', async () => {
    await renderViewerFeed('c1', 'violet', ['m1'], { rewrite: null });
    expect(w.memories[0].visibleForm).not.toBeNull();
    await correctCanon('c1', { userId: 'gm', role: 'WATCHER' }, { canonEventId: 'ev1', narration: 'Ruth slams the door.' });
    expect(w.memories.every((m) => m.visibleForm === null)).toBe(true);
    const after = await renderViewerFeed('c1', 'violet', ['m1'], { rewrite: null });
    expect(text(after, 'm1')).toBe('Ruth slams the door.');
    expect(w.memories[0].visibleForm).toContain('slams');
  });

  it('D3: reads sense clarity as stored at perception time, not the healed body now', async () => {
    // Violet's sheet now is whole (full sight + hearing); the moment was perceived blind and deafened.
    w.memories.push({ id: 'm3', entityId: 'ent-v', truthRef: 'ev1', chain: JSON.stringify({ truthRefs: ['ev1'] }), noticed: true, perceivedVia: JSON.stringify({ via: ['sight', 'hearing'], clarity: { sight: 0, hearing: 0 } }), visibleForm: null, source: 'perception', content: '', classification: '{}' });
    w.memories.push({ id: 'm4', entityId: 'ent-v', truthRef: 'ev1', chain: JSON.stringify({ truthRefs: ['ev1'] }), noticed: true, perceivedVia: JSON.stringify({ via: ['sight', 'hearing'], clarity: { sight: 0.15, hearing: 0.15 } }), visibleForm: null, source: 'perception', content: '', classification: '{}' });
    const f = await renderViewerFeed('c1', 'violet', ['m1', 'm3', 'm4'], { rewrite: null });
    expect(text(f, 'm1')).toBe('Ruth opens the door.'); // legacy row → the body now (whole)
    expect(f.get('m3')?.rows).toEqual([]); // took nothing in then → nothing now
    expect(text(f, 'm4')).toContain('{gap}');
    expect(text(f, 'm4')).not.toBe('Ruth opens the door.');
  });
});
