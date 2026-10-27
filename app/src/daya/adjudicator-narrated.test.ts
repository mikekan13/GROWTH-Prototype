/**
 * The Watcher's voiced act moves the map (HW3 2026-10-24): resolveIntent with
 * `narrated: true` asks for no check, keeps the Watcher's sentence as the
 * outcome, skips the locked-door pre-check, and still lands the effects.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({
  chat: vi.fn(),
  apply: vi.fn(),
  lockedDoor: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    character: {
      findUnique: vi.fn(async () => ({ id: 'kris', name: 'Kristopher', data: '{}' })),
      findMany: vi.fn(async () => [{ name: 'Violet' }]),
    },
    campaignItem: { findMany: vi.fn(async () => []) },
    worldFact: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock('./model-client', () => ({ chat: h.chat }));
vi.mock('./world-ledger', () => ({
  currentFacts: vi.fn(async () => []),
  establishFact: vi.fn(async (campaignId: string, subjectKey: string, fact: string) => ({ id: 'f1', campaignId, subjectKey, fact })),
  supersede: vi.fn(),
}));
vi.mock('./entity', () => ({ resolveDayaEntityId: vi.fn(async () => 'da-kris') }));
vi.mock('@/services/world-apply', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/world-apply')>();
  return {
    ...real,
    actorMap: vi.fn(async () => ({ roomId: 'landing', roomName: 'Fourth-floor landing', home: { id: 'bldg', name: 'Building' }, doors: [{ id: 'd1', name: 'Entry door', between: ['Fourth-floor landing', 'Main Room'], state: 'locked', homeId: 'apt' }] })),
    lockedDoorInTheWay: h.lockedDoor,
    applyActEffects: h.apply,
  };
});

import { resolveIntent } from './adjudicator';

const reply = (obj: unknown) => ({ text: JSON.stringify(obj), usage: {} });

beforeEach(() => {
  h.chat.mockReset();
  h.apply.mockReset();
  h.lockedDoor.mockReset();
  h.apply.mockResolvedValue({ applied: ['Kristopher → Stairwell'], refused: [] });
  h.lockedDoor.mockReturnValue({ id: 'd1', name: 'Entry door', between: [], state: 'locked', homeId: 'apt' });
});

describe('a narrated act', () => {
  it('keeps the words as the outcome, rolls nothing, and lands the effects', async () => {
    h.chat.mockResolvedValue(reply({
      outcome: 'He walks away.',
      factsToWrite: [],
      factsToSupersede: [],
      check: { attribute: 'Agility', dr: 12 },
      experienceEvent: { content: 'The hall stretches out.', valence: 0, salience: 0.2 },
      effects: [{ op: 'move', to: 'Stairwell' }],
    }));
    const r = await resolveIntent({ campaignId: 'c1', entityCharacterId: 'kris', intent: 'walks slowly down the hall to the stairwell', cycle: 1, narrated: true });
    expect(r.outcome).toBe('walks slowly down the hall to the stairwell');
    expect(r.roll).toBeUndefined();
    expect(r.mapBlocked).toBeUndefined();
    expect(h.apply).toHaveBeenCalledWith('c1', 'kris', [{ op: 'move', to: 'Stairwell' }], 'walks slowly down the hall to the stairwell');
    expect(r.effects?.applied).toEqual(['Kristopher → Stairwell']);
    // The locked-door pre-check is a being's gate, not the Watcher's.
    expect(h.lockedDoor).not.toHaveBeenCalled();
    const prompt = h.chat.mock.calls[0][0].messages[1].content as string;
    expect(prompt).toContain('Narrated by the Watcher');
    expect(prompt).toContain('"check" MUST be null');
  });

  it("a being's own act still meets the locked door first", async () => {
    const r = await resolveIntent({ campaignId: 'c1', entityCharacterId: 'kris', intent: 'push the door open', cycle: 1 });
    expect(r.mapBlocked).toBe(true);
    expect(h.chat).not.toHaveBeenCalled();
  });
});
