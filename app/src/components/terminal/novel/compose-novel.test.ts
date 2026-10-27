import { describe, it, expect } from 'vitest';
import type { FeedRowModel, CharacterRowModel, NarrationRowModel } from '../table-feed/feed-rows';
import { composeNovel, genderFromSex, firstPerson, narratorise, nameToFirstPerson, conjugateForI, gendersOf, isNothingLine } from './compose-novel';

const base = { timestamp: '2026-10-26T01:00:00.000Z', raw: '', via: 'typed' as const, voice: 'Watcher' as const, voicedBy: null, fromNarration: true };
const card = (key: string, name: string, segments: Array<{ kind: 'action' | 'speech' | 'thought'; text: string }>, id: string | null = name.toLowerCase(), cycle?: number): CharacterRowModel =>
  ({ type: 'character', key, characterId: id, name, segments, cycle, ...base });
const scene = (key: string, text: string, cycle?: number): NarrationRowModel => ({ type: 'narration', key, timestamp: base.timestamp, text, raw: text, via: 'typed', voicedBy: null, cycle });

const text = (b: ReturnType<typeof composeNovel>[number]) => (b.kind === 'para' ? b.runs.map((r) => r.text).join('') : b.text);

describe('pronoun rules', () => {
  it('conjugates the verb that follows I', () => {
    expect(conjugateForI('knocks')).toBe('knock');
    expect(conjugateForI('approaches')).toBe('approach');
    expect(conjugateForI('tries')).toBe('try');
    expect(conjugateForI('is')).toBe('am');
    expect(conjugateForI('forces')).toBe('force');
    expect(conjugateForI('pass')).toBe('pass');
  });

  it('turns the viewer\'s own act into first person', () => {
    const v = { name: 'Kristopher', gender: 'he' as const };
    expect(firstPerson('Kristopher approaches the door and knocks.', v)).toBe('I approach the door and knock.');
    expect(firstPerson('He smiles, his hand tightening on the cross.', v)).toBe('I smile, my hand tightening on the cross.');
    expect(firstPerson('He steadies himself.', v)).toBe('I steady myself.');
  });

  it('a she/her viewer: her is my before a noun, me before a preposition', () => {
    const v = { name: 'Violet', gender: 'she' as const };
    expect(firstPerson('Her hand hovers near the deadbolt.', { ...v, gender: 'she' })).toBe('Her hand hovers near the deadbolt.'); // opens with the possessive: not a subject start, left alone
    expect(firstPerson('She lifts her hand and looks at her.', v)).toBe('I lift my hand and look at me.');
  });

  it('never turns another person\'s sentence into "I"', () => {
    expect(firstPerson('She laughs. Violet nods.', { name: 'Violet', gender: 'he' })).toBe('She laughs. I nod.');
  });

  it('names the viewer in narration', () => {
    expect(nameToFirstPerson('Two knocks reach Violet through the door.', { name: 'Violet' })).toBe('Two knocks reach me through the door.');
    expect(nameToFirstPerson("Violet's door stands at the end of the hall.", { name: 'Violet' })).toBe('My door stands at the end of the hall.');
  });

  it('the narrator reports a thought in third person, past tense', () => {
    expect(narratorise('I know this door. I have been here before.', { name: 'Kristopher', gender: 'he' })).toBe('He knew this door. He had been here before.');
    expect(narratorise("I'm not ready. My hand shakes.", { name: 'Kristopher', gender: 'he' })).toBe('He was not ready. His hand shakes.');
    expect(narratorise("I don't look up.", { name: 'Violet', gender: 'she' })).toBe("She didn't look up.");
    expect(narratorise('I still hear it.', { name: 'Violet', gender: null })).toBe('Violet still hear it.');
  });
});

describe('composeNovel', () => {
  const rows: FeedRowModel[] = [
    scene('s1', 'A little after seven, the bulb holds the tile in a circle of light.', 0.1),
    card('c1', 'Kristopher', [
      { kind: 'action', text: 'Kristopher approaches the door and knocks.' },
      { kind: 'thought', text: 'I know this door.' },
      { kind: 'speech', text: 'Violet? I have a pizza here for you.' },
    ], 'k'),
    card('c2', 'Violet', [{ kind: 'action', text: 'Her hand hovers.' }, { kind: 'thought', text: 'Two knocks.' }], 'v'),
  ];

  it('omniscient: scene, then each card as a paragraph; words get a tag, thoughts are italic runs', () => {
    const out = composeNovel(rows, null);
    expect(out.map(text)).toEqual([
      'A little after seven, the bulb holds the tile in a circle of light.',
      'Kristopher approaches the door and knocks. I know this door. "Violet? I have a pizza here for you," Kristopher says.',
      'Her hand hovers. Two knocks.',
    ]);
    const k = out[1];
    expect(k.kind === 'para' && k.runs.map((r) => !!r.inner)).toEqual([false, true, false]);
  });

  it('thoughtStyle narrator reports the thought in the narrator\'s voice (no italics)', () => {
    const k = composeNovel(rows, null, { thoughtStyle: 'narrator' })[1];
    expect(text(k)).toBe('Kristopher approaches the door and knocks. Kristopher knew this door. "Violet? I have a pizza here for you," Kristopher says.');
    expect(k.kind === 'para' && k.runs.some((r) => r.inner)).toBe(false);
  });

  it('first person: the viewer\'s own acts and words are "I"', () => {
    const withHe = [card('c1', 'Kristopher', [{ kind: 'action', text: 'Kristopher approaches the door and knocks.' }, { kind: 'action', text: 'He smiles.' }, { kind: 'speech', text: 'Violet?' }], 'k')];
    const out = composeNovel(withHe, { id: 'k', name: 'Kristopher' });
    expect(text(out[0])).toBe('I approach the door and knock. I smile. "Violet?" I say.');
  });

  it('first person: others stay third person and the viewer\'s name in the scene becomes me', () => {
    const out = composeNovel([scene('s', 'Two knocks reach Violet through the door.'), rows[2]], { id: 'x', name: 'Violet' });
    expect(text(out[0])).toBe('Two knocks reach me through the door.');
  });

  it('leaves out machinery and joins a beat in order', () => {
    const out = composeNovel([
      { type: 'check', key: 'ck', timestamp: base.timestamp, lines: ['rolled 14'] },
      { type: 'event', key: 'ev', timestamp: base.timestamp, tag: '[X]', lines: ['y'] },
      { type: 'beat', key: 'b', beatId: 'b', timestamp: base.timestamp, lastTimestamp: base.timestamp, groups: [[scene('a', 'One.')], [scene('b2', 'Two.')]] },
    ], null);
    expect(out.map(text)).toEqual(['One.', 'Two.']);
  });

  it('lays a thin break where the hour label changes, never before the first block', () => {
    const label = (c: number) => (c < 1 ? '19:00' : '20:00');
    const out = composeNovel([scene('a', 'One.', 0.1), scene('b', 'Two.', 0.2), scene('c', 'Three.', 1.2)], null, { breakLabel: label });
    expect(out.map((b) => b.kind)).toEqual(['para', 'para', 'break', 'para']);
    expect(text(out[2])).toBe('20:00');
  });

  it('reads gender off the record', () => {
    const g = gendersOf(rows);
    expect(g.get('Violet')).toBe('she');
    expect(g.get('Kristopher')).toBe(null);
  });

  it('narrator style takes he/she from the sheet when given, name only when the sheet has none', () => {
    const sexes = new Map([['k', genderFromSex('Male')]]);
    expect(text(composeNovel(rows, null, { thoughtStyle: 'narrator', sexes })[1])).toContain('He knew this door.');
    expect(text(composeNovel(rows, null, { thoughtStyle: 'narrator' })[1])).toContain('Kristopher knew this door.');
    expect(genderFromSex('f')).toBe('she');
    expect(genderFromSex('')).toBe(null);
  });
});

describe('composeNovel — roll cards per viewpoint', () => {
  const roll = (over: Record<string, unknown> = {}): FeedRowModel => ({
    type: 'roll', key: 'r1', timestamp: base.timestamp, rollId: 'r1', level: 'watcher', event: 'Kristopher tries to force the lock.', actorId: 'k', actorName: 'Kristopher',
    lines: [], result: 'FAIL', note: null, skill: null, effort: 2, success: false, ...over,
  }) as FeedRowModel;

  it('the Watcher: the event, then the outcome in the third person, with the Effort it cost', () => {
    expect(text(composeNovel([roll()], null)[0])).toBe('Kristopher tries to force the lock. Kristopher fails. It costs 2 Effort.');
    expect(text(composeNovel([roll({ success: true, skill: 'Lock-picking', effort: 0 })], null)[0])).toBe('Kristopher tries to force the lock. Kristopher succeeds at Lock-picking.');
  });
  it('the actor reads it in first person', () => {
    expect(text(composeNovel([roll()], { id: 'k', name: 'Kristopher' })[0])).toBe('I try to force the lock. I fail. It costs me 2 Effort.');
  });
  it('a witness who saw it reads the outcome of someone else, in the third person', () => {
    expect(text(composeNovel([roll({ level: 'full' })], { id: 'v', name: 'Violet' })[0])).toBe('Kristopher tries to force the lock. Kristopher fails. It costs 2 Effort.');
  });
  it('a hearer reads only the sentence — no outcome, no numbers', () => {
    expect(text(composeNovel([roll({ level: 'event', success: null, effort: 0 })], { id: 'v', name: 'Violet' })[0])).toBe('Kristopher tries to force the lock.');
  });
});

describe('composeNovel — thoughts are attributed', () => {
  const italic = (b: ReturnType<typeof composeNovel>[number]) => (b.kind === 'para' ? b.runs.filter((r) => r.inner).map((r) => r.text.trim()) : []);

  it('a card that opens with a thought is opened by its first act, then the italics', () => {
    const out = composeNovel([card('c', 'Violet', [{ kind: 'thought', text: 'The sound is smaller than I expected.' }, { kind: 'action', text: 'Violet stands by the door.' }])], null);
    expect(text(out[0])).toBe('Violet stands by the door. The sound is smaller than I expected.');
    expect(italic(out[0])).toEqual(['The sound is smaller than I expected.']);
  });

  it('with no act, the scene line before it may already name her; otherwise a neutral clause opens', () => {
    const named = composeNovel([scene('s', 'Two knocks reach Violet through the door.'), card('c', 'Violet', [{ kind: 'thought', text: 'Two knocks.' }])], null);
    expect(text(named[1])).toBe('Two knocks.');
    const bare = composeNovel([card('c', 'Violet', [{ kind: 'thought', text: 'Two knocks.' }])], null);
    expect(text(bare[0])).toBe('Violet thought it over. Two knocks.');
  });

  it('later thoughts in the same card need no new tag; a card that opens with an act needs none', () => {
    const out = composeNovel([card('c', 'Kristopher', [{ kind: 'action', text: 'He knocks.' }, { kind: 'thought', text: 'One.' }, { kind: 'thought', text: 'Two.' }])], null);
    expect(text(out[0])).toBe('He knocks. One. Two.');
  });

  it('first person: the viewer’s own thoughts need no attribution', () => {
    const out = composeNovel([card('c', 'Violet', [{ kind: 'thought', text: 'Two knocks.' }], 'v')], { id: 'v', name: 'Violet' });
    expect(text(out[0])).toBe('Two knocks.');
  });
});

describe('composeNovel — no "nothing happened" lines', () => {
  const tonight = [
    'Nothing on the landing has changed.',
    'Nothing on the Fourth-floor landing has changed.',
    'Nothing new has reached Violet from beyond the room.',
    'Nothing new has reached her from beyond the entry door.',
    'The knock has settled into silence; nothing further reaches Violet through the locked entry door.',
    'The knock has gone quiet; nothing from the landing reaches her now.',
  ];
  it('recognises the family, and not real events', () => {
    for (const l of tonight) expect(isNothingLine(l)).toBe(true);
    expect(isNothingLine('Two knocks reach Violet through the locked entry door.')).toBe(false);
    expect(isNothingLine('A faint vibration reaches Violet through the plaster.')).toBe(false);
  });

  const knock = card('k1', 'Kristopher', [{ kind: 'action', text: 'He knocks again at the door.' }], 'k');
  it('(a) becomes "<Name> did not hear him." when someone else’s sounding stretch did not reach her', () => {
    for (const l of tonight) {
      const out = composeNovel([knock, scene('s#scene', l), card('v1', 'Violet', [{ kind: 'action', text: 'Violet waits.' }], 'v')], null);
      expect(out.map(text)).toEqual(['He knocks again at the door.', 'Violet did not hear him.', 'Violet waits.']);
    }
  });
  it('uses him/her when the sheet gives the speaker’s sex, and "I" for the viewer', () => {
    const sexes = new Map([['k', 'he' as const]]);
    const rows = [knock, scene('s#scene', tonight[0]), card('v1', 'Violet', [{ kind: 'action', text: 'Violet waits.' }], 'v')];
    expect(composeNovel(rows, null, { sexes }).map(text)[1]).toBe('Violet did not hear him.');
    expect(composeNovel(rows, { id: 'v', name: 'Violet' }, { sexes }).map(text)[1]).toBe('I did not hear him.');
  });
  it('says it once per sounding stretch', () => {
    const rows = [knock, scene('s1#scene', tonight[0]), card('v1', 'Violet', [{ kind: 'action', text: 'Violet waits.' }], 'v'), scene('s2#scene', tonight[2]), card('v2', 'Violet', [{ kind: 'action', text: 'Violet waits.' }], 'v')];
    expect(composeNovel(rows, null).filter((b) => text(b).includes('did not hear')).length).toBe(1);
  });
  it('is dropped when the beat was not addressed to her (no knock at a door, no quote naming her)', () => {
    const talk = card('k2', 'Kristopher', [{ kind: 'action', text: 'He eats a slice.' }, { kind: 'speech', text: 'Mmm.' }], 'k');
    const out = composeNovel([talk, scene('s#scene', tonight[0]), card('v1', 'Violet', [{ kind: 'action', text: 'Violet waits.' }], 'v')], null);
    expect(out.map(text)).toEqual(['He eats a slice. "Mmm," Kristopher says.', 'Violet waits.']);
  });
  it('a quote that names her counts as addressed', () => {
    const calls = card('k3', 'Kristopher', [{ kind: 'speech', text: 'Violet? I have a pizza.' }], 'k');
    const out = composeNovel([calls, scene('s#scene', tonight[2]), card('v1', 'Violet', [{ kind: 'action', text: 'Violet waits.' }], 'v')], null);
    expect(out.map(text)[1]).toBe('Violet did not hear Kristopher.');
  });
  it('(b) is dropped when nothing sounded on that side', () => {
    const out = composeNovel([scene('s#scene', tonight[0]), card('v1', 'Violet', [{ kind: 'action', text: 'Violet waits.' }], 'v')], null);
    expect(out.map(text)).toEqual(['Violet waits.']);
  });
});

describe('composeNovel — narrator style prefers the stored narrated form', () => {
  const thought = (extra: Record<string, unknown> = {}) => card('c', 'Violet', [{ kind: 'action', text: 'Violet waits.' }, { kind: 'thought', text: 'I know this door.', ...extra } as never]);
  it('uses segment.narrated when present', () => {
    const out = composeNovel([thought({ narrated: 'She knew that door, and the weight of it.' })], null, { thoughtStyle: 'narrator' });
    expect(text(out[0])).toBe('Violet waits. She knew that door, and the weight of it.');
  });
  it('falls back to the transform when it is missing (old rows)', () => {
    expect(text(composeNovel([thought()], null, { thoughtStyle: 'narrator', sexes: new Map([['violet', 'she' as const]]) })[0])).toBe('Violet waits. She knew this door.');
  });
  it('inner style ignores it', () => {
    const out = composeNovel([thought({ narrated: 'She knew.' })], null);
    expect(text(out[0])).toBe('Violet waits. I know this door.');
  });
  it('fallback covers the copulas and modals, leaves unknown verbs alone', () => {
    const f = (t: string) => narratorise(t, { name: 'Violet', gender: 'she' });
    expect(f('I am tired.')).toBe('She was tired.');
    expect(f("I'm tired.")).toBe('She was tired.');
    expect(f('I have a key.')).toBe('She had a key.');
    expect(f("I can't see.")).toBe("She couldn't see.");
    expect(f("I don't know.")).toBe("She didn't know.");
    expect(f('I know.')).toBe('She knew.');
    expect(f('I want it.')).toBe('She wanted it.');
    expect(f('I zorble it.')).toBe('She zorble it.');
  });
});
