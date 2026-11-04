import { describe, it, expect } from 'vitest';
import { newTranslationMap, translateOut, translateBack, type NameEntry } from './translator';

const names: NameEntry[] = [
  { name: 'Violet Hart', kind: 'person', aliases: ['Violet'] },
  { name: 'Kristopher', kind: 'person' },
  { name: 'the lot behind the hotel', kind: 'place' },
];

describe('translator', () => {
  it('round-trips a paragraph with two people, a place and a possessive', () => {
    const src = "Violet Hart met Kristopher in the lot behind the hotel. Violet's keys were Kristopher's.";
    const { text, map } = translateOut(src, names);
    expect(text).toBe("Person-A met Person-B in Place-A. Person-A's keys were Person-B's.");
    expect(translateBack(text, map)).toBe(
      "Violet Hart met Kristopher in the lot behind the hotel. Violet Hart's keys were Kristopher's.",
    );
  });

  it('matches a place with or without the leading article', () => {
    const { text } = translateOut('Meet at The lot behind the hotel, or lot behind the hotel.', names);
    expect(text).toBe('Meet at Place-A, or Place-A.');
  });

  it('longest first: full name beats alias', () => {
    const { text } = translateOut('Violet Hart and Violet', names);
    expect(text).toBe('Person-A and Person-A');
  });

  it('does not replace inside other words', () => {
    const { text } = translateOut('Violetta saw violet flowers and Violet.', names);
    expect(text).toBe('Violetta saw Person-A flowers and Person-A.');
  });

  it('reuses placeholders across calls sharing one map', () => {
    const m = newTranslationMap();
    const a = translateOut('Kristopher waits.', names, m);
    const b = translateOut('Violet arrives, then Kristopher leaves.', names, a.map);
    expect(a.text).toBe('Person-A waits.');
    expect(b.text).toBe('Person-B arrives, then Person-A leaves.');
    expect(b.map).toBe(m);
  });

  it('translateBack leaves unknown placeholders alone', () => {
    const { map } = translateOut('Kristopher', names);
    expect(translateBack('Person-A and Person-Z, Place-Q', map)).toBe('Kristopher and Person-Z, Place-Q');
  });

  it('skips names under 3 characters', () => {
    const { text } = translateOut('Al and Jo went.', [
      { name: 'Al', kind: 'person' },
      { name: 'Jo', kind: 'person' },
    ]);
    expect(text).toBe('Al and Jo went.');
  });

  it('escapes regex metacharacters in names', () => {
    const n: NameEntry[] = [
      { name: 'C.J. (Mac) +1', kind: 'person' },
      { name: 'a.c', kind: 'thing' },
    ];
    const { text, map } = translateOut('Ask C.J. (Mac) +1 about abc and a.c today', n);
    expect(text).toBe('Ask Person-A about abc and Thing-A today');
    expect(translateBack(text, map)).toBe('Ask C.J. (Mac) +1 about abc and a.c today');
  });

  it('continues letters past Z', () => {
    const many: NameEntry[] = Array.from({ length: 28 }, (_, i) => ({
      name: `Nomen${String.fromCharCode(97 + (i % 26))}${i < 26 ? '' : 'x'}ee`,
      kind: 'person' as const,
    }));
    const joined = many.map(n => n.name).join(' ');
    const { text, map } = translateOut(joined, many);
    const parts = text.split(' ');
    expect(parts[0]).toBe('Person-A');
    expect(parts[25]).toBe('Person-Z');
    expect(parts[26]).toBe('Person-AA');
    expect(parts[27]).toBe('Person-AB');
    expect(translateBack(text, map)).toBe(joined);
  });
});

describe('names with hyphens, slashes and dashes (2026-11-03: they broke every cloud call)', () => {
  it('translates and restores without a regex error', () => {
    const names = [
      { name: "Violet's apartment — fourth-floor walkup studio", kind: 'place' as const },
      { name: 'gaming/dev rig', kind: 'thing' as const },
      { name: 'Violet', kind: 'person' as const },
    ];
    const map = newTranslationMap();
    const out = translateOut("Violet sits at the gaming/dev rig in Violet's apartment — fourth-floor walkup studio.", names, map).text;
    expect(out).not.toMatch(/Violet|gaming\/dev|fourth-floor/);
    expect(translateBack(out, map)).toBe("Violet sits at the gaming/dev rig in Violet's apartment — fourth-floor walkup studio.");
  });
});

import { neutralizeStrayPlaceholders } from './translator';
describe('a stray placeholder never reaches the page (session 2 live, 2026-11-03)', () => {
  it('neutralizes by kind, possessive kept', () => {
    expect(neutralizeStrayPlaceholders("I expect Person-A to come. Person-B's phone. At Place-C.")).toEqual({ text: "I expect someone to come. someone's phone. At somewhere.", count: 3 });
    expect(neutralizeStrayPlaceholders('No placeholders here.').count).toBe(0);
  });
});

describe('a thing after a determiner follows the sentence on the way back (run 7, 2026-11-04)', () => {
  it('lowercases a label after "my"/"the", keeps a proper name inside, keeps people and sentence starts', () => {
    const map = newTranslationMap();
    const names = [{ name: 'Personal phone', kind: 'thing' as const }, { name: 'Chess Pizza polo', kind: 'thing' as const }, { name: 'Violet', kind: 'person' as const }];
    const out = translateOut('Violet sees the Personal phone and my Chess Pizza polo. Personal phone rings.', names, map).text;
    expect(translateBack(out, map)).toBe('Violet sees the personal phone and my Chess Pizza polo. Personal phone rings.');
  });
});
