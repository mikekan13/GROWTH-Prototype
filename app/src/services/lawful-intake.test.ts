/**
 * Lawfulness wired in (unit 8b, Mike 2026-10-12): human input, local model
 * output and image jobs pass the screen; blocked content is withheld + flagged;
 * dark fiction passes everywhere.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── In-memory prisma: just what these paths touch ──
type Row = Record<string, unknown> & { id: string };
const db = vi.hoisted(() => ({
  flags: [] as (Row & { sequenceNumber: number })[],
  messages: [] as Row[],
  characters: [
    { id: 'ch16', name: 'Wren', campaignId: 'c1', data: JSON.stringify({ identity: { age: 16 } }), campaign: { currentCycle: 100 } },
    { id: 'ch30', name: 'Corvin', campaignId: 'c1', data: JSON.stringify({ identity: { age: 30 } }), campaign: { currentCycle: 100 } },
  ],
  entities: [{ id: 'e16', characterId: 'ch16' }, { id: 'e30', characterId: 'ch30' }],
}));

vi.mock('@/lib/db', () => {
  const lawfulnessFlag = {
    findFirst: vi.fn(async () => [...db.flags].sort((a, b) => b.sequenceNumber - a.sequenceNumber)[0] ?? null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `f${db.flags.length + 1}`, ...data } as Row & { sequenceNumber: number };
      db.flags.push(row);
      return row;
    }),
  };
  const copilotMessage = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `m${db.messages.length + 1}`, ...data } as Row;
      db.messages.push(row);
      return { id: row.id };
    }),
  };
  const campaign = {
    findUnique: vi.fn(async () => ({
      gmUser: { username: 'mikegm' },
      members: [{ user: { username: 'dana_k' } }],
      characters: db.characters.map((c) => ({ name: c.name })),
    })),
  };
  const character = {
    findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => db.characters.filter((c) => where.id.in.includes(c.id))),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.characters.find((c) => c.id === where.id) ?? null),
  };
  const dayaEntity = { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.entities.find((e) => e.id === where.id) ?? null) };
  const dayaModelCall = { create: vi.fn(async () => ({})) };
  const client = { lawfulnessFlag, copilotMessage, campaign, character, dayaEntity, dayaModelCall };
  return { prisma: { ...client, $transaction: vi.fn(async (fn: (tx: typeof client) => unknown) => fn(client)) } };
});
vi.mock('@/ai/network/metering', () => ({ recordAiCall: vi.fn(), estimateUsd: vi.fn(() => 0) }));
// The image providers pull in ComfyUI/sharp; the screen runs before any provider is touched.
vi.mock('@/ai/portraits/providers', () => ({
  getPortraitProvider: vi.fn(async () => { throw new Error('provider must not be reached'); }),
  isPortraitGenerationAvailable: vi.fn(),
  getProviderStatuses: vi.fn(),
}));

const { holdIfUnlawful } = await import('./lawful-intake');
const { clearNameCache } = await import('./lawfulness');
const { isWithheldRow, withoutWithheld, WITHHELD_STRING } = await import('@/lib/withheld');
const { chat, lawfulStream } = await import('@/daya/model-client');
const { assertLawfulImageJob, generateFromDescription } = await import('@/ai/portraits/portrait-service');
const { WithheldContentError } = await import('@/lib/errors');

beforeEach(() => {
  db.flags.length = 0;
  db.messages.length = 0;
  clearNameCache();
});

// ── 1. Input ──
describe('input — ambient and typed', () => {
  it('an ambient threat against a real user is stored withheld, flagged with a pointer, and kept out of the classifier window', async () => {
    const held = await holdIfUnlawful({
      campaignId: 'c1', userId: 'u2', username: '[ambient]', source: 'AMBIENT', origin: 'TABLE_AMBIENT',
      text: "after the session I'm going to kill dana_k, I know where she lives",
    });
    expect(held).toMatchObject({ blocked: true, text: WITHHELD_STRING, categories: ['REAL_PERSON_THREAT'] });

    const row = db.messages.find((m) => m.id === held.withheldRowId)!;
    expect(row).toMatchObject({ campaignId: 'c1', role: 'user', contentClass: 'real', username: '[ambient]' });
    expect(row.content).toContain('dana_k'); // the original stays on the row, for the moderator only
    expect(isWithheldRow(row as unknown as { actions: string })).toBe(true);

    expect(db.flags).toHaveLength(1);
    expect(db.flags[0]).toMatchObject({ category: 'REAL_PERSON_THREAT', lane: 'input', source: 'AMBIENT', refTable: 'CopilotMessage', refId: row.id, userId: 'u2' });

    // The classifier window (and every model history) drops withheld rows.
    const window = [{ id: 'x', actions: JSON.stringify({ source: 'TABLE_AMBIENT' }) }, row as unknown as { id: string; actions: string }];
    expect(withoutWithheld(window).map((r) => r.id)).toEqual(['x']);
  });

  it('a typed sexual line with a scene participant recorded under 18 is withheld (structural age)', async () => {
    const held = await holdIfUnlawful({
      campaignId: 'c1', userId: 'gm', origin: 'TABLE_PROSE', text: 'Corvin seduces Wren by the fire.',
      participants: async () => ['ch16', 'ch30'],
    });
    expect(held.blocked).toBe(true);
    expect(db.flags[0]).toMatchObject({ category: 'MINOR_SEXUAL', source: 'TYPED' });
  });

  it('dark fiction passes untouched — no row, no flag', async () => {
    const text = 'Corvin cut the raider\'s throat and left him to bleed out in the snow; the village burned behind them.';
    const held = await holdIfUnlawful({ campaignId: 'c1', userId: 'gm', origin: 'TABLE_PROSE', text, participants: async () => ['ch16'] });
    expect(held).toEqual({ text, blocked: false, categories: [] });
    expect(db.messages).toHaveLength(0);
    expect(db.flags).toHaveLength(0);
  });
});

// ── 2. Local model output ──
describe('local model output — DAYA L1', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.DAYA_L1_URL = 'http://mock-l1.local';
    process.env.DAYA_L1_MODEL = 'mock-model';
    delete process.env.DAYA_L1_PROVIDER;
  });
  afterEach(() => { process.env = { ...saved }; });

  const answer = (text: string) => async () => ({
    ok: true, status: 200,
    json: async () => ({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
    text: async () => '',
  });

  it('sexual output from an entity recorded under 18 is withheld and flagged MODEL_OUTPUT / local (structural age)', async () => {
    const res = await chat(
      { tier: 'L1', subsystem: 'renderer', contentClass: 'fiction', campaignId: 'c1', entityId: 'e16', messages: [{ role: 'user', content: 'the fire' }] },
      { fetchImpl: answer('Say: Come closer. Do: begins to undress, slow foreplay by the fire.') },
    );
    expect(res.text).toBe(WITHHELD_STRING);
    expect(db.flags).toHaveLength(1);
    expect(db.flags[0]).toMatchObject({ category: 'MINOR_SEXUAL', lane: 'local', source: 'MODEL_OUTPUT', refTable: null, campaignId: 'c1' });
    expect(JSON.parse(db.flags[0].screenHits as string)).toContain('structural-age');
  });

  it('dark fiction from the same entity passes untouched', async () => {
    const text = 'Do: drives the knife between the guard\'s ribs and holds him until he stops moving.';
    const res = await chat(
      { tier: 'L1', subsystem: 'renderer', contentClass: 'fiction', campaignId: 'c1', entityId: 'e16', messages: [{ role: 'user', content: 'the gate' }] },
      { fetchImpl: answer(text) },
    );
    expect(res.text).toBe(text);
    expect(db.flags).toHaveLength(0);
  });

  it('a streamed answer stops at the first hit and never hands that piece on', () => {
    const seen: string[] = [];
    const guard = lawfulStream((d) => { seen.push(d); });
    expect(guard('The little girl ')).toBeUndefined();
    expect(guard('was molested')).toBe(false);
    expect(guard(' later')).toBe(false);
    expect(seen).toEqual(['The little girl ']);
  });
});

// ── 3. Image jobs ──
describe('image jobs', () => {
  it('a real reference + a sexual prompt is refused before any provider is touched, and flagged IMAGE_REFERENCE', async () => {
    await expect(assertLawfulImageJob({
      prompt: 'topless, seductive boudoir pose', usesRealReference: true, campaignId: 'c1', userId: 'u2', subjectCharacterIds: ['ch30'],
    })).rejects.toBeInstanceOf(WithheldContentError);
    expect(db.flags[0]).toMatchObject({ category: 'REAL_PERSON_SEXUAL_IMAGE', lane: 'image', source: 'IMAGE_REFERENCE', refTable: 'CopilotMessage' });
    expect(isWithheldRow(db.messages[0] as unknown as { actions: string })).toBe(true);
  });

  it('generateFromDescription refuses a Watcher-enabled nude creation body of a character recorded under 18', async () => {
    const data = {
      characterId: 'creation-preview',
      identity: { name: 'Wren', age: 16 },
      visibleEquipment: [], wounds: [], conditions: [], visualTraits: [],
      attributeDepletion: {},
    } as unknown as Parameters<typeof generateFromDescription>[0];
    await expect(generateFromDescription(data, { creationMode: true, campaignStyle: { allowNudity: true } as never, requesterId: 'u2', campaignId: 'c1' }))
      .rejects.toBeInstanceOf(WithheldContentError);
    expect(db.flags.map((f) => f.category)).toContain('MINOR_SEXUAL');
  });

  it('a dark but non-sexual prompt with a real reference passes', async () => {
    await expect(assertLawfulImageJob({
      prompt: 'battle-scarred warrior, blood-soaked armour, grim stare', usesRealReference: true, campaignId: 'c1', userId: 'u2',
    })).resolves.toBeUndefined();
    expect(db.flags).toHaveLength(0);
  });
});
