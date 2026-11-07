import { describe, it, expect } from 'vitest';
import { messageAsSignal, sendsReadReceipts, type MessageRow } from './world-messages';
import { STANDARD_CALENDAR, secondsToCycles } from '@/types/time';

// A message is a record (2026-11-07): the thread a thing shows is derived from WorldMessage rows.
const ts = { unitsPerMetaCycle: 1, calendar: STANDARD_CALENDAR };
const minute = secondsToCycles(60, ts);
const row = (over: Partial<MessageRow> = {}): MessageRow => ({
  id: 'm1', medium: 'text', senderId: 'kris', senderThingId: 'kphone', recipientId: 'vi', recipientThingId: 'vphone',
  content: 'Coffee?', notice: "Violet's phone chimes.", sentCycle: 10, deliveredCycle: 10, readCycle: null, settledCycle: null, ...over,
});

describe('messageAsSignal', () => {
  it('an unread delivered message is received, with its row, medium, sender name and age', () => {
    const s = messageAsSignal(row(), 10 + 3 * minute, ts, { fromName: 'Kristopher' })!;
    expect(s).toMatchObject({ state: 'received', by: 'kris', words: 'Coffee?', fromItem: 'kphone', messageId: 'm1', medium: 'text', fromName: 'Kristopher', ago: 'about 3 minutes' });
    expect(s.until).toBe(Number.POSITIVE_INFINITY);
  });
  it('not yet delivered, or settled, is not live', () => {
    expect(messageAsSignal(row({ deliveredCycle: null }), 20, ts)).toBeNull();
    expect(messageAsSignal(row({ deliveredCycle: 30 }), 20, ts)).toBeNull();
    expect(messageAsSignal(row({ settledCycle: 15 }), 20, ts)).toBeNull();
  });
  it('a read message waits two hours of world time, then is simply read', () => {
    const r = row({ readCycle: 10 });
    expect(messageAsSignal(r, 10 + 119 * minute, ts)?.state).toBe('read');
    expect(messageAsSignal(r, 10 + 121 * minute, ts)).toBeNull();
  });
  it('carries receiptsOff from the reader\'s thing', () => {
    expect(messageAsSignal(row({ readCycle: 10 }), 10 + minute, ts, { receiptsOff: true })?.receiptsOff).toBe(true);
    expect(sendsReadReceipts('{"readReceipts":false}')).toBe(false);
    expect(sendsReadReceipts('{}')).toBe(true);
  });
});
