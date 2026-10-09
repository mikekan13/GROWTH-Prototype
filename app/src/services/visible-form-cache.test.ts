import { describe, it, expect, vi, beforeEach } from 'vitest';

// One in-memory world shared by services/visible-form (render + cache) and services/reconciliation (correctCanon).
const w = vi.hoisted(() => ({
  memories: [] as Array<{ id: string; entityId: string; truthRef: string | null; chain: string; noticed: boolean; perceivedVia: string; visibleForm: string | null; firstVisibleForm?: string | null; source: string; content: string; classification: string }>,
  events: [] as Array<{ id: string; campaignId: string; kind: string; narration: string; detail: string; actorId: string | null; sourceType: string | null }>,
  memoryUpdates: 0,
  ruthIdentity: 0.7,
}));

vi.mock('@/lib/db', () => {
  const inIds = (where: { id?: { in?: string[] } } | undefined, id: string) => !where?.id?.in || where.id.in.includes(id);
  const prisma = {
    campaign: { findUnique: async () => ({ gmUserId: 'gm', currentCycle: 1 }) },
    dayaEntity: { findUnique: async ({ where }: { where: { characterId: string } }) => (where.characterId === 'violet' ? { id: 'ent-v' } : null) },
    character: { findMany: async () => [{ id: 'violet', name: 'Violet', data: '{}', entityType: 'PLAYER_CHARACTER' }, { id: 'ruth', name: 'Ruth', data: JSON.stringify({ _npc: { appearance: 'Tall woman in a coat' } }), entityType: 'NPC' }] },
    campaignItem: { findMany: async () => [] },
    location: { findMany: async () => [] },
    familiarity: { findMany: async () => [{ subjectId: 'ruth', aspectKind: 'identity', score: w.ruthIdentity, lastCycle: null }] },
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
      findUnique: async ({ where }: { where: { id: string } }) => w.memories.find((m) => m.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { w.memoryUpdates++; return Object.assign(w.memories.find((m) => m.id === where.id)!, data); },
      updateMany: async ({ where, data }: { where: { id: string | { in: string[] }; firstVisibleForm?: null }; data: Record<string, unknown> }) => {
        const hit = w.memories.filter((m) => (typeof where.id === 'string' ? m.id === where.id : where.id.in.includes(m.id)) && (!('firstVisibleForm' in where) || (m.firstVisibleForm ?? null) === null));
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
const push = vi.hoisted(() => ({ notifyMemoryWritten: vi.fn() }));
vi.mock('@/lib/perceived-feed-push', () => push);

import { renderViewerFeed, getFirstVisibleForm } from './visible-form';
import { correctCanon } from './reconciliation';

beforeEach(() => {
  w.memoryUpdates = 0;
  w.ruthIdentity = 0.7;
  w.events = [{ id: 'ev1', campaignId: 'c1', kind: 'declaration', narration: 'Ruth opens the door.', detail: '{}', actorId: null, sourceType: 'gm' }];
  w.memories = [
    { id: 'm1', entityId: 'ent-v', truthRef: 'ev1', chain: JSON.stringify({ truthRefs: ['ev1'] }), noticed: true, perceivedVia: '["sight","hearing"]', visibleForm: null, firstVisibleForm: null, source: 'perception', content: 'You see Ruth open the door.', classification: '{}' },
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

  it('a canon correction sends the text-free re-read signal once per affected being (owner + Watcher via feedReadersOf)', async () => {
    push.notifyMemoryWritten.mockClear();
    await correctCanon('c1', { userId: 'gm', role: 'WATCHER' }, { canonEventId: 'ev1', narration: 'Ruth slams the door.' });
    await vi.waitFor(() => expect(push.notifyMemoryWritten).toHaveBeenCalledTimes(1));
    expect(push.notifyMemoryWritten).toHaveBeenCalledWith('ent-v');
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

  it('first render is frozen beside the live cache: later knowledge re-labels the live line, never the snapshot', async () => {
    w.ruthIdentity = 0.1; // Violet barely knows Ruth when she first reads the line
    const first = await renderViewerFeed('c1', 'violet', ['m1'], { rewrite: null });
    const firstText = text(first, 'm1');
    expect(firstText).not.toContain('Ruth');
    const snap = JSON.parse(w.memories[0].firstVisibleForm!);
    expect(snap.form).toEqual(first.get('m1'));
    expect(snap.familiarity).toEqual({ ruth: { identity: 0 } }); // the knowledge the render used
    expect(snap.nowCycle).toBe(1);
    expect(typeof snap.renderedAt).toBe('string');

    w.ruthIdentity = 0.7; // later she learns the name
    const later = await renderViewerFeed('c1', 'violet', ['m1'], { rewrite: null });
    expect(text(later, 'm1')).toBe('Ruth opens the door.'); // live cache re-labels
    expect((await getFirstVisibleForm('m1'))?.form).toEqual(first.get('m1')); // the record does not
    expect(w.memories[0].firstVisibleForm).toBe(JSON.stringify(snap));

    // a canon correction clears the live cache only
    await correctCanon('c1', { userId: 'gm', role: 'WATCHER' }, { canonEventId: 'ev1', narration: 'Ruth slams the door.' });
    expect(w.memories[0].visibleForm).toBeNull();
    expect(w.memories[0].firstVisibleForm).toBe(JSON.stringify(snap));
  });
});
