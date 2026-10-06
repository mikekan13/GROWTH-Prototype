import { describe, it, expect } from 'vitest';
import { readTableTalk, settleAmbiguous, addressees, splitSentences, type TableTalkContext, type TableUtterance } from './table-talk';

const present = [{ id: 'violet', name: 'Violet' }];
const npcs = [
  { id: 'ruth', name: 'Ruth' },
  { id: 'carr', name: 'Mr. Carrasco' },
  { id: 'danny', name: 'Danny' },
];
const ctx: TableTalkContext = { present, npcs };
const read = (text: string, extra: Partial<TableTalkContext> = {}) => readTableTalk(text, { ...ctx, ...extra });
const only = (text: string, extra: Partial<TableTalkContext> = {}): TableUtterance => {
  const { utterances } = read(text, extra);
  expect(utterances).toHaveLength(1);
  return utterances[0];
};

describe('readTableTalk — Mike\'s example', () => {
  const text = 'You sit at the bar. The scent of flame licked meat and spicy mead linger over the lively inn atmosphere. A bright eyed lass behind the bar gives you a wink. "Hey scruffy, you gonna order something?"';
  it('narration, then the barmaid\'s question as dialogue that expects a reply', () => {
    const { utterances } = read(text);
    expect(utterances.map((u) => u.kind)).toEqual(['narration', 'dialogue']);
    expect(utterances[0].text).toBe('You sit at the bar. The scent of flame licked meat and spicy mead linger over the lively inn atmosphere. A bright eyed lass behind the bar gives you a wink.');
    expect(utterances[0]).toMatchObject({ to: null, expectsReply: false, ambiguous: false });
    expect(utterances[1]).toMatchObject({
      text: 'Hey scruffy, you gonna order something?',
      speaker: { id: null, label: 'a bright eyed lass behind the bar' },
      to: { scope: 'unspecified' },
      expectsReply: true,
    });
    expect(addressees(utterances[1], present)).toEqual(['violet']);
  });
});

describe('readTableTalk — the ask', () => {
  it('"what do you do?" after narration hands the turn to the party', () => {
    const { utterances } = read('The hallway is dark and smells of rain. What do you do?');
    expect(utterances.map((u) => u.kind)).toEqual(['narration', 'ask-to-party']);
    expect(utterances[1]).toMatchObject({ text: 'What do you do?', to: { scope: 'party' }, expectsReply: true, ambiguous: false });
    expect(addressees(utterances[1], present)).toEqual(['violet']);
  });
  it.each([
    'Violet, what do you do?',
    'What do you do, Violet?',
    'So, Violet, what\'s your move?',
    'Violet?',
    'And Violet?',
    'What about Violet?',
    'What about you, Violet?',
    'violet what do you do',
    'Violet, you\'re up.',
    'Okay Violet, your turn.',
    'Violet, do you open it?',
  ])('a name in the vocative makes it an ask to that name: %s', (text) => {
    const u = only(text);
    expect(u.kind).toBe('ask-to-name');
    expect(u.to).toEqual({ scope: 'named', ids: ['violet'] });
    expect(u.expectsReply).toBe(true);
  });
  it.each([
    'What do you all do?',
    'What would you like to do?',
    'How do you respond?',
    'Where do you go?',
    'It\'s your move.',
    'What now?',
    'Do you go in?',
    'Does anyone want to go first?',
  ])('handoff phrases and second-person questions are asks to the party: %s', (text) => {
    expect(only(text)).toMatchObject({ kind: 'ask-to-party', to: { scope: 'party' }, expectsReply: true });
  });
  it.each(['What does Violet do?', 'Violet wakes up on the couch, what does she do?', 'Tell me what Violet does.'])('the turn handed over in the third person: %s', (text) => {
    expect(only(text)).toMatchObject({ kind: 'ask-to-name', to: { scope: 'named', ids: ['violet'] }, expectsReply: true });
  });
  it.each(['It is your turn to do the dishes, apparently.', 'What you do next is up to you.', 'You have no idea what to do.', 'She fails to hide her surprise.', 'You manage a smile.'])('narration that only sounds like a turn or an outcome: %s', (text) => {
    expect(only(text)).toMatchObject({ kind: 'narration', ambiguous: false });
  });
  it('a name that is only mentioned is not an address', () => {
    const { utterances } = read('Violet opens the door. Inside, a vault. What do you do?');
    expect(utterances.map((u) => u.kind)).toEqual(['narration', 'ask-to-party']);
  });
  it('a list of names as the subject is not an address', () => {
    const { utterances, state } = read('Ruth, Danny, and Mr. Carrasco walk in. You see Ruth, Danny.');
    expect(utterances.map((u) => u.kind)).toEqual(['narration']);
    expect(state.focusIds).toEqual([]);
  });
  it('an address followed by another name still counts', () => {
    const { state } = read('Violet, Ruth is staring at you.');
    expect(state.focusIds).toEqual(['violet']);
  });
  it('a bare name with no question mark is an ask, flagged ambiguous', () => {
    expect(only('Violet.')).toMatchObject({ kind: 'ask-to-name', ambiguous: true });
    expect(only('Violet?')).toMatchObject({ kind: 'ask-to-name', ambiguous: false });
  });
});

describe('readTableTalk — the address carries to the ask', () => {
  it('inside one message', () => {
    const { utterances } = read('Violet, the door is locked. It will not budge. What do you do?');
    expect(utterances.map((u) => u.kind)).toEqual(['narration', 'ask-to-name']);
    expect(utterances[1].to).toEqual({ scope: 'named', ids: ['violet'] });
    expect(utterances[1].rule).toBe('ask:handoff+carried');
  });
  it('across chunks through the state', () => {
    const first = read('Violet, the door is locked.');
    expect(first.state.focusIds).toEqual(['violet']);
    const second = read('What do you do?', { state: first.state });
    expect(second.utterances[0]).toMatchObject({ kind: 'ask-to-name', to: { scope: 'named', ids: ['violet'] } });
  });
  it('a turn to everyone drops it', () => {
    const { utterances, state } = read('Violet, you hear it first. Everyone, what do you do?');
    expect(utterances[1]).toMatchObject({ kind: 'ask-to-party', to: { scope: 'party' } });
    expect(state.focusIds).toEqual([]);
  });
});

describe('readTableTalk — dialogue', () => {
  it('direct address in a script line is dialogue to that name and expects a reply', () => {
    const u = only('Ruth: Violet, what did you see?');
    expect(u).toMatchObject({
      kind: 'dialogue',
      speaker: { id: 'ruth', label: 'Ruth' },
      to: { scope: 'named', ids: ['violet'] },
      expectsReply: true,
      rule: 'dialogue:direct-address',
    });
    expect(addressees(u, present)).toEqual(['violet']);
  });
  it('a direct-address statement expects a reply too', () => {
    expect(only('Ruth: "Sit down, Violet."')).toMatchObject({ to: { scope: 'named', ids: ['violet'] }, expectsReply: true });
  });
  it('speech aimed at someone who is not a being at the table asks nobody present', () => {
    const { utterances } = read('Mr. Carrasco pounds on the door from the landing. "Open this door, Danny. You owe me rent."');
    expect(utterances.map((u) => u.kind)).toEqual(['narration', 'dialogue']);
    expect(utterances[0].text).toBe('Mr. Carrasco pounds on the door from the landing.');
    expect(utterances[1]).toMatchObject({ speaker: { id: 'carr', label: 'Mr. Carrasco' }, to: { scope: 'named', ids: ['danny'] } });
    expect(addressees(utterances[1], present)).toEqual([]);
  });
  it('a line thrown at nobody does not expect a reply', () => {
    const { utterances } = read('Ruth sets down the tray. "Eat."');
    expect(utterances[1]).toMatchObject({ kind: 'dialogue', to: { scope: 'unspecified' }, expectsReply: false });
    expect(addressees(utterances[1], present)).toEqual([]);
  });
  it('the sentence that introduced the quote can carry the address', () => {
    const { utterances } = read('Ruth turns to Violet. "What did you see?"');
    expect(utterances[1]).toMatchObject({ speaker: { id: 'ruth' }, to: { scope: 'named', ids: ['violet'] }, rule: 'dialogue:context-address' });
  });
  it('a being never answers its own line', () => {
    const u = only('Violet: Who is there?');
    expect(u).toMatchObject({ kind: 'dialogue', speaker: { id: 'violet' }, expectsReply: true });
    expect(addressees(u, present)).toEqual([]);
  });
  it('speech with no quote marks (a transcript) is still the named speaker talking', () => {
    expect(only('Ruth says, sit down.')).toMatchObject({ kind: 'dialogue', text: 'sit down.', speaker: { id: 'ruth', label: 'Ruth' }, expectsReply: false, rule: 'dialogue+unquoted' });
    expect(only('Ruth asks, what did you see?')).toMatchObject({ kind: 'dialogue', speaker: { id: 'ruth' }, expectsReply: true });
    expect(only('Ruth says, Violet, sit down.')).toMatchObject({ kind: 'dialogue', to: { scope: 'named', ids: ['violet'] }, expectsReply: true });
    expect(only('Danny says he never touched it.').kind).toBe('narration');
  });
  it('unquoted speech keeps its place between narration and the ask', () => {
    const { utterances } = read('The kettle screams. Ruth says, sit down. What do you do?');
    expect(utterances.map((u) => [u.kind, u.speaker?.id ?? null, u.text])).toEqual([
      ['narration', null, 'The kettle screams.'],
      ['dialogue', 'ruth', 'sit down.'],
      ['ask-to-party', null, 'What do you do?'],
    ]);
  });
  it('a script line is one speaker from start to finish, whatever its sentences look like', () => {
    const u = only('Ruth: Sit. Danny says, no.');
    expect(u).toMatchObject({ kind: 'dialogue', speaker: { id: 'ruth' }, text: 'Sit. Danny says, no.' });
  });
  it('keeps speech and narration in the order they were said', () => {
    const { utterances } = read('Ruth sets down the tray. “Eat.” Danny pushes it away. “Not hungry.” What do you do?');
    expect(utterances.map((u) => [u.kind, u.speaker?.id ?? null])).toEqual([
      ['narration', null], ['dialogue', 'ruth'], ['narration', null], ['dialogue', 'danny'], ['ask-to-party', null],
    ]);
  });
  it('a question inside a quote is not the GM\'s ask', () => {
    const { utterances } = read('"What do you do for a living?" the clerk asks Danny.');
    expect(utterances[0].kind).toBe('dialogue');
    expect(utterances.some((u) => u.kind === 'ask-to-party' || u.kind === 'ask-to-name')).toBe(false);
  });
});

describe('readTableTalk — check calls', () => {
  it.each([
    ['Roll perception.', { scope: 'unspecified' }],
    ['Violet, give me a Clout check.', { scope: 'named', ids: ['violet'] }],
    ['Violet, roll for it.', { scope: 'named', ids: ['violet'] }],
    ['I need a perception check from Violet.', { scope: 'named', ids: ['violet'] }],
    ['Everyone roll for it.', { scope: 'party' }],
    ['Make a death save.', { scope: 'unspecified' }],
    ['Perception check.', { scope: 'unspecified' }],
    ['Can you roll that for me?', { scope: 'unspecified' }],
    ['That\'s going to be a Celerity check.', { scope: 'unspecified' }],
  ])('%s', (text, to) => {
    expect(only(text)).toMatchObject({ kind: 'check-call', to, expectsReply: false });
  });
  it('a check with no name goes to whoever the GM was addressing', () => {
    const { utterances } = read('Violet, you try the lock. Roll for it.');
    expect(utterances[1]).toMatchObject({ kind: 'check-call', to: { scope: 'named', ids: ['violet'] } });
  });
  it.each([
    'You check the door.',
    'You check.',
    'The barrel rolls down the hill.',
    'You roll out of bed.',
    'You make a quick check of the room.',
    'You need a roll of tape.',
    'Danny rolls his eyes.',
  ])('the words in ordinary narration are not a check call: %s', (text) => {
    expect(only(text).kind).toBe('narration');
  });
  it('a bare "roll" the patterns cannot place stays narration, flagged', () => {
    expect(only('You roll.')).toMatchObject({ kind: 'narration', ambiguous: true, rule: 'narration:check-word?' });
  });
});

describe('readTableTalk — results', () => {
  it.each(['You succeed.', 'That\'s a success.', 'With a 14, the lock gives.', 'Violet fails, but only just.'])('outcome words: %s', (text) => {
    expect(only(text)).toMatchObject({ kind: 'result', to: null, expectsReply: false });
  });
  it('a check call leaves a result pending; the next chunk\'s narration is the result', () => {
    const call = read('Violet, roll perception.');
    expect(call.state.checkPending).toBe(true);
    const next = read('The latch is older than the door. What do you do?', { state: call.state });
    expect(next.utterances.map((u) => u.kind)).toEqual(['result', 'ask-to-name']);
    expect(next.utterances[0].rule).toBe('result:after-check');
    expect(next.state.checkPending).toBe(false);
  });
  it('narration in the same breath as the call is still narration', () => {
    const { utterances, state } = read('Roll perception. The lock is old and stiff.');
    expect(utterances.map((u) => u.kind)).toEqual(['check-call', 'narration']);
    expect(state.checkPending).toBe(true);
  });
  it('table chatter does not use up the pending result', () => {
    const state = { focusIds: [], checkPending: true };
    expect(read('(one sec)', { state }).state.checkPending).toBe(true);
  });
  it('an ask before any result closes the pending check', () => {
    const state = { focusIds: [], checkPending: true };
    const next = read('What do you do? The rain keeps falling.', { state });
    expect(next.utterances.map((u) => u.kind)).toEqual(['ask-to-party', 'narration']);
    expect(next.state.checkPending).toBe(false);
  });
});

describe('readTableTalk — out of character', () => {
  it.each(['(brb, phone)', '((who has the snacks))', 'ooc: back in five', 'Hang on, let me check my notes.', 'Give me a second.', 'Where was I?', 'Can everyone hear me?'])('%s', (text) => {
    expect(only(text)).toMatchObject({ kind: 'ooc', to: null, expectsReply: false });
  });
  it.each([
    'Hold on to the rope.',
    'You hang on tight as the cart lurches.',
    'The door (the one from yesterday) is open.',
    'You hold on as the cart lurches, then it stops.',
    'The guard says to give me a second look.',
    'They take a break from the climb.',
  ])('in-fiction look-alikes stay narration: %s', (text) => {
    expect(only(text).kind).toBe('narration');
  });
  it.each(['Sorry, hold on, my dog is barking.', 'Okay where were we.', 'Let\'s take five.', 'Guys, brb.'])('table chatter that opens the sentence: %s', (text) => {
    expect(only(text).kind).toBe('ooc');
  });
  it('an aside that opens a sentence does not take the narration after it down with it', () => {
    const { utterances } = read('(brb, phone) It will not budge. [ooc one sec] The rain keeps on.');
    expect(utterances.map((u) => [u.kind, u.text])).toEqual([
      ['ooc', '(brb, phone)'],
      ['narration', 'It will not budge.'],
      ['ooc', '[ooc one sec]'],
      ['narration', 'The rain keeps on.'],
    ]);
  });
});

describe('readTableTalk — ambiguous', () => {
  it('a question aimed at nobody is narration, flagged', () => {
    expect(only('Who could have done this?')).toMatchObject({ kind: 'narration', ambiguous: true, expectsReply: false, rule: 'narration:question?' });
  });
  it('the character\'s own wondering is not an ask', () => {
    expect(only('You wonder, who would do this to you?')).toMatchObject({ kind: 'narration', ambiguous: true, rule: 'narration:inner-question?' });
  });
  it('flagged and unflagged narration are kept apart', () => {
    const { utterances } = read('The room is empty. Who could have done this?');
    expect(utterances.map((u) => u.ambiguous)).toEqual([false, true]);
  });
});

describe('segmentation', () => {
  it('does not cut a sentence at a title', () => {
    expect(splitSentences('Mr. Carrasco waits. Dr. Hale nods.')).toEqual(['Mr. Carrasco waits.', 'Dr. Hale nods.']);
  });
  it('runs of the same kind merge; an ask stands alone', () => {
    const { utterances } = read('The rain stops.\nThe street empties. What do you do?');
    expect(utterances.map((u) => u.text)).toEqual(['The rain stops. The street empties.', 'What do you do?']);
  });
  it('holds an unfinished trailing sentence back when asked to', () => {
    const first = read('The rain stops. Then the door at the end of', { holdTrailingFragment: true });
    expect(first.utterances.map((u) => u.text)).toEqual(['The rain stops.']);
    expect(first.pending).toBe('Then the door at the end of');
    const second = read(`${first.pending} the hall opens. What do you do?`, { holdTrailingFragment: true });
    expect(second.pending).toBeNull();
    expect(second.utterances.map((u) => u.kind)).toEqual(['narration', 'ask-to-party']);
  });
  it('classifies everything when not asked to hold', () => {
    const r = read('what do you do');
    expect(r.pending).toBeNull();
    expect(r.utterances[0].kind).toBe('ask-to-party');
  });
  it('empty input reads as nothing', () => {
    expect(read('  \n ').utterances).toEqual([]);
  });
  it('an alias two entries share addresses nobody', () => {
    const twins = { present: [{ id: 'a', name: 'Ada Vale' }, { id: 'b', name: 'Bram Vale' }] };
    expect(readTableTalk('Vale, what do you do?', twins).utterances[0].kind).toBe('ask-to-party');
    expect(readTableTalk('Bram, what do you do?', twins).utterances[0].to).toEqual({ scope: 'named', ids: ['b'] });
  });
});

describe('settleAmbiguous — the fallback seam', () => {
  const ambiguous = () => read('The room is empty. Who could have done this?').utterances;
  it('with no fallback the rule reading stands', async () => {
    const before = ambiguous();
    expect(await settleAmbiguous(before, ctx)).toBe(before);
  });
  it('only ambiguous utterances are sent, with what surrounds them', async () => {
    const seen: string[] = [];
    await settleAmbiguous(ambiguous(), ctx, async (u, around) => {
      seen.push(u.text);
      expect(around.before.map((b) => b.text)).toEqual(['The room is empty.']);
      return null;
    });
    expect(seen).toEqual(['Who could have done this?']);
  });
  it('a valid verdict replaces the reading and clears the flag', async () => {
    const out = await settleAmbiguous(ambiguous(), ctx, async () => ({ kind: 'ask-to-party', to: { scope: 'party' } }));
    expect(out[1]).toMatchObject({ kind: 'ask-to-party', to: { scope: 'party' }, expectsReply: true, ambiguous: false, rule: 'fallback(narration:question?)' });
    expect(out[0].kind).toBe('narration');
  });
  it('a verdict naming someone unknown, or a kind and target that disagree, is refused', async () => {
    const unknown = await settleAmbiguous(ambiguous(), ctx, async () => ({ kind: 'ask-to-name', to: { scope: 'named', ids: ['nobody'] } }));
    expect(unknown[1]).toMatchObject({ kind: 'narration', ambiguous: true });
    const mismatch = await settleAmbiguous(ambiguous(), ctx, async () => ({ kind: 'ask-to-name', to: { scope: 'party' } }));
    expect(mismatch[1]).toMatchObject({ kind: 'narration', ambiguous: true });
  });
  it('a fallback that throws leaves the rule reading', async () => {
    const out = await settleAmbiguous(ambiguous(), ctx, async () => { throw new Error('lane down'); });
    expect(out[1]).toMatchObject({ kind: 'narration', ambiguous: true });
  });
});
