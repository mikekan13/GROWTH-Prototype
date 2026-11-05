import { describe, it, expect, vi } from 'vitest';
import { chat } from './model-client';
vi.mock('server-only', () => ({}));
vi.mock('./model-client', () => ({ chat: vi.fn() }));
vi.mock('@/ai/network/translator', async () => await vi.importActual('@/ai/network/translator'));
import { orderPrompt, parsePiece } from './orders';
import { chooserPrompt, parseChoice, resolveRecord, recordIsEmpty, recordGist, candidateLines, composeBeat, openingOf, actsFor, actPairsFor, asWriteBack, withDuePair, leavesForPlace, type Candidates } from './composer';
import { newTranslationMap, translateOut, translateBack } from '@/ai/network/translator';

describe('orders — narrow, nameless pieces (SIMULATION-COMPOSER-DESIGN-2026-11-03)', () => {
  it('a perception order carries only senses, surroundings and the event, and asks for JSON', () => {
    const p = orderPrompt({ kind: 'perception', brief: { senses: ['hearing'], surroundings: ['A small apartment, dark.'], event: "Violet's phone rings.", own: false } });
    expect(p.system).toMatch(/only judge perception/);
    expect(p.system).toMatch(/JSON only/);
    expect(p.user).toContain('Senses working: hearing');
    expect(p.user).toContain("What just happened: Violet's phone rings.");
  });
  it('names cross as placeholders and come back', () => {
    const { user } = orderPrompt({ kind: 'voice', brief: { gist: 'Kristopher is calling. I will not answer.', voice: 'Plain.', recent: [] } });
    const map = newTranslationMap();
    const out = translateOut(user, [{ name: 'Kristopher', kind: 'person' }], map).text;
    expect(out).not.toContain('Kristopher');
    expect(out).toContain('Person-A');
    expect(translateBack('{"thought":"Person-A again."}', map)).toContain('Kristopher again.');
  });
  it('parses a valid piece and refuses a malformed one', () => {
    expect(parsePiece('recall', 'sure: {"wakes":[{"i":0,"why":"the bill"}]}')).toEqual({ wakes: [{ i: 0, why: 'the bill' }] });
    expect(parsePiece('mood', '{"feel":"x"}')).toBeNull();
    expect(parsePiece('voice', 'no json here')).toBeNull();
  });
});

const C: Candidates = {
  near: ['her phone', 'the couch'],
  going: [{ text: "Violet's phone rings.", mine: false, holder: 'Violet' }],
  remember: [{ text: 'he came to the door with the pizza', age: 'About 2 days ago', why: 'the same pull, to not answer' }],
};

describe('the composer chooses; it does not write (GROUNDED-BEATS-PLAN-2026-11-03 §3)', () => {
  it('numbers the candidates by kind', () => {
    expect(candidateLines(C)).toEqual(['N1: her phone', 'N2: the couch', "G1: Violet's phone rings.", 'M1: About 2 days ago: he came to the door with the pizza — the same pull, to not answer']);
  });
  it('asks for codes, a picture, an impulse and why — and says it writes nothing', () => {
    const p = chooserPrompt({ name: 'Violet', identity: 'A writer.', desires: 'Quiet.', innerSoFar: '', sinceOwn: 'about a minute' }, 'My phone rings.', 'You are tense.', C);
    expect(p).toContain('WHAT JUST REACHED VIOLET: My phone rings.');
    expect(p).toContain('N1: her phone');
    expect(p).toMatch(/You write nothing/);
    expect(p).toMatch(/"impulse": "speak"\|"act"\|"stay"/);
  });
  it('standing traits appear as an IS, always line only when given', () => {
    const base = { name: 'Violet', identity: 'A writer.', desires: 'Quiet.', innerSoFar: '', sinceOwn: 'about a minute' };
    const line = 'NECTAR Ageless Face (body): looks fifteen years younger.';
    const withT = chooserPrompt({ ...base, traits: [line] }, 'My phone rings.', 'You are tense.', C);
    expect(withT).toContain(line);
    expect(withT).toContain('IS, always');
    expect(chooserPrompt(base, 'My phone rings.', 'You are tense.', C)).not.toContain('IS, always');
  });
  it('resolves codes against the list and drops the rest', () => {
    const ch = parseChoice('{"about":["G1","M1","Z9","n1"],"imagine":"He is in his car, waiting.","impulse":"stay","why":"not ready"}', C);
    expect(ch).toEqual({ about: ['G1', 'M1', 'N1'], imagine: 'He is in his car, waiting.', impulse: 'stay', why: 'not ready' });
    expect(parseChoice('{"about":[],"impulse":"shout"}', C)).toBeNull();
    expect(parseChoice('no json', C)).toBeNull();
  });
  it('the record names what the codes point at; remembered things carry their age', () => {
    const ch = parseChoice('{"about":["M1","N1"],"imagine":null,"impulse":"stay"}', C)!;
    const r = resolveRecord(ch, 'My phone rings.', 'You are tense.', C);
    expect(r.about).toEqual(['he came to the door with the pizza', 'her phone']);
    expect(r.remember[0].age).toBe('About 2 days ago');
    expect(r.going).toEqual(C.going);
    expect(recordIsEmpty(r)).toBe(false);
    expect(recordGist(r)).toContain('reached: My phone rings.');
  });
  it('nothing reached, nothing going, nothing chosen: no beat', () => {
    const quiet: Candidates = { near: ['her phone'], going: [], remember: [] };
    const ch = parseChoice('{"about":[],"imagine":null,"impulse":"stay","why":"nothing to do"}', quiet)!;
    const r = resolveRecord(ch, null, 'You are steady.', quiet);
    expect(recordIsEmpty(r)).toBe(true);
    // A picture alone is a beat (ruling 2, 2026-11-03).
    const ch2 = parseChoice('{"about":[],"imagine":"He might call again.","impulse":"stay"}', quiet)!;
    expect(recordIsEmpty(resolveRecord(ch2, null, 'You are steady.', quiet))).toBe(false);
  });
  it('the voice order renders the record and forbids what is outside it', () => {
    const ch = parseChoice('{"about":["G1"],"imagine":"He is waiting in his car.","impulse":"stay"}', C)!;
    const r = resolveRecord(ch, 'My phone rings.', 'You are tense.', C);
    const { system, user } = orderPrompt({ kind: 'voice', brief: { record: r, voice: 'Plain.', recent: [] } });
    expect(user).toContain("STILL GOING: Violet's phone rings.");
    expect(user).toContain('HERE WITH IT (the only things it may place here): her phone; the couch');
    expect(user).toContain('IT PICTURES (has not happened): He is waiting in his car.');
    expect(system).toMatch(/never say it ended/);
    expect(system).toMatch(/does nothing and says nothing aloud/);
  });
});

import { naturalName } from './composer';
describe('things as the being says them (run 3, 2026-11-03)', () => {
  it('its own things are "my …", labels lose their capital, proper names inside stand', () => {
    expect(naturalName('Personal phone', true)).toBe('my personal phone');
    expect(naturalName('Her phone', true)).toBe('my phone');
    expect(naturalName('Five-dollar bill with her number', true)).toBe('my five-dollar bill with her number');
    expect(naturalName('Chess Pizza polo', true)).toBe('my Chess Pizza polo');
    expect(naturalName('The cash in her wallet', false)).toBe('the cash in her wallet');
  });
});

describe('a voice, not a formula (session 2 live, 2026-11-03)', () => {
  it('reads the opening of a thought', () => {
    expect(openingOf('I think I notice the room is doing something.')).toBe('i think i');
    expect(openingOf('  Eight months of nothing.')).toBe('eight months of');
  });
});

describe('Day 6 (2026-11-04): acts on the list, the act in the choice', () => {
  it('a ringing thing in its hands offers answer / decline / silence; a connected line offers speak / hang up; always leaving be', () => {
    const ringing = actsFor([{ text: 'Your phone rings.', mine: false, holder: 'Violet', state: 'ringing', thing: 'Her phone' }], ['Her phone']);
    expect(ringing).toEqual(['answer it', 'decline it and let it go', 'silence it and leave it', 'put down what you are holding and go on with what you were doing']);
    expect(actPairsFor([{ text: 'Your phone rings.', mine: false, holder: 'Violet', state: 'ringing', thing: 'Her phone' }], ['Her phone'])[0]).toEqual({ label: 'answer it', deed: 'answers the phone' });
    const line = actsFor([{ text: 'On the line.', mine: false, holder: 'Violet', state: 'connected', other: 'Kristopher' }], ['Her phone']);
    expect(line[0]).toBe('hang up');
    expect(actsFor([], [])).toEqual(['go on with what you were doing']);
  });
  it('the chooser may pick an A code; an "act" with no A code is a stay; the record carries the act', () => {
    const g = [{ text: 'Your phone rings.', mine: false, holder: 'Violet', state: 'ringing' as const, thing: 'Her phone' }];
    const pairs = actPairsFor(g, ['Her phone']);
    const c: Candidates = { near: ['my phone'], going: g, remember: [], acts: pairs.map((p) => p.label), deeds: pairs.map((p) => p.deed) };
    expect(candidateLines(c)).toContain('A1: answer it');
    const choice = parseChoice('{"about":["G1"],"imagine":null,"impulse":"act","act":"A1","why":"enough"}', c);
    expect(choice).toMatchObject({ impulse: 'act', act: 'A1' });
    expect(resolveRecord(choice!, 'Your phone rings.', 'tight', c).act).toBe('answers the phone');
    expect(parseChoice('{"about":["G1"],"imagine":null,"impulse":"act"}', c)).toMatchObject({ impulse: 'stay' });
    expect(parseChoice('{"about":["G1"],"imagine":null,"impulse":"act","act":"A9"}', c)).toMatchObject({ impulse: 'stay' });
  });
});

describe('Day 8 (2026-11-05): a read message offers its own acts', () => {
  it('the holder of a read message may write back or leave it; the sender may write again', () => {
    const pairs = actPairsFor([{ text: 'x', mine: false, holder: 'Violet', state: 'read', other: 'Kristopher', thing: 'Her phone' }], []);
    expect(pairs[0]).toEqual({ label: 'write back to Kristopher', deed: 'writes back to Kristopher on the phone' });
    expect(pairs[1]).toEqual({ label: 'leave the message unanswered for now', deed: 'puts the phone down without answering' });
    const mine = actPairsFor([{ text: 'x', mine: true, holder: 'Kristopher', state: 'read', other: 'Violet', thing: 'His phone' }], []);
    expect(mine[0].label).toBe('write Violet again');
  });
});

describe('Day 8 (2026-11-05): an own line is never a quiet beat', () => {
  const args = (over: Record<string, unknown>) => ({
    campaignId: 'c', entityId: 'e-own-test', name: 'Violet', identity: 'A woman.', voice: 'plain', desires: '', feltBefore: 'calm',
    envelope: 'A room.', event: 'Violet looks at the message a moment longer.', senses: ['sight'], own: false,
    memories: [], innerSoFar: '', recent: [], held: [], facts: [], perceived: 'Nothing new reaches you.', ...over,
  });
  const choose = () => vi.mocked(chat).mockResolvedValue({ text: '{"about":[],"imagine":null,"impulse":"stay"}' } as never);
  it('own + nothing-new perception: the record carries the event as what reached her', async () => {
    choose();
    const beat = await composeBeat(args({ own: true }) as never);
    expect(beat).not.toBeNull();
    expect(beat!.record.perceived).toBe('Violet looks at the message a moment longer.');
    expect(recordIsEmpty(beat!.record)).toBe(false);
  });
  it('not own, not prompted, nothing new: the beat stays quiet (perceived null)', async () => {
    choose();
    const beat = await composeBeat(args({ own: false }) as never);
    expect(beat!.record.perceived).toBeNull();
    expect(beat!.empty).toBe(true);
  });
});

describe('Finding 70 (2026-11-05): a free act on a read message is the write-back', () => {
  const read = [{ text: 'x', mine: false, holder: 'Violet', state: 'read' as const, other: 'Kristopher', thing: 'Her work phone' }];
  it('normalises Violet\'s typed-and-sent act and carries the quoted words', () => {
    const wb = asWriteBack('Type "Extra Space. In ten." and hit send before she can second-guess the number.', read);
    expect(wb).toEqual({ to: 'Kristopher', thing: 'work phone', deed: 'writes back to Kristopher on the work phone', words: 'Extra Space. In ten.' });
  });
  it('takes the words from the thought when the act has none but the thought types them', () => {
    expect(asWriteBack('uses Texting with the phone', read, 'She types "See you there." and sends it.')?.words).toBe('See you there.');
  });
  it('an offered write-back deed passes through, composing only when no words were quoted', () => {
    const wb = asWriteBack('writes back to Kristopher on the work phone', read);
    expect(wb).toMatchObject({ to: 'Kristopher', thing: 'work phone', deed: 'writes back to Kristopher on the work phone' });
    expect(wb?.words).toBeUndefined();
  });
  it('leaves deliberate non-write-backs and non-messages alone', () => {
    expect(asWriteBack('puts the phone down without answering', read)).toBeNull();
    expect(asWriteBack('reads the message on the phone', read)).toBeNull();
    expect(asWriteBack('Type "hi"', [{ text: 'x', mine: false, holder: 'Violet', state: 'ringing', thing: 'Her phone' }])).toBeNull();
    expect(asWriteBack('Type "hi"', [{ text: 'x', mine: true, holder: 'Kristopher', state: 'read', other: 'Violet' }])).toBeNull();
    expect(asWriteBack('uses Camera with the phone', read, 'He once said "no".')).toBeNull();
  });
});

describe('a due plan is on the list (finding 63, 2026-11-05)', () => {
  const leave = { label: 'leave for the coffee shop on Broadway', deed: 'leaves for the coffee shop on Broadway' };
  it('puts the leave pair first, once, and leaves the rest alone', () => {
    const base = actPairsFor([], []);
    const out = withDuePair([...base, leave], leave);
    expect(out[0]).toEqual(leave);
    expect(out.filter((p) => p.label === leave.label)).toHaveLength(1);
    expect(out).toHaveLength(base.length + 1);
    expect(withDuePair(base, null)).toEqual(base);
  });
  it('reads the place out of a chosen "leaves for X" deed', () => {
    expect(leavesForPlace('leaves for the coffee shop on Broadway')).toBe('the coffee shop on Broadway');
    expect(leavesForPlace('Leaves for Extra Space ')).toBe('Extra Space');
    expect(leavesForPlace('writes back to Kristopher on the phone')).toBeNull();
    expect(leavesForPlace(null)).toBeNull();
  });
  it('a leave deed is never mistaken for a write-back', () => {
    const read = [{ text: 'x', mine: false, holder: 'Violet', state: 'read' as const, other: 'Kristopher', thing: 'Her phone' }];
    expect(asWriteBack('leaves for the coffee shop', read, 'She types "on my way" and sends it.')).toBeNull();
  });
});
