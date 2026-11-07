import { describe, it, expect } from 'vitest';
import { liveSignal, withSignal, withoutSignal, signalLines, signalInState, connectedParties, onTheLine, signalTextFor, actorWordsFromIntent, replyTargetItem, liveSignals, mirrorOf, threadTextFor, markRead, settleFrom, pickFromItem, withoutOneSignal, withoutSignalsBy, senderSees } from './item-signal';

const sig = { text: "Violet's phone rings wherever she has it.", since: 100, until: 200, by: 'kris' };

describe('a signal on a held thing', () => {
  it('is set, read live, expires, and clears', () => {
    const d = withSignal({ description: 'a phone' }, sig);
    expect(d.description).toBe('a phone');
    expect(liveSignal(d, 150)?.text).toMatch(/rings/);
    expect(liveSignal(d, 200)).toBeNull();
    expect(liveSignal(d, 99)).toBeNull();
    expect(liveSignal(withoutSignal(d), 150)).toBeNull();
    expect(withoutSignal(d).description).toBe('a phone');
  });
  it('tolerates junk data', () => {
    expect(liveSignal(null, 1)).toBeNull();
    expect(liveSignal({ signal: 'x' }, 1)).toBeNull();
    expect(liveSignal({ signal: { text: '' } }, 1)).toBeNull();
    expect(withSignal(null, sig).signal).toBeTruthy();
  });
});

describe('signal lines', () => {
  const items = [{ name: 'Her phone', holderId: 'violet', data: withSignal({}, sig) }];
  it('tells the holder it is going right now', () => {
    const l = signalLines(items, 'violet', 150);
    expect(l).toHaveLength(1);
    expect(l[0]).toContain('The phone you are holding');
    expect(l[0]).toContain('right now');
  });
  it('tells the one who caused it that it is not answered', () => {
    const l = signalLines(items, 'kris', 150);
    expect(l).toHaveLength(1);
    expect(l[0]).toContain('not been answered');
  });
  it('says nothing to others, after expiry, or once answered', () => {
    expect(signalLines(items, 'third', 150)).toEqual([]);
    expect(signalLines(items, 'violet', 250)).toEqual([]);
    expect(signalLines([{ ...items[0], data: withoutSignal(items[0].data) }], 'kris', 150)).toEqual([]);
  });
});

describe('Day 6 (2026-11-04): a signal has a state; the parties on a line', () => {
  it('ringing → connected keeps the caller and loses its own end; the holder and the caller are the parties', () => {
    const data = withSignal({}, { text: 'Her phone rings.', since: 1, until: 2, by: 'kris', kind: 'call', state: 'ringing' });
    const sig = liveSignal(data, 1.5)!;
    expect(sig.state).toBe('ringing');
    const open = withSignal(data, signalInState(sig, 'connected'));
    expect(liveSignal(open, 99)).toMatchObject({ state: 'connected', by: 'kris' });
    const parties = connectedParties([{ holderId: 'vi', data: open }], 99);
    expect(parties).toEqual([{ holderId: 'vi', by: 'kris' }]);
    expect(onTheLine(parties, 'vi', 'kris')).toBe(true);
    expect(onTheLine(parties, 'kris', 'vi')).toBe(true);
    expect(onTheLine(parties, 'vi', 'vi')).toBe(false);
    expect(connectedParties([{ holderId: 'vi', data }], 1.5)).toEqual([]);
  });
  it('a message lands with its words; the holder is told who and when, never the words, until it is opened (2026-11-07)', () => {
    const data = withSignal({}, { text: "Violet's phone chimes.", since: 1, until: 2, by: 'kris', kind: 'text', state: 'received', words: 'Is this the woman with purple hair?', fromName: 'Kristopher', ago: 'about 2 minutes' });
    const sig = liveSignal(data, 1.5)!;
    const holder = signalTextFor(sig, 'holder', 'Kristopher');
    expect(holder).toBe('An unread message from Kristopher, about 2 minutes ago. The words are not known until it is opened; opening it is your act.');
    expect(holder).not.toContain('purple');
    expect(signalTextFor(sig, 'caller', 'Violet')).toContain('Your message reached Violet.');
    const line = signalLines([{ name: 'Her phone', holderId: 'vi', data }], 'vi', 1.5)[0];
    expect(line).toContain('An unread message from Kristopher');
    expect(line).not.toContain('purple');
  });
  it("read receipts belong to the reader's thing: with them off the sender sees only that it was delivered (2026-11-07)", () => {
    const sig = { text: 't', since: 1, until: 99, by: 'kris', kind: 'text' as const, state: 'read' as const, words: 'hi', receiptsOff: true };
    expect(senderSees(sig)).toBe('received');
    expect(signalTextFor(sig, 'caller', 'Violet')).toContain('Your message reached Violet.');
    expect(signalTextFor(sig, 'holder', 'Kristopher')).toContain("Kristopher's message, read");
    expect(senderSees({ ...sig, receiptsOff: undefined })).toBe('read');
  });
});

describe('Day 8 (2026-11-05): a message READ is a signal state of its own', () => {
  const base = { text: "Violet's phone chimes.", since: 1, until: 2, by: 'kris', kind: 'text' as const };
  it("signalInState 'read' holds the signal open (until Infinity), like connected", () => {
    const sig = liveSignal(withSignal({}, { ...base, state: 'received', words: 'hi' }), 1.5)!;
    const read = signalInState(sig, 'read');
    expect(read.state).toBe('read');
    expect(read.until).toBe(Number.POSITIVE_INFINITY);
    expect(read.words).toBe('hi');
    expect(signalInState(sig, 'received').until).toBe(2);
  });
  it('tells a read message to both sides, with and without its words', () => {
    const sig = { ...base, state: 'read' as const, words: 'Is this the woman with purple hair?' };
    expect(signalTextFor(sig, 'holder', 'Kristopher')).toBe(`Kristopher's message, read: "Is this the woman with purple hair?". You have not written back.`);
    expect(signalTextFor(sig, 'caller', 'Violet')).toBe('Violet read your message. It said: "Is this the woman with purple hair?" Nothing has come back yet.');
    const bare = { ...base, state: 'read' as const };
    expect(signalTextFor(bare, 'holder', 'Kristopher')).toBe("Kristopher's message, read. You have not written back.");
    expect(signalTextFor(bare, 'caller', 'Violet')).toBe('Violet read your message. Nothing has come back yet.');
  });
});

describe('findings 60/62 (2026-11-05): the sender\'s words, the phone it came from', () => {
  it('a text takes words only from the actor\'s own marker, never another speaker\'s quote', () => {
    expect(actorWordsFromIntent('writes back to Violet. Violet said "I\'ll be there."')).toBeUndefined();
    expect(actorWordsFromIntent('texts her\nThe words Kristopher put into it, exactly: "On my way."')).toBe('On my way.');
  });
  it('a reply targets fromItem of the message being answered', () => {
    const d = withSignal({}, { text: 't', since: 0, until: Number.POSITIVE_INFINITY, by: 'v', kind: 'text', state: 'received', words: 'hi', fromItem: 'phone-b' });
    expect(liveSignal(d, 1)?.fromItem).toBe('phone-b');
    expect(replyTargetItem([{ data: {} }, { data: d }], 'v', 1)).toBe('phone-b');
    expect(replyTargetItem([{ data: d }], 'someone-else', 1)).toBeNull();
  });
});

describe('finding 69 (2026-11-05): a thing holds a THREAD of signals', () => {
  const text = (words: string, since: number, by = 'K'): Parameters<typeof withSignal>[1] => ({ text: 'A message came in.', since, until: Number.POSITIVE_INFINITY, by, kind: 'text', state: 'received', words });
  const two = withSignal(withSignal({}, text('Coffee?', 1)), text('Hello?? 2pm', 2));

  it('a second text APPENDS; both are on the phone, the mirror is the newest unread', () => {
    expect(liveSignals(two, 3).map((s) => s.words)).toEqual(['Coffee?', 'Hello?? 2pm']);
    expect(liveSignal(two, 3)?.words).toBe('Hello?? 2pm');
    expect((two.signal as { words: string }).words).toBe('Hello?? 2pm');
  });
  it('mirror order: a ringing call > an unread text > the newest read text', () => {
    const read = markRead(two, 3, 100, { all: true }).data;
    expect(liveSignal(read, 4)?.state).toBe('read');
    expect(liveSignal(read, 4)?.words).toBe('Hello?? 2pm');
    const withUnread = withSignal(read, text('Third', 5));
    expect(liveSignal(withUnread, 6)?.words).toBe('Third');
    const ringing = withSignal(withUnread, { text: 'It rings.', since: 6, until: 50, by: 'K', kind: 'call', state: 'ringing' });
    expect(liveSignal(ringing, 7)?.state).toBe('ringing');
    expect(liveSignals(ringing, 7)).toHaveLength(4);
  });
  it('a ringing call replaces only an earlier ringing call from the same caller', () => {
    const r1 = withSignal({}, { text: 'rings', since: 1, until: 50, by: 'K', kind: 'call', state: 'ringing' });
    const r2 = withSignal(r1, { text: 'rings', since: 3, until: 50, by: 'K', kind: 'call', state: 'ringing' });
    expect(liveSignals(r2, 4)).toHaveLength(1);
    const r3 = withSignal(r2, { text: 'rings', since: 4, until: 50, by: 'M', kind: 'call', state: 'ringing' });
    expect(liveSignals(r3, 5)).toHaveLength(2);
  });
  it('read applies to the newest unread text, or all unread from that sender', () => {
    const one = markRead(two, 3, 100);
    expect(one.read.map((s) => s.words)).toEqual(['Hello?? 2pm']);
    expect(liveSignals(one.data, 4).map((s) => s.state)).toEqual(['received', 'read']);
    const all = markRead(two, 3, 100, { all: true });
    expect(all.read.map((s) => s.words)).toEqual(['Coffee?', 'Hello?? 2pm']);
    expect(liveSignals(all.data, 4).every((s) => s.state === 'read')).toBe(true);
  });
  it('Finding 84: a reply settles only READ texts from the sender; unread ones stay', () => {
    const r = settleFrom(withSignal(two, { ...text('Old', 1, 'K'), state: 'read' }), 'K', 4);
    expect(r.settled).toBe(1);
    expect(liveSignals(r.data, 4).every((x) => x.state === 'received')).toBe(true);
  });
  it('a reply settles ALL of that sender READ texts; others stay', () => {
    const readTwo = markRead(two, 3, 100, { all: true }).data;
    const mixed = withSignal(readTwo, text('From T', 3, 'T'));
    const s = settleFrom(mixed, 'K', 4);
    expect(s.settled).toBe(2);
    expect(liveSignals(s.data, 4).map((x) => x.by)).toEqual(['T']);
    expect(liveSignal(settleFrom(readTwo, 'K', 4).data, 4)).toBeNull();
    expect('signal' in settleFrom(readTwo, 'K', 4).data).toBe(false);
  });
  it('reads a legacy single data.signal as a thread of one', () => {
    const legacy = { signal: { text: 'rings', since: 0, until: null, state: 'ringing' } };
    expect(liveSignals(legacy, 1)).toHaveLength(1);
  });
  it('expires only by until', () => {
    const t = withSignal(withSignal({}, { ...text('old', 1), until: 5 }), text('new', 2));
    expect(liveSignals(t, 6).map((s) => s.words)).toEqual(['new']);
  });
  it('withoutOneSignal / withoutSignalsBy keep the rest', () => {
    const t = withSignal(two, { text: 'rings', since: 3, until: 50, by: 'M', kind: 'call', state: 'ringing' });
    expect(liveSignals(withoutOneSignal(t, liveSignal(t, 4)!), 4)).toHaveLength(2);
    expect(liveSignals(withoutSignalsBy(t, 'K'), 4).map((s) => s.by)).toEqual(['M']);
  });
  it('Finding 79: the going piece strips the sentence full stop before " on the <thing>"', () => {
    const one = withSignal({}, { ...text('Coffee?', 1), text: 'The phone chimes with a text message.' });
    expect(threadTextFor(liveSignals(one, 2), 'holder', 'Kristopher', { thing: 'Personal phone' })).toBe('An unread message from Kristopher on the Personal phone. The words are not known until it is opened; opening it is your act.');
  });
  it('the holder is told the thread, the sender is told how many were read', () => {
    const read1 = withSignal(withSignal({}, { ...text('Coffee?', 1), state: 'read' }), text('Hello?? 2pm', 2));
    expect(threadTextFor(liveSignals(read1, 3), 'holder', 'Kristopher', { thing: 'Personal phone' }))
      .toBe('An unread message from Kristopher on the Personal phone. The words are not known until it is opened; opening it is your act. Already read, oldest first, not written back: "Coffee?".');
    const allRead = withSignal(withSignal({}, { ...text('Coffee?', 1), state: 'read' }), { ...text('Hello?? 2pm', 2), state: 'read' });
    expect(threadTextFor(liveSignals(allRead, 3), 'holder', 'Kristopher')).toBe('Two messages from Kristopher, all read and not written back; oldest first: "Coffee?"; "Hello?? 2pm".');
    const sent = threadTextFor(liveSignals(read1, 3), 'caller', 'Violet', { thing: "Violet's phone" });
    expect(sent).toContain("Your 2 messages reached Violet's phone: 1 read, 1 not yet read");
    expect(sent).toContain('"Hello?? 2pm"');
  });
});

describe('finding 60 (2026-11-05): which of the senders things a text went out from', () => {
  const quiet = (id: string, name: string) => ({ id, name, data: {} });
  const personal = quiet('p', 'Personal phone');
  const work = quiet('w', 'Work phone');
  it('named by the act, the longest name wins', () => {
    expect(pickFromItem([personal, work], 'V', 'texts her from his work phone')).toBe('w');
    expect(pickFromItem([personal, work], 'V', 'texts her on the personal phone')).toBe('p');
    expect(pickFromItem([quiet('a', 'phone'), quiet('b', 'Work phone')], 'V', 'sends it from the work phone')).toBe('b');
  });
  it('else the thing last used with the receiver', () => {
    const used = { id: 'w', name: 'Work phone', data: withSignal({}, { text: 'x', since: 4, until: 99, by: 'V', kind: 'text', state: 'read', words: 'hi' }) };
    const older = { id: 'p', name: 'Personal phone', data: withSignal({}, { text: 'x', since: 1, until: 99, by: 'V', kind: 'text', state: 'read', words: 'yo' }) };
    expect(pickFromItem([older, used], 'V', 'texts her')).toBe('w');
  });
  it('else the only thing with any history, else the only thing held, else undefined', () => {
    const hist = { id: 'w', name: 'Work phone', data: withSignal({}, { text: 'x', since: 4, until: 99, by: 'Z', kind: 'text', state: 'read', words: 'hi' }) };
    expect(pickFromItem([personal, hist], 'V', 'texts her')).toBe('w');
    expect(pickFromItem([personal], 'V', 'texts her')).toBe('p');
    expect(pickFromItem([personal, work], 'V', 'texts her')).toBeUndefined();
  });
  it('a reply targets the newest messages fromItem', () => {
    const a = withSignal({}, { text: 'm', since: 1, until: 99, by: 'K', kind: 'text', state: 'received', words: 'a', fromItem: 'ph1' });
    const b = withSignal({}, { text: 'm', since: 2, until: 99, by: 'K', kind: 'text', state: 'received', words: 'b', fromItem: 'ph2' });
    expect(replyTargetItem([{ data: a }, { data: b }], 'K', 3)).toBe('ph2');
  });
});
