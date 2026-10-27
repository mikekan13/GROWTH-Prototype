import { describe, it, expect } from 'vitest';
import { didNotHear, withoutNothingLines } from './did-not-hear';
import { splitSentences } from '@/services/table-prose';

const violet = { id: 'v', name: 'Violet' };
describe('didNotHear — the one line a silence earns (HW8 run 7 item 12)', () => {
  it('an addressed quote that did not carry earns "<Name> did not hear him."', () => {
    expect(didNotHear(violet, [{ text: 'Violet? I have your pizza.', kind: 'dialogue', speakerSex: 'male' }])).toBe('Violet did not hear him.');
  });
  it('a knock at the door counts as addressed', () => {
    expect(didNotHear(violet, [{ text: 'He knocks on the door.', kind: 'narration' }], 'm')).toBe('Violet did not hear him.');
  });
  it('an unaddressed act that did not reach posts nothing', () => {
    expect(didNotHear(violet, [{ text: 'He shifts his weight and looks down the stairwell.', kind: 'narration' }], 'm')).toBeNull();
    expect(didNotHear(violet, [{ text: 'Is everyone here?', kind: 'dialogue' }])).toBeNull();
  });
});
describe('withoutNothingLines', () => {
  it('drops the model\'s nothing-changed lines and keeps the rest', () => {
    const scene = 'Nothing on the landing has changed. The bulb hums. Nothing new has reached Violet from beyond the room. The knock has settled into silence.';
    expect(withoutNothingLines(scene, splitSentences)).toBe('The bulb hums.');
  });
});
