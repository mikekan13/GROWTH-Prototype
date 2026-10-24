/** SEEDS stage (2026-10-12): NPC seed shells (no model call), open threads never filled, location seed from the GM's typed messages. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db, createLoc, modelCall, spawn } = vi.hoisted(() => ({
  db: {
    character: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    campaign: { findUnique: vi.fn() },
    genesisProd: { findFirst: vi.fn() },
    entityRelationship: { upsert: vi.fn() },
    location: { findMany: vi.fn() },
    copilotMessage: { findMany: vi.fn() },
    dayaWorkSession: { findFirst: vi.fn() },
  },
  createLoc: vi.fn(),
  modelCall: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: db }));
// Recursive genesis is scheduled, never run, inside seed_npc (its own tests: genesis-spawn.test.ts).
vi.mock('./genesis-spawn', async (orig) => ({
  ...(await orig<typeof import('./genesis-spawn')>()),
  spawnSeedGenesisLater: (o: unknown) => spawn(o),
}));
vi.mock('./location', () => ({ createLocation: (...a: unknown[]) => createLoc(...a) }));
// Any model path would go through these — a seed must touch none of them.
vi.mock('@/ai/copilot/runtime', () => ({ dispatchPrompt: modelCall }));
vi.mock('./sketch-genesis', () => ({ startSketch: modelCall, runSketch: modelCall }));
vi.mock('./campaign-item', () => ({ createCampaignItem: vi.fn() }));
vi.mock('./forge', () => ({ pullFromGlobalCatalog: vi.fn() }));

import { seedLocation, seedNpc, seedThread } from './genesis-seeds';
import { pickGmWorldMessages } from './genesis-stages';

const APARTMENT = 'please build Violet\'s apartment using these specs… A fourth-floor walkup studio, pre-war, autumn ~4:00 PM.';

beforeEach(() => {
  vi.clearAllMocks();
  db.character.findUnique.mockResolvedValue({ id: 'v', name: 'Violet', campaignId: 'c1' });
  db.character.findMany.mockResolvedValue([{ id: 'v', name: 'Violet' }]);
  db.character.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'npc1', ...data }));
  db.campaign.findUnique.mockResolvedValue({ gmUserId: 'gm1' });
  db.dayaWorkSession.findFirst.mockResolvedValue({ id: 's1', plan: '', progress: '[]', status: 'active' });
  db.entityRelationship.upsert.mockResolvedValue({});
  db.location.findMany.mockResolvedValue([]);
  createLoc.mockImplementation(async (_c: string, _u: string, _r: string, input: { name: string }) => ({ id: 'loc1', name: input.name }));
  db.copilotMessage.findMany.mockResolvedValue([
    { id: 'm_apt', content: APARTMENT, username: 'Mikekan13', contentClass: null, actions: null, createdAt: new Date('2026-08-02T08:58:16Z') },
    { id: 'm_sys', content: '[SYSTEM] Work cycle 1', username: '[system]', contentClass: 'fiction', actions: null, createdAt: new Date('2026-10-12T11:58:00Z') },
    { id: 'm_amb', content: 'uh pass the chips', username: '[ambient]', contentClass: null, actions: null, createdAt: new Date('2026-10-12T11:59:00Z') },
    { id: 'm_tbl', content: 'brb', username: 'Mikekan13', contentClass: 'table', actions: null, createdAt: new Date('2026-10-12T12:00:00Z') },
  ]);
});

describe('seed_npc — a shell, no model call', () => {
  it('creates an NPC SEED (DRAFT, genesisTier SEED, seededFromId) with valence + open thread on the edge', async () => {
    const r = await seedNpc('c1', {
      characterId: 'v', name: 'Rosemary Marsh', relation: 'grandmother', valence: 0.9,
      note: 'Raised her.', openThread: 'What Rosemary kept from her about her mother.',
    });
    expect(r).toMatchObject({ npcId: 'npc1', created: true, valence: 0.9, unresolved: true });
    const row = db.character.create.mock.calls[0][0].data;
    expect(row).toMatchObject({ name: 'Rosemary Marsh', entityType: 'NPC', status: 'DRAFT', genesisTier: 'SEED', seededFromId: 'v', userId: 'gm1', campaignId: 'c1' });
    expect(JSON.parse(row.data)._seed).toMatchObject({ fromCharacterId: 'v', relation: 'grandmother', valence: 0.9, openThread: expect.stringContaining('kept from her') });
    const edge = db.entityRelationship.upsert.mock.calls[0][0].create;
    expect(edge).toMatchObject({ sourceId: 'v', targetId: 'npc1', targetType: 'NPC', relationshipType: 'knows' });
    expect(JSON.parse(edge.data)).toMatchObject({ valence: 0.9, unresolved: true });
    expect(modelCall).not.toHaveBeenCalled();
  });

  it('reuses a person already in the campaign instead of duplicating', async () => {
    db.character.findMany.mockResolvedValue([{ id: 'v', name: 'Violet' }, { id: 'old', name: 'Rosemary Marsh' }]);
    const r = await seedNpc('c1', { characterId: 'v', name: 'rosemary marsh', relation: 'grandmother', valence: 1 });
    expect(r).toMatchObject({ npcId: 'old', created: false, genesis: 'skipped' });
    expect(db.character.create).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it('a NEW seed schedules her own genesis (depth = bearer + 1), linked to the bearer and her session', async () => {
    const r = await seedNpc('c1', { characterId: 'v', name: 'Rosemary Marsh', relation: 'grandmother', valence: 0.9 });
    expect(r.genesis).toBe('scheduled');
    expect(JSON.parse(db.character.create.mock.calls[0][0].data.data)._seed.genesisDepth).toBe(1);
    expect(spawn).toHaveBeenCalledWith({ campaignId: 'c1', npcId: 'npc1', created: true, parent: { characterId: 'v', name: 'Violet', sessionId: 's1' } });
  });

  it("a seed of a seed is stamped depth 2 (the spawn decides it gets no genesis); noSpawn callers schedule nothing", async () => {
    db.character.findUnique.mockResolvedValue({ id: 'r', name: 'Rosemary', campaignId: 'c1', data: JSON.stringify({ _seed: { genesisDepth: 1 } }) });
    db.character.findMany.mockResolvedValue([{ id: 'r', name: 'Rosemary' }]);
    await seedNpc('c1', { characterId: 'r', name: 'The Miller', relation: 'neighbour', valence: 0 }, { noSpawn: true });
    expect(JSON.parse(db.character.create.mock.calls[0][0].data.data)._seed.genesisDepth).toBe(2);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('refuses to seed the character themself — in the pronoun the sheet gives', async () => {
    db.character.findUnique.mockResolvedValue({ id: 'v', name: 'Violet', campaignId: 'c1', data: JSON.stringify({ identity: { sex: 'female' } }) });
    await expect(seedNpc('c1', { characterId: 'v', name: 'Violet', relation: 'self', valence: 0 })).rejects.toThrow(/herself — seed the people around her/);
    db.character.findUnique.mockResolvedValue({ id: 'k', name: 'Kristopher', campaignId: 'c1', data: JSON.stringify({ identity: { physicalDescription: { gender: 'male' } } }) });
    await expect(seedNpc('c1', { characterId: 'k', name: 'Kristopher', relation: 'self', valence: 0 })).rejects.toThrow(/himself — seed the people around him/);
    db.character.findUnique.mockResolvedValue({ id: 'v', name: 'Violet', campaignId: 'c1' });
    await expect(seedNpc('c1', { characterId: 'v', name: 'Violet', relation: 'self', valence: 0 })).rejects.toThrow(/themself/);
  });
});

describe('open threads from prods are never filled', () => {
  it('a LEFT_OPEN prod rides verbatim as unknown', () => {
    expect(seedThread({ openThreadProdId: 'p1' }, { status: 'LEFT_OPEN', question: 'Who gave her the key?' }))
      .toEqual({ text: 'UNKNOWN (left open by the GM): Who gave her the key?', unresolved: true, prodId: 'p1' });
  });
  it('writing an answer beside a left-open thread is refused', () => {
    expect(() => seedThread({ openThreadProdId: 'p1', openThread: 'It was her mother.' }, { status: 'LEFT_OPEN', question: 'q' }))
      .toThrow(/never write an answer/);
  });
  it('only LEFT_OPEN prods ride verbatim', () => {
    expect(() => seedThread({ openThreadProdId: 'p1' }, { status: 'ANSWERED', question: 'q' })).toThrow(/not left open/);
  });
  it('seedNpc records the left-open prod verbatim', async () => {
    db.genesisProd.findFirst.mockResolvedValue({ status: 'LEFT_OPEN', question: 'Who gave her the key?' });
    const r = await seedNpc('c1', { characterId: 'v', name: 'The Stranger', relation: 'unknown giver', valence: 0, openThreadProdId: 'p1' });
    expect(r.openThread).toBe('UNKNOWN (left open by the GM): Who gave her the key?');
  });
});

describe('location seed from the GM\'s typed world messages', () => {
  it('GM world messages: GM-typed fiction only — no [system], [ambient] or table rows', () => {
    const picked = pickGmWorldMessages([
      { id: 'a', content: APARTMENT, username: 'Mikekan13', contentClass: null, actions: null, createdAt: new Date('2026-08-02T00:00:00Z') },
      { id: 'b', content: '[SYSTEM] x', username: '[system]', contentClass: 'fiction', actions: null, createdAt: new Date() },
      { id: 'c', content: 'mm', username: '[ambient]', contentClass: null, actions: null, createdAt: new Date() },
      { id: 'd', content: 'brb', username: 'Mikekan13', contentClass: 'table', actions: null, createdAt: new Date() },
    ]);
    expect(picked.map(m => m.id)).toEqual(['a']);
    expect(picked[0].at).toBe('2026-08-02');
  });

  it('seeds her home citing the 2026-08-02 apartment message; home edge, no deed when she rents', async () => {
    const r = await seedLocation('c1', { id: 'jewl', role: 'GODHEAD' }, {
      characterId: 'v', name: "Violet's Apartment", relation: 'home', description: 'A fourth-floor walkup studio in the historic district.', sourceMessageIds: ['m_apt'],
    });
    expect(r).toMatchObject({ locationId: 'loc1', created: true, relation: 'home', owned: false, sources: ['m_apt'] });
    const input = createLoc.mock.calls[0][3];
    expect(input).toMatchObject({ name: "Violet's Apartment", type: 'building', description: expect.stringContaining('walkup') });
    expect(input.data.seed).toMatchObject({ fromCharacterId: 'v', relation: 'home', sources: ['m_apt'] });
    const types = db.entityRelationship.upsert.mock.calls.map((c: Array<{ create: { relationshipType: string } }>) => c[0].create.relationshipType);
    expect(types).toEqual(['home']);
  });

  it('refuses a source that is not a GM world message', async () => {
    await expect(seedLocation('c1', { id: 'jewl', role: 'GODHEAD' }, {
      characterId: 'v', name: 'X', relation: 'home', description: 'd', sourceMessageIds: ['m_amb'],
    })).rejects.toThrow(/Not GM world messages/);
  });

  it('owned adds the deed edge', async () => {
    await seedLocation('c1', { id: 'jewl', role: 'GODHEAD' }, { characterId: 'v', name: 'Cabin', relation: 'origin', description: 'd', owned: true });
    const types = db.entityRelationship.upsert.mock.calls.map((c: Array<{ create: { relationshipType: string } }>) => c[0].create.relationshipType);
    expect(types).toEqual(['origin', 'owns']);
  });
});
