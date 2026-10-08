import { describe, it, expect } from 'vitest';
import type { TerminalEvent, TerminalPayload } from '@/types/terminal';
import { buildFeedRows, eventRows } from './feed-rows';

let n = 0;
function ev(payload: TerminalPayload, over: Partial<TerminalEvent> = {}): TerminalEvent {
  n += 1;
  return {
    id: `ev-${n}`, type: payload.kind as TerminalEvent['type'], timestamp: new Date(2026, 9, 7, 21, 7, n).toISOString(),
    campaignId: 'c', actor: 'gm', actorUserId: 'u', actorName: 'mike', payload, ...over,
  };
}
const roster = [{ id: 'warden', name: 'Warden' }];

describe('character rows', () => {
  it("a being's line: chip row, segments parsed, voiced by the being, raw kept", () => {
    const [row] = eventRows(ev({ kind: 'chat', message: '*sets the lamp down* "Sit."', via: 'being', cycle: 0.004, raw: 'Do: sets the lamp down' }, { actor: 'ai_copilot', characterId: 'warden', characterName: 'Warden' }), roster);
    expect(row).toMatchObject({
      type: 'character', characterId: 'warden', name: 'Warden', via: 'being', voice: 'Being', voicedBy: null, cycle: 0.004,
      raw: 'Do: sets the lamp down',
      segments: [{ kind: 'action', text: 'sets the lamp down' }, { kind: 'speech', text: 'Sit.' }],
    });
  });

  it('an old row with no feed fields falls back: a being line is "being", raw = the message', () => {
    const [row] = eventRows(ev({ kind: 'chat', message: 'Hm.' }, { actor: 'ai_copilot', characterId: 'warden', characterName: 'Warden' }), roster);
    expect(row).toMatchObject({ type: 'character', via: 'being', raw: 'Hm.', segments: [{ kind: 'speech', text: 'Hm.' }] });
  });

  it("a Trailblazer's typed line is voiced by them", () => {
    const [row] = eventRows(ev({ kind: 'chat', message: '::listens at the door::' }, { actor: 'player', actorName: 'ash-player', characterId: 'ash', characterName: 'Ash' }), roster);
    expect(row).toMatchObject({ type: 'character', voice: 'Trailblazer', voicedBy: 'ash-player', via: 'typed', segments: [{ kind: 'action', text: 'listens at the door' }] });
  });
});

describe('the Watcher\'s narration — the preprocessor\'s split', () => {
  it('uses the stored split: narration row, then the NPC\'s own row, raw = the whole utterance', () => {
    const rows = eventRows(ev({
      kind: 'game_event', eventType: 'declaration', description: 'The stairwell is dark. "Sit down."',
      via: 'spoken', cycle: 0.004, raw: 'the stairwell is dark sit down',
      narration: 'The stairwell is dark.', speech: [{ speakerId: 'warden', speakerLabel: 'Warden', text: 'Sit down.' }],
    }), roster);
    expect(rows.map((r) => r.type)).toEqual(['narration', 'character']);
    expect(rows[0]).toMatchObject({ text: 'The stairwell is dark.', raw: 'the stairwell is dark sit down', via: 'spoken', cycle: 0.004 });
    expect(rows[1]).toMatchObject({ characterId: 'warden', name: 'Warden', fromNarration: true, voice: 'Watcher', segments: [{ kind: 'speech', text: 'Sit down.' }], raw: 'the stairwell is dark sit down' });
  });

  it('speech alone: no narration row', () => {
    const rows = eventRows(ev({ kind: 'game_event', eventType: 'declaration', description: 'x', narration: null, speech: [{ speakerId: null, speakerLabel: 'someone present', text: 'Hey.' }] }), roster);
    expect(rows.map((r) => r.type)).toEqual(['character']);
  });

  it('an old row falls back to the same preprocessor over the description', () => {
    const rows = eventRows(ev({ kind: 'game_event', eventType: 'declaration', description: 'Warden sets the lamp down. "Sit down."' }), roster);
    expect(rows.map((r) => [r.type, r.type === 'narration' ? r.text : r.type === 'character' ? r.name : ''])).toEqual([
      ['narration', 'Warden sets the lamp down.'],
      ['character', 'Warden'],
    ]);
    expect(rows[0]).toMatchObject({ via: 'typed', raw: 'Warden sets the lamp down. "Sit down."' });
  });

  it('a GM chat with no character is narration', () => {
    expect(eventRows(ev({ kind: 'chat', message: 'Rain.' }), roster)[0]).toMatchObject({ type: 'narration', text: 'Rain.' });
  });
});

describe('the other row types (feed-grammar sheet)', () => {
  it('dice roll → check bars', () => {
    const [row] = eventRows(ev({ kind: 'dice_roll', context: 'Clout check vs DR 12', fateDie: { die: 'd8', value: 6 }, total: 15, dr: 12, success: true, isSkilled: true }, { characterName: 'Ash' }), roster);
    expect(row).toMatchObject({ type: 'check', lines: ['Ash · Clout check vs DR 12', 'rolled 15 vs DR 12 · PASS'] });
  });

  it('skill events are checks; session lines are system; other game events are tagged events', () => {
    expect(eventRows(ev({ kind: 'game_event', eventType: 'skill_check', description: 'Skill check initiated' }), roster)[0]).toMatchObject({ type: 'check' });
    expect(eventRows(ev({ kind: 'game_event', eventType: 'session_start', description: 'Session 2 started' }), roster)[0]).toMatchObject({ type: 'system', lines: ['[SESSION 2 STARTED]'] });
    expect(eventRows(ev({ kind: 'game_event', eventType: 'encounter_round', description: 'Round 1' }), roster)[0]).toMatchObject({ type: 'event', tag: '[ENCOUNTER ROUND]', lines: ['Round 1'] });
  });

  it('JEWL notes, commands, changes, reverted changes', () => {
    expect(eventRows(ev({ kind: 'ai_message', message: 'Upstairs now?', severity: 'question' }), roster)[0]).toMatchObject({ type: 'jewl', tag: '[jEWL]:' });
    expect(eventRows(ev({ kind: 'command', input: '/roll d8', result: 'ok\nmore', success: true }), roster)[0]).toMatchObject({ type: 'system', lines: ['> /roll d8', 'ok', 'more'] });
    const change = { kind: 'changelog' as const, entryId: 'x', category: 'attribute' as const, description: 'Clout 3 → 2', changes: [], source: null, revertible: true };
    expect(eventRows(ev({ ...change, reverted: false }, { characterName: 'Ash' }), roster)[0]).toMatchObject({ type: 'system', lines: ['[CHANGE] Ash · Clout 3 → 2'] });
    expect(eventRows(ev({ ...change, reverted: true }), roster)[0]).toMatchObject({ type: 'withdrawn', fix: 'REVERTED' });
  });

  it('rows the table does not show give nothing', () => {
    expect(eventRows(ev({ kind: 'game_event', eventType: '', description: '' }), roster)).toEqual([]);
    expect(eventRows({ ...ev({ kind: 'chat', message: 'x' }), payload: {} as TerminalPayload }, roster)).toEqual([]);
  });
});

describe('spoken beats fold', () => {
  it('consecutive spoken sentences of one beat become one beat row; a lone sentence stays a plain row', () => {
    const a = ev({ kind: 'game_event', eventType: 'declaration', description: 'The door opens.', beatId: 'b1' });
    const b = ev({ kind: 'game_event', eventType: 'declaration', description: 'Rain comes in.', beatId: 'b1' });
    const c = ev({ kind: 'game_event', eventType: 'declaration', description: 'Silence.', beatId: 'b2' });
    const rows = buildFeedRows([a, b, c], roster);
    expect(rows.map((r) => r.type)).toEqual(['beat', 'narration']);
    const beat = rows[0];
    if (beat.type !== 'beat') throw new Error('expected a beat');
    expect(beat.groups.map((g) => g.map((r) => (r.type === 'narration' ? r.text : '')))).toEqual([['The door opens.'], ['Rain comes in.']]);
    expect(beat.groups[0][0]).toMatchObject({ via: 'spoken' });
    expect(beat.lastTimestamp).toBe(b.timestamp);
  });
});
