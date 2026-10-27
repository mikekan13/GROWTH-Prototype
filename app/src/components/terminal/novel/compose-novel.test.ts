import { describe, it, expect } from 'vitest';
import type { FeedRowModel, CharacterRowModel, NarrationRowModel } from '../table-feed/feed-rows';
import { composeNovel, genderFromSex, firstPerson, narratorise, nameToFirstPerson, conjugateForI, gendersOf } from './compose-novel';

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
    expect(narratorise("I don't look up.", { name: 'Violet', gender: 'she' })).toBe('She did not look up.');
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
