import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = { perceiverId: string; subjectId: string; aspectKind: string; subjectKind: string; score: number; lastSource: string; lastCycle: number | null; campaignId: string };

const db = vi.hoisted(() => ({
  rows: [] as Row[],
  items: {} as Record<string, { id: string; type: string; data: string; holderId: string | null; campaignId: string; status: string }>,
  godSeats: new Set<string>(),
  personas: {} as Record<string, string>,
  changes: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/db', () => {
  const match = (r: Row, w: Record<string, unknown>) => Object.entries(w).every(([k, v]) => {
    const val = (r as Record<string, unknown>)[k];
    if (v && typeof v === 'object' && 'not' in v) return val !== (v as { not: unknown }).not;
    if (v && typeof v === 'object' && 'in' in v) return (v as { in: unknown[] }).in.includes(val);
    return val === v;
  });
  const prisma = {
    campaign: { findUnique: async () => ({ currentCycle: 7 }) },
    godHead: { findFirst: async ({ where }: { where: { characterId: string } }) => (db.godSeats.has(where.characterId) ? { id: 'g' } : null) },
    dayaEntity: { findUnique: async ({ where }: { where: { characterId: string } }) => (db.personas[where.characterId] ? { personaProfile: db.personas[where.characterId] } : null) },
    campaignItem: {
      findUnique: async ({ where }: { where: { id: string } }) => db.items[where.id] ?? null,
      count: async ({ where }: { where: Record<string, unknown> }) => Object.values(db.items).filter((i) => match(i as never, where)).length,
    },
    familiarity: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => db.rows.filter((r) => match(r, where)),
      upsert: async ({ where, create, update }: { where: { perceiverId_subjectId_aspectKind: { perceiverId: string; subjectId: string; aspectKind: string } }; create: Row; update: Partial<Row> }) => {
        const k = where.perceiverId_subjectId_aspectKind;
        const hit = db.rows.find((r) => r.perceiverId === k.perceiverId && r.subjectId === k.subjectId && r.aspectKind === k.aspectKind);
        if (hit) Object.assign(hit, update); else db.rows.push({ ...create });
        return hit ?? create;
      },
      findUnique: async ({ where }: { where: { perceiverId_subjectId_aspectKind: { perceiverId: string; subjectId: string; aspectKind: string } } }) => {
        const k = where.perceiverId_subjectId_aspectKind;
        const hit = db.rows.find((r) => r.perceiverId === k.perceiverId && r.subjectId === k.subjectId && r.aspectKind === k.aspectKind);
        return hit ? { ...hit } : null; // a fresh object, as Prisma returns
      },
    },
    familiarityChange: { createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { db.changes.push(...data); return { count: data.length }; } },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  return { prisma };
});

import {
  FAMILIARITY_SEED, contactKind, seedPlan, subjectAspects, seedOnFirstContact, isGodheadBeing,
} from './familiarity-seed';
import { scoreToFidelity, fadeFamiliarity, familiarityAt, growFamiliarity } from './familiarity';

const base = { campaignId: 'c1', perceiverId: 'ent-v', perceiverCharacterId: 'violet' };
const sword = JSON.stringify({ description: 'a sword', damage: { piercing: 1, slashing: 4, heat: 0, decay: 0, cold: 0, bashing: 0, energy: 0 }, properties: ['Sharp'] });

beforeEach(() => {
  db.rows = [];
  db.items = {};
  db.godSeats = new Set();
  db.personas = {};
  db.changes = [];
});

describe('seed tuning (labelled placeholders)', () => {
  it('lands on the intended rungs: Godhead F5, self F4, owned F3, known category F2', () => {
    expect(scoreToFidelity(FAMILIARITY_SEED.godhead)).toBe(5);
    expect(scoreToFidelity(FAMILIARITY_SEED.self)).toBe(4);
    expect(scoreToFidelity(FAMILIARITY_SEED.owned)).toBe(3);
    expect(scoreToFidelity(FAMILIARITY_SEED.knownCategory)).toBe(2);
  });
  it("a Godhead's F5 never fades and never regrows downward", () => {
    expect(fadeFamiliarity(FAMILIARITY_SEED.godhead, 1e9)).toBe(1);
    expect(familiarityAt({ score: FAMILIARITY_SEED.godhead, lastCycle: 0 }, 1e9)).toBe(1);
    expect(growFamiliarity(FAMILIARITY_SEED.godhead, 'exposure')).toBe(1);
  });
});

describe('contactKind / seedPlan / subjectAspects (pure)', () => {
  it('Godhead > self > owned > known category > stranger', () => {
    expect(contactKind({ godhead: true, self: true, owned: true, categoryKnown: true })).toBe('godhead');
    expect(contactKind({ self: true, owned: true })).toBe('self');
    expect(contactKind({ owned: true, categoryKnown: true })).toBe('owned');
    expect(contactKind({ categoryKnown: true })).toBe('known-category');
    expect(contactKind({})).toBe('stranger');
  });
  it('known category seeds only identity + appearance; a stranger seeds nothing', () => {
    const aspects = subjectAspects('ITEM', sword);
    expect(aspects).toEqual(expect.arrayContaining(['identity', 'appearance', 'damage', 'property:sharp']));
    expect(seedPlan('known-category', aspects)).toEqual([
      { aspectKind: 'identity', score: FAMILIARITY_SEED.knownCategory },
      { aspectKind: 'appearance', score: FAMILIARITY_SEED.knownCategory },
    ]);
    expect(seedPlan('stranger', aspects)).toEqual([]);
    expect(seedPlan('owned', aspects).every((p) => p.score === FAMILIARITY_SEED.owned)).toBe(true);
    expect(seedPlan('owned', aspects)).toHaveLength(aspects.length);
  });
  it('self knows its own thoughts; other beings and places get identity/appearance/history', () => {
    expect(subjectAspects('SELF')).toEqual(['identity', 'appearance', 'history', 'thoughts']);
    expect(subjectAspects('CHARACTER')).toEqual(['identity', 'appearance', 'history']);
    expect(subjectAspects('LOCATION')).toEqual(['identity', 'appearance', 'history']);
  });
});

describe('seedOnFirstContact (store)', () => {
  it('self: every self aspect at the self seed, stamped with the campaign clock', async () => {
    const r = await seedOnFirstContact({ ...base, subjectId: 'violet', subjectKind: 'CHARACTER' });
    expect(r).toEqual({ contact: 'self', seeded: ['identity', 'appearance', 'history', 'thoughts'] });
    expect(db.rows.every((x) => x.score === FAMILIARITY_SEED.self && x.subjectKind === 'SELF' && x.lastSource === 'seed' && x.lastCycle === 7)).toBe(true);
  });

  it('owned item: every aspect high', async () => {
    db.items.sw = { id: 'sw', type: 'weapon', data: sword, holderId: 'violet', campaignId: 'c1', status: 'ACTIVE' };
    const r = await seedOnFirstContact({ ...base, subjectId: 'sw', subjectKind: 'ITEM' });
    expect(r.contact).toBe('owned');
    expect(r.seeded).toContain('damage');
    expect(db.rows.every((x) => x.score === FAMILIARITY_SEED.owned)).toBe(true);
  });

  it('known category: holding another of the type, or knowing one, seeds identity + appearance at mid', async () => {
    db.items.knife = { id: 'knife', type: 'tool', data: '{"description":"a butter knife"}', holderId: null, campaignId: 'c1', status: 'ACTIVE' };
    db.items.mine = { id: 'mine', type: 'tool', data: '{}', holderId: 'violet', campaignId: 'c1', status: 'ACTIVE' };
    const r = await seedOnFirstContact({ ...base, subjectId: 'knife', subjectKind: 'ITEM' });
    expect(r).toEqual({ contact: 'known-category', seeded: ['identity', 'appearance'] });

    db.rows = [];
    db.items.mine.holderId = null;
    db.rows.push({ ...base, perceiverId: 'ent-v', subjectId: 'mine', subjectKind: 'ITEM', aspectKind: 'identity', score: 0.6, lastSource: 'use', lastCycle: 7 } as Row);
    expect((await seedOnFirstContact({ ...base, subjectId: 'knife', subjectKind: 'ITEM' })).contact).toBe('known-category');
  });

  it("a stranger thing (unknown or 'misc' category) seeds nothing", async () => {
    db.items.odd = { id: 'odd', type: 'misc', data: '{}', holderId: null, campaignId: 'c1', status: 'ACTIVE' };
    db.items.other = { id: 'other', type: 'misc', data: '{}', holderId: 'violet', campaignId: 'c1', status: 'ACTIVE' };
    expect(await seedOnFirstContact({ ...base, subjectId: 'odd', subjectKind: 'ITEM' })).toEqual({ contact: 'stranger', seeded: [] });
    expect(db.rows).toEqual([]);
  });

  it('first contact only: an existing row is never touched for a non-Godhead', async () => {
    db.rows.push({ campaignId: 'c1', perceiverId: 'ent-v', subjectId: 'violet', subjectKind: 'SELF', aspectKind: 'identity', score: 0.2, lastSource: 'exposure', lastCycle: 1 });
    const r = await seedOnFirstContact({ ...base, subjectId: 'violet', subjectKind: 'SELF' });
    expect(r.seeded).not.toContain('identity');
    expect(db.rows.find((x) => x.aspectKind === 'identity')!.score).toBe(0.2);
    expect(db.changes.some((c) => c.aspectKind === 'identity')).toBe(false);
  });

  it('Godhead (seated, or godlike persona): every aspect F5, and an existing low row is raised', async () => {
    db.godSeats.add('violet');
    expect(await isGodheadBeing('violet')).toBe(true);
    db.items.sw = { id: 'sw', type: 'weapon', data: sword, holderId: null, campaignId: 'c1', status: 'ACTIVE' };
    db.rows.push({ campaignId: 'c1', perceiverId: 'ent-v', subjectId: 'sw', subjectKind: 'ITEM', aspectKind: 'damage', score: 0.1, lastSource: 'exposure', lastCycle: 1 });
    const r = await seedOnFirstContact({ ...base, subjectId: 'sw', subjectKind: 'ITEM' });
    expect(r.contact).toBe('godhead');
    expect(r.seeded).toContain('damage');
    expect(db.rows.every((x) => x.score === 1)).toBe(true);
    expect(db.changes.find((c) => c.aspectKind === 'damage')).toMatchObject({ fromScore: 0.1, fromCycle: 1, toScore: 1, source: 'seed', subjectKind: 'ITEM' });
    expect(db.changes).toHaveLength(r.seeded.length); // one change row per seeded aspect

    db.godSeats.clear();
    db.personas.ruth = JSON.stringify({ godlike: true });
    expect(await isGodheadBeing('ruth')).toBe(true);
    expect(await isGodheadBeing('violet')).toBe(false);
  });
});
