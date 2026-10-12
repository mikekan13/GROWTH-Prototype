import { describe, it, expect } from 'vitest';
import { parseClassifierOutput, buildClassifierUser } from './classifier-format';
import { rowContentClass, typedMessageClass, promptContentClass } from './content-class';

describe('parseClassifierOutput — the local split', () => {
  it('reads the verdict and a per-line split with an extracted in-character part', () => {
    const r = parseClassifierOutput(
      'VERDICT: react: Ruth was asked a question\n#2 OOC\n#3 IC\n#4 IC: "Ruth, where is the key?"',
      [2, 3, 4],
    );
    expect(r.parsed).toBe(true);
    expect(r.verdict).toBe('react');
    expect(r.reasoning).toBe('Ruth was asked a question');
    expect(r.split.get(2)).toEqual({ kind: 'ooc' });
    expect(r.split.get(3)).toEqual({ kind: 'ic' });
    expect(r.split.get(4)).toEqual({ kind: 'ic', icText: 'Ruth, where is the key?' });
  });

  it('proact is not mistaken for react or act', () => {
    expect(parseClassifierOutput('VERDICT: proact: stuck', []).verdict).toBe('proact');
    expect(parseClassifierOutput('verdict: act', []).verdict).toBe('act');
  });

  it('tolerates markdown bold, fences and a stray think block', () => {
    const r = parseClassifierOutput('<think>hmm</think>\n```\n**VERDICT:** silent: noise\n- #1 OOC\n```', [1]);
    expect(r.verdict).toBe('silent');
    expect(r.split.get(1)).toEqual({ kind: 'ooc' });
  });

  it('a split line the model skipped defaults to OOC', () => {
    const r = parseClassifierOutput('VERDICT: react: talk\n#1 IC', [1, 2]);
    expect(r.split.get(1)).toEqual({ kind: 'ic' });
    expect(r.split.get(2)).toEqual({ kind: 'ooc' });
  });

  it('numbers the model was not asked about are ignored', () => {
    const r = parseClassifierOutput('VERDICT: react\n#9 IC: smuggled', [1]);
    expect(r.split.has(9)).toBe(false);
    expect(r.split.get(1)).toEqual({ kind: 'ooc' });
  });

  it('unparseable output → silent and every line OOC (the safe fallback)', () => {
    const r = parseClassifierOutput('I think JEWL should probably say something. #1 IC', [1, 2]);
    expect(r.parsed).toBe(false);
    expect(r.verdict).toBe('silent');
    expect([...r.split.values()]).toEqual([{ kind: 'ooc' }, { kind: 'ooc' }]);
    expect(parseClassifierOutput('', [1]).verdict).toBe('silent');
  });

  it('the user block tags only the lines to split', () => {
    const u = buildClassifierUser([
      { n: 1, who: 'JEWL', ts: '10:00:00', text: 'Who?', split: false },
      { n: 2, who: '[ambient]', ts: '10:00:05', text: 'Ruth.', split: true },
    ]);
    expect(u).toContain('1. [10:00:00] JEWL: Who?');
    expect(u).toContain('2. [10:00:05] SPLIT [ambient]: Ruth.');
  });

  it('the user block names every split line the answer must carry', () => {
    const u = buildClassifierUser([
      { n: 1, who: '[ambient]', ts: '10:00:00', text: 'a', split: true },
      { n: 2, who: 'JEWL', ts: '10:00:01', text: 'b', split: false },
      { n: 3, who: '[ambient]', ts: '10:00:02', text: 'c', split: true },
    ]);
    expect(u).toContain('exactly 2 split line(s): #1, #3.');
  });
});

describe('content class of copilot rows', () => {
  it('a stamped row keeps its stamp', () => {
    expect(rowContentClass({ contentClass: 'fiction', username: '[ambient]' })).toBe('fiction');
    expect(rowContentClass({ contentClass: 'table', username: 'mike' })).toBe('table');
  });

  it('legacy rows are inferred from their markers', () => {
    expect(rowContentClass({ username: '[ambient]' })).toBe('table');
    expect(rowContentClass({ username: '[ui]' })).toBe('real');
    expect(rowContentClass({ username: 'x', actions: JSON.stringify({ source: 'TABLE_DROPPED' }) })).toBe('table');
    expect(rowContentClass({ username: 'mike', actions: JSON.stringify({ source: 'GM_TEXT' }) })).toBe('fiction');
  });

  it('typed lines are fiction unless the ooc rules fire', () => {
    expect(typedMessageClass('Ruth opens the door slowly.')).toBe('fiction');
    expect(typedMessageClass('hang on, bathroom break')).toBe('table');
    expect(typedMessageClass('((brb))')).toBe('table');
    expect(promptContentClass('GM_TEXT', 'ooc: snacks?')).toBe('table');
    expect(promptContentClass('GM_VOICE', 'anything')).toBe('table');
    expect(promptContentClass('UI_ACTIVITY', 'clicked')).toBe('real');
    expect(promptContentClass('TABLE_AMBIENT', 'Classifier verdict: REACT')).toBe('fiction');
  });
});
