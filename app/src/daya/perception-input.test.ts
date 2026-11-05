import { describe, it, expect } from 'vitest';
import { scrubOthersCardText } from './perception-input';
import { voicedByLine, voicedByDeclaration } from '@/services/watcher-voiced';

describe('FINDING 71: another being\'s card never rides into a perception input', () => {
  const violetCard = [
    'Her thumb hovers over the screen.',
    'Type "Extra Space. In ten." and hit send, she thinks.',
    'Violet types out the message and presses send.',
  ];
  const envelope = [
    'You are in the car.',
    'The screen shows the conversation with the text you just typed: "Extra Space. In ten."',
    'Violet types out the message and presses send.',
    'Her phone sits on the passenger seat.',
  ];
  it('drops surroundings lines that carry A\'s thought/action text from B\'s input', () => {
    const out = scrubOthersCardText(envelope, 'Violet read your message. Nothing has come back yet.', violetCard);
    expect(out.join('\n')).not.toMatch(/Extra Space/);
    expect(out.join('\n')).not.toMatch(/presses send/);
    expect(out).toContain('You are in the car.');
    expect(out).toContain('Her phone sits on the passenger seat.');
  });
  it('keeps text the event itself carries (perceived through a sense: heard or read)', () => {
    const out = scrubOthersCardText(envelope, 'A text arrives: "Extra Space. In ten."', ['Type "Extra Space. In ten." and hit send, she thinks.']);
    expect(out.join('\n')).toMatch(/Extra Space/);
  });
  it('no cards, nothing changes', () => {
    expect(scrubOthersCardText(envelope, 'x', [])).toEqual(envelope);
  });
});

describe('FINDING 62a: Watcher-voiced = speech or a deed, never narration ABOUT', () => {
  it('a quote with a speaker voices it; a deed written for it voices it', () => {
    expect(voicedByLine({ quotes: [{ speakerId: 'kris' }], actions: [] })).toEqual(['kris']);
    expect(voicedByLine({ quotes: [], actions: [{ actorId: 'kris' }] })).toEqual(['kris']);
  });
  it('narration about Violet ("Violet didn\'t answer") parses to no quote and no action: nobody voiced', () => {
    expect(voicedByLine({ quotes: [], actions: [] })).toEqual([]);
  });
  it('owned acts and unattributed quotes do not voice', () => {
    expect(voicedByLine({ quotes: [{ speakerId: null }], actions: [{ actorId: 'violet', owned: true }] })).toEqual([]);
  });
  it('reads a recorded declaration the same way', () => {
    expect(voicedByDeclaration({ speech: [{ speakerId: 'kris' }], actions: [{ actorId: 'violet', owned: true }, { actorId: 'kris' }] })).toEqual(['kris']);
    expect(voicedByDeclaration(null)).toEqual([]);
  });
});
