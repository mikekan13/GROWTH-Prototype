import { describe, it, expect } from 'vitest';
import type { TerminalEvent, GameSessionInfo } from '@/types/terminal';
import { buildSections, openByDefault, isRest } from './feed-sections';

const at = (m: number) => new Date(Date.UTC(2026, 9, 8, 1, m)).toISOString();
let n = 0;
const ev = (m: number, over: Partial<TerminalEvent> = {}, eventType = 'declaration', cycle?: number): TerminalEvent => ({
  id: `e${++n}`, type: 'game_event', timestamp: at(m), campaignId: 'c', actor: 'gm', actorUserId: 'u', actorName: 'mike',
  payload: { kind: 'game_event', eventType, description: `d${n}`, ...(cycle !== undefined ? { cycle } : {}) }, ...over,
});
const s1: GameSessionInfo = { id: 's1', number: 1, name: 'First', startedAt: at(10), endedAt: at(20) };
const s2: GameSessionInfo = { id: 's2', number: 2, name: null, startedAt: at(30), endedAt: null };

describe('buildSections — fold away by session', () => {
  it('lines go to their session (by sessionId, else by time); others to "between" stretches', () => {
    const rows = [ev(5), ev(12, { sessionId: 's1' }), ev(15), ev(25), ev(26), ev(31, { sessionId: 's2' })];
    const secs = buildSections(rows, [s1, s2]);
    expect(secs.map((s) => [s.kind, s.session?.id ?? null, s.lines])).toEqual([
      ['between', null, 1], ['session', 's1', 2], ['between', null, 2], ['session', 's2', 1],
    ]);
    expect(secs[3].live).toBe(true);
  });

  it('a rest inside a session opens a sub-section and is not a line', () => {
    const rest = ev(14, { sessionId: 's1' }, 'long_rest');
    const secs = buildSections([ev(12, { sessionId: 's1' }), rest, ev(16, { sessionId: 's1' })], [s1]);
    expect(isRest(rest)).toBe(true);
    expect(secs[0].parts.map((p) => [p.rest?.id ?? null, p.events.length])).toEqual([[null, 1], [rest.id, 1]]);
    expect(secs[0].lines).toBe(2);
  });

  it('the in-world span comes from the cycles the lines carry', () => {
    const secs = buildSections([ev(12, { sessionId: 's1' }, 'declaration', 0.5), ev(13, { sessionId: 's1' }, 'declaration', 0.2), ev(14, { sessionId: 's1' })], [s1]);
    expect(secs[0].cycles).toEqual([0.2, 0.5]);
  });

  it('sessions with no loaded lines get a header when inside what is loaded', () => {
    expect(buildSections([], [s1, s2]).map((s) => s.session?.id)).toEqual(['s1', 's2']);
    expect(buildSections([], [s1, s2], at(25)).map((s) => s.session?.id)).toEqual(['s2']);
  });
});

describe('openByDefault', () => {
  it('the live session is open, past sessions folded; the latest between-stretch open only when nothing is live', () => {
    const secs = buildSections([ev(12, { sessionId: 's1' }), ev(25)], [s1]);
    expect(secs.map((s, i, all) => openByDefault(s, i, all))).toEqual([false, true]);
    const live = buildSections([ev(25), ev(31, { sessionId: 's2' })], [s2]);
    expect(live.map((s, i, all) => openByDefault(s, i, all))).toEqual([false, true]);
  });
});
