import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = { campaignId: string; subjectKind: string; score: number; lastCycle: number | null; lastSource: string; impression: string | null };
const h = vi.hoisted(() => ({
  rows: new Map<string, Row>(),
  changes: [] as Array<Record<string, unknown>>,
  godhead: false,
  names: { chars: [] as Array<{ id: string; name: string }>, items: [] as Array<{ id: string; name: string }>, locs: [] as Array<{ id: string; name: string }> },
}));

vi.mock('@/lib/db', () => {
  const k = (w: { perceiverId_subjectId_aspectKind: { perceiverId: string; subjectId: string; aspectKind: string } }) => {
    const x = w.perceiverId_subjectId_aspectKind;
    return `${x.perceiverId}|${x.subjectId}|${x.aspectKind}`;
  };
  const familiarity = {
    findUnique: async ({ where }: { where: Parameters<typeof k>[0] }) => h.rows.get(k(where)) ?? null,
    findMany: async ({ where }: { where: { perceiverId: string; subjectId: { not: string } } }) =>
      [...h.rows.entries()]
        .map(([key, r]) => { const [p, subjectId, aspectKind] = key.split('|'); return { p, subjectId, aspectKind, ...r }; })
        .filter((r) => r.p === where.perceiverId && r.score > 0 && r.subjectKind !== 'SELF' && r.subjectId !== where.subjectId.not)
        .map((r) => ({ campaignId: r.campaignId, subjectId: r.subjectId, subjectKind: r.subjectKind, aspectKind: r.aspectKind })),
    upsert: async ({ where, update }: { where: Parameters<typeof k>[0]; update: Partial<Row> }) => {
      const key = k(where);
      h.rows.set(key, { ...h.rows.get(key)!, ...update });
      return { ...where.perceiverId_subjectId_aspectKind, updatedAt: new Date(0), ...h.rows.get(key)! };
    },
  };
  const familiarityChange = { createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { h.changes.push(...data); return { count: data.length }; } };
  const byIds = (list: () => Array<{ id: string; name: string }>) => ({ findMany: async ({ where }: { where: { id: { in: string[] } } }) => list().filter((n) => where.id.in.includes(n.id)) });
  return {
    prisma: {
      $transaction: async (fn: (t: { familiarity: typeof familiarity; familiarityChange: typeof familiarityChange }) => Promise<unknown>) => fn({ familiarity, familiarityChange }),
      familiarity,
      dayaEntity: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === 'e1' ? { characterId: 'violet' } : null), findMany: async () => [] },
      character: byIds(() => h.names.chars),
      campaignItem: byIds(() => h.names.items),
      location: byIds(() => h.names.locs),
    },
  };
});
vi.mock('@/services/history', () => ({ currentCycleOf: async () => 10 }));
vi.mock('@/services/familiarity-seed', () => ({ isGodheadBeing: async () => h.godhead }));
vi.mock('@/services/campaign-access', () => ({ requireCampaignGM: async () => undefined }));

import { refreshFamiliarityByThought, refreshByThought, subjectsNamedIn, THOUGHT_SOURCE, THOUGHT_REFRESH_TUNING } from './familiarity-thought';
import { fadeFamiliarity } from './familiarity';

const row = (o: Partial<Row> = {}): Row => ({ campaignId: 'c', subjectKind: 'NPC', score: 0.5, lastCycle: 4, lastSource: 'exposure', impression: null, ...o });

beforeEach(() => {
  h.rows.clear(); h.changes = []; h.godhead = false;
  h.names = { chars: [{ id: 'ruth', name: 'Ruth Almswood' }, { id: 'stranger', name: 'Odo' }], items: [{ id: 'sword', name: 'Grey Sword' }], locs: [{ id: 'apt', name: 'Apartment' }] };
});

describe('pure helpers', () => {
  it('refreshByThought strengthens a little, with diminishing returns', () => {
    expect(refreshByThought(0.5)).toBeCloseTo(0.5 + 0.5 * THOUGHT_REFRESH_TUNING.step);
    expect(refreshByThought(0.9) - 0.9).toBeLessThan(refreshByThought(0.5) - 0.5);
    expect(refreshByThought(1)).toBe(1);
  });
  it('subjectsNamedIn matches whole words, people by first name, never partial words', () => {
    const known = [{ id: 'ruth', name: 'Ruth Almswood', kind: 'NPC' }, { id: 'sword', name: 'Grey Sword', kind: 'ITEM' }, { id: 'apt', name: 'Apartment', kind: 'LOCATION' }];
    expect(subjectsNamedIn(['Why does ruth keep looking at me?'], known)).toEqual(['ruth']);
    expect(subjectsNamedIn(['The truthful answer is the grey sword.'], known)).toEqual(['sword']);
    expect(subjectsNamedIn(['Apartments everywhere.'], known)).toEqual([]);
  });
});

describe('refreshFamiliarityByThought', () => {
  it('a known subject named in a thought: fade applied, small strengthen, clock reset, source thought, change logged', async () => {
    h.rows.set('e1|ruth|identity', row());
    h.rows.set('e1|ruth|appearance', row({ score: 0.3 }));
    const n = await refreshFamiliarityByThought({ perceiverId: 'e1', texts: ['Ruth again. She never sits still.'] });
    expect(n).toBe(2);
    const faded = fadeFamiliarity(0.5, 6);
    expect(h.rows.get('e1|ruth|identity')).toMatchObject({ lastSource: THOUGHT_SOURCE, lastCycle: 10 });
    expect(h.rows.get('e1|ruth|identity')!.score).toBeCloseTo(refreshByThought(faded));
    expect(h.changes).toEqual(expect.arrayContaining([expect.objectContaining({ subjectId: 'ruth', aspectKind: 'identity', fromScore: 0.5, fromCycle: 4, source: 'thought', cycle: 10 })]));
  });

  it('resolved subject ids refresh without a name match; unknown ids teach nothing', async () => {
    h.rows.set('e1|sword|identity', row({ subjectKind: 'ITEM' }));
    expect(await refreshFamiliarityByThought({ perceiverId: 'e1', subjectIds: ['sword', 'stranger'] })).toBe(1);
    expect(h.rows.has('e1|stranger|identity')).toBe(false);
  });

  it('thinking about a stranger (no row, or score 0) teaches nothing', async () => {
    h.rows.set('e1|ruth|identity', row({ score: 0 }));
    expect(await refreshFamiliarityByThought({ perceiverId: 'e1', texts: ['Odo. Ruth.'] })).toBe(0);
    expect(h.changes).toEqual([]);
  });

  it('once per beat: a row already refreshed by thought this cycle is not touched again', async () => {
    h.rows.set('e1|ruth|identity', row({ lastSource: THOUGHT_SOURCE, lastCycle: 10, score: 0.6 }));
    expect(await refreshFamiliarityByThought({ perceiverId: 'e1', subjectIds: ['ruth'] })).toBe(0);
    expect(h.rows.get('e1|ruth|identity')!.score).toBe(0.6);
  });

  it('a held wrong impression is kept, not fixed, by rehearsal', async () => {
    h.rows.set('e1|sword|damage', row({ subjectKind: 'ITEM', score: 0.99, impression: '3d6' }));
    await refreshFamiliarityByThought({ perceiverId: 'e1', subjectIds: ['sword'] });
    expect(h.rows.get('e1|sword|damage')!.impression).toBe('3d6');
    expect(h.changes[0]).toMatchObject({ fromImpression: '3d6', toImpression: '3d6' });
  });

  it('Godheads and SELF rows are unaffected; writes are bounded', async () => {
    h.rows.set('e1|violet|identity', row({ subjectKind: 'SELF' }));
    expect(await refreshFamiliarityByThought({ perceiverId: 'e1', subjectIds: ['violet'] })).toBe(0);
    h.rows.set('e1|ruth|identity', row());
    h.godhead = true;
    expect(await refreshFamiliarityByThought({ perceiverId: 'e1', subjectIds: ['ruth'] })).toBe(0);
    h.godhead = false;
    for (let i = 0; i < THOUGHT_REFRESH_TUNING.maxWrites + 10; i++) h.rows.set(`e1|ruth|a${i}`, row());
    expect(await refreshFamiliarityByThought({ perceiverId: 'e1', subjectIds: ['ruth'] })).toBe(THOUGHT_REFRESH_TUNING.maxWrites);
  });
});
