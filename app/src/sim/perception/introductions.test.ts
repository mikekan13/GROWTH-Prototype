import { describe, it, expect } from 'vitest';
import { introducedBeings, detectIntroductions, nameMatches, caughtText, type CaughtPiece } from './introductions';

const t = (text: string): CaughtPiece[] => [{ kind: 'text', text }];
const ruth = { id: 'ruth', name: 'Ruth Almswood' };
const violet = { id: 'violet', name: 'Violet' };
const kai = { id: 'kai', name: 'Kai' };
const present = [ruth, violet, kai];

describe('self-introduction teaches the speaker', () => {
  it.each([
    "I'm Ruth.", 'Hello, my name is Ruth Almswood.', 'Call me Ruth', 'i am ruth, warden of this place', 'The name’s Ruth.', "They call me Ruth.",
  ])('%s', (said) => {
    expect(introducedBeings(t(said), ruth, present, 'violet')).toEqual(['ruth']);
  });

  it('a name that is not the speaker\'s teaches nothing (an alias is not the truth)', () => {
    expect(introducedBeings(t("I'm Bess."), ruth, present, 'violet')).toEqual([]);
  });

  it('"I\'m tired" is not an introduction', () => {
    expect(introducedBeings(t("I'm tired, Violet."), ruth, present, 'violet')).toEqual([]);
  });

  it('unknown speaker → no self-introduction', () => {
    expect(introducedBeings(t("I'm Ruth."), null, present, 'violet')).toEqual([]);
  });
});

describe('introduction by another teaches the one present being named', () => {
  it.each(['This is Kai.', 'Meet Kai, my cousin.', "Her name's Ruth.", 'Say hello to Ruth Almswood!', 'That is Kai over there'])('%s', (said) => {
    const got = introducedBeings(t(said), violet, present, 'someone-else');
    expect(got).toHaveLength(1);
  });

  it('only beings present can be introduced', () => {
    expect(introducedBeings(t('This is Kai.'), violet, [ruth, violet], 'x')).toEqual([]);
  });

  it('ambiguous first names → nobody; a full name settles it', () => {
    const ruthB = { id: 'ruth2', name: 'Ruth Bell' };
    expect(introducedBeings(t('This is Ruth.'), violet, [ruth, ruthB, violet], 'x')).toEqual([]);
    expect(introducedBeings(t('This is Ruth Bell.'), violet, [ruth, ruthB, violet], 'x')).toEqual(['ruth2']);
  });

  it('possessives are not introductions; the perceiver is never introduced to itself', () => {
    expect(introducedBeings(t("This is Kai's knife."), violet, present, 'x')).toEqual([]);
    expect(introducedBeings(t('This is Kai.'), violet, present, 'kai')).toEqual([]);
  });
});

describe('only words actually caught teach', () => {
  it('the name in a gap → no gain', () => {
    expect(introducedBeings([{ kind: 'text', text: "Hello, I'm " }, { kind: 'gap' }, { kind: 'text', text: ' and welcome.' }], ruth, present, 'violet')).toEqual([]);
  });

  it('the introducing phrase in a gap → no gain', () => {
    expect(introducedBeings([{ kind: 'text', text: 'Hello, ' }, { kind: 'gap' }, { kind: 'text', text: ' Ruth.' }], ruth, present, 'violet')).toEqual([]);
    expect(introducedBeings([{ kind: 'text', text: 'This ' }, { kind: 'gap' }, { kind: 'text', text: ' Kai.' }], violet, present, 'x')).toEqual([]);
  });

  it('entity pieces read as their words', () => {
    expect(caughtText([{ kind: 'text', text: 'This is ' }, { kind: 'entity', text: 'Kai', entityId: 'kai' }, { kind: 'text', text: '.' }])).toBe('This is Kai.');
    expect(introducedBeings([{ kind: 'text', text: 'This is ' }, { kind: 'entity', text: 'Kai', entityId: 'kai' }], violet, present, 'x')).toEqual(['kai']);
  });
});

describe('helpers', () => {
  it('nameMatches: full name or first word (≥3 letters)', () => {
    expect(nameMatches(['Ruth'], 'Ruth Almswood')).toBe(true);
    expect(nameMatches(['ruth', 'almswood'], 'Ruth Almswood')).toBe(true);
    expect(nameMatches(['Almswood'], 'Ruth Almswood')).toBe(false);
    expect(nameMatches(['Al'], 'Al')).toBe(true);
  });
  it('detectIntroductions finds both kinds', () => {
    expect(detectIntroductions("I'm Ruth and this is Kai.").map((d) => d.kind).sort()).toEqual(['other', 'self']);
  });
});
