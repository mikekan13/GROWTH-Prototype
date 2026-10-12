/** GM redraft of a genesis's drafts (blocks are campaign-agnostic, 2026-10-12). */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, ValidationError } from '@/lib/errors';

type Row = Record<string, unknown> & { id: string };
const db = vi.hoisted(() => ({
  sessions: [] as Array<Record<string, unknown> & { id: string }>,
  forge: [] as Array<Record<string, unknown> & { id: string }>,
  links: [] as Array<Record<string, unknown> & { id: string }>,
  kicks: 0,
}));

function match(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Array<Record<string, unknown>>).some(w => match(row, w));
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const o = v as Record<string, unknown>;
      if ('in' in o) return (o.in as unknown[]).includes(row[k]);
      if ('gte' in o) return (row[k] as Date) >= (o.gte as Date);
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
    dayaWorkSession: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.sessions.find(s => s.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Object.assign(db.sessions.find(s => s.id === where.id)!, data)),
    },
    characterBlockLink: {
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

const { withdrawDraftsAndRedraft } = await import('./genesis-redraft');
const GM = { id: 'gm', role: 'WATCHER' };
const T0 = new Date('2026-10-12T00:00:00Z');
const later = new Date('2026-10-12T01:00:00Z');

beforeEach(() => {
  db.kicks = 0;
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
