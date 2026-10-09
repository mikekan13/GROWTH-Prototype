/**
 * perceive() × the familiarity store. The first block pins the base behaviour
 * (flat SCENE_ATTUNEMENT 0.8 → F4); unit 5 (D1) pins that stored familiarity
 * of the place no longer changes it.
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

import { perceive, forgetScene, SCENE_ATTUNEMENT } from './perceive';

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

// Unit 5 / orchestrator D1 (2026-10-09): unit 4 let stored familiarity of the place set scene clarity.
// Reverted — familiarity governs what a being KNOWS of a thing's aspects, not how clearly its senses take in
// a room (reality default: you see a new room fine). Scene clarity = 0.8 base, dimmed by the senses.
describe('familiarity of the place does NOT set scene clarity (D1)', () => {
  it('a low stored familiarity leaves the scene at 0.8 → F4', async () => {
    db.familiarityRows = [{ score: 0.05, lastCycle: null }];
    const r = await look();
    expect(r.observer.attunement).toBe(SCENE_ATTUNEMENT);
    expect(r.fidelityLevel).toBe(4);
  });

  it('a sealed F5 familiarity does not lift the scene to F5 either', async () => {
    db.familiarityRows = [{ score: 0.99, lastCycle: 0 }];
    const r = await look();
    expect(r.observer.attunement).toBe(SCENE_ATTUNEMENT);
    expect(r.fidelityLevel).toBe(4);
  });

  it('the mirror does not read the familiarity store at all', async () => {
    db.familiarityRows = [{ score: 0.1, lastCycle: null }];
    await look();
    db.persona = JSON.stringify({ godlike: true });
    await look();
    expect(db.familiarityQueries).toBe(0);
  });
});
