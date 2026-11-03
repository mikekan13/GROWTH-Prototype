/** The ledger decides what an act uses (session 2, 2026-11-03): unheld uses become refusal lines. */
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: {} }));

import { unheldUses, unheldThings, parseUses } from './adjudicator';

describe('unheldUses', () => {
  const held = ['Weed vape pen', 'Personal phone'];
  it('exact match passes', () => expect(unheldUses(['Personal phone'], held, [], 'Kristopher')).toEqual([]));
  it('word match passes', () => {
    expect(unheldUses(['weed vape'], held, [], 'Kristopher')).toEqual([]);
    expect(unheldUses(['his phone'], held, [], 'Kristopher')).toEqual([]);
  });
  it('room items count', () => expect(unheldUses(['lighter'], [], ['Brass lighter'], 'K')).toEqual([]));
  it('no match is a refusal line', () => {
    expect(unheldUses(['weed vape'], ['Personal phone'], [], 'Kristopher')).toEqual(['Kristopher has no weed vape on them']);
  });
  it('empty uses is nothing', () => {
    expect(unheldUses([], held, [])).toEqual([]);
    expect(unheldUses(undefined, held, [])).toEqual([]);
  });
});

describe('unheldThings', () => {
  it('names the bare things, for the continuity question', () => {
    expect(unheldThings(['weed vape', 'phone'], ['Personal phone'], [])).toEqual(['weed vape']);
  });
});

describe('parseUses', () => {
  it('keeps trimmed strings only', () => expect(parseUses([' a vape ', 3, '', 'phone'])).toEqual(['a vape', 'phone']));
  it('non-array is empty', () => expect(parseUses('vape')).toEqual([]));
});
