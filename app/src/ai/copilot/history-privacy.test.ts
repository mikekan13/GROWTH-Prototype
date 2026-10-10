/**
 * JEWL history private per user (Mike 2026-10-08). The service is run against
 * an in-memory copilotMessage table that applies the same `where` Prisma would,
 * with two users in one campaign — no real users are created.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { replyRecipientId, copilotHistoryWhere } from './history-privacy';
import { canSeeCopilotRow } from '@/lib/permissions';

type Row = { id: string; campaignId: string; role: string; content: string; userId: string | null; username: string | null; actions: string | null; createdAt: Date };
const table: Row[] = [];

type Where = { campaignId: string; OR: Array<{ userId: string | null }> };
function matches(r: Row, w: Where) {
  return r.campaignId === w.campaignId && w.OR.some(c => c.userId === r.userId);
}

vi.mock('@/lib/db', () => ({
  prisma: {
    copilotMessage: {
      findMany: vi.fn(async ({ where, take }: { where: Where; take: number }) =>
        table.filter(r => matches(r, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, take)),
    },
  },
}));

const { getCopilotHistory } = await import('./copilot-service');

const C = 'camp1';
let t = 0;
function row(role: string, userId: string | null, content: string, campaignId = C): Row {
  return { id: `r${t}`, campaignId, role, content, userId, username: null, actions: null, createdAt: new Date(1_000_000 + (t++) * 1000) };
}

beforeEach(() => {
  table.length = 0; t = 0;
  table.push(
    row('user', 'gm', 'gm asks'),
    row('assistant', 'gm', 'jewl answers gm'),
    row('user', 'p1', 'player asks'),
    row('assistant', 'p1', 'jewl answers player'),
    row('assistant', null, 'legacy unattributed reply'),
    row('user', 'p1', 'other campaign', 'camp2'),
  );
});

describe('getCopilotHistory — private per user', () => {
  it('the player sees only their own turns and JEWL replies to them', async () => {
    const h = await getCopilotHistory(C, { id: 'p1', role: 'TRAILBLAZER' });
    expect(h.map(m => m.content)).toEqual(['player asks', 'jewl answers player']);
  });

  it('the GM (a Watcher) does not see the player turns nor unattributed rows', async () => {
    const h = await getCopilotHistory(C, { id: 'gm', role: 'WATCHER' });
    expect(h.map(m => m.content)).toEqual(['gm asks', 'jewl answers gm']);
  });

  it('ADMIN sees their own rows plus the unattributed ones, never another user\'s', async () => {
    const h = await getCopilotHistory(C, { id: 'gm', role: 'ADMIN' });
    expect(h.map(m => m.content)).toEqual(['gm asks', 'jewl answers gm', 'legacy unattributed reply']);
  });

  it('actions is always an array — metadata JSON, null and junk rows become []', async () => {
    table.length = 0; t = 0;
    const meta = row('assistant', 'gm', 'metadata row'); meta.actions = '{"source":"GM_TEXT","canvasAction":null}';
    const none = row('assistant', 'gm', 'null row');
    const junk = row('assistant', 'gm', 'junk row'); junk.actions = 'not json';
    const list = row('assistant', 'gm', 'action list'); list.actions = '[{"id":"a1","type":"create_npc","status":"pending"}]';
    table.push(meta, none, junk, list);
    const h = await getCopilotHistory(C, { id: 'gm', role: 'ADMIN' });
    for (const m of h) expect(Array.isArray(m.actions)).toBe(true);
    expect(h.map(m => m.actions.length)).toEqual([0, 0, 0, 1]);
  });

  it('GODHEAD role is not ADMIN for unattributed rows', async () => {
    const h = await getCopilotHistory(C, { id: 'x', role: 'GODHEAD' });
    expect(h).toEqual([]);
  });

  it('the query filter agrees with canSeeCopilotRow for every row and viewer', () => {
    const viewers = [{ id: 'gm', role: 'ADMIN' }, { id: 'gm', role: 'WATCHER' }, { id: 'p1', role: 'TRAILBLAZER' }];
    for (const v of viewers) {
      for (const r of table.filter(r => r.campaignId === C)) {
        expect(matches(r, copilotHistoryWhere(C, v))).toBe(canSeeCopilotRow(v.id, v.role, r));
      }
    }
  });
});

describe('replyRecipientId', () => {
  it('a human prompt is answered to that human', () => {
    expect(replyRecipientId({ source: 'GM_TEXT', actorId: 'p1' }, 'gm')).toBe('p1');
    expect(replyRecipientId({ source: 'TABLE_AMBIENT', actorId: 'gm' }, 'gm')).toBe('gm');
  });
  it('JEWL\'s own triggers report to the campaign Watcher', () => {
    expect(replyRecipientId({ source: 'JEWL_AUTONOMOUS_TICK', actorId: 'jewl' }, 'gm')).toBe('gm');
    expect(replyRecipientId({ source: 'JEWL_WORK_CYCLE', actorId: 'jewl-user' }, 'gm')).toBe('gm');
  });
  it('no recipient when nothing identifies one (row then stays ADMIN-only)', () => {
    expect(replyRecipientId({ source: 'JEWL_WORK_CYCLE', actorId: 'j' }, null)).toBeNull();
    expect(replyRecipientId({ source: 'GM_TEXT', actorId: '' }, 'gm')).toBeNull();
  });
});
