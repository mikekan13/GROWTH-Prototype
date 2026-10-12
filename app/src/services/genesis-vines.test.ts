/** VINES stage (2026-10-12): AI-chosen GOALS only, authoredBy 'ai', within the seed's slots. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db, emit } = vi.hoisted(() => ({
  db: {
    character: { findUnique: vi.fn() },
    forgeItem: { findUnique: vi.fn() },
    goal: { findMany: vi.fn(), create: vi.fn() },
  },
  emit: vi.fn(async () => undefined),
}));

vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('./godhead-dispatcher', () => ({ emit }));
vi.mock('./daya-affect', () => ({ applyDispositionEvent: vi.fn() }));
vi.mock('./genesis-sheet-sync', () => ({ liveBlockLinks: vi.fn(async () => [{ block: { id: 'human', type: 'seed' } }]) }));

import { authorVineGoals, vineSlotsForSeed } from './genesis-vines';

beforeEach(() => {
  vi.clearAllMocks();
  db.character.findUnique.mockResolvedValue({ campaignId: 'c1', data: JSON.stringify({ creation: {} }) });
  db.forgeItem.findUnique.mockResolvedValue({ data: JSON.stringify({ nectars: ['Ambitious'] }) });
  db.goal.findMany.mockResolvedValue([]);
  db.goal.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: `g${db.goal.create.mock.calls.length}`, ...data }));
});

describe('vine slots', () => {
  it('avg 3; the Human "Ambitious" nectar adds one; a seed stat wins when present', () => {
    expect(vineSlotsForSeed(null)).toBe(3);
    expect(vineSlotsForSeed({ nectars: ['Ambitious'] })).toBe(4);
    expect(vineSlotsForSeed({ grovineSlots: 2 })).toBe(2);
  });
});

describe('authorVineGoals', () => {
  it('writes GOALS marked authoredBy ai — no resistance, no opportunity — and lets the Terminal triage them', async () => {
    const r = await authorVineGoals('c1', { characterId: 'v', goals: [{ description: 'Finish the book about the man who keeps coming back' }, { description: 'Open the door she sealed' }] });
    expect(r).toMatchObject({ slots: 4, used: 2 });
    for (const [arg] of db.goal.create.mock.calls) {
      expect(arg.data).toMatchObject({ characterId: 'v', campaignId: 'c1', authoredBy: 'ai' });
      expect(arg.data).not.toHaveProperty('resistancePlan');
      expect(arg.data).not.toHaveProperty('resistancePrompt');
      expect(arg.data).not.toHaveProperty('opportunities');
    }
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('refuses more goals than her free slots', async () => {
    db.goal.findMany.mockResolvedValue([{ description: 'a' }, { description: 'b' }, { description: 'c' }]);
    await expect(authorVineGoals('c1', { characterId: 'v', goals: [{ description: 'one more' }, { description: 'two more' }] }))
      .rejects.toThrow(/at most 1/);
  });
});
