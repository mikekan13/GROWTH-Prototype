/**
 * perceive() × the familiarity store (perception unit 4). The first block pins
 * the as-built behaviour (flat SCENE_ATTUNEMENT 0.8 → F4) for a being with no
 * stored familiarity of the place — written BEFORE the store was wired in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  familiarityRows: [] as Array<{ score: number; lastCycle: number | null }>,
  persona: '{}',
  familiarityQueries: 0,
  currentCycle: 0,
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    character: {
      findUnique: async () => ({ data: '{}' }),
      findMany: async () => [{ id: 'danny', name: 'Danny', data: '{}' }],
    },
    entityRelationship: {
      findFirst: async ({ where }: { where: { sourceId: string } }) => (where.sourceId === 'violet' ? { targetId: 'inn' } : null),
      findMany: async () => [{ sourceId: 'danny' }],
    },
    location: {
      findUnique: async () => ({ id: 'inn', name: 'The Inn', data: JSON.stringify({ description: 'Low beams, a long bar.', environment: 'Smoke in the air.' }), campaignId: 'c1' }),
    },
    campaignItem: { findMany: async () => [{ name: 'tankard' }] },
    dayaEntity: { findUnique: async () => ({ id: 'ent-violet', personaProfile: db.persona, affect: null }) },
    familiarity: {
      findMany: async () => { db.familiarityQueries++; return db.familiarityRows; },
    },
    campaign: { findUnique: async () => ({ currentCycle: db.currentCycle }) },
  },
}));
vi.mock('./world-ledger', () => ({ currentFacts: async () => [] }));

import { perceive, forgetScene, SCENE_ATTUNEMENT, sceneAttunementFrom } from './perceive';

beforeEach(() => {
  db.familiarityRows = [];
  db.persona = '{}';
  db.familiarityQueries = 0;
  db.currentCycle = 0;
  forgetScene();
});

const look = () => perceive('violet', 'c1', 'The door bangs.', 'perception', {}, { voice: false });

describe('fallback — no stored familiarity of the place (as-built behaviour, pinned)', () => {
  it('renders the scene at the flat SCENE_ATTUNEMENT 0.8 → F4', async () => {
    expect(SCENE_ATTUNEMENT).toBe(0.8);
    const r = await look();
    expect(r.observer.attunement).toBe(0.8);
    expect(r.fidelityLevel).toBe(4);
    expect(r.mirrored).toBe(true);
    expect(r.voiced).toBe(false);
    expect(r.prose.startsWith('The door bangs.')).toBe(true);
    expect(r.prose).toContain('Danny is here.');
  });

  it('godlike beings still bypass the mirror (F5, unmirrored)', async () => {
    db.persona = JSON.stringify({ godlike: true });
    const r = await look();
    expect(r.fidelityLevel).toBe(5);
    expect(r.mirrored).toBe(false);
    expect(r.distortions).toContain('godlike:unmirrored');
  });

  it('a caller-given attunement (canon re-render) still wins', async () => {
    const r = await perceive('violet', 'c1', 'The door bangs.', 'perception', {}, { voice: false, observer: { attunement: 0.3 } });
    expect(r.observer.attunement).toBe(0.3);
    expect(r.fidelityLevel).toBe(1);
  });
});

describe('the mirror reads the store when a row exists', () => {
  it('uses the stored familiarity of the place instead of the flat 0.8', async () => {
    db.familiarityRows = [{ score: 0.45, lastCycle: null }];
    const r = await look();
    expect(r.observer.attunement).toBe(0.45);
    expect(r.fidelityLevel).toBe(2);
  });

  it('takes the best-known scene aspect, faded to the campaign clock', async () => {
    db.currentCycle = 50;
    db.familiarityRows = [{ score: 0.3, lastCycle: null }, { score: 0.96, lastCycle: 0 }];
    const r = await look();
    expect(r.observer.attunement).toBe(0.96); // sealed F5 does not fade
    expect(r.fidelityLevel).toBe(5);
  });

  it('a caller-given attunement skips the store; godlike never consults it', async () => {
    db.familiarityRows = [{ score: 0.1, lastCycle: null }];
    await perceive('violet', 'c1', 'x', 'perception', {}, { voice: false, observer: { attunement: 0.8 } });
    expect(db.familiarityQueries).toBe(0);
    db.persona = JSON.stringify({ godlike: true });
    await look();
    expect(db.familiarityQueries).toBe(0);
  });
});

describe('sceneAttunementFrom (pure)', () => {
  it('no rows → the flat fallback; rows → the max faded score', () => {
    expect(sceneAttunementFrom([], 0)).toBe(SCENE_ATTUNEMENT);
    expect(sceneAttunementFrom([{ score: 0.2, lastCycle: null }, { score: 0.6, lastCycle: null }], 0)).toBe(0.6);
    expect(sceneAttunementFrom([{ score: 0.6, lastCycle: 0 }], 100)).toBeLessThan(0.6);
  });
});
