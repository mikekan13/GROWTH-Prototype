import { describe, it, expect } from 'vitest';
import { liveSignal, withSignal, withoutSignal, signalLines, signalInState, connectedParties, onTheLine, signalTextFor } from './item-signal';

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
  it('a message lands with its words and is told to both sides', () => {
    const data = withSignal({}, { text: "Violet's phone chimes.", since: 1, until: 2, by: 'kris', kind: 'text', state: 'received', words: 'Is this the woman with purple hair?' });
    const sig = liveSignal(data, 1.5)!;
    expect(signalTextFor(sig, 'holder', 'Kristopher')).toContain('It reads: "Is this the woman with purple hair?"');
    expect(signalTextFor(sig, 'caller', 'Violet')).toContain('Your message reached Violet.');
    expect(signalLines([{ name: 'Her phone', holderId: 'vi', data }], 'vi', 1.5)[0]).toContain('a message has come in');
  });
});
