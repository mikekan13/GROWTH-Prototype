import { describe, it, expect } from 'vitest';
import { firstQuotedWords, withoutQuotedRuns } from './quoted-words';

describe('quoted words (finding 80)', () => {
  it('reads the words typed inside an act', () => {
    expect(firstQuotedWords('I type "Yes. Extra Space. I\'ll be there in ten." and hit send before I can talk')).toBe("Yes. Extra Space. I'll be there in ten.");
  });
  it('skips runs with no letter or digit and handles none', () => {
    expect(firstQuotedWords('she mouths "..." then "ok"')).toBe('ok');
    expect(firstQuotedWords('she looks away')).toBeUndefined();
    expect(firstQuotedWords(undefined)).toBeUndefined();
  });
  it('strips quoted runs before grounding', () => {
    expect(withoutQuotedRuns('I type "like the five-dollar bill" and send')).toBe('I type and send');
  });
});
