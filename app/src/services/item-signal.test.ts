import { describe, it, expect } from 'vitest';
import { liveSignal, withSignal, withoutSignal, signalLines } from './item-signal';

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
