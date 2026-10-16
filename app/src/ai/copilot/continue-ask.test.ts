/** A chat ask never dies at the cap (2026-10-16). */
import { describe, it, expect } from 'vitest';
import { shouldContinueAsWorkSession, continuationGoal, withContinuingNote, CONTINUING_NOTE } from './continue-ask';

const base = { source: 'GM_TEXT', kind: 'TABLE_CHAT', rounds: 12, maxToolIterations: 12, lastStopReason: 'tool_use', lastRoundHadTools: true };

describe('shouldContinueAsWorkSession', () => {
  it('continues a GM chat ask that hit the cap with the model still calling tools', () => {
    expect(shouldContinueAsWorkSession(base)).toBe(true);
    expect(shouldContinueAsWorkSession({ ...base, lastStopReason: 'max_tokens' })).toBe(true);
  });
  it('does not continue when the model finished, or stopped calling tools, or had rounds left', () => {
    expect(shouldContinueAsWorkSession({ ...base, lastStopReason: 'end_turn' })).toBe(false);
    expect(shouldContinueAsWorkSession({ ...base, lastRoundHadTools: false })).toBe(false);
    expect(shouldContinueAsWorkSession({ ...base, rounds: 5 })).toBe(false);
  });
  it('only a human chat ask continues — work cycles and canvas gestures do not', () => {
    expect(shouldContinueAsWorkSession({ ...base, source: 'JEWL_WORK_CYCLE', kind: 'WORK_CYCLE' })).toBe(false);
    expect(shouldContinueAsWorkSession({ ...base, source: 'GM_CANVAS_ACTION' })).toBe(false);
    expect(shouldContinueAsWorkSession({ ...base, kind: 'GENESIS' })).toBe(false);
  });
});

describe('continuationGoal / withContinuingNote', () => {
  it('prefixes "Continue:" and cuts the ask at 120 chars', () => {
    expect(continuationGoal('  organize   the studio ')).toBe('Continue: organize the studio');
    const long = 'x'.repeat(200);
    const g = continuationGoal(long);
    expect(g.startsWith('Continue: ')).toBe(true);
    expect(g.length).toBe('Continue: '.length + 120 + 1);
  });
  it('appends the note once', () => {
    const once = withContinuingNote('Facts are in.');
    expect(once).toBe(`Facts are in.\n\n${CONTINUING_NOTE}`);
    expect(withContinuingNote(once)).toBe(once);
    expect(withContinuingNote('')).toBe(CONTINUING_NOTE);
  });
});
