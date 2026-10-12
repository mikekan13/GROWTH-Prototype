/**
 * SKETCH genesis service (2026-10-12): one call → valid sheet → priced
 * against the wallet → written ACTIVE with memories, in the background.
 * DB, model, wallet, ledger and DAYA authoring are faked at the module seam.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  modelText: '',
  fluid: 10_000,
  created: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  crystallize: vi.fn(async (..._args: unknown[]) => ({})),
  wrap: vi.fn(async () => ({ entityId: 'e1', status: 'DORMANT' })),
  author: vi.fn(async () => ({})),
  seedMem: vi.fn(async (_id: string, _role: string, m: unknown[]) => m.map((_, i) => ({ memoryEntryId: `m${i}` }))),
  setStatus: vi.fn(async () => ({ status: 'ACTIVE' })),
  broadcast: vi.fn(),
  lawful: vi.fn(async () => undefined),
  routed: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    campaign: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 'c1' ? { id: 'c1', gmUserId: 'gm' } : where.id === 'c2' ? { id: 'c2', gmUserId: 'gm2' } : null)) },
    forgeItem: { findFirst: vi.fn(async () => null) },
    character: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { h.created.push(data); return { id: data.id }; }),
      update: vi.fn(async (a: Record<string, unknown>) => { h.updates.push(a); return {}; }),
      delete: vi.fn(async () => ({})),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const c = h.created.find((x) => x.id === where.id);
        return c ? { campaignId: c.campaignId, genesisTier: c.genesisTier } : null;
      }),
    },
    dayaEntity: { findFirst: vi.fn(async () => null) },
    entityRelationship: { findFirst: vi.fn(async () => null) },
  },
}));
vi.mock('@/ai/network/chat', () => ({ routedChatText: h.routed }));
vi.mock('@/services/lawful-intake', () => ({ assertLawfulInput: h.lawful }));
vi.mock('@/services/krma/wallet', () => ({ getCampaignEconomy: vi.fn(async () => ({ fluid: BigInt(h.fluid) })) }));
vi.mock('@/services/krma/crystallization', () => ({ crystallizeEntity: h.crystallize }));
vi.mock('@/services/canvas-placement', () => ({ snapCharacterToLocation: vi.fn() }));
vi.mock('@/services/maturity', () => ({ assertMayEnterCampaign: vi.fn(), REMOVED_STATUS: 'REMOVED' }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: h.broadcast }));
vi.mock('@/daya/authoring', () => ({
  wrapCharacterAsDaya: h.wrap,
  updateDayaAuthoring: h.author,
  seedEntityMemories: h.seedMem,
  setDayaStatus: h.setStatus,
}));

import { startSketch, awaitSketch, getSketchStatus, markForDeepening, __resetSketchJobs } from './sketch-genesis';
import { calculateCharacterTKV } from '@/lib/kv-calculator';
import type { GrowthCharacter } from '@/types/growth';

const GM = { id: 'gm', role: 'WATCHER' };

function answer(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    name: 'Bertram Ashby',
    persona: 'Keeps the Drowned Lantern; wants the debt-collectors gone by winter.',
    voice: 'Gravel and grievance; answers questions with questions.',
    memories: [
      'The night the river took the old cellar and his father with it.',
      'Watering the ale the winter the harvest failed, and never stopping.',
      'A stranger paid in silver once and never came back for the change.',
      'His daughter left for the city without saying goodbye.',
    ],
    seedName: 'Human',
    attributes: { clout: 40, celerity: 2, constitution: 4, flow: 1, focus: 2, willpower: 3, wisdom: 3, wit: 2 },
    skills: [
      { name: 'Brewing', die: 'd2', governors: ['wisdom'] },
      { name: 'Haggling', level: 6, governors: ['wit'] },
    ],
    traitHints: [{ name: 'Iron Gut', type: 'nectar' }],
    ...over,
  });
}

beforeEach(() => {
  __resetSketchJobs();
  h.created.length = 0;
  h.updates.length = 0;
  h.fluid = 10_000;
  for (const f of [h.crystallize, h.wrap, h.author, h.seedMem, h.setStatus, h.broadcast, h.lawful, h.routed]) f.mockClear();
  h.routed.mockImplementation(async () => ({ text: h.modelText, model: 'm', usage: { inputTokens: 900, outputTokens: 600, cacheReadTokens: 0, cacheWriteTokens: 0 }, lane: {} }));
  h.modelText = answer();
});

describe('sketch genesis — the write set', () => {
  it('returns PENDING at once, then writes Character NPC + DAYA ACTIVE + believed sheet + N memories', async () => {
    const started = await startSketch('c1', GM, { seedText: 'a grumpy innkeeper' });
    expect(started.status).toBe('PENDING');
    expect(h.routed).not.toHaveBeenCalled(); // background, not inline
    expect((await getSketchStatus('c1', GM, started.characterId)).status).toBe('PENDING');

    const job = await awaitSketch(started.characterId);
    expect(job?.status).toBe('DONE');
    expect((await getSketchStatus('c1', GM, started.characterId)).status).toBe('DONE');

    // One structured call, class fiction, judgment lane.
    expect(h.routed).toHaveBeenCalledTimes(1);
    expect(h.routed.mock.calls[0][0]).toMatchObject({ caller: 'sketch-genesis', lane: 'judgment', contentClass: 'fiction', campaignId: 'c1' });

    // Character: NPC, SKETCH, owned by the campaign's GM, in the campaign.
    expect(h.created).toHaveLength(1);
    const row = h.created[0];
    expect(row).toMatchObject({ id: started.characterId, entityType: 'NPC', genesisTier: 'SKETCH', campaignId: 'c1', userId: 'gm', name: 'Bertram Ashby' });
    const sheet = JSON.parse(row.data as string) as GrowthCharacter & { _npc: { description: string } };
    // Repairs: clout 40 → 20; d2 → d4; Human seed applied (Frequency 40, d8, augments).
    expect(sheet.attributes.clout.level).toBe(20);
    expect(sheet.skills.find((s) => s.name === 'Brewing')?.level).toBe(4);
    expect(sheet.attributes.frequency.level).toBe(40);
    expect(sheet.creation?.seed?.baseFateDie).toBe('d8');
    expect(sheet.attributes.willpower.augmentPositive).toBe(13);
    expect(sheet._npc.description).toMatch(/Drowned Lantern/);

    // Priced through the crystallization debit at the sheet's own TKV.
    const kv = calculateCharacterTKV(sheet).total;
    expect(h.crystallize).toHaveBeenCalledWith('gm', 'WATCHER', 'c1', expect.objectContaining({ entityId: started.characterId, entityType: 'character', karmicValue: kv, action: 'crystallize' }));

    // DAYA: wrapped (entity + affect + believed sheet — the sheet carries willpower), persona, memories, ACTIVE.
    expect(h.wrap).toHaveBeenCalledWith(started.characterId, 'WATCHER');
    expect(h.author).toHaveBeenCalledWith(started.characterId, 'WATCHER', expect.objectContaining({ voiceNotes: expect.stringMatching(/Gravel/) }));
    expect(h.seedMem).toHaveBeenCalledTimes(1);
    expect(h.seedMem.mock.calls[0][2]).toHaveLength(4);
    expect(h.setStatus).toHaveBeenCalledWith(started.characterId, 'WATCHER', 'ACTIVE');
    expect(h.updates.some((u) => (u.data as Record<string, unknown>)?.status === 'ACTIVE')).toBe(true);

    // The card appears live.
    expect(h.broadcast).toHaveBeenCalledWith('c1', expect.objectContaining({ kind: 'character_update', characterId: started.characterId }));
    // Order: money before the being wakes.
    expect(h.crystallize.mock.invocationCallOrder[0]).toBeLessThan(h.wrap.mock.invocationCallOrder[0]);
  });

  it('over-wallet KV is clamped to the fluid KRMA and the summary says so', async () => {
    h.fluid = 200; // the proposal prices at 227; the bare Human floor is 188
    const { characterId } = await startSketch('c1', GM, { seedText: 'a retired champion' });
    const job = await awaitSketch(characterId);
    expect(job?.status).toBe('DONE');
    const sheet = JSON.parse(h.created[0].data as string) as GrowthCharacter;
    const kv = calculateCharacterTKV(sheet).total;
    expect(kv).toBeLessThanOrEqual(200);
    expect(sheet.skills).toEqual([]); // skills give way first
    expect(sheet.attributes.clout.level).toBeLessThan(20);
    expect(h.crystallize.mock.calls[0][3]).toMatchObject({ karmicValue: kv });
    expect(job?.summary).toMatch(/clamped \d+ → \d+ KRMA/);
  });

  it('memories in game vocabulary are dropped; zero memories still wakes the being', async () => {
    h.modelText = answer({ memories: ['He rolled a d20 and gained a skill level.', 'Spent 5 KRMA on his Frequency.'] });
    const { characterId } = await startSketch('c1', GM, { seedText: 'a gambler' });
    expect((await awaitSketch(characterId))?.status).toBe('DONE');
    expect(h.seedMem).not.toHaveBeenCalled();
    expect(h.setStatus).toHaveBeenCalledWith(characterId, 'WATCHER', 'ACTIVE');
  });

  it('a withheld model answer fails the job and writes nothing', async () => {
    h.modelText = '[withheld: this content cannot be processed]';
    const { characterId } = await startSketch('c1', GM, { seedText: 'someone' });
    const job = await awaitSketch(characterId);
    expect(job?.status).toBe('FAILED');
    expect(h.created).toHaveLength(0);
    expect(h.crystallize).not.toHaveBeenCalled();
    expect((await getSketchStatus('c1', GM, characterId)).status).toBe('FAILED');
  });

  it('a wallet below even the bare floor refuses up front (the wallet is never bypassed)', async () => {
    h.fluid = 10;
    await expect(startSketch('c1', GM, { seedText: 'a beggar' })).rejects.toMatchObject({ status: 400 });
    expect(h.routed).not.toHaveBeenCalled();
  });

  it('a very long seed text is clipped, not refused', async () => {
    const { characterId } = await startSketch('c1', GM, { seedText: 'innkeeper '.repeat(2000) });
    expect((await awaitSketch(characterId))?.status).toBe('DONE');
    expect(String(h.routed.mock.calls[0][1].user).length).toBeLessThan(4100);
  });
});

describe('sketch genesis — permissions', () => {
  it('a Trailblazer and another campaign\'s Watcher get 403; nothing is scheduled', async () => {
    await expect(startSketch('c1', { id: 'p1', role: 'TRAILBLAZER' }, { seedText: 'x' })).rejects.toMatchObject({ status: 403 });
    await expect(startSketch('c1', { id: 'gm2', role: 'WATCHER' }, { seedText: 'x' })).rejects.toMatchObject({ status: 403 });
    expect(h.lawful).not.toHaveBeenCalled();
    expect(h.routed).not.toHaveBeenCalled();
  });

  it('ADMIN may sketch in any campaign; the NPC is still owned by the campaign GM', async () => {
    const { characterId } = await startSketch('c2', { id: 'mike', role: 'ADMIN' }, { seedText: 'a ferryman' });
    expect((await awaitSketch(characterId))?.status).toBe('DONE');
    expect(h.created[0]).toMatchObject({ campaignId: 'c2', userId: 'gm2' });
  });

  it('status is GM-only and campaign-scoped', async () => {
    const { characterId } = await startSketch('c1', GM, { seedText: 'x' });
    await awaitSketch(characterId);
    await expect(getSketchStatus('c1', { id: 'p1', role: 'TRAILBLAZER' }, characterId)).rejects.toMatchObject({ status: 403 });
    await expect(getSketchStatus('c2', { id: 'gm2', role: 'WATCHER' }, characterId)).rejects.toMatchObject({ status: 404 });
  });
});

describe('markForDeepening', () => {
  it('sets the flag for the deep pipeline (GM only)', async () => {
    const { characterId } = await startSketch('c1', GM, { seedText: 'x' });
    await awaitSketch(characterId);
    await expect(markForDeepening(characterId, { id: 'p1', role: 'TRAILBLAZER' })).rejects.toMatchObject({ status: 403 });
    await markForDeepening(characterId, GM);
    expect(h.updates.some((u) => (u.data as Record<string, unknown>)?.deepenRequested === true)).toBe(true);
  });
});
