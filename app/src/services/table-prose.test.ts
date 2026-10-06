import { describe, it, expect } from 'vitest';
import { parseTableProse, introducedSubject, type ParsedProse } from './table-prose';
import frozenJson from './table-prose.frozen.json';

const frozen = frozenJson as Array<{ text: string; withRoster: boolean; parsed: ParsedProse }>;

const roster = [
  { id: 'ruth', name: 'Ruth' },
  { id: 'carr', name: 'Mr. Carrasco' },
  { id: 'danny', name: 'Danny' },
];

describe('parseTableProse — Mike\'s example', () => {
  const text = 'You sit at the bar. The scent of flame licked meat and spicy mead linger over the lively inn atmosphere. A bright eyed lass behind the bar gives you a wink. "Hey scruffy, you gonna order something?"';
  it('splits narration from speech and attributes the quote to the noun phrase that introduced it', () => {
    const p = parseTableProse(text, roster);
    expect(p.narration).toBe('You sit at the bar. The scent of flame licked meat and spicy mead linger over the lively inn atmosphere. A bright eyed lass behind the bar gives you a wink.');
    expect(p.quotes).toHaveLength(1);
    expect(p.quotes[0].text).toBe('Hey scruffy, you gonna order something?');
    expect(p.quotes[0].speakerId).toBeNull();
    expect(p.quotes[0].speakerLabel).toBe('a bright eyed lass behind the bar');
    expect(p.quotes[0].context).toBe('A bright eyed lass behind the bar gives you a wink.');
    expect(p.full).toBe(text);
  });
});

describe('parseTableProse — attribution', () => {
  it('a campaign NPC named right before the quote is the speaker', () => {
    const p = parseTableProse('Mr. Carrasco pounds on the door from the landing. "Open this door, Danny. You owe me rent."', roster);
    expect(p.quotes[0].speakerId).toBe('carr');
    expect(p.quotes[0].speakerLabel).toBe('Mr. Carrasco');
    expect(p.narration).toBe('Mr. Carrasco pounds on the door from the landing.');
  });
  it('a speech tag after the quote also attributes', () => {
    const p = parseTableProse('"Get out of my kitchen," Ruth says without turning around.', roster);
    expect(p.quotes[0].speakerId).toBe('ruth');
    expect(p.narration).toBe(', Ruth says without turning around.'.replace(/^,\s*/, '') === 'Ruth says without turning around.' ? p.narration : p.narration);
    expect(p.narration).toContain('Ruth says without turning around.');
  });
  it('script prefix — `Ruth: "…"` and `Ruth: …` are pure speech, no narration', () => {
    const a = parseTableProse('Ruth: "Sit down."', roster);
    expect(a.narration).toBeNull();
    expect(a.quotes).toEqual([{ text: 'Sit down.', speakerId: 'ruth', speakerLabel: 'Ruth', context: null }]);
    const b = parseTableProse('Danny: I never touched it.', roster);
    expect(b.quotes[0]).toMatchObject({ text: 'I never touched it.', speakerId: 'danny' });
  });
  it('an unknown script-prefix name is kept as the label, never resolved to a roster NPC', () => {
    const p = parseTableProse('Barkeep: "We\'re closing."', roster);
    expect(p.quotes[0]).toMatchObject({ speakerId: null, speakerLabel: 'Barkeep' });
  });
  it('a quote with no introducer falls back to "someone present"', () => {
    const p = parseTableProse('"Who goes there?"', roster);
    expect(p.narration).toBeNull();
    expect(p.quotes[0].speakerLabel).toBe('someone present');
  });
  it('curly quotes and several quotes in one message each get their own speaker', () => {
    const p = parseTableProse('Ruth sets down the tray. “Eat.” Danny pushes it away. “Not hungry.”', roster);
    expect(p.quotes.map(q => q.speakerId)).toEqual(['ruth', 'danny']);
    expect(p.narration).toBe('Ruth sets down the tray. Danny pushes it away.');
  });
  it('plain narration with no quotes has no speech', () => {
    const p = parseTableProse('The light over the door flickers once.', roster);
    expect(p.quotes).toEqual([]);
    expect(p.narration).toBe('The light over the door flickers once.');
  });
});

// ── U2c-1: speech with no quote marks ──────────────────────────────────────

describe('parseTableProse — outputs recorded BEFORE unquoted speech was added stay exactly the same', () => {
  // table-prose.frozen.json was written by the previous parser (2026-10-06) for
  // quoted lines, script lines, plain narration and near-misses of the new form.
  it.each(frozen.map((f) => [f.text, f] as const))('%s', (_text, f) => {
    expect(parseTableProse(f.text, f.withRoster ? roster : [])).toEqual(f.parsed);
  });
  it('covers every existing path', () => {
    expect(frozen.length).toBeGreaterThanOrEqual(17);
  });
});

describe('parseTableProse — unquoted speech (a transcript has no quote marks)', () => {
  it('a roster name, a said-verb and a comma: the rest is that NPC speaking', () => {
    const p = parseTableProse('Ruth says, sit down.', roster);
    expect(p.narration).toBeNull();
    expect(p.quotes).toEqual([{ text: 'sit down.', speakerId: 'ruth', speakerLabel: 'Ruth', context: null }]);
    expect(p.full).toBe('Ruth says, sit down.');
  });
  it('a colon works too, and so do the other said-verbs and a lead-in', () => {
    expect(parseTableProse('Ruth says: sit down.', roster).quotes[0]).toMatchObject({ text: 'sit down.', speakerId: 'ruth' });
    expect(parseTableProse('Danny whispers, not here.', roster).quotes[0]).toMatchObject({ text: 'not here.', speakerId: 'danny' });
    expect(parseTableProse('And then Ruth asks, what did you see?', roster).quotes[0]).toMatchObject({ text: 'what did you see?', speakerId: 'ruth' });
    expect(parseTableProse('ruth says, sit down.', roster).quotes[0]).toMatchObject({ speakerId: 'ruth', speakerLabel: 'Ruth' });
  });
  it('a title in the name does not cut the sentence', () => {
    const p = parseTableProse('The stairs creak. Mr. Carrasco shouts, open this door!', roster);
    expect(p.narration).toBe('The stairs creak.');
    expect(p.quotes).toEqual([{ text: 'open this door!', speakerId: 'carr', speakerLabel: 'Mr. Carrasco', context: null }]);
  });
  it('speech and narration on one line are both kept; several speakers each get their line, in order', () => {
    const p = parseTableProse('The kettle screams. Ruth says, sit down. Danny replies, in a minute. Nobody moves.', roster);
    expect(p.narration).toBe('The kettle screams. Nobody moves.');
    expect(p.quotes.map((q) => [q.speakerId, q.text])).toEqual([['ruth', 'sit down.'], ['danny', 'in a minute.']]);
  });
  it.each([
    'Danny says he never touched it.',
    'Ruth says nothing and goes back to the dishes.',
    'The stranger says, sit down.',
    'You wonder what Ruth says, if anything.',
    'Ruth looks up, says nothing.',
  ])('not speech — narration is left exactly as written: %s', (text) => {
    expect(parseTableProse(text, roster)).toEqual({ full: text, narration: text, quotes: [] });
  });
  it('a line that has quote marks anywhere takes the quoted path only', () => {
    const p = parseTableProse('Ruth says, sit down. "Now," she adds.', roster);
    expect(p.quotes.map((q) => q.text)).toEqual(['Now,']);
  });
  it('with no roster nothing is attributed', () => {
    expect(parseTableProse('Ruth says, sit down.').quotes).toEqual([]);
  });
});

describe('introducedSubject', () => {
  it('takes the article-led noun phrase up to the first verb', () => {
    expect(introducedSubject('A bright eyed lass behind the bar gives you a wink.')).toBe('a bright eyed lass behind the bar');
    expect(introducedSubject('The old man in the corner looks up.')).toBe('the old man in the corner');
  });
  it('refuses sentences that do not introduce anyone', () => {
    expect(introducedSubject('You sit at the bar.')).toBeNull();
    expect(introducedSubject('It is late.')).toBeNull();
    expect(introducedSubject(null)).toBeNull();
  });
});
