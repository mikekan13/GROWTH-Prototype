import { describe, it, expect } from 'vitest';
import type { TerminalEvent, GameSessionInfo, TerminalPayload } from '@/types/terminal';
import { narrateMechanical, UNMAPPED_KINDS } from './mechanical-narration';
import { mechanicalKind, withNarration, feedKeep, logKeep, isFeedLine, narratedId, logCharacters, type LogKind } from './feed-split';
import { buildFoldTree, revealKeys, type FoldNode } from './feed-tree';
import { buildFeedRows } from './feed-rows';

const at = (m: number) => new Date(Date.UTC(2026, 9, 8, 1, m)).toISOString();
let n = 0;
const ev = (m: number, payload: Record<string, unknown>, over: Partial<TerminalEvent> = {}): TerminalEvent => ({
  id: `e${++n}`, type: 'game_event', timestamp: at(m), campaignId: 'c', actor: 'gm', actorUserId: 'u', actorName: 'mike',
  payload: payload as unknown as TerminalPayload, ...over,
});
const say = (m: number) => ev(m, { kind: 'game_event', eventType: 'declaration', description: `line ${n + 1}` });
const change = (m: number, category: string, over: Partial<TerminalEvent> = {}) =>
  ev(m, { kind: 'changelog', entryId: `cl${n + 1}`, category, description: 'x: 1 → 2', changes: [], source: 'manual_change', revertible: true, reverted: false }, { type: 'changelog', characterId: 'ash', characterName: 'Ash', ...over });
const s1: GameSessionInfo = { id: 's1', number: 1, name: null, startedAt: at(10), endedAt: at(20) };

const kinds = (nodes: FoldNode[], depth = 0): string[] => nodes.flatMap((nd) => [
  `${'  '.repeat(depth)}${nd.kind}:${nd.lines}`,
  ...kinds(nd.items.filter((i) => i.type === 'node').map((i) => (i as { node: FoldNode }).node), depth + 1),
]);

describe('narrateMechanical — the common mechanical kinds as a numberless line', () => {
  it('relocation, arrival, departure', () => {
    expect(narrateMechanical(ev(1, { kind: 'game_event', eventType: 'relocation', description: '', toName: 'the Galley Kitchen' }, { characterName: 'Ash' }))).toBe('Ash goes to the Galley Kitchen.');
    expect(narrateMechanical(ev(1, { kind: 'game_event', eventType: 'located_at', description: '', fromName: 'the Hall' }, { characterName: 'Ash' }))).toBe('Ash leaves the Hall.');
    expect(narrateMechanical(ev(1, { kind: 'game_event', eventType: 'arrival', description: '', locationName: 'the Deck' }, { characterName: 'Ash' }))).toBe('Ash arrives at the Deck.');
    expect(narrateMechanical(ev(1, { kind: 'game_event', eventType: 'departure', description: '', fromName: 'the Deck' }, { characterName: 'Ash' }))).toBe('Ash leaves the Deck.');
  });
  it('item moves', () => {
    expect(narrateMechanical(ev(1, { kind: 'game_event', eventType: 'item_moved', description: '', itemName: 'The lantern', toName: 'Ash' }))).toBe('The lantern goes to Ash.');
    expect(narrateMechanical(ev(1, { kind: 'game_event', eventType: 'item_taken', description: '', itemName: 'The key', fromName: 'the drawer' }))).toBe('The key is taken from the drawer.');
    expect(narrateMechanical(ev(1, { kind: 'game_event', eventType: 'item_dropped', description: '', itemName: 'the rope', fromName: 'the Hall' }, { characterName: 'Ash' }))).toBe('Ash sets down the rope in the Hall.');
    expect(narrateMechanical(change(1, 'inventory'))).toBe("Ash's belongings change.");
    expect(narrateMechanical(change(1, 'equipment'))).toBe('Ash changes what they carry.');
  });
  it('a check with a verdict, numbers left to the Log', () => {
    expect(narrateMechanical(ev(1, { kind: 'dice_roll', context: 'Climbing check vs DR 8 (auto-resolved, no wager)', total: 9, success: true }, { type: 'dice_roll', characterName: 'Ash' }))).toBe('Ash succeeds at Climbing.');
    expect(narrateMechanical(ev(1, { kind: 'dice_roll', context: 'D20 roll', total: 9 }, { type: 'dice_roll' }))).toBeNull();
  });
  it('unmapped kinds stay null (and are listed)', () => {
    expect(narrateMechanical(change(1, 'attribute'))).toBeNull();
    expect(narrateMechanical(ev(1, { kind: 'command', input: '/x', result: 'y' }, { type: 'command' }))).toBeNull();
    expect(narrateMechanical(ev(1, { subtype: 'crystallization', kvCommitted: 3 }))).toBeNull();
    expect(UNMAPPED_KINDS.length).toBeGreaterThan(0);
  });
});

describe('mechanicalKind', () => {
  it('sorts rows into the Log kinds; story is null', () => {
    const k = (p: Record<string, unknown>, over: Partial<TerminalEvent> = {}) => mechanicalKind(ev(1, p, over));
    expect(k({ kind: 'changelog', category: 'attribute' })).toBe<LogKind>('stats');
    expect(k({ kind: 'changelog', category: 'inventory' })).toBe('items');
    expect(k({ kind: 'dice_roll' })).toBe('checks');
    expect(k({ kind: 'command' })).toBe('checks');
    expect(k({ kind: 'game_event', eventType: 'relocation' })).toBe('location');
    expect(k({ kind: 'game_event', eventType: 'item_given' })).toBe('items');
    expect(k({ kind: 'game_event', eventType: 'opportunity_arose' })).toBe('planning');
    expect(k({ subtype: 'crystallization' })).toBe('krma');
    expect(k({ kind: 'game_event', eventType: 'declaration' })).toBeNull();
    expect(k({ kind: 'game_event', eventType: 'encounter_begin' })).toBeNull();
    expect(k({ kind: 'chat', message: 'hi' })).toBeNull();
  });
});

describe('withNarration — narrated lines and log links', () => {
  it('a mapped row gets its own line; an unmapped one hangs behind the line before it; between-session rows are not linked', () => {
    const a = say(12);
    const inv = change(13, 'inventory');
    const attr = change(14, 'attribute');
    const outside = change(25, 'attribute');
    const { events, logRefs } = withNarration([a, inv, attr, outside], [s1]);
    expect(events.map((e) => e.id)).toEqual([a.id, inv.id, narratedId(inv.id), attr.id, outside.id]);
    expect(logRefs.get(narratedId(inv.id))).toEqual([inv.id, attr.id]);
    expect(logRefs.has(a.id)).toBe(false);
    expect([...logRefs.values()].flat()).not.toContain(outside.id);
  });
  it('the narrated line renders as narration carrying the link', () => {
    const a = say(12);
    const attr = change(13, 'attribute');
    const { events, logRefs } = withNarration([a, attr], [s1]);
    const rows = buildFeedRows(events.filter(feedKeep), [], logRefs);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'narration', logRefs: [attr.id] });
    const inv = change(14, 'inventory');
    const told = buildFeedRows(withNarration([inv], [s1]).events.filter(feedKeep), []);
    expect(told[0]).toMatchObject({ type: 'narration', text: "Ash's belongings change.", mechanical: true });
  });
});

describe('the two trees', () => {
  const rows = () => {
    n = 0;
    return [say(5), change(6, 'trait'), say(12), change(13, 'attribute'), say(14), ev(26, { subtype: 'crystallization' })];
  };
  it('Terminal: sessions only, narrative only', () => {
    const tree = buildFoldTree(rows(), [s1], { keep: (e) => feedKeep(e), dropBetween: true });
    expect(kinds(tree)).toEqual(['chapter:2', '  session:2']);
  });
  it('Log: mechanics from everywhere plus everything between sessions; KRMA for the Watcher only; empty folds pruned', () => {
    const all = rows();
    const gm = buildFoldTree(all, [s1], { keep: (e, w) => logKeep(e, w, { kinds: new Set(), characterId: null, isGM: true }), prune: true });
    expect(kinds(gm)).toEqual(['chapter:4', '  between:2', '  session:1', '  between:1']);
    const player = buildFoldTree(all, [s1], { keep: (e, w) => logKeep(e, w, { kinds: new Set(), characterId: null, isGM: false }), prune: true });
    expect(kinds(player)).toEqual(['chapter:3', '  between:2', '  session:1']);
    const statsOnly = buildFoldTree(all, [s1], { keep: (e, w) => logKeep(e, w, { kinds: new Set<LogKind>(['stats']), characterId: 'nobody', isGM: true }), prune: true });
    expect(statsOnly).toEqual([]);
  });
  it('revealKeys opens exactly the folds holding the rows', () => {
    const all = rows();
    const tree = buildFoldTree(all, [s1], { keep: (e, w) => logKeep(e, w, { kinds: new Set(), characterId: null, isGM: true }), prune: true });
    const target = all[3].id; // the attribute change inside session 1
    expect([...revealKeys(tree, new Set([target]))]).toEqual(['session-s1', 'chapter-1']);
  });
  it('isFeedLine: narrative inside a session', () => {
    const all = rows();
    expect(all.filter((e) => isFeedLine(e, [s1])).map((e) => e.id)).toEqual([all[2].id, all[4].id]);
  });
  it('logCharacters lists who the rows name', () => {
    expect(logCharacters(rows())).toEqual([{ id: 'ash', name: 'Ash' }]);
  });
});
