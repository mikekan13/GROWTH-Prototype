import { describe, it, expect } from 'vitest';
import { firstPersonVerb, firstPersonSentence, ownVoice } from './own-voice';

describe("own voice — the Watcher's line about a being, in that being's person (HW6 2026-10-25)", () => {
  const kris = { name: 'Kristopher', sex: 'Male' };
  const violet = { name: 'Violet', sex: 'Female' };
  it('verbs drop the third-person -s, irregulars included', () => {
    expect(['knocks', 'gets', 'pushes', 'watches', 'tries', 'is', 'has', 'does', 'goes', 'says', 'misses', 'this', 'always'].map(firstPersonVerb))
      .toEqual(['knock', 'get', 'push', 'watch', 'try', 'am', 'have', 'do', 'go', 'say', 'miss', 'this', 'always']);
    expect(firstPersonVerb('Knocks')).toBe('Knock');
  });
  it('"He gets close to the door and speaks loudly" → "I get close to the door and speak loudly"', () => {
    expect(firstPersonSentence('He gets close to the door and speaks loudly.', kris)).toBe('I get close to the door and speak loudly.');
    expect(firstPersonSentence('He waits a minute and then knocks again.', kris)).toBe('I wait a minute and then knock again.');
    expect(firstPersonSentence('Kristopher knocks on the apartment door.', kris)).toBe('I knock on the apartment door.');
  });
  it('his pronouns become mine; the name elsewhere is me', () => {
    expect(firstPersonSentence('Kristopher looks over the receipt as a smile masks the tears he was crying.', kris)).toBe('I look over the receipt as a smile masks the tears I was crying.');
    expect(firstPersonSentence("Kristopher's hand drops to his side.", kris)).toBe('my hand drops to my side.');
    expect(firstPersonSentence('She looks at her hands and tells herself to breathe.', violet)).toBe('I look at my hands and tell myself to breathe.');
    expect(firstPersonSentence('He looks back at Violet and waits for her.', kris)).toBe('I look back at Violet and wait for her.');
  });
  it('a speech line is what I say; narration lines go sentence by sentence', () => {
    expect(ownVoice('He gets close to the door and speaks loudly.\nKristopher: hello? Anyone home?', kris))
      .toBe('I get close to the door and speak loudly.\nI say: "hello? Anyone home?"');
    expect(ownVoice('He thinks about just leaving but he remembers this woman. He knocks again.', kris))
      .toBe('I think about just leaving but I remember this woman. I knock again.');
  });
  it('a sentence about no one is left as it is', () => {
    expect(firstPersonSentence('The radiator ticks.', kris)).toBe('The radiator ticks.');
  });
});
