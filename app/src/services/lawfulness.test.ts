/** Lawfulness screen (Mike 2026-10-12, unit 8a): screen, chain, moderation scope. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError } from '@/lib/errors';

// ── In-memory prisma: just what the service touches ──
type Row = Record<string, unknown> & { id: string; sequenceNumber: number };
const db = vi.hoisted(() => ({
  flags: [] as Row[],
  campaigns: [
    { id: 'c1', gmUserId: 'gm1' },
    { id: 'c2', gmUserId: 'gm2' },
  ],
}));

function matches(r: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && 'in' in (v as object)) return (v as { in: unknown[] }).in.includes(r[k]);
    return r[k] === v;
  });
}

vi.mock('@/lib/db', () => {
  const lawfulnessFlag = {
    findFirst: vi.fn(async () => [...db.flags].sort((a, b) => b.sequenceNumber - a.sequenceNumber)[0] ?? null),
    findMany: vi.fn(async ({ where, orderBy }: { where?: Record<string, unknown>; orderBy?: { sequenceNumber: 'asc' | 'desc' } } = {}) => {
      const rows = db.flags.filter((r) => matches(r, where));
      return rows.sort((a, b) => (orderBy?.sequenceNumber === 'desc' ? b.sequenceNumber - a.sequenceNumber : a.sequenceNumber - b.sequenceNumber));
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.flags.find((r) => r.id === where.id) ?? null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `f${db.flags.length + 1}`, status: 'OPEN', reviewerId: null, reviewNote: null, reviewedAt: null, ...data } as unknown as Row;
      db.flags.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = db.flags.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
  };
  const campaign = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.campaigns.find((c) => c.id === where.id) ?? null),
    findMany: vi.fn(async ({ where }: { where: { gmUserId: string } }) => db.campaigns.filter((c) => c.gmUserId === where.gmUserId)),
  };
  const character = {
    findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => [
      { id: 'ch16', data: JSON.stringify({ identity: { age: 16 } }), campaign: { currentCycle: 100 } },
      { id: 'ch24', data: JSON.stringify({ identity: { age: 24 }, birthCycle: 76 }), campaign: { currentCycle: 100 } },
      { id: 'chNoAge', data: JSON.stringify({ identity: {}, birthCycle: 100 }), campaign: { currentCycle: 100 } },
      { id: 'chGrew', data: JSON.stringify({ identity: { age: 19 }, birthCycle: 98 }), campaign: { currentCycle: 100 } },
    ].filter((c) => where.id.in.includes(c.id))),
  };
  const client = { lawfulnessFlag, campaign, character };
  return { prisma: { ...client, $transaction: vi.fn(async (fn: (tx: typeof client) => unknown) => fn(client)) } };
});

const svc = await import('./lawfulness');
const { screenText, screenImageRequest, raiseFlag, verifyFlagChain, listFlags, reviewFlag, WITHHELD_STRING } = svc;

beforeEach(() => {
  db.flags.length = 0;
});

// ── (1) MINOR_SEXUAL ──
describe('screenText — MINOR_SEXUAL', () => {
  it('fires on age cues + sexual cues in the same window', () => {
    expect(screenText('The 14-year-old girl was described in explicit sexual detail.').flags).toEqual(['MINOR_SEXUAL']);
    expect(screenText('He tried to seduce the child behind the stables.').flags).toEqual(['MINOR_SEXUAL']);
    expect(screenText('a schoolgirl in an erotic scene').flags).toEqual(['MINOR_SEXUAL']);
    expect(screenText('She was aged twelve when he molested her.').flags).toEqual(['MINOR_SEXUAL']);
    const r = screenText('The teen and the man had sex.');
    expect(r.verdict).toBe('block');
    expect(r.hits.MINOR_SEXUAL).toEqual(expect.arrayContaining(['age:teen-word', 'sex:acts']));
  });
  it('does not fire when the cues are far apart', () => {
    const far = 'The child ran home. ' + 'The road wound on through the hills. '.repeat(20) + 'Later, two adults at the inn had sex.';
    expect(screenText(far).flags).toEqual([]);
  });
  it('needs LOCAL co-occurrence: same sentence or within ~200 chars (2026-10-12)', () => {
    const para = 'The girl who waits at the door.\n\n' + 'Rain on the tin roof, the bus late again, the kettle on. '.repeat(4) + '\n\nThe two adults had sex in the tower.';
    expect(screenText(para).flags).toEqual([]);
    const sentence = 'The girl, ' + 'after the long walk past the mills and the burned church and the frozen ford, '.repeat(3) + 'was molested.';
    expect(screenText(sentence).flags).toEqual(['MINOR_SEXUAL']);
  });
  it('a block carries the matched cue words (logged, never stored)', () => {
    const r = screenText('The teen and the man had sex.');
    expect(r.cueWords).toEqual(expect.arrayContaining(['teen', 'had sex']));
    expect(screenText('The ferry left at dawn.').cueWords).toBeUndefined();
  });
  it('adult sexual content alone is not this screen (the tone filter handles register)', () => {
    expect(screenText('The two adult lovers had sex in the tower.').flags).toEqual([]);
  });
});

// ── (1b) Structural age: a character RECORDED under 18 (Mike 2026-10-12) ──
describe('screenText / screenImageRequest — structural age', () => {
  const passage = 'Later that night, in the tower room, Mira and Corvin had sex by the light of the dying fire.';
  it('a 16-year-old participant + a sexual passage with NO age words is blocked', () => {
    expect(screenText(passage).flags).toEqual([]);
    const r = screenText(passage, { participantAges: [16, 31] });
    expect(r.flags).toEqual(['MINOR_SEXUAL']);
    expect(r.hits.MINOR_SEXUAL).toContain('structural-age');
  });
  it('the same passage with adult participants [24, 31] is merely sexual — allowed by lawfulness', () => {
    expect(screenText(passage, { participantAges: [24, 31] })).toMatchObject({ verdict: 'allow', flags: [] });
  });
  it('a minor participant in a non-sexual (even violent) passage passes', () => {
    expect(screenText('Mira drove the knife into the guard and ran for the gate.', { participantAges: [16] }).verdict).toBe('allow');
  });
  it('images: a minor subject + nudity cues = MINOR_SEXUAL without any age word', () => {
    expect(screenImageRequest({ prompt: 'portrait of Mira, topless, by the river', usesRealReference: false, subjectAges: [16] }).flags).toEqual(['MINOR_SEXUAL']);
    expect(screenImageRequest({ prompt: 'portrait of Mira, topless, by the river', usesRealReference: false, subjectAges: [24] }).flags).toEqual([]);
  });
  it('resolveCharacterAges reads identity.age; the younger of sheet vs clock wins; no recorded age = omitted', async () => {
    expect(await svc.resolveCharacterAges(['ch16', 'ch24', 'chNoAge', 'chGrew'])).toEqual([16, 24, 2]);
  });
  it('hooks resolve participantCharacterIds and block', async () => {
    const { screenModelOutput } = await import('@/lib/lawfulness-hooks');
    const r = await screenModelOutput(passage, { campaignId: 'c1', realNames: [], participantCharacterIds: ['ch16'] });
    expect(r).toMatchObject({ blocked: true, categories: ['MINOR_SEXUAL'] });
    expect(db.flags.at(-1)!.screenHits).toContain('structural-age');
    const ok = await screenModelOutput(passage, { campaignId: 'c1', realNames: [], participantCharacterIds: ['ch24'] });
    expect(ok.blocked).toBe(false);
  });
});

// ── (4) Dark fiction must pass ──
describe('screenText — dark fiction is ALLOWED, no flag', () => {
  const passages = [
    'Vesna drove the dagger into the baron\'s throat and watched the light leave his eyes. "That is for my brother," she whispered, and kicked the body into the moat.',
    'The inquisitor heated the irons until they glowed. He pressed the brand to the prisoner\'s chest, slowly, and asked again where the rebels slept. The screaming went on until dawn.',
    'When the legion took the city they burned the granaries, hanged the elders from the gates, and put every soldier to the sword. Children wandered the ash, naked and starving, calling for mothers who would not answer.',
    'Kai said: I will kill you, Tiberoak, and I will burn your house to the ground. The boy watched from the doorway, shaking.',
    'An arrow took the girl in the breast; she fell from the wall and did not rise. The orc captain laughed and ordered the survivors shot.',
    'The plague doctor cut open the dead boy to see what had killed him. The town poisoned the well rather than let the sickness spread.',
  ];
  for (const p of passages) {
    it(`passes: ${p.slice(0, 40)}…`, () => {
      expect(screenText(p, { fictionalNames: ['Kai', 'Tiberoak', 'Vesna'] })).toMatchObject({ verdict: 'allow', flags: [] });
    });
  }
});

// ── (2) REAL_PERSON_THREAT ──
describe('screenText — REAL_PERSON_THREAT', () => {
  it('a real user name + a threat verb fires', () => {
    const r = screenText('Honestly I am going to kill mikemobile when I see him tomorrow.', { realNames: ['mikemobile', 'tara_player'] });
    expect(r.flags).toEqual(['REAL_PERSON_THREAT']);
    expect(r.hits.REAL_PERSON_THREAT).toEqual(expect.arrayContaining(['real:user-name', 'threat:kill']));
  });
  it('relations, @handles, irl and addresses count as real referents', () => {
    expect(screenText('I swear I will hurt my neighbor tonight.').flags).toEqual(['REAL_PERSON_THREAT']);
    expect(screenText('@darkstar_99 you are going to get shot').flags).toEqual(['REAL_PERSON_THREAT']);
    expect(screenText('I will kill him irl').flags).toEqual(['REAL_PERSON_THREAT']);
    expect(screenText('I know where you live, 1420 Maple Street, and I will stab you.').flags).toEqual(['REAL_PERSON_THREAT']);
  });
  it('doxxing (a real person + a locator) fires without a threat verb', () => {
    expect(screenText('tara_player lives at 88 Birch Lane, phone 555-201-3344', { realNames: ['tara_player'] }).flags).toEqual(['REAL_PERSON_THREAT']);
  });
  it('fictional character names never trigger, even if a user shares the name', () => {
    const ctx = { realNames: ['Kai', 'mikemobile'], fictionalNames: ['Kai Tiberoak', 'Val Pendragon'] };
    expect(screenText('Val will kill Kai before the moon sets.', ctx).flags).toEqual([]);
    expect(screenText('I will murder Tiberoak and stab Pendragon.', ctx).flags).toEqual([]);
    expect(screenText('@Kai, the assassin is coming to kill you.', ctx).flags).toEqual([]);
  });
  it('a threat verb with no real referent is fiction', () => {
    expect(screenText('The bandit swore he would kill the merchant and burn his house.').flags).toEqual([]);
  });
});

// ── (3) Images ──
describe('screenImageRequest', () => {
  it('a real-face reference + sexual/nudity cues = REAL_PERSON_SEXUAL_IMAGE', () => {
    const r = screenImageRequest({ prompt: 'portrait, nude, lying on a bed', usesRealReference: true });
    expect(r.flags).toEqual(['REAL_PERSON_SEXUAL_IMAGE']);
    expect(r.hits.REAL_PERSON_SEXUAL_IMAGE).toContain('ref:real-face');
  });
  it('the same prompt without a real reference is not NCII', () => {
    expect(screenImageRequest({ prompt: 'portrait, nude, lying on a bed', usesRealReference: false }).flags).toEqual([]);
  });
  it('age cues + nudity/sexual cues = MINOR_SEXUAL, reference or not', () => {
    expect(screenImageRequest({ prompt: 'teen girl in lingerie', usesRealReference: false }).flags).toEqual(['MINOR_SEXUAL']);
    expect(screenImageRequest({ prompt: 'teen girl in lingerie', usesRealReference: true }).flags).toEqual(['MINOR_SEXUAL', 'REAL_PERSON_SEXUAL_IMAGE']);
  });
  it('a clothed portrait from a real reference passes', () => {
    expect(screenImageRequest({ prompt: 'weathered ranger, leather armour, rain', usesRealReference: true }).verdict).toBe('allow');
  });
});

// ── Chain ──
describe('flag chain', () => {
  it('chains rows and verifies; stores pattern ids only', async () => {
    await raiseFlag({ category: 'MINOR_SEXUAL', lane: 'local', source: 'MODEL_OUTPUT', campaignId: 'c1', ref: { table: 'DayaMemoryEntry', id: 'm1' }, screenHits: ['sex:acts', 'age:child-word'] });
    await raiseFlag({ category: 'REAL_PERSON_THREAT', lane: 'input', source: 'TYPED', campaignId: 'c2', userId: 'u9' });
    await raiseFlag({ category: 'REAL_PERSON_SEXUAL_IMAGE', lane: 'image', source: 'IMAGE_REFERENCE' });
    expect(db.flags.map((f) => f.sequenceNumber)).toEqual([1, 2, 3]);
    expect(db.flags[1].prevHash).toBe(db.flags[0].hash);
    expect(db.flags[0].screenHits).toBe('["age:child-word","sex:acts"]');
    expect(await verifyFlagChain()).toEqual({ valid: true, count: 3 });
  });
  it('detects tampering with a hashed field', async () => {
    await raiseFlag({ category: 'MINOR_SEXUAL', lane: 'local', source: 'MODEL_OUTPUT', campaignId: 'c1' });
    await raiseFlag({ category: 'REAL_PERSON_THREAT', lane: 'input', source: 'TYPED', campaignId: 'c1' });
    db.flags[0].category = 'REAL_PERSON_THREAT';
    expect(await verifyFlagChain()).toMatchObject({ valid: false, brokenAt: 1, reason: 'hash mismatch' });
  });
  it('detects a deleted row', async () => {
    for (let i = 0; i < 3; i++) await raiseFlag({ category: 'MINOR_SEXUAL', lane: 'input', source: 'AMBIENT', campaignId: 'c1' });
    db.flags.splice(1, 1);
    expect(await verifyFlagChain()).toMatchObject({ valid: false, brokenAt: 3 });
  });
  it('reviewing does not break the chain', async () => {
    const f = await raiseFlag({ category: 'MINOR_SEXUAL', lane: 'input', source: 'TYPED', campaignId: 'c1' });
    await reviewFlag(f.id as string, { status: 'REVIEWED', note: 'seen' }, { id: 'gm1', role: 'WATCHER' });
    expect(await verifyFlagChain()).toMatchObject({ valid: true });
  });
});

// ── Moderation scope ──
describe('listFlags / reviewFlag permissions', () => {
  beforeEach(async () => {
    await raiseFlag({ category: 'MINOR_SEXUAL', lane: 'local', source: 'MODEL_OUTPUT', campaignId: 'c1', userId: 'p1', ref: { table: 'CopilotMessage', id: 'x' } });
    await raiseFlag({ category: 'REAL_PERSON_THREAT', lane: 'input', source: 'TYPED', campaignId: 'c2', userId: 'p2' });
    await raiseFlag({ category: 'REAL_PERSON_SEXUAL_IMAGE', lane: 'image', source: 'IMAGE_REFERENCE', campaignId: null });
  });
  it('ADMIN sees every flag with pointers', async () => {
    const r = await listFlags({}, { id: 'mike', role: 'ADMIN' });
    expect(r.flags).toHaveLength(3);
    expect(r.flags.find((f) => f.campaignId === 'c1')).toMatchObject({ refTable: 'CopilotMessage', refId: 'x' });
  });
  it('a Watcher sees only their own table, with no pointer or user', async () => {
    const r = await listFlags({}, { id: 'gm1', role: 'WATCHER' });
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0]).toMatchObject({ campaignId: 'c1', category: 'MINOR_SEXUAL' });
    expect(r.flags[0]).not.toHaveProperty('refId');
    expect(r.flags[0]).not.toHaveProperty('userId');
  });
  it("a Watcher cannot list another campaign's flags", async () => {
    await expect(listFlags({ campaignId: 'c2' }, { id: 'gm1', role: 'WATCHER' })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('a Trailblazer sees nothing', async () => {
    expect((await listFlags({}, { id: 'p1', role: 'TRAILBLAZER' })).flags).toEqual([]);
  });
  it("a Watcher can REVIEW their table's flag but not another's", async () => {
    const mine = db.flags.find((f) => f.campaignId === 'c1')!;
    const theirs = db.flags.find((f) => f.campaignId === 'c2')!;
    await expect(reviewFlag(mine.id, { status: 'REVIEWED' }, { id: 'gm1', role: 'WATCHER' })).resolves.toMatchObject({ status: 'REVIEWED' });
    await expect(reviewFlag(theirs.id, { status: 'REVIEWED' }, { id: 'gm1', role: 'WATCHER' })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('only ADMIN can ACTION', async () => {
    const mine = db.flags.find((f) => f.campaignId === 'c1')!;
    await expect(reviewFlag(mine.id, { status: 'ACTIONED' }, { id: 'gm1', role: 'WATCHER' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reviewFlag(mine.id, { status: 'ACTIONED' }, { id: 'god', role: 'GODHEAD' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reviewFlag(mine.id, { status: 'ACTIONED', note: 'reported' }, { id: 'mike', role: 'ADMIN' })).resolves.toMatchObject({ status: 'ACTIONED', reviewerId: 'mike' });
    await expect(reviewFlag(mine.id, { status: 'REVIEWED' }, { id: 'gm1', role: 'WATCHER' })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('a campaign-less flag is ADMIN-only', async () => {
    const orphan = db.flags.find((f) => f.campaignId === null)!;
    await expect(reviewFlag(orphan.id, { status: 'REVIEWED' }, { id: 'gm1', role: 'WATCHER' })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ── Hooks ──
describe('lawfulness hooks', () => {
  it('blocked text becomes the fixed withheld string and raises a flag; allowed text passes untouched', async () => {
    const { screenInput, screenModelOutput, screenImage } = await import('@/lib/lawfulness-hooks');
    const ok = await screenModelOutput('The knight cut down the raiders one by one.', { campaignId: 'c1', realNames: [], fictionalNames: [] });
    expect(ok).toEqual({ text: 'The knight cut down the raiders one by one.', blocked: false, categories: [] });
    const bad = await screenInput('I will kill my boss tomorrow', { campaignId: 'c1', userId: 'p1', source: 'AMBIENT', realNames: [] });
    expect(bad).toEqual({ text: WITHHELD_STRING, blocked: true, categories: ['REAL_PERSON_THREAT'] });
    expect(db.flags.at(-1)).toMatchObject({ lane: 'input', source: 'AMBIENT', category: 'REAL_PERSON_THREAT', userId: 'p1' });
    const img = await screenImage({ prompt: 'topless beach photo', usesRealReference: true, campaignId: 'c1' });
    expect(img.blocked).toBe(true);
    expect(db.flags.at(-1)).toMatchObject({ lane: 'image', source: 'IMAGE_REFERENCE', category: 'REAL_PERSON_SEXUAL_IMAGE' });
    expect(WITHHELD_STRING).toBe('[withheld: this content cannot be processed]');
  });
});
