/** AGE stage (2026-10-12): Σ instance years = the brief's AGE (Violet 25); birthCycle + identity.age + fatedAge stamped. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db, links, session } = vi.hoisted(() => ({
  db: {
    character: { findUnique: vi.fn(), update: vi.fn() },
    characterBlockLink: { update: vi.fn() },
    campaign: { findUnique: vi.fn() },
  },
  links: { rows: [] as unknown[] },
  session: { plan: 'NAME: Violet\nAGE: 25\n' as string | null },
}));

vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('./genesis-sheet-sync', () => ({ liveBlockLinks: vi.fn(async () => links.rows) }));
vi.mock('./block-attachment', () => ({ findGenesisSession: vi.fn(async () => ({ id: 's1', plan: session.plan })) }));

import { planStartingAge, setStartingAge } from './genesis-age';
import type { LinkWithBlock } from './genesis-sheet-sync';

function link(id: string, type: string, name: string, data: Record<string, unknown>, localName: string | null = null): LinkWithBlock {
  return { id, forgeItemId: `f_${id}`, localName, story: 's', ageAdded: null, createdAt: new Date(), block: { id: `f_${id}`, type, name, status: 'published', data: JSON.stringify(data) } };
}

// Violet as born: root 18 + branches 2 + 6 = 26 against AGE 25.
const VIOLET = [
  link('seed', 'seed', 'Human', { fatedAge: 80 }),
  link('root', 'root', 'Grandparent Household', { ageAdded: 18 }, "Rosemary's House"),
  link('key', 'branch', 'Violated Trust', { ageAdded: 2 }, 'The Key'),
  link('hold', 'branch', 'Years of Solitary Craft', { ageAdded: 6 }, 'The Holding Years'),
];

beforeEach(() => {
  vi.clearAllMocks();
  links.rows = VIOLET;
  session.plan = 'NAME: Violet\nAGE: 25\n';
  db.character.findUnique.mockResolvedValue({ campaignId: 'c1', data: JSON.stringify({ identity: { name: 'Violet' }, fatedAge: 0 }) });
  db.campaign.findUnique.mockResolvedValue({ currentCycle: 3.5 });
});

describe('planStartingAge', () => {
  it('refuses years that miss the brief\'s AGE and lists her blocks', () => {
    expect(() => planStartingAge(VIOLET, [], 25)).toThrow(/sum to 26.*AGE is 25/);
  });
  it('her own years per block make the sum land on 25', () => {
    const p = planStartingAge(VIOLET, [{ block: "Rosemary's House", ageAdded: 17 }], 25);
    expect(p.age).toBe(25);
    expect(p.overrides).toEqual([{ linkId: 'root', ageAdded: 17 }]);
  });
  it('a root covers at most 25 years', () => {
    expect(() => planStartingAge(VIOLET, [{ block: 'Grandparent Household', ageAdded: 26 }], null)).toThrow(/at most 25/);
  });
});

describe('setStartingAge', () => {
  it('writes the instance years, identity.age 25, birthCycle = clock − 25, fatedAge 80', async () => {
    const r = await setStartingAge('c1', { characterId: 'v', years: [{ block: 'Years of Solitary Craft', ageAdded: 5 }] });
    expect(r.age).toBe(25);
    expect(db.characterBlockLink.update).toHaveBeenCalledWith({ where: { id: 'hold' }, data: { ageAdded: 5 } });
    const written = JSON.parse(db.character.update.mock.calls[0][0].data.data);
    expect(written.identity.age).toBe(25);
    expect(written.birthCycle).toBe(3.5 - 25);
    expect(written.fatedAge).toBe(80);
  });

  it('writes nothing when the sum is wrong', async () => {
    await expect(setStartingAge('c1', { characterId: 'v' })).rejects.toThrow(/AGE is 25/);
    expect(db.character.update).not.toHaveBeenCalled();
    expect(db.characterBlockLink.update).not.toHaveBeenCalled();
  });
});
