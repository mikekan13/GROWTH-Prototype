import { describe, it, expect } from 'vitest';
import type { TerminalEvent } from '@/types/terminal';
import { pageCutoff, keepFrom, mergeEvents, sessionMarkers, withoutLoggedSessionLines } from './feed-paging';

const at = (m: number) => new Date(Date.UTC(2026, 9, 7, 20, m)).toISOString();
const ev = (id: string, m: number, eventType?: string): TerminalEvent => ({
  id, type: 'game_event', timestamp: at(m), campaignId: 'c', actor: 'gm', actorUserId: 'u', actorName: 'mike',
  payload: { kind: 'game_event', eventType: eventType ?? 'declaration', description: id },
});

describe('pageCutoff — no gaps when two sources are merged', () => {
  it('the later oldest-row among sources that have more', () => {
    expect(pageCutoff([{ oldest: at(10), hasMore: true }, { oldest: at(30), hasMore: true }])).toBe(at(30));
  });
  it('an exhausted source does not cut', () => {
    expect(pageCutoff([{ oldest: at(10), hasMore: true }, { oldest: at(30), hasMore: false }])).toBe(at(10));
  });
  it('both exhausted = the start of the campaign', () => {
    expect(pageCutoff([{ oldest: at(10), hasMore: false }, { oldest: null, hasMore: false }])).toBeNull();
  });
});

describe('keepFrom / mergeEvents', () => {
  it('drops rows older than the cutoff', () => {
    expect(keepFrom([ev('a', 5), ev('b', 20)], at(10)).map((e) => e.id)).toEqual(['b']);
    expect(keepFrom([ev('a', 5)], null).map((e) => e.id)).toEqual(['a']);
  });
  it('merges by id, incoming wins, oldest first', () => {
    const old = ev('x', 5);
    const fresh = { ...ev('x', 5), payload: { ...old.payload, description: 'new' } } as TerminalEvent;
    const merged = mergeEvents([ev('b', 20), old], [ev('a', 1), fresh]);
    expect(merged.map((e) => e.id)).toEqual(['a', 'x', 'b']);
    expect((merged[1].payload as { description: string }).description).toBe('new');
  });
});

describe('session boundaries', () => {
  it('a start row per session and an end row once it ended', () => {
    const rows = sessionMarkers([
      { id: 's1', number: 1, name: null, startedAt: at(0), endedAt: at(40) },
      { id: 's2', number: 2, name: 'The stair', startedAt: at(50), endedAt: null },
    ], 'c');
    expect(rows.map((r) => [r.id, (r.payload as { description: string }).description])).toEqual([
      ['session-start-s1', 'Session 1 started'],
      ['session-end-s1', 'Session 1 ended'],
      ['session-start-s2', 'Session 2: The stair started'],
    ]);
  });
  it('the logged session lines give way to them', () => {
    expect(withoutLoggedSessionLines([ev('a', 1, 'session_start'), ev('b', 2), ev('c', 3, 'session_end')]).map((e) => e.id)).toEqual(['b']);
  });
});
