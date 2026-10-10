/**
 * perceive() × organ condition (perception unit 5). The "intact body" block was
 * written and snapshotted BEFORE organ effectiveness was wired in: an intact
 * (or unmodelled) body must render exactly as it did.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ sheet: '{}' }));

vi.mock('@/lib/db', () => ({
  prisma: {
    character: {
      findUnique: async () => ({ data: db.sheet }),
      findMany: async () => [{ id: 'danny', name: 'Danny', data: JSON.stringify({ _npc: { appearance: 'a wiry man in a grey coat' } }) }],
    },
    entityRelationship: {
      findFirst: async ({ where }: { where: { sourceId: string } }) => (where.sourceId === 'violet' ? { targetId: 'inn' } : null),
      findMany: async () => [{ sourceId: 'danny' }],
    },
    location: {
      findUnique: async () => ({
        id: 'inn', name: 'The Inn', campaignId: 'c1',
        data: JSON.stringify({
          description: 'Low beams, a long bar.',
          environment: 'Smoke in the air.',
          features: [{ name: 'Hearth', description: 'A fire burns low.', type: 'feature' }, { name: 'Trapdoor', description: 'Loose boards by the bar.', type: 'hazard' }],
        }),
      }),
    },
    campaignItem: { findMany: async () => [{ name: 'tankard' }, { name: 'dice cup' }] },
    dayaEntity: { findUnique: async () => ({ id: 'ent-violet', personaProfile: '{}', affect: null }) },
    familiarity: { findMany: async () => [] },
    campaign: { findUnique: async () => ({ currentCycle: 0 }) },
  },
}));
vi.mock('./world-ledger', () => ({ currentFacts: async () => [] }));

import { perceive, forgetScene, composeSceneLines, dimBySenses, lineModality } from './perceive';
import { computeSceneContent, rngFor } from './renderer-math';
import { conditionEffectiveness, senseProfileFromSheet, senseFlagsFromSheet, SENSE_KINDS } from '@/sim/senses/field';

const part = (partName: string, condition: number, contains: unknown[] = []) => ({ isBodyPart: true, partName, condition, contains });
const anatomy = (eye: [number, number], ear: [number, number] = [3, 3]) => JSON.stringify({
  bodyAnatomy: part('Body', 3, [part('Head', 3, [part('Left Eye', eye[0]), part('Right Eye', eye[1]), part('Left Ear', ear[0]), part('Right Ear', ear[1])])]),
});

beforeEach(() => { db.sheet = '{}'; forgetScene(); });

const look = () => perceive('violet', 'c1', 'The door bangs.', 'perception', {}, { voice: false });
const hear = () => perceive('violet', 'c1', 'Danny: "Sit down."', 'dialogue', {}, { voice: false });

describe('intact body — output pinned before unit 5', () => {
  it('no anatomy (default human): perception', async () => {
    const r = await look();
    expect({ prose: r.prose, level: r.fidelityLevel, distortions: r.distortions }).toMatchInlineSnapshot(`
      {
        "distortions": [
          "scene:dropped=2",
          "scene:kept=5/7",
          "unvoiced",
        ],
        "level": 4,
        "prose": "The door bangs.
      Danny is here — a wiry man in a grey coat
      You are in The Inn — Low beams, a long bar.
      Hearth: A fire burns low.
      Around you: tankard, dice cup.",
      }
    `);
  });

  it('no anatomy (default human): dialogue', async () => {
    const r = await hear();
    expect({ prose: r.prose, level: r.fidelityLevel, distortions: r.distortions }).toMatchInlineSnapshot(`
      {
        "distortions": [
          "scene:dropped=2",
          "scene:kept=5/7",
          "unvoiced",
        ],
        "level": 4,
        "prose": "Danny: "Sit down."
      Danny is here — a wiry man in a grey coat
      You are in The Inn — Low beams, a long bar.
      Hearth: A fire burns low.
      Around you: tankard, dice cup.",
      }
    `);
  });

  it('modelled intact eyes and ears render the same as the default human', async () => {
    const plain = await look();
    forgetScene();
    db.sheet = anatomy([3, 3]);
    const r = await look();
    expect(r.prose).toBe(plain.prose);
    expect(r.fidelityLevel).toBe(plain.fidelityLevel);
    expect(r.distortions).toEqual(plain.distortions);
  });
});

describe('condition → effectiveness (canon Equipment_Conditions tiers)', () => {
  it('4 Indestructible, 3 Undamaged, 2 Worn → 1; 1 Broken → 0.5; 0 Destroyed → 0', () => {
    expect([4, 3, 2, 1, 0].map(conditionEffectiveness)).toEqual([1, 1, 1, 0.5, 0]);
    expect(conditionEffectiveness(-1)).toBe(0);
  });
});

describe('senseProfileFromSheet', () => {
  it('no anatomy → a default human: every sense assumed, Undamaged, at 1', () => {
    const p = senseProfileFromSheet(null);
    expect(p.anatomyModelled).toBe(false);
    expect(p.organs.map((o) => o.sense)).toEqual([...SENSE_KINDS]);
    expect(p.organs.every((o) => o.assumed && o.condition === 3 && o.effectiveness === 1 && o.path === null)).toBe(true);
    expect(p.effectiveness).toEqual({ sight: 1, hearing: 1, smell: 1, taste: 1, touch: 1 });
    expect(JSON.parse(JSON.stringify(p))).toEqual(p); // serialisable for the world-sim (unit 6)
  });

  it('lists each modelled organ with its path, condition and properties', () => {
    const sheet = { bodyAnatomy: part('Body', 3, [part('Head', 3, [{ ...part('Left Eye', 1), properties: ['Low-light'], primaryMaterial: 'Flesh' }, part('Right Eye', 3), part('Heart', 3)])]) };
    const p = senseProfileFromSheet(sheet);
    const left = p.organs.find((o) => o.partName === 'Left Eye')!;
    expect(left).toEqual({ sense: 'sight', partName: 'Left Eye', path: 'Body/Head/Left Eye', condition: 1, conditionLabel: 'Broken', properties: ['Low-light'], primaryMaterial: 'Flesh', effectiveness: 0.5, assumed: false });
    expect(p.organs.some((o) => o.partName === 'Heart')).toBe(false); // "Heart" is not an ear
    expect(p.effectiveness.sight).toBe(1); // the best eye counts
    expect(p.organs.find((o) => o.sense === 'hearing')!.assumed).toBe(true); // no ears modelled → default human ears
  });

  it('both eyes Broken → sight halved; both Destroyed → sight gone, flags follow', () => {
    expect(senseProfileFromSheet(JSON.parse(anatomy([1, 1]))).effectiveness.sight).toBe(0.5);
    expect(senseFlagsFromSheet(JSON.parse(anatomy([1, 1])))).toEqual({ canSee: true, canHear: true });
    expect(senseProfileFromSheet(JSON.parse(anatomy([0, 0]))).effectiveness.sight).toBe(0);
    expect(senseFlagsFromSheet(JSON.parse(anatomy([0, 0])))).toEqual({ canSee: false, canHear: true });
    expect(senseFlagsFromSheet(JSON.parse(anatomy([3, 3], [0, 0])))).toEqual({ canSee: true, canHear: false });
    expect(senseFlagsFromSheet(null)).toEqual({ canSee: true, canHear: true });
  });
});

describe('lines dimmed by the sense that carries them', () => {
  it('modality: speech → hearing; place/fact/item → sight; present → either; sense notes → none', () => {
    expect(lineModality('speech')).toEqual(['hearing']);
    expect(lineModality('place')).toEqual(['sight']);
    expect(lineModality('present')).toEqual(['sight', 'hearing']);
    expect(lineModality('sense')).toEqual([]);
  });

  it('intact senses leave lines untouched (no clarity field)', () => {
    const lines = [{ text: 'a', salience: 0.5, kind: 'place' as const }];
    expect(dimBySenses(lines, { sight: 1, hearing: 1 })).toEqual(lines);
    expect(dimBySenses(lines, undefined)).toBe(lines);
  });

  it('a Broken eye halves the fidelity of sight lines only', () => {
    const t = composeSceneLines({
      headline: 'The door bangs.', speech: ['Ruth: "Sit."'], place: { name: 'The Inn', data: null }, parent: null,
      present: [{ name: 'Danny', description: null }], items: ['tankard'], facts: [], parentFacts: [],
      senses: { canSee: true, canHear: true, effectiveness: { sight: 0.5, hearing: 1 } },
    });
    expect(t.lines.find((l) => l.kind === 'place')!.clarity).toBe(0.5);
    expect(t.lines.find((l) => l.kind === 'item')!.clarity).toBe(0.5);
    expect(t.lines.find((l) => l.kind === 'speech')!.clarity).toBeUndefined();
    expect(t.lines.find((l) => l.kind === 'present')!.clarity).toBeUndefined(); // heard fine
  });

  it('renderer: a half-clear line is judged at floor(level × 0.5); clarity 0 drops it', () => {
    const scene = (clarity?: number) => ({ subject: 'scene' as const, subjectKey: 'k', trueData: { headline: 'H', lines: [{ text: 'mid', salience: 0.5, kind: 'place' as const, ...(clarity != null ? { clarity } : {}) }] } });
    const run = (clarity?: number) => computeSceneContent(scene(clarity), {}, { morale: 0, stress: 0, grief: 0 }, 5, rngFor('x', 'k', 0)).prose;
    expect(run()).toBe('H\nmid');           // F5: kept
    expect(run(0.5)).toBe('H');             // F2 floor 0.6 > 0.5: dropped
    expect(run(0)).toBe('H');               // gone
    expect(run(1)).toBe('H\nmid');
  });
});

describe('perceive() with impaired organs', () => {
  it('Broken eyes: sight lines are judged at F2 — fewer of them survive; speech and presence unchanged', async () => {
    const intact = await look();
    forgetScene();
    db.sheet = anatomy([1, 1]);
    const r = await look();
    expect(r.fidelityLevel).toBe(4); // the scene level is unchanged; the sight lines are dimmed
    expect(r.prose).toContain('The door bangs.');
    expect(r.prose).toContain('Danny is here — a wiry man in a grey coat');
    expect(r.prose).not.toContain('Hearth: A fire burns low.'); // salience 0.45 < F2 floor 0.6
    expect(r.prose).not.toContain('Around you:');
    expect(r.prose.split('\n').length).toBeLessThan(intact.prose.split('\n').length);
  });

  it('one Broken eye and one good eye see fully', async () => {
    const intact = await look();
    forgetScene();
    db.sheet = anatomy([1, 3]);
    expect((await look()).prose).toBe(intact.prose);
  });

  it('Destroyed eyes: blind — the old canSee=false path', async () => {
    db.sheet = anatomy([0, 0]);
    const r = await look();
    expect(r.prose).toContain('You cannot see; you go by sound, touch and smell.');
    expect(r.prose).not.toContain('You are in The Inn');
  });
});
