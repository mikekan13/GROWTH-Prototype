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
  it('never reads the Watcher', () => {
    expect(utterancesFor(ev({ kind: 'chat', message: 'Rain falls.' }, { actor: 'gm' }), roster)).toEqual([]);
  });
  it('cleanSpoken strips marks', () => {
    expect(cleanSpoken('"Hi."')).toBe('Hi.');
    expect(cleanSpoken('((quiet))')).toBe('quiet');
  });
});
