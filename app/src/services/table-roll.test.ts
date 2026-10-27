import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  created: [] as Array<{ type: string; payload: Record<string, unknown>; characterId?: string }>,
  pushed: [] as Array<{ data: { kind: string; event?: { payload: Record<string, unknown> } }; target?: string }>,
  verdicts: new Map<string, { reaches: boolean; noticed: boolean; via: string[] }>(),
  initiate: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  prisma: {
    campaign: { findUnique: vi.fn(async () => ({ gmUserId: 'gm', currentCycle: 0.2, aiSettings: '{}' })) },
    character: {
      findUnique: vi.fn(async () => ({ id: 'k', name: 'Kristopher', userId: null, entityType: 'NPC', campaignId: 'c1', data: '{"skills":[],"attributes":{}}' })),
      findMany: vi.fn(async () => [
        { id: 'k', userId: null, entityType: 'NPC' },
        { id: 'v', userId: 'u-violet', entityType: 'PLAYER_CHARACTER' },
        { id: 't', userId: 'u-tom', entityType: 'PLAYER_CHARACTER' },
      ]),
    },
  },
}));
vi.mock('@/ai/campaign-ai', () => ({ getCampaignAISettings: vi.fn(async () => ({ defaultProvider: 'cloud' })) }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: (_c: string, data: { kind: string; event?: { payload: Record<string, unknown> } }, target?: string) => { h.pushed.push({ data, target }); } }));
vi.mock('@/services/campaign-event', () => ({
  createCampaignEvent: vi.fn(async (i: { type: string; payload: Record<string, unknown>; characterId?: string }) => { h.created.push(i); return { id: 'e1', createdAt: new Date('2026-10-26T10:00:00Z'), sessionId: 's1' }; }),
}));
vi.mock('@/services/skill-check', () => ({ initiateSkillCheck: h.initiate }));
vi.mock('@/services/table-speak', () => ({ tableParticipantIds: async () => ['k', 'v', 't', 'x'] }));
vi.mock('@/services/perception-reach', () => ({
  judgeCanonReach: async () => ({ verdicts: h.verdicts, source: 'model', ms: 1, beings: [] }),
}));

import { startTableRoll, writeRollCard, rollVisibility } from './table-roll';

const pending = {
  id: 'chk', campaignId: 'c1', isSkilled: false, skillName: undefined, sdDie: 'flat:0', sdResult: 0, fateDie: 'd6', dr: 10, difficultyHint: 'purple' as const,
  purpose: { kind: 'roll' as const, rollId: 'r1', event: 'Kristopher tries to force the lock.', actorId: 'k', actorName: 'Kristopher', governor: 'clout', ownerRole: 'watcher' as const, drBy: 'sim' as const, cycle: 0.2 },
};

beforeEach(() => {
  h.created.length = 0; h.pushed.length = 0; h.verdicts.clear(); h.initiate.mockReset();
});

describe('startTableRoll', () => {
  it('does nothing for an act that is not an active check (knocking, walking, noticing)', async () => {
    for (const text of ['Kristopher knocks twice.', 'She notices the smell.', 'He walks to the door.']) {
      expect(await startTableRoll('c1', { id: 'gm', username: 'mike' }, { characterId: 'k', text })).toBeNull();
    }
    expect(h.initiate).not.toHaveBeenCalled();
  });
});

describe('rollVisibility — the reach verdict decides who reads the card', () => {
  it('sight -> the readout, hearing only -> the sentence, not reached / unnoticed -> nothing', async () => {
    h.verdicts.set('v', { reaches: true, noticed: true, via: ['sight', 'hearing'] });
    h.verdicts.set('t', { reaches: true, noticed: true, via: ['hearing'] });
    h.verdicts.set('x', { reaches: true, noticed: false, via: ['sight'] });
    expect(await rollVisibility('c1', 'k', 'Kristopher tries to force the lock.')).toEqual({ v: 'full', t: 'event' });
  });
});

describe('writeRollCard', () => {
  it('writes ONE roll event with the whole card + visibility, and pushes each reader only their own cut', async () => {
    h.verdicts.set('v', { reaches: true, noticed: true, via: ['sight'] });
    h.verdicts.set('t', { reaches: true, noticed: true, via: ['hearing'] });
    await writeRollCard('c1', pending, { total: 6, success: false, margin: -4, effortBy: { clout: 2 }, fdResult: 4, chosenBy: 'ai' });
    expect(h.created).toHaveLength(1);
    expect(h.created[0]).toMatchObject({ type: 'roll', characterId: 'k' });
    expect(h.created[0].payload).toMatchObject({
      kind: 'roll', event: 'Kristopher tries to force the lock.', effort: 2, total: 6, dr: 10, drBy: 'sim', chosenBy: 'ai', sd: { die: 'flat:0', value: 0 }, fd: { die: 'd6', value: 4 },
      visibility: { v: 'full', t: 'event' },
    });
    const terminal = h.pushed.filter((p) => p.data.kind === 'terminal_event');
    const byTarget = new Map(terminal.map((p) => [p.target, p.data.event!.payload]));
    expect(byTarget.get('gm')).toMatchObject({ view: 'watcher', dr: 10 });
    expect(byTarget.get('u-violet')).toMatchObject({ view: 'full', total: 6 });
    expect(byTarget.get('u-violet')!.dr).toBeUndefined();
    expect(byTarget.get('u-tom')).toMatchObject({ view: 'event', total: 0 });
    // never a campaign-wide push of the numbers
    expect(terminal.every((p) => !!p.target)).toBe(true);
  });

  it('a check that is not a roll writes nothing', async () => {
    await writeRollCard('c1', { ...pending, purpose: undefined }, { total: 1, success: true, margin: 0, effortBy: {} });
    expect(h.created).toHaveLength(0);
  });
});
