import { describe, it, expect } from 'vitest';
import { pickProdForReply } from './prod-reply';

const marriage = { id: 'm', question: 'Did the first marriage end before he enlisted in July 2012, or was he still married when he joined?', why: 'The branch close depends on it.', createdAt: new Date('2026-10-17T12:37:55Z') };
const want = { id: 'w', question: 'At story-open, does Kristopher know what he wants — to get his kids back, to survive the trial?', why: 'This is his first vine.', createdAt: new Date('2026-10-17T12:38:00Z') };

describe('pickProdForReply', () => {
  it('Kristopher, 17 Oct: the marriage answer goes to the marriage question, not the newest one', () => {
    expect(pickProdForReply([want, marriage], 'his first marriage ended a year before he left service and his second marriage started before he left service in 2019')?.id).toBe('m');
  });
  it('an answer about what he wants goes to the want question', () => {
    expect(pickProdForReply([marriage, want], 'He wants his kids back more than anything')?.id).toBe('w');
  });
  it('no overlap → the question asked first', () => {
    expect(pickProdForReply([want, marriage], 'yes')?.id).toBe('m');
  });
  it('nothing open → null', () => {
    expect(pickProdForReply([], 'anything')).toBeNull();
  });
});
