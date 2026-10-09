/**
 * Perception unit 11 — active inspection end to end (declare → board → commit on the GM's move → the
 * ordinary check → familiarity), with the DB, dice and relevance model faked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const w = vi.hoisted(() => ({
  fams: [] as Array<{ perceiverId: string; subjectId: string; aspectKind: string; score: number; lastCycle: number | null; lastSource?: string }>,
  events: [] as Array<Record<string, unknown>>,
  exposures: [] as Array<Record<string, unknown>>,
  initiated: [] as Array<{ input: Record<string, unknown>; purpose: Record<string, unknown> }>,
  dice: [] as number[],
  changes: [] as Array<Record<string, unknown>>,
  mems: [] as Array<Record<string, unknown>>,
  memUpdates: [] as Array<Record<string, unknown>>,
}));

const SWORD = JSON.stringify({ damage: { slashing: 4 }, baseResist: 12, value: 40, properties: ['Sharp'], itemAbilities: [{ name: 'Flame Tongue', school: 'Force', description: 'burns' }] });

vi.mock('@/lib/db', () => {
  const chars: Record<string, { id: string; name: string; userId: string; entityType: string; campaignId: string; data: string }> = {
    violet: { id: 'violet', name: 'Violet', userId: 'p1', entityType: 'PLAYER_CHARACTER', campaignId: 'c1', data: JSON.stringify({ skills: [{ name: 'Swordsmanship', level: 12, governors: ['clout', 'wit'] }] }) },
    ruth: { id: 'ruth', name: 'Ruth', userId: 'gm', entityType: 'NPC', campaignId: 'c1', data: JSON.stringify({ skills: [] }) },
  };
  const prisma = {
    campaign: { findUnique: async () => ({ id: 'c1', gmUserId: 'gm', currentCycle: 1 }) },
    campaignMember: { findUnique: async ({ where }: { where: { campaignId_userId: { userId: string } } }) => (where.campaignId_userId.userId === 'p1' ? { id: 'm' } : null) },
    character: {
      findUnique: async ({ where }: { where: { id: string } }) => chars[where.id] ?? null,
      findFirst: async ({ where }: { where: { id: string } }) => chars[where.id] ?? null,
      findMany: async ({ where }: { where: { userId?: string } }) => Object.values(chars).filter((c) => !where.userId || c.userId === where.userId),
    },
    campaignItem: {
      findMany: async () => [{ id: 'sword1', name: 'Old Sword' }],
      findFirst: async ({ where }: { where: { id: string } }) => (where.id === 'sword1' ? { id: 'sword1', name: 'Old Sword' } : null),
      findUnique: async () => ({ data: SWORD }),
    },
    location: { findMany: async () => [], findFirst: async () => null },
    dayaEntity: { findUnique: async ({ where }: { where: { characterId: string } }) => ({ id: `ent-${where.characterId}` }) },
    familiarity: {
      findMany: async ({ where }: { where: { perceiverId: string } }) => w.fams.filter((f) => f.perceiverId === where.perceiverId),
      upsert: async ({ where, create, update }: { where: { perceiverId_subjectId_aspectKind: { perceiverId: string; subjectId: string; aspectKind: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const k = where.perceiverId_subjectId_aspectKind;
        const row = w.fams.find((f) => f.perceiverId === k.perceiverId && f.subjectId === k.subjectId && f.aspectKind === k.aspectKind);
        if (row) Object.assign(row, update); else w.fams.push(create as never);
        return { ...k, subjectKind: 'ITEM', updatedAt: new Date(0), ...(row ?? create) };
      },
      findUnique: async ({ where }: { where: { perceiverId_subjectId_aspectKind: { perceiverId: string; subjectId: string; aspectKind: string } } }) => {
        const k = where.perceiverId_subjectId_aspectKind;
        const row = w.fams.find((f) => f.perceiverId === k.perceiverId && f.subjectId === k.subjectId && f.aspectKind === k.aspectKind);
        return row ? { score: row.score, lastCycle: row.lastCycle } : null;
      },
    },
    dayaMemoryEntry: { update: async (q: Record<string, unknown>) => { w.memUpdates.push(q); return {}; } },
    familiarityChange: { createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { w.changes.push(...data); return { count: data.length }; } },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  };
  return { prisma };
});
vi.mock('@/daya/memory', () => ({ writeMemoryEntry: vi.fn(async (p: Record<string, unknown>) => { w.mems.push(p); return { id: `mem${w.mems.length}` }; }) }));
vi.mock('@/services/perceived-feed', () => ({
  INSPECTION_MEMORY_KIND: 'inspection',
  renderInspectionForms: async (_c: string, _v: string, rows: Array<{ id: string; classification: string }>) => ({
    forms: new Map(rows.map((r) => [r.id, { rows: [{ type: 'narration', pieces: [{ kind: 'text', text: 'You study ' }, { kind: 'entity', text: 'an old sword', entityId: 'sword1' }, { kind: 'text', text: `: ${(JSON.parse(r.classification) as { aspects: string[] }).aspects.join(', ')}.` }] }] }])),
    subjects: new Map(),
  }),
}));
vi.mock('@/lib/dice', () => ({ rollDie: vi.fn(() => w.dice.shift() ?? 1) }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn() }));
vi.mock('@/services/campaign-event', () => ({ createCampaignEvent: vi.fn(async (e: Record<string, unknown>) => { w.events.push(e); return { id: 'e' }; }) }));
vi.mock('@/services/trait-modifiers', () => ({ gatherTraitModifiers: () => ({ totalFlat: 0, sources: [] }) }));
vi.mock('@/services/history', () => ({ currentCycleOf: async () => 1 }));
vi.mock('@/lib/perceived-feed-push', () => ({ notifyMemoryWritten: vi.fn() }));
vi.mock('@/services/familiarity', async () => {
  const actual = await vi.importActual<typeof import('@/services/familiarity')>('@/services/familiarity');
  return { ...actual, recordExposure: vi.fn(async (input: Record<string, unknown>) => { w.exposures.push(input); return input; }) };
});
vi.mock('@/services/skill-check', () => ({
  initiateSkillCheck: vi.fn(async (_c: string, _r: unknown, input: Record<string, unknown>, opts: { purpose: Record<string, unknown> }) => { w.initiated.push({ input, purpose: opts.purpose }); return { checkId: 'chk' }; }),
}));
vi.mock('@/services/skill-relevance', async () => {
  const actual = await vi.importActual<typeof import('@/services/skill-relevance')>('@/services/skill-relevance');
  const rel = (scores: Record<string, number>) => Object.fromEntries(actual.SKILL_RELEVANCE_TUNING && ['dissolution', 'restoration', 'force', 'abjuration', 'divination', 'enchantment', 'illusion', 'alteration', 'conjuration', 'fortune'].map((d) => [d, { relevance: scores[d] ?? 0, source: 'model' }]));
  return { ...actual, getRelevance: vi.fn(async (name: string) => (name.toLowerCase() === 'swordsmanship' ? rel({ force: 0.9, abjuration: 0.6 }) : rel({}))) };
});
vi.mock('@/ai/network', () => ({ route: vi.fn(), anthropicChatText: vi.fn(), openAiCompatChat: vi.fn(), recordAiCall: vi.fn() }));

const { clearBoard, listIntents } = await import('@/lib/planning-board');
const svc = await import('./inspection');
const { afterCheckResolved } = await import('./check-resolved');

const P1 = { id: 'p1', role: 'TRAILBLAZER', username: 'p1' };
const GM = { id: 'gm', role: 'WATCHER', username: 'gm' };
const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  clearBoard();
  w.fams = [{ perceiverId: 'ent-violet', subjectId: 'sword1', aspectKind: 'identity', score: 0.3, lastCycle: null }];
  w.events = []; w.exposures = []; w.initiated = []; w.dice = []; w.changes = []; w.mems = []; w.memUpdates = [];
});

describe('declare → board', () => {
  it('a player\'s chat line posts an inspect chip naming the subject and the skill', async () => {
    const chip = await svc.postInspectFromChat('c1', P1, 'violet', 'I inspect the old sword with my swordsmanship');
    expect(chip).toMatchObject({ kind: 'inspect', characterId: 'violet', subjectId: 'sword1', subjectKind: 'ITEM', skillName: 'swordsmanship', skillBy: 'player' });
    expect(listIntents('c1')).toHaveLength(1);
    expect(await svc.postInspectFromChat('c1', P1, 'violet', 'I draw my sword')).toBeNull();
    expect(await svc.postInspectFromChat('c1', P1, 'violet', 'I inspect the moon')).toBeNull(); // nothing by that name
  });

  it('a player cannot declare for another\'s character; the GM names the skill and DR on the chip', async () => {
    await expect(svc.postInspectIntent('c1', P1, { characterId: 'ruth', target: 'sword' })).rejects.toThrow(/Not your/);
    const chip = await svc.postInspectIntent('c1', P1, { characterId: 'violet', target: 'sword' });
    await expect(svc.editInspectIntent('c1', P1, chip.id, { dr: 4 })).rejects.toThrow(/GM sets the DR/);
    const named = await svc.editInspectIntent('c1', GM, chip.id, { skillName: 'Swordsmanship', dr: 8 });
    expect(named).toMatchObject({ skillName: 'Swordsmanship', skillBy: 'gm', dr: 8 });
  });
});

describe('planning-board chips (the strip\'s reads and edits)', () => {
  it('the GM reads every chip with names + sheet skills; a player only their own, never the DR control', async () => {
    await svc.postInspectIntent('c1', P1, { characterId: 'violet', target: 'sword' });
    await svc.postInspectIntent('c1', GM, { characterId: 'ruth', target: 'sword' });
    const gmView = await svc.listInspectIntents('c1', GM);
    expect(gmView.map((c) => c.characterName)).toEqual(['Violet', 'Ruth']);
    expect(gmView[0]).toMatchObject({ gm: true, skills: ['Swordsmanship'], subjectLabel: 'Old Sword' });
    const p1View = await svc.listInspectIntents('c1', P1);
    expect(p1View).toHaveLength(1);
    expect(p1View[0]).toMatchObject({ characterId: 'violet', gm: false });
  });

  it('the owner rewrites the words: the chip realigns its subject and names the skill the words name', async () => {
    const chip = await svc.postInspectIntent('c1', P1, { characterId: 'violet', target: 'sword' });
    const next = await svc.editInspectIntent('c1', P1, chip.id, { text: 'I inspect Ruth with my swordsmanship' });
    expect(next).toMatchObject({ subjectId: 'ruth', subjectKind: 'NPC', text: 'I inspect Ruth with my swordsmanship', skillName: 'swordsmanship', skillBy: 'player' });
    await expect(svc.editInspectIntent('c1', P1, chip.id, { text: 'the moon' })).rejects.toThrow(/Nothing called/);
  });

  it('post / edit / withdraw / commit each send the text-free board_changed to the owner and the GM', async () => {
    const { broadcastEvent } = await import('@/lib/campaign-stream');
    const sent = vi.mocked(broadcastEvent);
    sent.mockClear();
    const chip = await svc.postInspectIntent('c1', P1, { characterId: 'violet', target: 'sword' });
    await flush();
    const boardSends = () => sent.mock.calls.filter((c) => (c[1] as { kind: string }).kind === 'board_changed');
    expect(boardSends().map((c) => c[2]).sort()).toEqual(['gm', 'p1']);
    expect(boardSends()[0][1]).toEqual({ kind: 'board_changed' });
    sent.mockClear();
    await svc.cancelInspectIntent('c1', P1, chip.id);
    await flush();
    expect(boardSends()).toHaveLength(2);
    expect(listIntents('c1')).toHaveLength(0);
  });
});

describe('commit on the GM\'s next move → the ordinary check', () => {
  it('a player\'s character: the EXISTING check flow, skilled, with the skill\'s domains on the purpose (system pick)', async () => {
    await svc.postInspectIntent('c1', P1, { characterId: 'violet', target: 'sword' });
    svc.commitPlanningBoardOnGmMove('c1', P1); // not the GM: nothing commits
    await flush();
    expect(w.initiated).toHaveLength(0);
    svc.commitPlanningBoardOnGmMove('c1', GM);
    await flush();
    expect(listIntents('c1')).toHaveLength(0);
    expect(w.initiated[0].input).toMatchObject({ characterId: 'violet', skillName: 'Swordsmanship', dr: 10 });
    expect(w.initiated[0].purpose).toMatchObject({ kind: 'inspect', subjectId: 'sword1', skillName: 'Swordsmanship', skillDomains: ['force', 'abjuration'] });
  });

  it('a being nobody plays: the engine rolls the same dice, posts the roll, and the inspection resolves', async () => {
    await svc.postInspectIntent('c1', GM, { characterId: 'ruth', target: 'sword' });
    w.dice = [6]; // ruth has no skills → unskilled Wisdom: flat SD 0? + FD 6 vs DR 10 → fail, no gain
    svc.commitPlanningBoardOnGmMove('c1', GM);
    await flush();
    expect(w.initiated).toHaveLength(0);
    expect(w.events[0]).toMatchObject({ type: 'dice_roll', characterId: 'ruth' });
    expect((w.events[0].payload as { context: string }).context).toMatch(/wisdom check to inspect/);
    expect(w.exposures).toEqual([]);
  });
});

describe('resolve', () => {
  const purpose = { kind: 'inspect' as const, intentId: 'i1', characterId: 'violet', subjectId: 'sword1', subjectKind: 'ITEM' as const, skillName: 'Swordsmanship', skillDomains: ['force', 'abjuration'] };

  it('skilled success raises damage / hardness / the fire enchantment with source inspect; strong result flags value at F1', async () => {
    const writes = await svc.resolveInspection('c1', purpose, { total: 20, success: true, margin: 10, effortBy: {}, skilled: true, checkId: 'chk9' });
    const grown = w.exposures.map((e) => e.aspectKind);
    expect(grown).toEqual(expect.arrayContaining(['damage', 'hardness', 'ability:flame-tongue']));
    expect(grown).not.toContain('property:sharp'); // alteration — not a swordsmanship domain (flagged instead)
    expect(grown).not.toContain('history');
    expect(w.exposures.every((e) => e.source === 'inspect' && (e.times as number) > 1)).toBe(true);
    expect(writes.find((x) => x.aspectKind === 'value')).toMatchObject({ op: 'flag' });
    expect(w.fams.find((f) => f.aspectKind === 'value')).toMatchObject({ score: 0.2, lastSource: 'inspect' });
    // the change record: the flag appended with its check; grows carry the check to recordExposure
    expect(w.changes).toHaveLength(writes.filter((x) => x.op !== 'grow').length);
    expect(w.changes.every((c) => c.source === 'inspect' && c.checkId === 'chk9')).toBe(true);
    expect(w.changes.find((c) => c.aspectKind === 'value')).toMatchObject({ fromScore: null, toScore: 0.2 });
    expect(w.exposures.every((e) => (e.refs as { checkId?: string })?.checkId === 'chk9')).toBe(true);
  });

  it('the hook: a resolved pending check with an inspect purpose resolves it; a bad failure marks one aspect wrong', async () => {
    await afterCheckResolved({ id: 'pc1', campaignId: 'c1', isSkilled: true, purpose }, { total: 1, success: false, margin: -9, effortBy: {} });
    expect(w.exposures).toEqual([]);
    const wrong = w.fams.filter((f) => f.lastSource === 'wrong');
    expect(wrong).toHaveLength(1);
    expect(wrong[0].score).toBe(0);
    expect(w.changes).toEqual([expect.objectContaining({ aspectKind: wrong[0].aspectKind, toScore: 0, source: 'wrong', checkId: 'pc1' })]);
    // Wrong impressions show as received: the WRONG value is stored (world-sim off → deterministic fallback) and recorded.
    expect(wrong[0]).toMatchObject({ aspectKind: 'damage', impression: 'slashing roughly 5–9' }); // truth: slashing 4 (F3 'roughly 3–5')
    expect(w.changes[0]).toMatchObject({ fromImpression: null, toImpression: 'slashing roughly 5–9' });
  });

  it('a wrong impression takes the small model value when there is one (the truth itself is refused)', async () => {
    await svc.resolveInspection('c1', purpose, { total: 1, success: false, margin: -9, effortBy: {}, skilled: true, checkId: 'k1' }, { model: async () => '{"value":"cuts deep, a butcher edge"}' });
    expect(w.fams.find((f) => f.lastSource === 'wrong')).toMatchObject({ impression: 'cuts deep, a butcher edge' });
    w.fams.length = 0; w.changes.length = 0;
    await svc.resolveInspection('c1', purpose, { total: 1, success: false, margin: -9, effortBy: {}, skilled: true, checkId: 'k2' }, { model: async () => '{"value":"slashing 4"}' });
    const fell = w.fams.find((f) => f.lastSource === 'wrong') as { impression?: string } | undefined;
    expect(fell?.impression).toMatch(/^slashing roughly/); // fell back to the deterministic wrong value
    expect(fell?.impression).not.toBe('slashing 4');
  });

  it('unskilled (raw Wisdom) never reaches a domain with zero exposure', async () => {
    await svc.resolveInspection('c1', { ...purpose, skillName: '', skillDomains: [] }, { total: 14, success: true, margin: 4, effortBy: {}, skilled: false });
    const grown = w.exposures.map((e) => e.aspectKind);
    expect(grown).toEqual(expect.arrayContaining(['identity', 'appearance']));
    expect(grown.some((k) => k === 'damage' || String(k).startsWith('ability'))).toBe(false);
  });
});

describe('inspection writes a feed line (Mike 2026-10-09: "probably both")', () => {
  const purpose = { kind: 'inspect' as const, intentId: 'i1', characterId: 'violet', subjectId: 'sword1', subjectKind: 'ITEM' as const, skillName: 'Swordsmanship', skillDomains: ['force', 'abjuration'] };

  it('a resolved inspection leaves the inspector a memory row naming what it studied, its content the rendered line', async () => {
    const writes = await svc.resolveInspection('c1', purpose, { total: 20, success: true, margin: 10, effortBy: {}, skilled: true, checkId: 'chk1' });
    expect(w.mems).toHaveLength(1);
    expect(w.mems[0]).toMatchObject({ entityId: 'ent-violet', source: 'perception', truthRef: null, noticed: true, entityRefs: ['sword1'] });
    expect(w.mems[0].classification).toMatchObject({ kind: 'inspection', subjectId: 'sword1', subjectKind: 'ITEM', checkId: 'chk1', success: true, aspects: [...new Set(writes.map((x) => x.aspectKind))] });
    expect(w.memUpdates[0]).toMatchObject({ where: { id: 'mem1' }, data: { content: expect.stringMatching(/^You study an old sword: /) } });
  });

  it('a failed inspection still leaves its line (nothing studied)', async () => {
    await svc.resolveInspection('c1', purpose, { total: 5, success: false, margin: -2, effortBy: {}, skilled: true, checkId: 'chk2' });
    expect(w.mems[0].classification).toMatchObject({ kind: 'inspection', aspects: [], success: false });
  });
});
