/**
 * Recursive genesis (Mike 2026-10-16): every person JEWL seeds gets her own
 * genesis — a sketch in place, then the walk in SAIL mode, in the background;
 * depth 1 only; never while the parent is still PRODDING; per-campaign switch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db, sketch, complete, settings, updateWorkSession } = vi.hoisted(() => ({
  db: {
    character: { findUnique: vi.fn(), update: vi.fn() },
    campaign: { findUnique: vi.fn() },
    dayaWorkSession: { findUnique: vi.fn() },
  },
  sketch: vi.fn(),
  complete: vi.fn(),
  settings: vi.fn(),
  updateWorkSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('@/ai/campaign-ai', () => ({ getCampaignAISettings: (...a: unknown[]) => settings(...a) }));
vi.mock('./genesis-prods', () => ({ PRODDING_STAGE: 'PRODDING' }));
vi.mock('./sketch-genesis', () => ({ sketchNpc: (...a: unknown[]) => sketch(...a) }));
vi.mock('./genesis-complete', () => ({ completeCharacter: (...a: unknown[]) => complete(...a) }));
vi.mock('./daya-work-session', () => ({ updateWorkSession: (...a: unknown[]) => updateWorkSession(...a) }));

import { SPAWN_MAX_DEPTH, readSeedMeta, seedDepth, seedSketchText, shouldSpawnSeedGenesis, spawnSeedGenesis } from './genesis-spawn';

const rows: Record<string, Record<string, unknown>> = {};
const sheetOf = (id: string) => JSON.parse(rows[id].data as string) as { _seed?: Record<string, unknown> };

beforeEach(() => {
  vi.clearAllMocks();
  rows.v = { id: 'v', name: 'Violet', campaignId: 'c1', genesisTier: null, data: JSON.stringify({ identity: { name: 'Violet' } }) };
  rows.r = {
    id: 'r', name: 'Rosemary Marsh', campaignId: 'c1', genesisTier: 'SEED',
    data: JSON.stringify({ backstory: { notes: 'Raised her above the bakery.' }, _seed: { fromCharacterId: 'v', relation: 'grandmother', valence: 0.9, openThread: 'What she kept from her about her mother.', genesisDepth: 1 } }),
  };
  db.character.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => rows[where.id] ?? null);
  db.character.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { Object.assign(rows[where.id], data); return rows[where.id]; });
  db.campaign.findUnique.mockResolvedValue({ gmUserId: 'gm' });
  db.dayaWorkSession.findUnique.mockResolvedValue({ stage: 'WORLD', status: 'active' });
  settings.mockResolvedValue({ defaultProvider: 'cloud' });
  sketch.mockResolvedValue({ characterId: 'r', name: 'Rosemary Marsh', tkv: 190 });
  complete.mockResolvedValue({ opened: true, sessionId: 'child1', stages: ['AGE', 'WORLD', 'MEMORIES', 'VINES'] });
  updateWorkSession.mockResolvedValue({});
});

describe('depth (pure)', () => {
  it('a seated character is depth 0; a seed carries its stamp; a legacy seed without one is 1', () => {
    expect(seedDepth(rows.v.data as string)).toBe(0);
    expect(seedDepth(rows.r.data as string)).toBe(1);
    expect(seedDepth(JSON.stringify({ _seed: { relation: 'x' } }))).toBe(1);
    expect(seedDepth(null)).toBe(0);
    expect(seedDepth('not json')).toBe(0);
    expect(readSeedMeta(rows.r.data as string)).toMatchObject({ relation: 'grandmother' });
  });
});

describe('shouldSpawnSeedGenesis (pure)', () => {
  const ok = { enabled: true, created: true, childTier: 'SEED', parentDepth: 0, parentStage: 'WORLD', parentStatus: 'active' };
  it('spawns for a new depth-1 seed of a building parent', () => {
    expect(shouldSpawnSeedGenesis(ok)).toEqual({ spawn: true });
  });
  it('refuses: campaign off, reused person, not a shell, too deep, parent PRODDING, parent cancelled', () => {
    expect(shouldSpawnSeedGenesis({ ...ok, enabled: false }).reason).toMatch(/off for this campaign/);
    expect(shouldSpawnSeedGenesis({ ...ok, created: false }).reason).toMatch(/already existed/);
    expect(shouldSpawnSeedGenesis({ ...ok, childTier: 'SKETCH' }).reason).toMatch(/not a seed shell/);
    expect(shouldSpawnSeedGenesis({ ...ok, parentDepth: SPAWN_MAX_DEPTH }).reason).toMatch(/seeds of a seed/);
    expect(shouldSpawnSeedGenesis({ ...ok, parentStage: 'PRODDING' }).reason).toMatch(/still at PRODDING/);
    expect(shouldSpawnSeedGenesis({ ...ok, parentStatus: 'cancelled' }).reason).toMatch(/cancelled/);
  });
});

describe('seedSketchText (pure)', () => {
  it('carries the seed facts only and keeps the open thread open', () => {
    const t = seedSketchText({ name: 'Rosemary Marsh', bearerName: 'Violet', relation: 'grandmother', valence: 0.9, note: 'Raised her.', openThread: 'What she kept back.' });
    expect(t).toBe('Rosemary Marsh, grandmother of Violet. Violet holds them dear. Raised her. Unresolved between them (keep it open, do not answer it): What she kept back.');
    expect(seedSketchText({ name: 'A Stranger', bearerName: 'Violet', valence: -1 })).toBe("A Stranger — a person in Violet's life. Violet holds them with hostility or pain.");
  });
});

describe('spawnSeedGenesis', () => {
  const parent = { characterId: 'v', name: 'Violet', sessionId: 's1' };

  it('sketches the shell in place, opens the walk in SAIL without gates, links child ↔ parent, notes the parent session', async () => {
    const r = await spawnSeedGenesis({ campaignId: 'c1', npcId: 'r', created: true, parent });
    expect(r).toEqual({ spawned: true, sessionId: 'child1' });
    expect(sketch).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 'c1', watcherId: 'gm', watcherRole: 'WATCHER', tier: 'SKETCH', characterId: 'r',
      seedText: expect.stringContaining('Rosemary Marsh, grandmother of Violet'),
    }));
    expect((sketch.mock.calls[0][0] as { seedText: string }).seedText).toContain('Raised her above the bakery.');
    expect(complete).toHaveBeenCalledWith('r', { id: 'gm', role: 'WATCHER' }, { mode: 'sail', skipGates: true, spawnedFrom: { characterId: 'v', name: 'Violet', sessionId: 's1' } });
    const seed = sheetOf('r')._seed!;
    expect(seed).toMatchObject({ genesisDepth: 1, spawnedFrom: { characterId: 'v', name: 'Violet', sessionId: 's1' } });
    expect(seed.spawnedGenesis).toMatchObject({ sessionId: 'child1', stages: ['AGE', 'WORLD', 'MEMORIES', 'VINES'] });
    expect(updateWorkSession).toHaveBeenCalledWith({ sessionId: 's1', progressNote: expect.stringMatching(/^\[swarm\] Rosemary Marsh's own genesis opened .*sail, depth 1: AGE → WORLD → MEMORIES → VINES/) });
    // The sketch ran BEFORE the walk opened.
    expect(sketch.mock.invocationCallOrder[0]).toBeLessThan(complete.mock.invocationCallOrder[0]);
  });

  it('does nothing when the campaign turned it off, or the parent is still PRODDING', async () => {
    settings.mockResolvedValue({ defaultProvider: 'cloud', recursiveGenesis: false });
    expect((await spawnSeedGenesis({ campaignId: 'c1', npcId: 'r', created: true, parent })).spawned).toBe(false);
    settings.mockResolvedValue({ defaultProvider: 'cloud' });
    db.dayaWorkSession.findUnique.mockResolvedValue({ stage: 'PRODDING', status: 'blocked' });
    expect((await spawnSeedGenesis({ campaignId: 'c1', npcId: 'r', created: true, parent })).reason).toMatch(/PRODDING/);
    expect(sketch).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(sheetOf('r')._seed!.spawnedFrom).toBeUndefined();
  });

  it("a seed of a seed (parent depth 1) gets no genesis — depth stops at 1", async () => {
    rows.m = { id: 'm', name: 'The Miller', campaignId: 'c1', genesisTier: 'SEED', data: JSON.stringify({ _seed: { genesisDepth: 2 } }) };
    const r = await spawnSeedGenesis({ campaignId: 'c1', npcId: 'm', created: true, parent: { characterId: 'r', name: 'Rosemary Marsh', sessionId: 'child1' } });
    expect(r.spawned).toBe(false);
    expect(r.reason).toMatch(/depth 2/);
    expect(sketch).not.toHaveBeenCalled();
  });

  it('a failed sketch (wallet, withheld) is logged on the parent and never throws; the shell stays', async () => {
    sketch.mockRejectedValue(new Error('The campaign wallet holds 12 fluid KRMA; this sketch\'s bare floor costs 188.'));
    const r = await spawnSeedGenesis({ campaignId: 'c1', npcId: 'r', created: true, parent });
    expect(r.spawned).toBe(false);
    expect(r.reason).toMatch(/wallet/);
    expect(complete).not.toHaveBeenCalled();
    expect(updateWorkSession).toHaveBeenCalledWith({ sessionId: 's1', progressNote: expect.stringMatching(/^\[swarm\] Violet's seed got no genesis of her own — The campaign wallet/) });
  });
});
