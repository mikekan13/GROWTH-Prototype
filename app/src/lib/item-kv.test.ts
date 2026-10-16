/** Item KV is decimal (Mike 2026-10-16: "KV IS the price"; sub-1 allowed). */
import { describe, it, expect } from 'vitest';
import { instanceKvOf, itemKvOf, kvMirror, readKit, roundKv } from './item-kv';

describe('item KV', () => {
  it('data.value is the truth, decimal; the BigInt mirror is the fallback; never negative', () => {
    expect(itemKvOf({ value: 0.02 }, BigInt(0))).toBe(0.02);
    expect(itemKvOf({ value: 0 }, BigInt(10))).toBe(10); // legacy stock: value 0 beside a graded mirror
    expect(itemKvOf({}, 3)).toBe(3);
    expect(itemKvOf({ kv: 1.5 })).toBe(1.5);
    expect(itemKvOf({ value: -4 })).toBe(0);
  });
  it('mirror rounds; display rounds to 2 places', () => {
    expect(kvMirror(0.4)).toBe(BigInt(0));
    expect(kvMirror(2.6)).toBe(BigInt(3));
    expect(roundKv(0.0249)).toBe(0.02);
  });
  it('an instance is its archetype KV × quantity (six eggs)', () => {
    expect(instanceKvOf({ quantity: 6, value: 400 }, { data: { value: 0.02 }, karmicValue: BigInt(0) })).toBeCloseTo(0.12);
    expect(instanceKvOf({ value: 0.5 })).toBe(0.5);
  });
  it('readKit reads a holder kit defensively', () => {
    expect(readKit({})).toBeNull();
    expect(readKit({ kit: { kvBudget: 1.2, contents: 'milk, eggs' } })).toEqual({ kvBudget: 1.2, contents: 'milk, eggs', spentKv: 0, resolvedItemIds: [] });
  });
});
