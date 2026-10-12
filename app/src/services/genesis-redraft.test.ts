/** GM redraft of a genesis's drafts (blocks are campaign-agnostic, 2026-10-12). */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, ValidationError } from '@/lib/errors';

type Row = Record<string, unknown> & { id: string };
const db = vi.hoisted(() => ({
  sessions: [] as Array<Record<string, unknown> & { id: string }>,
  forge: [] as Array<Record<string, unknown> & { id: string }>,
  links: [] as Array<Record<string, unknown> & { id: string }>,
  kicks: 0,
  memories: 0,
}));

function match(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Array<Record<string, unknown>>).some(w => match(row, w));
    if (k === 'AND') return (v as Array<Record<string, unknown>>).every(w => match(row, w));
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const o = v as Record<string, unknown>;
      if ('in' in o) return (o.in as unknown[]).includes(row[k]);
      if ('gte' in o) return (row[k] as Date) >= (o.gte as Date);
      if ('gt' in o) return (row[k] as Date) > (o.gt as Date);
      if ('lte' in o) return (row[k] as Date) <= (o.lte as Date);
      if ('not' in o) return row[k] !== o.not;
      if ('contains' in o) return String(row[k] ?? '').includes(String(o.contains));
      if ('startsWith' in o) return String(row[k] ?? '').startsWith(String(o.startsWith));
      return true;
    }
    return row[k] === v;
  });
}

vi.mock('@/lib/db', () => ({
  prisma: {
    campaign: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 'c1' ? { id: 'c1', gmUserId: 'gm' } : null)),
    },
    dayaEntity: { findUnique: vi.fn(async ({ where }: { where: { characterId: string } }) => (where.characterId === 'ch1' ? { id: 'e1' } : null)) },
    dayaMemoryEntry: { count: vi.fn(async () => db.memories) },
    dayaWorkSession: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => db.sessions.find(s => match(s, where)) ?? null),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.sessions.find(s => s.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Object.assign(db.sessions.find(s => s.id === where.id)!, data)),
    },
    characterBlockLink: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => db.links.find(l => match(l, where)) ?? null),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => db.links.filter(l => match(l, where))),
      deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const keep = db.links.filter(l => !match(l, where));
        const n = db.links.length - keep.length;
        db.links.splice(0, db.links.length, ...keep);
        return { count: n };
      }),
    },
    forgeItem: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => db.forge.filter(f => match(f, where))),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.forge.find(f => f.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Object.assign(db.forge.find(f => f.id === where.id)!, data)),
    },
  },
}));
vi.mock('@/ai/copilot/work-loop', () => ({ kickWorkLoop: vi.fn(() => { db.kicks++; }) }));
vi.mock('@/ai/copilot/jewl-identity', () => ({ getJewlGodHead: vi.fn(async () => ({ characterUserId: 'jewl' })) }));
vi.mock('./character-genesis-progress', () => ({
  parseGenesisGoal: (goal: string) => {
    const m = /^Character genesis: (.+?) \[([^\]\s]+)\]/.exec(goal);
    return m ? { name: m[1], characterId: m[2] } : null;
  },
  announceGenesisStatus: vi.fn(async () => null),
  logGenesisReport: vi.fn(async () => 'ev'),
  isGenesisGoal: (g: string) => g.startsWith('Character genesis'),
}));

const { withdrawDraftsAndRedraft, requestDraftRevision, loadPendingFeedback } = await import('./genesis-redraft');
const { planWorkCycle } = await import('@/ai/copilot/work-cycle-text');
const GM = { id: 'gm', role: 'WATCHER' };
const T0 = new Date('2026-10-12T00:00:00Z');
const later = new Date('2026-10-12T01:00:00Z');

beforeEach(() => {
  db.kicks = 0;
  db.memories = 0;
  db.sessions.length = 0;
  db.forge.length = 0;
  db.links.length = 0;
  db.sessions.push({
    id: 's1', campaignId: 'c1', goal: 'Character genesis: Violet [ch1] — x', status: 'blocked',
    blockedReason: 'waiting on the GM', stage: 'BUILDING', progress: '[]', startedAt: T0,
  });
  db.forge.push(
    { id: 'd1', campaignId: 'c1', name: 'Raised by Rosemary', type: 'root', status: 'draft', authorUserId: 'jewl', createdAt: later },
    { id: 'd2', campaignId: 'c1', name: 'After the Key', type: 'branch', status: 'draft', authorUserId: 'jewl', createdAt: later },
    { id: 'pub', campaignId: 'c1', name: 'Human', type: 'seed', status: 'published', authorUserId: 'jewl', createdAt: later },
    { id: 'other', campaignId: 'c1', name: 'Dockworker Years', type: 'branch', status: 'draft', authorUserId: 'jewl', createdAt: later },
    { id: 'gmdraft', campaignId: 'c1', name: 'GM Idea', type: 'skill', status: 'draft', authorUserId: 'gm', createdAt: later },
  );
  db.links.push(
    { id: 'l1', campaignId: 'c1', characterId: 'ch1', forgeItemId: 'd1', sessionId: 's1' },
    { id: 'l2', campaignId: 'c1', characterId: 'ch2', forgeItemId: 'other', sessionId: 's2' },
  );
});

describe('withdrawDraftsAndRedraft', () => {
  it('withdraws the session\'s pending JEWL drafts, notes the law, un-blocks and kicks the loop', async () => {
    const r = await withdrawDraftsAndRedraft({ campaignId: 'c1', sessionId: 's1', actor: GM });
    expect(r.withdrawn.map(w => w.id).sort()).toEqual(['d1', 'd2']);
    expect(db.forge.find(f => f.id === 'd1')).toMatchObject({ status: 'superseded', name: 'Raised by Rosemary [w:d1]' });
    // published, another character's, and the GM's own drafts are untouched
    expect(db.forge.find(f => f.id === 'pub')!.status).toBe('published');
    expect(db.forge.find(f => f.id === 'other')!.status).toBe('draft');
    expect(db.forge.find(f => f.id === 'gmdraft')!.status).toBe('draft');
    expect(db.links.map(l => l.id)).toEqual(['l2']);
    const s = db.sessions[0];
    expect(s.status).toBe('active');
    expect(s.blockedReason).toBeNull();
    expect(JSON.parse(s.progress as string).at(-1)).toBe(
      'drafts withdrawn: generalise per the archetype law — root "Raised by Rosemary", branch "After the Key"',
    );
    expect(db.kicks).toBe(1);
  });

  it('only the campaign GM or ADMIN may redraft', async () => {
    await expect(withdrawDraftsAndRedraft({ campaignId: 'c1', sessionId: 's1', actor: { id: 'p1', role: 'TRAILBLAZER' } }))
      .rejects.toBeInstanceOf(ForbiddenError);
    const r = await withdrawDraftsAndRedraft({ campaignId: 'c1', sessionId: 's1', actor: { id: 'mike', role: 'ADMIN' } });
    expect(r.withdrawn).toHaveLength(2);
  });

  it('refuses a session still prodding or already done', async () => {
    db.sessions[0].stage = 'PRODDING';
    await expect(withdrawDraftsAndRedraft({ campaignId: 'c1', sessionId: 's1', actor: GM })).rejects.toBeInstanceOf(ValidationError);
    db.sessions[0].stage = 'BUILDING';
    db.sessions[0].status = 'done';
    await expect(withdrawDraftsAndRedraft({ campaignId: 'c1', sessionId: 's1', actor: GM })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('requestDraftRevision — per-draft GM feedback', () => {
  it('withdraws ONLY the targeted draft, records the note on it, notes the cycle, un-blocks', async () => {
    const r = await requestDraftRevision({ campaignId: 'c1', draftId: 'd2', body: { note: 'Make it about caregiving, not the key.' }, actor: GM });
    expect(r).toMatchObject({ draftId: 'd2', sessionId: 's1', status: 'revising' });
    expect(db.forge.find(f => f.id === 'd2')!.status).toBe('superseded');
    expect(db.forge.find(f => f.id === 'd1')!.status).toBe('draft');
    expect(db.forge.find(f => f.id === 'other')!.status).toBe('draft');
    const tag = JSON.parse(db.forge.find(f => f.id === 'd2')!.relationshipTags as string).withdrawn;
    expect(tag).toMatchObject({ revisionNote: 'Make it about caregiving, not the key.', sessionId: 's1', type: 'branch', originalName: 'After the Key' });
    const s = db.sessions[0];
    expect(s.status).toBe('active');
    expect(JSON.parse(s.progress as string).at(-1))
      .toBe('GM feedback on After the Key (branch): Make it about caregiving, not the key. — redraft it');
    expect(db.kicks).toBe(1);
  });

  it('the note reaches the next cycle text verbatim, and leaves once a new draft of that kind exists', async () => {
    await requestDraftRevision({ campaignId: 'c1', draftId: 'd2', body: { note: 'Make it about caregiving.' }, actor: GM });
    const feedback = await loadPendingFeedback('c1', 's1', 'jewl');
    expect(feedback).toEqual(['GM feedback on After the Key (branch): Make it about caregiving. — redraft it']);
    const { text } = planWorkCycle({ id: 's1', goal: 'Character genesis: Violet [ch1]', plan: 'B', cycleCount: 4, stage: 'BUILDING' },
      [], '', [], null, { feedback });
    expect(text).toContain('GM FEEDBACK');
    expect(text).toContain('- GM feedback on After the Key (branch): Make it about caregiving. — redraft it');
    db.forge.push({ id: 'd3', campaignId: 'c1', name: 'Years of Caregiving', type: 'branch', status: 'draft', authorUserId: 'jewl', createdAt: new Date(Date.now() + 1000) });
    expect(await loadPendingFeedback('c1', 's1', 'jewl')).toEqual([]);
  });

  it('perms: campaign GM or ADMIN only; note required and ≤600; only JEWL drafts', async () => {
    await expect(requestDraftRevision({ campaignId: 'c1', draftId: 'd2', body: { note: 'x' }, actor: { id: 'p1', role: 'TRAILBLAZER' } }))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(requestDraftRevision({ campaignId: 'c1', draftId: 'd2', body: { note: '' }, actor: GM })).rejects.toThrow();
    await expect(requestDraftRevision({ campaignId: 'c1', draftId: 'd2', body: { note: 'x'.repeat(601) }, actor: GM })).rejects.toThrow();
    await expect(requestDraftRevision({ campaignId: 'c1', draftId: 'gmdraft', body: { note: 'x' }, actor: GM })).rejects.toBeInstanceOf(ValidationError);
    const r = await requestDraftRevision({ campaignId: 'c1', draftId: 'd2', body: { note: 'ok' }, actor: { id: 'mike', role: 'ADMIN' } });
    expect(r.status).toBe('revising');
  });

  it('seed feedback: JEWL may re-pick; with memories already sealed the note warns about a rebuild', async () => {
    db.forge.push({ id: 'sd', campaignId: 'c1', name: 'Half-Fae', type: 'seed', status: 'draft', authorUserId: 'jewl', createdAt: later });
    db.memories = 12;
    const r = await requestDraftRevision({ campaignId: 'c1', draftId: 'sd', body: { note: 'She should be fully human.' }, actor: GM });
    expect(r.seedHasMemories).toBe(true);
    const note = JSON.parse(db.sessions[0].progress as string).at(-1) as string;
    expect(note).toContain('GM feedback on Half-Fae (seed): She should be fully human. — redraft it');
    expect(note).toContain('re-pick it');
    expect(note).toContain('the sheet may need a rebuild');
  });
});
