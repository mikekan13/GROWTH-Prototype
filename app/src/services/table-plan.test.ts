import { describe, it, expect } from 'vitest';
import { readTableTalk } from './table-talk';
import { planTableTalk, stimulusFor, answerers, overhearers, canonNarration, type TableBeat } from './table-plan';

const listeners = [{ id: 'mara', name: 'Mara' }, { id: 'oren', name: 'Oren' }];
const npcs = [{ id: 'oren', name: 'Oren' }, { id: 'tess', name: 'Tess' }];
const read = (text: string) => readTableTalk(text, { present: listeners, npcs }).utterances;
const plan = (text: string, mode: 'typed' | 'spoken' = 'typed') => planTableTalk(read(text), mode);
const shape = (beats: TableBeat[]) => beats.map((b) => (b.type === 'hear' ? ['hear', b.utterances.map((u) => u.text).join(' | ')] : [b.type, b.utterance.text]));

describe('planTableTalk — what a stretch of table talk does', () => {
  it('narration is heard; the GM handing over the turn asks', () => {
    const p = plan('The door bangs open. Rain comes in with it. What do you do?');
    expect(shape(p.beats)).toEqual([['hear', 'The door bangs open. Rain comes in with it.'], ['turn', 'What do you do?']]);
    expect(p.ignored).toEqual([]);
    expect(p.world.map((u) => u.kind)).toEqual(['narration']);
  });
  it('narration and speech thrown at nobody are one run, heard together', () => {
    const p = plan('Tess sets down the tray. "Eat." The fire pops.');
    expect(shape(p.beats)).toEqual([['hear', 'Tess sets down the tray. | Eat. | The fire pops.']]);
  });
  it('speech that expects a reply closes the run and stands as its own beat', () => {
    const q = plan('The door bangs open.\nTess: Mara, you the pilot?\nThe room goes quiet.');
    expect(shape(q.beats)).toEqual([['hear', 'The door bangs open.'], ['spoken', 'Mara, you the pilot?'], ['hear', 'The room goes quiet.']]);
    expect(q.world.map((u) => u.kind)).toEqual(['narration', 'dialogue', 'narration']);
  });
  it('a message that is only an ask has nothing to hear', () => {
    const p = plan('Mara, what do you do?');
    expect(shape(p.beats)).toEqual([['turn', 'Mara, what do you do?']]);
    expect(p.world).toEqual([]);
  });
  it('check calls and out-of-character talk are ignored, and do not break the run around them', () => {
    const p = plan('The lock is old. Roll perception. (brb, phone) It will not budge.');
    expect(shape(p.beats)).toEqual([['hear', 'The lock is old. | It will not budge.']]);
    expect(p.ignored.map((u) => [u.kind, u.text])).toEqual([['check-call', 'Roll perception.'], ['ooc', '(brb, phone)']]);
  });
  it('a result is narration and is heard', () => {
    const p = plan('You succeed. The latch gives.');
    expect(p.beats).toHaveLength(1);
    expect(p.world.map((u) => u.kind)).toEqual(['result', 'narration']);
  });
});

describe('planTableTalk — spoken talk is only dropped on the sure rules', () => {
  it('typed: a guessed bit of table chatter is ignored', () => {
    const p = plan('Hang on, let me check my notes. The door opens.', 'typed');
    expect(p.ignored.map((u) => u.rule)).toEqual(['ooc:table-management']);
    expect(shape(p.beats)).toEqual([['hear', 'The door opens.']]);
  });
  it('spoken: the same words are kept as narration — a false drop would delete them from the world', () => {
    const p = plan('Hang on, let me check my notes. The door opens.', 'spoken');
    expect(p.ignored).toEqual([]);
    expect(shape(p.beats)).toEqual([['hear', 'Hang on, let me check my notes. | The door opens.']]);
    expect(p.world[0]).toMatchObject({ kind: 'narration', rule: 'ooc:table-management→kept-as-narration' });
  });
  it('spoken: an explicit "out of character" still drops, and so does a check call', () => {
    const p = plan('Out of character, I need five minutes. Roll perception. The door opens.', 'spoken');
    expect(p.ignored.map((u) => u.kind)).toEqual(['ooc', 'check-call']);
    expect(shape(p.beats)).toEqual([['hear', 'The door opens.']]);
  });
});

describe('stimulusFor — what one listener is handed for a run', () => {
  const run = (text: string) => { const b = plan(text).beats[0]; if (b.type !== 'hear') throw new Error('not a run'); return b.utterances; };
  it('narration with speech in it is a perception, speech as Speaker: words', () => {
    expect(stimulusFor(run('Tess sets down the tray. "Eat." The fire pops.'), 'mara')).toEqual({
      source: 'perception',
      content: 'Tess sets down the tray.\nTess: Eat.\nThe fire pops.',
    });
  });
  it('speech alone is dialogue', () => {
    expect(stimulusFor(run('Tess: "Eat."'), 'mara')).toEqual({ source: 'dialogue', content: 'Tess: Eat.' });
  });
  it('a being is never handed its own line as something heard', () => {
    const lines = run('Oren: "Eat."\nTess: "No."');
    expect(stimulusFor(lines, 'oren')).toEqual({ source: 'dialogue', content: 'Tess: No.' });
    expect(stimulusFor(lines, 'mara')).toEqual({ source: 'dialogue', content: 'Oren: Eat.\nTess: No.' });
    expect(stimulusFor(run('Oren: "Eat."'), 'oren')).toBeNull();
  });
  it('speech with no known speaker is still heard', () => {
    expect(stimulusFor(run('"Eat."'), 'mara')).toEqual({ source: 'dialogue', content: 'someone present: Eat.' });
  });
});

describe('answerers / overhearers', () => {
  const beat = (text: string) => plan(text).beats.find((b) => b.type !== 'hear') as Extract<TableBeat, { type: 'turn' | 'spoken' }>;
  it('a turn to the party is everyone listening; a turn to a name is that one', () => {
    expect(answerers(beat('What do you do?'), listeners)).toEqual(['mara', 'oren']);
    expect(answerers(beat('Mara, what do you do?'), listeners)).toEqual(['mara']);
  });
  it('a turn to someone who is not listening is answered by nobody', () => {
    expect(answerers(beat('Tess, what do you do?'), listeners)).toEqual([]);
  });
  it('direct address: the one spoken to answers, the rest overhear, the speaker neither', () => {
    const b = beat('Oren: Mara, you the pilot?') as Extract<TableBeat, { type: 'spoken' }>;
    expect(answerers(b, listeners)).toEqual(['mara']);
    expect(overhearers(b, listeners)).toEqual([]);
    const c = beat('Tess: Mara, you the pilot?') as Extract<TableBeat, { type: 'spoken' }>;
    expect(answerers(c, listeners)).toEqual(['mara']);
    expect(overhearers(c, listeners)).toEqual(['oren']);
  });
  it('a question thrown to the room: everyone but the speaker answers', () => {
    const b = beat('Oren: Anyone seen the ferryman?') as Extract<TableBeat, { type: 'spoken' }>;
    expect(answerers(b, listeners)).toEqual(['mara']);
    expect(overhearers(b, listeners)).toEqual([]);
  });
});

describe('canonNarration — what goes on the record', () => {
  it('with nothing ignored it is the text exactly as given, asks included', () => {
    const full = 'Tess sets down the tray. "Eat."  What do you do?';
    expect(canonNarration(full, plan(full))).toBe(full);
  });
  it('ignored talk is left out, and then the asks are too', () => {
    const full = 'The lock is old. Roll perception. (brb, phone)\nTess: "Leave it."\nWhat do you do?';
    expect(canonNarration(full, plan(full))).toBe('The lock is old. Tess: "Leave it."');
  });
  it('a message with nothing in the world has no narration', () => {
    expect(canonNarration('What do you do?', plan('What do you do?'))).toBeNull();
    expect(canonNarration('(brb)', plan('(brb)'))).toBeNull();
    expect(canonNarration('Roll perception.', plan('Roll perception.'))).toBeNull();
  });
});
