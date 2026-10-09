/** Perception unit 12 — USE TEACHES: the round's uses (pure) and their one-per-being write (source 'use'). */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ rows: new Map<string, { score: number; lastCycle: number | null; lastSource: string; subjectKind?: string }>(), txCount: 0, seeded: [] as string[] }));

vi.mock('@/lib/db', () => {
  const k = (w: { perceiverId_subjectId_aspectKind: { perceiverId: string; subjectId: string; aspectKind: string } }) => {
    const x = w.perceiverId_subjectId_aspectKind;
    return `${x.perceiverId}|${x.subjectId}|${x.aspectKind}`;
  };
  const tx = {
    familiarity: {
      findUnique: async ({ where }: { where: Parameters<typeof k>[0] }) => h.rows.get(k(where)) ?? null,
      upsert: async ({ where, create, update }: { where: Parameters<typeof k>[0]; create: { score: number; lastCycle: number; lastSource: string; subjectKind: string }; update: { score: number; lastCycle: number; lastSource: string } }) => {
        const key = k(where);
        h.rows.set(key, h.rows.has(key) ? { ...h.rows.get(key)!, ...update } : { score: create.score, lastCycle: create.lastCycle, lastSource: create.lastSource, subjectKind: create.subjectKind });
      },
    },
  };
  return {
    prisma: {
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => { h.txCount++; return fn(tx); },
      campaignItem: {
        findMany: async () => [
          // a plain sword: no ability; an enchanted blade: Flame Tongue (Fortune + Force)
          { id: 'sword', data: JSON.stringify({ weightLbs: 3, damage: { slashing: 4 }, baseResist: 10, condition: 3 }) },
          { id: 'blade', data: JSON.stringify({ weightLbs: 3, damage: { slashing: 5 }, itemAbilities: [{ name: 'Flame Tongue', school: 'Force' }] }) },
          { id: 'mail', data: JSON.stringify({ baseResist: 8, condition: 3 }) },
        ],
      },
      familiarity: { findMany: async () => [] },
      dayaEntity: { findUnique: async ({ where }: { where: { characterId?: string; id?: string } }) => (where.characterId === 'violet' || where.id === 'ent-violet' ? { id: 'ent-violet', characterId: 'violet' } : where.characterId === 'ruth' ? { id: 'ent-ruth' } : null) },
    },
  };
});
vi.mock('@/services/history', () => ({ currentCycleOf: async () => 5 }));
vi.mock('@/services/familiarity-seed', () => ({
  isGodheadBeing: async () => false,
  seedOnFirstContact: async (i: { perceiverCharacterId: string; subjectId: string }) => { h.seeded.push(`${i.perceiverCharacterId}:${i.subjectId}`); return { contact: 'stranger', seeded: [] }; },
}));

import { usesFromRound } from '@/sim/perception/use';
import { recordUseBatch, growFamiliarity } from './familiarity';

beforeEach(() => { h.rows.clear(); h.txCount = 0; h.seeded.length = 0; });

describe('usesFromRound (pure)', () => {
  it('wielding → weight; an attack that dealt damage → damage; a held item taking the hit → hardness + condition; worn armour hit → same', () => {
    const uses = usesFromRound({
      heldAtStart: { violet: 'sword', ruth: 'blade', danny: 'cup' },
      upAtStart: ['violet', 'ruth'], // danny was already down — wields nothing
      log: [
        { kind: 'damage', actorId: 'violet', targetId: 'ruth' },
        { kind: 'note', actorId: 'ruth', targetId: null, detail: { itemId: 'blade', conditionBefore: 3, conditionAfter: 2 } },
        { kind: 'note', actorId: null, targetId: null, detail: { text: 'GM note' } },
      ],
      wornHits: [{ wearerId: 'ruth', itemId: 'mail' }],
      abilitiesFired: [{ userId: 'ruth', itemId: 'blade', abilityId: 'flame-tongue' }],
    });
    expect(uses).toEqual([
      { userId: 'violet', itemId: 'sword', aspects: ['weight', 'damage'] },
      { userId: 'ruth', itemId: 'blade', aspects: ['weight', 'hardness', 'condition', 'ability:flame-tongue'] },
      { userId: 'ruth', itemId: 'mail', aspects: ['hardness', 'condition'] },
    ]);
  });
});

describe('recordUseBatch', () => {
  it('one transaction per being, source use, only aspects the item has, no domain gate (the enchantment is learned by use)', async () => {
    const n = await recordUseBatch({ campaignId: 'c1', cycle: 5, uses: [
      { userId: 'violet', itemId: 'sword', aspects: ['weight', 'damage', 'ability:nope'] },
      { userId: 'ruth', itemId: 'blade', aspects: ['weight', 'hardness', 'ability:flame-tongue'] }, // blade has no hardness
      { userId: 'ghost', itemId: 'sword', aspects: ['weight'] }, // no DAYA being → skipped
    ] });
    expect(n).toBe(4);
    expect(h.txCount).toBe(2);
    expect(h.rows.get('ent-violet|sword|damage')).toMatchObject({ score: growFamiliarity(0, 'use'), lastSource: 'use', lastCycle: 5, subjectKind: 'ITEM' });
    expect(h.rows.has('ent-violet|sword|ability:nope')).toBe(false);
    expect(h.rows.has('ent-ruth|blade|hardness')).toBe(false);
    expect(h.rows.get('ent-ruth|blade|ability:flame-tongue')?.lastSource).toBe('use');
    expect(h.seeded).toEqual(['violet:sword', 'ruth:blade']); // first contact seeded before counting
  });

  it('repeated rounds grow slowly (diminishing returns)', async () => {
    for (let i = 0; i < 3; i++) await recordUseBatch({ campaignId: 'c1', cycle: 5, uses: [{ userId: 'violet', itemId: 'sword', aspects: ['damage'] }] });
    expect(h.rows.get('ent-violet|sword|damage')?.score).toBeCloseTo(growFamiliarity(0, 'use', 3));
  });
});
