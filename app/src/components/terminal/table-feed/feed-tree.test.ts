import { describe, it, expect } from 'vitest';
import type { TerminalEvent, GameSessionInfo, TerminalPayload } from '@/types/terminal';
import { buildFoldTree, openByDefaultKeys, filterTree, matchEvent, isHarvest, type FoldNode } from './feed-tree';

const at = (m: number) => new Date(Date.UTC(2026, 9, 8, 1, m)).toISOString();
let n = 0;
const ev = (m: number, payload: Partial<TerminalPayload> & Record<string, unknown> = {}, over: Partial<TerminalEvent> = {}): TerminalEvent => ({
  id: `e${++n}`, type: 'game_event', timestamp: at(m), campaignId: 'c', actor: 'gm', actorUserId: 'u', actorName: 'mike',
  payload: { kind: 'game_event', eventType: 'declaration', description: `line ${n}`, ...payload } as TerminalPayload, ...over,
});
const g = (m: number, eventType: string, description: string, extra: Record<string, unknown> = {}) => ev(m, { eventType, description, ...extra });
const s1: GameSessionInfo = { id: 's1', number: 1, name: null, startedAt: at(10), endedAt: at(20) };
const s2: GameSessionInfo = { id: 's2', number: 2, name: 'Stair', startedAt: at(30), endedAt: null };

const kinds = (nodes: FoldNode[], depth = 0): string[] => nodes.flatMap((nd) => [
  `${'  '.repeat(depth)}${nd.kind}:${nd.label}:${nd.lines}${nd.live ? '*' : ''}`,
  ...kinds(nd.items.filter((i) => i.type === 'node').map((i) => (i as { node: FoldNode }).node), depth + 1),
]);

describe('buildFoldTree — chapter → session → rest → encounter', () => {
  it('nests encounters inside the rest stretch they happened in; the live path is marked', () => {
    const rows = [
      ev(12), g(13, 'long_rest', 'The party rests'), g(14, 'encounter_begin', 'Encounter begins: Ambush. Six seconds at a time.'),
      g(15, 'encounter_round', 'Ambush — round 1'), g(16, 'encounter_end', 'Encounter resolved: Ambush.'), ev(17),
      ev(31), g(32, 'encounter_begin', 'Encounter begins: Stair fight. Six seconds at a time.'), g(33, 'encounter_round', 'Stair fight — round 1'),
    ];
    const tree = buildFoldTree(rows, [s1, s2], { liveEncounter: { id: null, name: 'Stair fight' } });
    expect(kinds(tree)).toEqual([
      'chapter:Chapter 1:8*',
      '  session:Session 1:5',
      '    rest:Long rest:4',
      '      encounter:Ambush:3',
      '  session:Session 2 · Stair:3*',
      '    encounter:Stair fight:2*',
    ]);
    expect([...openByDefaultKeys(tree)].sort()).toEqual(['chapter-1', 'enc-' + rows[7].id, 'session-s2'].sort());
  });

  it('payload.encounterName wins over the text', () => {
    const tree = buildFoldTree([g(31, 'encounter_begin', 'whatever', { encounterId: 'x', encounterName: 'Named' })], [s2], { liveEncounter: { id: 'x', name: 'Other' } });
    const enc = (tree[0].items[0] as { node: FoldNode }).node.items[0] as { node: FoldNode };
    expect(enc.node.label).toBe('Named');
    expect(enc.node.live).toBe(true);
  });

  it('a harvest closes the chapter after the session it happened in', () => {
    const harvest: TerminalEvent = { ...ev(15, {}), type: 'changelog', sessionId: 's1', payload: { kind: 'changelog', entryId: 'h', category: 'harvest', description: 'Harvest', changes: [], source: null, revertible: false, reverted: false } };
    expect(isHarvest(harvest)).toBe(true);
    const tree = buildFoldTree([ev(12), harvest, ev(31)], [s1, s2]);
    expect(tree.map((c) => [c.label, c.chapter!.sessions, !!c.chapter!.harvest, c.live])).toEqual([
      ['Chapter 1', 1, true, false],
      ['Chapter 2', 1, false, true],
    ]);
  });

  it('no harvest yet: everything is Chapter 1', () => {
    expect(buildFoldTree([ev(12), ev(31)], [s1, s2]).map((c) => c.label)).toEqual(['Chapter 1']);
  });
});

describe('search', () => {
  it('keeps matching lines and the folds holding them, all opened', () => {
    const rows = [ev(12, { description: 'The lamp gutters' }), ev(13, { description: 'Rain' }), ev(31, { description: 'A lamp again' })];
    const tree = buildFoldTree(rows, [s1, s2]);
    const r = filterTree(tree, 'LAMP');
    expect(r.hits).toBe(2);
    expect(kinds(r.tree)).toEqual(['chapter:Chapter 1:3*', '  session:Session 1:2', '  session:Session 2 · Stair:1*']);
    expect([...r.openKeys].sort()).toEqual(['chapter-1', 'session-s1', 'session-s2']);
  });

  it('matches who spoke and the raw text; an empty query keeps the tree', () => {
    const e = ev(12, { kind: 'chat', message: 'Hm.', raw: 'Say: hm' } as never, { characterName: 'Warden' });
    expect(matchEvent(e, 'warden')).toBe(true);
    expect(matchEvent(e, 'say:')).toBe(true);
    const tree = buildFoldTree([e], [s1]);
    expect(filterTree(tree, '  ').tree).toBe(tree);
  });
});
