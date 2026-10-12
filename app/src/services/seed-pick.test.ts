/** Seed first (Mike 2026-10-12): JEWL picks the seed on genesis submit; portraits wait for it. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SeedRequiredError, ForbiddenError, ValidationError } from '@/lib/errors';
import { seedGate, seedLine, SEED_WAIT_TITLE, SEED_REQUIRED_MESSAGE } from '@/lib/seed-state';

type Row = { id: string; name: string; data: string; isGlobal: boolean; campaignId: string | null; sourceGlobalId: string | null };

const h = vi.hoisted(() => ({
  charData: '{}' as string,
  seeds: [] as Row[],
  writes: [] as string[],
  events: [] as Array<{ campaignId: string; data: Record<string, unknown> }>,
  calls: [] as Array<{ task: Record<string, unknown>; input: Record<string, unknown> }>,
  answer: (async () => ({ text: '' })) as () => Promise<{ text: string }>,
  session: null as null | { id: string },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    character: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 'ch1'
        ? { id: 'ch1', name: 'Violet', campaignId: 'c1', data: h.charData }
        : null)),
      update: vi.fn(async ({ data }: { data: { data: string } }) => { h.writes.push(data.data); h.charData = data.data; return {}; }),
    },
    forgeItem: { findMany: vi.fn(async () => h.seeds) },
    dayaWorkSession: { findFirst: vi.fn(async () => h.session) },
    campaign: { findUnique: vi.fn(async () => ({ id: 'c1', gmUserId: 'gm' })) },
  },
}));
vi.mock('@/lib/campaign-stream', () => ({
  broadcastEvent: vi.fn((campaignId: string, data: Record<string, unknown>) => { h.events.push({ campaignId, data }); }),
}));
vi.mock('@/ai/network', () => ({
  routedChatText: vi.fn(async (task: Record<string, unknown>, input: Record<string, unknown>) => {
    h.calls.push({ task, input });
    return h.answer();
  }),
}));

const { pickSeedForCharacter, setSeedByGm, getSeedPanel, assertSeedSetForPortrait, listCatalogSeeds, parseSeedAnswer, SEED_PICK_TIMEOUT_MS } =
  await import('./seed-pick');

const HUMAN: Row = { id: 'g-human', name: 'Human', data: JSON.stringify({ description: 'Mortal kin', baseFateDie: 'd6' }), isGlobal: true, campaignId: null, sourceGlobalId: null };
const ELF: Row = { id: 'c-elf', name: 'Et\'herling', data: JSON.stringify({ description: 'Elven heritage' }), isGlobal: false, campaignId: 'c1', sourceGlobalId: null };
const GM = { id: 'gm', role: 'WATCHER' };
const BACKSTORY = 'She grew up by the river. '.repeat(200);
const stored = () => JSON.parse(h.charData) as { creation: { seed: { name: string }; seedPick: { pickedBy: string; id: string } } };

beforeEach(() => {
  h.charData = JSON.stringify({ creation: { seed: { baseFateDie: 'd6' } }, backstory: { backstory: BACKSTORY } });
  h.seeds = [HUMAN];
  h.writes = []; h.events = []; h.calls = [];
  h.answer = async () => ({ text: '' });
  h.session = null;
});
afterEach(() => { vi.useRealTimers(); });

describe('pickSeedForCharacter', () => {
  it('single-seed catalog → sets it at once with NO model call, and emits the card event', async () => {
    const r = await pickSeedForCharacter('ch1', GM);
    expect(r).toMatchObject({ changed: true, modelCalled: false, seed: { name: 'Human', pickedBy: 'default' } });
    expect(h.calls).toHaveLength(0);
    expect(stored().creation.seed.name).toBe('Human');
    expect(stored().creation.seedPick).toMatchObject({ id: 'g-human', pickedBy: 'default' });
    expect(h.events).toEqual([{ campaignId: 'c1', data: { kind: 'character_update', characterId: 'ch1', characterName: 'Violet', fields: ['creation.seed'] } }]);
  });

  it('a seed already set is a no-op', async () => {
    h.charData = JSON.stringify({ creation: { seed: { name: 'Human', baseFateDie: 'd6' } } });
    h.seeds = [HUMAN, ELF];
    const r = await pickSeedForCharacter('ch1', GM);
    expect(r).toMatchObject({ changed: false, modelCalled: false, seed: { name: 'Human' } });
    expect(h.writes).toHaveLength(0);
    expect(h.calls).toHaveLength(0);
  });

  it('multi-seed → ONE local-lane fiction call (name + first 1,500 chars), parsed to the chosen seed', async () => {
    h.seeds = [HUMAN, ELF];
    h.answer = async () => ({ text: ' c-elf ' });
    const r = await pickSeedForCharacter('ch1', GM, { name: 'Violet' });
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].task).toMatchObject({ caller: 'seed-pick', lane: 'local', contentClass: 'fiction', campaignId: 'c1' });
    expect(h.calls[0].input.timeoutMs).toBe(SEED_PICK_TIMEOUT_MS);
    const user = h.calls[0].input.user as string;
    expect(user).toContain('CHARACTER: Violet');
    expect(user).toContain(BACKSTORY.slice(0, 1500));
    expect(user).not.toContain(BACKSTORY.slice(0, 1501));
    expect(r).toMatchObject({ modelCalled: true, seed: { name: 'Et\'herling', pickedBy: 'jewl' } });
  });

  it('multi-seed → falls back to the stock Human on timeout (4 s cap)', async () => {
    vi.useFakeTimers();
    h.seeds = [ELF, HUMAN];
    h.answer = () => new Promise(() => { /* never answers */ });
    const p = pickSeedForCharacter('ch1', GM);
    await vi.advanceTimersByTimeAsync(SEED_PICK_TIMEOUT_MS + 10);
    const r = await p;
    expect(h.calls).toHaveLength(1);
    expect(r.seed).toMatchObject({ name: 'Human', pickedBy: 'default' });
  });

  it('multi-seed → falls back to Human on an error or an unparseable answer', async () => {
    h.seeds = [HUMAN, ELF];
    h.answer = async () => { throw new Error('local lane down'); };
    expect((await pickSeedForCharacter('ch1', GM)).seed).toMatchObject({ name: 'Human', pickedBy: 'default' });
    h.charData = JSON.stringify({ creation: { seed: { baseFateDie: 'd6' } } });
    h.answer = async () => ({ text: 'Probably a dragon?' });
    expect((await pickSeedForCharacter('ch1', GM)).seed).toMatchObject({ name: 'Human', pickedBy: 'default' });
  });

  it('the seed the GM chose on the form wins, as gm, with no call', async () => {
    h.seeds = [HUMAN, ELF];
    const r = await pickSeedForCharacter('ch1', GM, { preferred: 'et\'herling' });
    expect(r.seed).toMatchObject({ name: 'Et\'herling', pickedBy: 'gm' });
    expect(h.calls).toHaveLength(0);
  });
});

describe('catalog listing', () => {
  it('a campaign copy of a stock seed replaces the stock row; Human leads', async () => {
    const pulled: Row = { id: 'c-human', name: 'Human', data: '{}', isGlobal: false, campaignId: 'c1', sourceGlobalId: 'g-human' };
    h.seeds = [ELF, HUMAN, pulled];
    const list = await listCatalogSeeds('c1');
    expect(list.map(s => s.id)).toEqual(['c-human', 'c-elf']);
  });

  it('parseSeedAnswer accepts an id, a name or {"seedId"}; rejects the rest', async () => {
    const seeds = await (h.seeds = [HUMAN, ELF], listCatalogSeeds('c1'));
    expect(parseSeedAnswer('"c-elf".', seeds)?.id).toBe('c-elf');
    expect(parseSeedAnswer('human', seeds)?.id).toBe('g-human');
    expect(parseSeedAnswer('{"seedId":"c-elf"}', seeds)?.id).toBe('c-elf');
    expect(parseSeedAnswer('orc', seeds)).toBeNull();
  });
});

describe('GM override', () => {
  it('writes seedPickedBy gm; no warning before genesis', async () => {
    h.seeds = [HUMAN, ELF];
    const r = await setSeedByGm('ch1', { seedId: 'c-elf' }, GM);
    expect(r.seed).toMatchObject({ name: 'Et\'herling', pickedBy: 'gm' });
    expect(r.rebuildWarning).toBeNull();
    expect(stored().creation.seedPick.pickedBy).toBe('gm');
    expect(h.events).toHaveLength(1);
  });

  it('after genesis started → one-line rebuild warning, nothing rebuilt', async () => {
    h.seeds = [HUMAN, ELF];
    h.session = { id: 's1' };
    const r = await setSeedByGm('ch1', { seedId: 'c-elf' }, GM);
    expect(r.rebuildWarning).toMatch(/may need a rebuild/);
    expect(h.writes).toHaveLength(1);
  });

  it('refuses a non-GM and an off-catalog seed', async () => {
    await expect(setSeedByGm('ch1', { seedId: 'g-human' }, { id: 'p1', role: 'TRAILBLAZER' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setSeedByGm('ch1', { seedId: 'nope' }, GM)).rejects.toBeInstanceOf(ValidationError);
  });

  it('the panel lists the seed, options and whether genesis started', async () => {
    h.seeds = [HUMAN, ELF];
    const before = await getSeedPanel('ch1', GM);
    expect(before.seed).toBeNull();
    expect(before.options.map(o => o.name)).toEqual(['Human', 'Et\'herling']);
    await pickSeedForCharacter('ch1', GM, { preferred: 'Human' });
    expect((await getSeedPanel('ch1', GM)).seed).toMatchObject({ name: 'Human', pickedBy: 'gm' });
  });
});

describe('portrait gate', () => {
  it('refuses (409, typed) before the seed is set; passes after', async () => {
    const err = await assertSeedSetForPortrait({ characterId: 'ch1' }).catch(e => e);
    expect(err).toBeInstanceOf(SeedRequiredError);
    expect(err.status).toBe(409);
    expect(err.message).toBe(SEED_REQUIRED_MESSAGE);
    await pickSeedForCharacter('ch1', GM);
    await expect(assertSeedSetForPortrait({ characterId: 'ch1' })).resolves.toBeUndefined();
  });

  it('an inline creation preview passes with a chosen seed, fails without', async () => {
    await expect(assertSeedSetForPortrait({ inlineSeedName: 'Human' })).resolves.toBeUndefined();
    await expect(assertSeedSetForPortrait({ inlineSeedName: '' })).rejects.toBeInstanceOf(SeedRequiredError);
  });
});

describe('Appearance gate (pure)', () => {
  it('locked with the waiting tooltip until the seed lands', () => {
    expect(seedGate(null)).toEqual({ locked: true, title: SEED_WAIT_TITLE, message: SEED_REQUIRED_MESSAGE });
    expect(seedGate('  ')).toMatchObject({ locked: true });
    expect(seedGate('Human')).toEqual({ locked: false, title: null, message: null });
  });
  it('the log line names the seed and who chose it', () => {
    expect(seedLine({ name: 'Human', pickedBy: 'jewl' })).toBe('seed → Human · JEWL chose');
    expect(seedLine({ name: 'Human', pickedBy: 'default' })).toBe('seed → Human · default');
  });
});
