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
    // Prose about a roster character is HIS act (Mike 2026-10-24), not narration.
    expect(p.narration).toBeNull();
    expect(p.actions).toEqual([{ text: 'Pounds on the door from the landing', actorId: 'carr', actorLabel: 'Mr. Carrasco' }]);
  });
  it('a speech tag after the quote also attributes', () => {
    const p = parseTableProse('"Get out of my kitchen," Ruth says without turning around.', roster);
    expect(p.quotes[0].speakerId).toBe('ruth');
    expect(p.narration).toBeNull();
    expect(p.actions).toEqual([{ text: 'Says without turning around', actorId: 'ruth', actorLabel: 'Ruth' }]);
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
    expect(p.narration).toBeNull();
    expect(p.actions?.map((a) => [a.actorId, a.text])).toEqual([['ruth', 'Sets down the tray'], ['danny', 'Pushes it away']]);
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
    'The stranger says, sit down.',
    'You wonder what Ruth says, if anything.',
  ])('not speech, about no one at the table — narration is left exactly as written: %s', (text) => {
    expect(parseTableProse(text, roster)).toEqual({ full: text, narration: text, quotes: [] });
  });
  it.each([
    ['Danny says he never touched it.', 'danny', 'Says he never touched it'],
    ['Ruth says nothing and goes back to the dishes.', 'ruth', 'Says nothing and goes back to the dishes'],
    ['Ruth looks up, says nothing.', 'ruth', 'Looks up, says nothing'],
  ])('not speech, but about a roster character — his act, not narration (Mike 2026-10-24): %s', (text, actorId, body) => {
    const p = parseTableProse(text, roster);
    expect(p.quotes).toEqual([]);
    expect(p.narration).toBeNull();
    expect(p.actions).toEqual([{ text: body, actorId, actorLabel: roster.find((r) => r.id === actorId)!.name }]);
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

describe('parseTableProse — the GM writes a roster character\'s action (hello world 2026-10-17)', () => {
  const table = [
    { id: 'kris', name: 'Kristopher', sex: 'Male' },
    { id: 'violet', name: 'Violet', sex: 'Female' },
    { id: 'rosemary', name: 'Rosemary Marsh' },
  ];
  it('`::Kristopher begins to let his eyes wander::` is his action, not narration', () => {
    const p = parseTableProse('::Kristopher begins to let his eyes wander around the hallway::', table);
    expect(p.actions).toEqual([{ text: 'Kristopher begins to let his eyes wander around the hallway', actorId: 'kris', actorLabel: 'Kristopher' }]);
    expect(p.narration).toBeNull();
    expect(p.quotes).toEqual([]);
  });
  it('a bare pronoun resolves to the character the table was just about, when the sex fits', () => {
    const p = parseTableProse(':: His voice is warm and relaxed:: "Take your time."', table, { lastActor: table[0] });
    expect(p.actions).toEqual([{ text: 'His voice is warm and relaxed', actorId: 'kris', actorLabel: 'Kristopher' }]);
    expect(p.quotes[0]).toMatchObject({ speakerId: 'kris', speakerLabel: 'Kristopher', text: 'Take your time.' });
  });
  it('a pronoun of the wrong sex does not pick the last actor', () => {
    const p = parseTableProse('"Take your time," she says.', table, { lastActor: table[0] });
    expect(p.quotes[0]).toMatchObject({ speakerId: null, speakerLabel: 'someone present' });
  });
  it('an unknown sex fits either pronoun', () => {
    const p = parseTableProse('She sets the tray down. "Eat."', table, { lastActor: table[2] });
    expect(p.quotes[0]).toMatchObject({ speakerId: 'rosemary' });
  });
  it('the actor named earlier in the same message is the referent of a later pronoun', () => {
    const p = parseTableProse('::Kristopher knocks twice:: "Hello?" ::He waits::', table);
    expect(p.actions?.map((a) => a.actorId)).toEqual(['kris', 'kris']);
    expect(p.quotes[0]).toMatchObject({ speakerId: 'kris' });
  });
  it('an action span with no roster actor stays narration, as before', () => {
    const p = parseTableProse('::The radiator ticks::', table);
    expect(p.actions).toBeUndefined();
    expect(p.narration).toBe('::The radiator ticks::');
  });
  it('without a roster nothing changes (no actions key)', () => {
    const p = parseTableProse('::Kristopher knocks::');
    expect(p).toEqual({ full: '::Kristopher knocks::', narration: '::Kristopher knocks::', quotes: [] });
  });
  it('a roster name in plain narration is the referent of the next line\'s pronoun', () => {
    const p = parseTableProse('Kristopher shifts his weight on the landing.\n"You didn\'t pay," he says through the door.', table);
    expect(p.quotes[0]).toMatchObject({ speakerId: 'kris' });
  });
});

describe('an unterminated quote (HW3, Mike 2026-10-24: the closing mark was missing and the words became narration)', () => {
  const table = [{ id: 'kris', name: 'Kristopher', sex: 'Male' }];
  it('runs to the end of the line and is his speech, on his card with his action', () => {
    const p = parseTableProse('He stands in the hallway with the empty pizza bag... "Please lady... Just pay the pizza. You don\'t even have to tip me... please.', table, { lastActor: table[0] });
    expect(p.actions).toEqual([{ text: 'Stands in the hallway with the empty pizza bag', actorId: 'kris', actorLabel: 'Kristopher' }]);
    expect(p.quotes).toEqual([expect.objectContaining({ speakerId: 'kris', text: "Please lady... Just pay the pizza. You don't even have to tip me... please." })]);
    expect(p.narration).toBeNull();
  });
});

describe('a pronoun walks back through the recent actors (HW3 2026-10-24)', () => {
  const table = [{ id: 'kris', name: 'Kristopher', sex: 'Male' }, { id: 'violet', name: 'Violet', sex: 'Female' }];
  it('"He knocks…" right after Violet spoke is still Kristopher', () => {
    const p = parseTableProse('He knocks on the door once more and lets his head sink to rest on the door.', table, { recentActors: [table[1], table[0]] });
    expect(p.actions).toEqual([{ text: 'Knocks on the door once more and lets his head sink to rest on the door', actorId: 'kris', actorLabel: 'Kristopher' }]);
    expect(p.narration).toBeNull();
  });
  it('"She …" in the same spot is Violet', () => {
    const p = parseTableProse('She does not move.', table, { recentActors: [table[1], table[0]] });
    expect(p.actions?.[0]).toMatchObject({ actorId: 'violet', text: 'Does not move' });
  });
});

describe('a sentence about a part or thing of his is his card (HW3 2026-10-24)', () => {
  const table = [{ id: 'kris', name: 'Kristopher', sex: 'Male' }, { id: 'violet', name: 'Violet', sex: 'Female' }];
  it('"A tear falls from his eye." is Kristopher\'s, and the quote after it is his too', () => {
    const p = parseTableProse('A tear falls from his eye. "Please lady I am having the worst week of my life."', table, { recentActors: [table[1], table[0]] });
    expect(p.actions).toEqual([{ text: 'A tear falls from his eye', actorId: 'kris', actorLabel: 'Kristopher' }]);
    expect(p.quotes[0]).toMatchObject({ speakerId: 'kris' });
    expect(p.narration).toBeNull();
  });
  it("Kristopher's hand drops is his; her coffee goes cold is hers", () => {
    expect(parseTableProse("Kristopher's hand drops to his side.", table).actions?.[0]).toMatchObject({ actorId: 'kris' });
    expect(parseTableProse('Her coffee goes cold on the counter.', table, { recentActors: [table[0], table[1]] }).actions?.[0]).toMatchObject({ actorId: 'violet' });
  });
  it('prose about no one and nothing of theirs stays narration', () => {
    expect(parseTableProse('The radiator ticks. Rain on the window.', table, { recentActors: [table[0]] }).narration).toBe('The radiator ticks. Rain on the window.');
  });
});

describe('the subject pronoun wins; an unclaimed quote beside one character\'s prose acts is his (HW4 2026-10-24)', () => {
  const table = [
    { id: 'kris', name: 'Kristopher', sex: 'm' },
    { id: 'violet', name: 'Violet', sex: 'f' },
  ] as Parameters<typeof parseTableProse>[1];
  it('"He … tries to get her …" is about him, and the quote beside his acts is his speech', () => {
    const p = parseTableProse('He stops at the entryway to the landing. He turns around and tries to get her to come to the door one last time. "Please can you pay for the pizza..."', table, { recentActors: [table[0], table[1]] });
    expect(p.actions?.map((a) => a.actorId)).toEqual(['kris', 'kris']);
    expect(p.quotes[0]).toMatchObject({ speakerId: 'kris', speakerLabel: 'Kristopher', text: 'Please can you pay for the pizza...' });
    expect(p.narration).toBeNull();
  });
  it('"She … tells him …" is about her', () => {
    const p = parseTableProse('She tells him to go away. "Go."', table, { recentActors: [table[0], table[1]] });
    expect(p.actions?.map((a) => a.actorId)).toEqual(['violet']);
    expect(p.quotes[0]).toMatchObject({ speakerId: 'violet' });
  });
  it('a quote on a line with two different actors is left to the older rules (the name just before it)', () => {
    const p = parseTableProse('Kristopher knocks. Violet freezes. "Who is it?"', table, { recentActors: [] });
    expect(p.actions?.map((a) => a.actorId)).toEqual(['kris', 'violet']);
    expect(p.quotes[0].speakerId).toBe('violet');
  });
});

describe("a line that is only a quote is the Watcher's last voice going on (HW5 2026-10-25)", () => {
  const table = [
    { id: 'kris', name: 'Kristopher', sex: 'm' },
    { id: 'violet', name: 'Violet', sex: 'f' },
  ] as Parameters<typeof parseTableProse>[1];
  it('a bare quote after the Watcher voiced Kristopher is Kristopher speaking, even if Violet spoke since', () => {
    const p = parseTableProse('"You took the pizza, closed the door, and locked it... Were you going to pay me?"', table, { recentActors: [table[1], table[0]], lastVoiced: table[0] });
    expect(p.quotes[0]).toMatchObject({ speakerId: 'kris', speakerLabel: 'Kristopher' });
    expect(p.narration).toBeNull();
  });
  it('with no voice to go on, the bare quote stays "someone present"', () => {
    const p = parseTableProse('"Who is it?"', table, { recentActors: [table[0]] });
    expect(p.quotes[0]).toMatchObject({ speakerId: null, speakerLabel: 'someone present' });
  });
  it('a quote with prose beside it keeps the older rules: the sentence names the speaker, not the last voice', () => {
    const p = parseTableProse('A bright eyed lass behind the bar gives you a wink. "Hey scruffy?"', table, { recentActors: [table[0]], lastVoiced: table[0] });
    expect(p.quotes[0]).toMatchObject({ speakerId: null, speakerLabel: 'a bright eyed lass behind the bar' });
    const q = parseTableProse('Violet opens the door a crack. "What."', table, { recentActors: [table[0]], lastVoiced: table[0] });
    expect(q.quotes[0].speakerId).toBe('violet');
  });
});

describe('the quote belongs to the subject of the sentence before it, not to a name in it (HW5 2026-10-25)', () => {
  const table = [
    { id: 'kris', name: 'Kristopher', sex: 'm' },
    { id: 'violet', name: 'Violet', sex: 'f' },
  ] as Parameters<typeof parseTableProse>[1];
  it('"He … looks back at Violet\'s closed door. "Please…"" is Kristopher speaking', () => {
    const p = parseTableProse('He stops at the door way to the landing and looks back at Violet\'s closed door. "Please... can you just slip money under the door at least?"', table, { recentActors: [table[0], table[1]] });
    expect(p.actions?.map((a) => a.actorId)).toEqual(['kris']);
    expect(p.quotes[0]).toMatchObject({ speakerId: 'kris', speakerLabel: 'Kristopher' });
    expect(p.narration).toBeNull();
  });
  it('"Kristopher looks at Violet. "Hi."" is Kristopher speaking', () => {
    const p = parseTableProse('Kristopher looks at Violet. "Hi."', table, { recentActors: [] });
    expect(p.quotes[0].speakerId).toBe('kris');
  });
  it('a possessive alone puts no words in her mouth; her door is still her card, so the quote stays open', () => {
    const p = parseTableProse('::Kristopher waits:: Violet\'s door stays shut. "Hello?"', table, { recentActors: [] });
    expect(p.quotes[0]).toMatchObject({ speakerId: null, speakerLabel: 'someone present' });
    expect(p.actions?.map((a) => [a.actorId, a.text])).toEqual([['kris', 'Kristopher waits'], ['violet', "Violet's door stays shut"]]);
  });
});
