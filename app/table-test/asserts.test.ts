import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { absentThing, stillGoing, sessionBound, noPlaceholder, noDeed, unheldUseWithheld, watcherLineStands, timing, cloudBudget, memoryNotEveryCard, knownPeopleOnly, runAsserts, summarize } from './asserts';
import type { RunCard, RunTranscript } from './transcript';

const T0 = Date.UTC(2026, 10, 3, 20, 0, 0);
const card = (o: Partial<RunCard> & { text?: string; kind?: string } = {}): RunCard => ({
  at: T0 + 5000, lineIndex: 0, characterId: 'v', characterName: 'Violet',
  segments: [{ kind: o.kind ?? 'thought', text: o.text ?? 'Quiet room.' }], thought: '', msAfterLine: 4000, ...o,
});
const make = (o: Partial<RunTranscript> = {}): RunTranscript => ({
  script: { name: 's', world: { snapshot: 'x', from: 'y' }, steps: [{ line: 'The phone rings.', waitS: 5 }] },
  sessionId: 'S2', startedAt: T0, endedAt: T0 + 60000, lineAt: [T0], lineResults: [{ status: 200, withheld: false, body: '' }],
  events: [], cards: [],
  ledger: [{ lineIndex: 0, at: T0, items: [{ id: 'bill', name: 'the bill', holderId: 'k', locationId: null, status: 'ok' }], beings: [{ characterId: 'v', name: 'Violet', locationId: 'apt' }, { characterId: 'k', name: 'Kristopher', locationId: 'car' }] }],
  memories: [], wall: [], log: [],
  roster: [{ characterId: 'v', name: 'Violet', knownNames: ['Rosemary Marsh'] }, { characterId: 'k', name: 'Kristopher', knownNames: ['Ruth Hale'] }],
  ...o,
});

describe('table-test asserts', () => {
  it('A1 absentThing', () => {
    const bad = absentThing(make({ cards: [card({ text: 'The bill is still by the door.' })] }));
    expect(bad.pass).toBe(false); expect(bad.evidence[0]).toContain('Violet');
    const ok = absentThing(make({ cards: [card({ text: 'I gave him the bill.' })] }));
    expect(ok.pass).toBe(true); expect(ok.evidence).toEqual([]);
  });
  const ringing = { id: 'ph', name: 'phone', holderId: 'v', locationId: null, status: 'ok', signal: { text: 'ringing', since: T0, until: T0 + 60000, by: 'k' } };
  const withPhone = (): Partial<RunTranscript> => ({ ledger: [{ lineIndex: 0, at: T0, items: [ringing], beings: [] }] });
  it('A2 stillGoing', () => {
    expect(stillGoing(make({ ...withPhone(), cards: [card({ text: 'It stopped ringing.' })] })).pass).toBe(false);
    expect(stillGoing(make({ ...withPhone(), cards: [card({ text: 'It keeps ringing.' })] })).pass).toBe(true);
  });
  it('A3 sessionBound', () => {
    const pieces = (recent: string[], rs?: string) => ({ perceived: '', felt: '', wakes: [], recent, gist: '', impulse: 'stay' as const, recentSessionId: rs });
    const old = { at: T0 - 1, type: 'being_thought', sessionId: 'S1', text: 'An  old thought', payload: {} };
    expect(sessionBound(make({ cards: [card({ pieces: pieces(['x'], 'S1') })] })).pass).toBe(false);
    expect(sessionBound(make({ events: [old], cards: [card({ pieces: pieces(['an old THOUGHT']) })] })).pass).toBe(false);
    const ok = sessionBound(make({ events: [old], cards: [card({ pieces: pieces(['fresh'], 'S2') }), card()] }));
    expect(ok.pass).toBe(true); expect(ok.measure).toEqual({ label: 'cards_without_pieces', value: 1 });
  });
  it('A4 noPlaceholder', () => {
    expect(noPlaceholder(make({ cards: [card({ text: 'Person-A called.' })] })).pass).toBe(false);
    expect(noPlaceholder(make({ events: [{ at: T0, type: 'chat', text: 'ok', narration: 'at Place-B', payload: {} }] })).pass).toBe(false);
    expect(noPlaceholder(make({ cards: [card()] })).pass).toBe(true);
  });
  it('A5 noDeed', () => {
    expect(noDeed(make({ cards: [card({ text: 'I picked up the phone.' })] })).pass).toBe(false);
    const decl = { at: T0, type: 'game_event', eventType: 'declaration', characterId: 'v', text: 'Violet picks up the phone', payload: {} };
    expect(noDeed(make({ events: [decl], cards: [card({ text: 'I picked up the phone.' })] })).pass).toBe(true);
  });
  it('A6 unheldUseWithheld', () => {
    const t = make({ lineResults: [{ status: 200, withheld: true, note: 'not in hand', body: '' }] });
    expect(unheldUseWithheld(t, [0]).pass).toBe(true);
    expect(unheldUseWithheld(t, []).pass).toBe(false);
    expect(unheldUseWithheld(make(), [0]).pass).toBe(false);
    expect(unheldUseWithheld(make({ lineResults: [{ status: 200, withheld: true, body: '' }] }), [0]).pass).toBe(false);
  });
  it('A7 watcherLineStands', () => {
    const script = { name: 's', world: { snapshot: '', from: '' }, steps: [{ line: 'Kristopher hangs up.', waitS: 5 }] };
    const live = { lineIndex: 0, at: T0, items: [ringing], beings: [{ characterId: 'k', name: 'Kristopher', locationId: 'car' }] };
    expect(watcherLineStands(make({ script, ledger: [live] })).pass).toBe(false);
    const gone = { ...live, items: [{ ...ringing, signal: { ...ringing.signal, until: T0 + 10000 } }] };
    expect(watcherLineStands(make({ script, ledger: [gone] })).pass).toBe(true);
  });
  it('A8 timing', () => {
    const slow = timing(make({ cards: [card({ msAfterLine: 30000 })] }));
    expect(slow.pass).toBe(false); expect(slow.measure?.value).toBe(30000);
    expect(timing(make({ cards: [card()] })).pass).toBe(true);
  });
  it('A9 cloudBudget measures; stray placeholders fail', () => {
    const w = (s?: number) => ({ at: T0, caller: 'composer', lane: 'cloud', bytesIn: 100, strayPlaceholders: s });
    const ok = cloudBudget(make({ wall: [w(0), w(0)] }));
    expect(ok.pass).toBe(true); expect(ok.measure?.value).toBe(200);
    expect(ok.evidence.every((e) => e.startsWith('info:'))).toBe(true);
    expect(cloudBudget(make({ wall: [w(2)] })).pass).toBe(false);
  });
  it('A10 memoryNotEveryCard', () => {
    const many = (n: number, hit: number) => Array.from({ length: n }, (_, i) => card({ text: i < hit ? 'Rosemary Marsh again.' : 'Nothing.' }));
    expect(memoryNotEveryCard(make({ cards: many(7, 4) })).pass).toBe(false);
    expect(memoryNotEveryCard(make({ cards: many(7, 2) })).pass).toBe(true);
    expect(memoryNotEveryCard(make({ cards: many(3, 3) })).pass).toBe(true);
  });
  it('A11 knownPeopleOnly', () => {
    expect(knownPeopleOnly(make({ cards: [card({ text: 'Ruth Hale would know.' })] })).pass).toBe(false);
    expect(knownPeopleOnly(make({ cards: [card({ text: 'Rosemary would know.' })] })).pass).toBe(true);
  });
  it('runAsserts order and summarize', () => {
    const rs = runAsserts(make({ cards: [card({ text: 'The bill is still by the door.' })] }));
    expect(rs.map((r) => r.id)).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11']);
    const md = summarize(rs);
    expect(md).toContain('| A1 | absentThing | FAIL | 1 |');
    expect(md).toContain('**A1 absentThing**');
  });
});
