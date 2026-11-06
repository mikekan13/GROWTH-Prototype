import { describe, it, expect } from 'vitest';
import type { TerminalEvent, TerminalPayload } from '@/types/terminal';
import { utterancesFor, cleanSpoken } from './table-reader-utterances';

function ev(payload: TerminalPayload, over: Partial<TerminalEvent> = {}): TerminalEvent {
  return {
    id: 'ev-1', type: payload.kind as TerminalEvent['type'], timestamp: new Date(2026, 10, 5, 21, 7, 1).toISOString(),
    campaignId: 'c', actor: 'ai_copilot', actorUserId: 'u', actorName: 'violet', payload,
    characterId: 'violet', characterName: 'Violet', ...over,
  };
}
const roster = [{ id: 'violet', name: 'Violet' }];

describe('utterancesFor', () => {
  it('action to narrator, quoted line to the character, thought skipped', () => {
    const out = utterancesFor(ev({ kind: 'chat', message: 'She looks up. "I think I did, yes." ((She is sure of it.))' }), roster);
    expect(out).toEqual([
      { text: 'She looks up.', characterId: null },
      { text: 'I think I did, yes.', characterId: 'violet' },
    ]);
  });
  it("the Watcher's typed narration goes to the narrator (2026-11-06: the narrator voices everything else)", () => {
    const out = utterancesFor(ev({ kind: 'chat', message: 'Rain falls on the lot.' }, { actor: 'gm', characterId: null, characterName: null as unknown as string }), roster);
    expect(out).toEqual([{ text: 'Rain falls on the lot.', characterId: null }]);
  });
  it('a typed declaration: narration to the narrator, pulled-out speech to the speaker', () => {
    const out = utterancesFor(ev({
      kind: 'game_event', eventType: 'declaration', description: 'Kristopher sits in his car. "Still raining," he says.',
      via: 'typed', narration: 'Kristopher sits in his car.',
      speech: [{ speakerId: 'kris', speakerLabel: 'Kristopher', text: 'Still raining,' }],
    } as TerminalPayload, { actor: 'gm', characterId: null }), [...roster, { id: 'kris', name: 'Kristopher' }]);
    expect(out.some((u) => u.characterId === null && /sits in his car/.test(u.text))).toBe(true);
    expect(out.some((u) => u.characterId === 'kris' && /Still raining/.test(u.text))).toBe(true);
  });
  it('time passing is read by the narrator', () => {
    const out = utterancesFor(ev({ kind: 'game_event', eventType: 'timeskip', description: 'Day 1: Violet slept.' } as TerminalPayload, { actor: 'system' }), roster);
    expect(out).toEqual([{ text: 'Day 1: Violet slept.', characterId: null }]);
  });
  it('session start is not read', () => {
    expect(utterancesFor(ev({ kind: 'game_event', eventType: 'session_start', description: 'Session 3 started' } as TerminalPayload, { actor: 'gm' }), roster)).toEqual([]);
  });
  it('cleanSpoken strips marks', () => {
    expect(cleanSpoken('"Hi."')).toBe('Hi.');
    expect(cleanSpoken('((quiet))')).toBe('quiet');
  });
});
