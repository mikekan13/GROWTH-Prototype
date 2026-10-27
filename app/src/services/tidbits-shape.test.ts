import { describe, it, expect } from 'vitest';
import { sampleTidbits, clip, FALLBACK_TIDBITS, TIDBIT_COUNT } from './tidbits-shape';

const seq = (xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };

describe('tidbits sampling', () => {
  it('keeps the fallback list tiny', () => {
    expect(FALLBACK_TIDBITS.length).toBeLessThanOrEqual(6);
  });

  it('returns about a dozen real lines spread across kinds, flagged as not fallback', () => {
    const many = Array.from({ length: 50 }, (_, i) => `memory ${i}`);
    const r = sampleTidbits({ memories: many, places: ['A is a building.', 'B is a region.'], facts: ['F1'] }, seq([0.1, 0.5, 0.9, 0.3]));
    expect(r.fallback).toBe(false);
    expect(r.tidbits).toHaveLength(TIDBIT_COUNT);
    expect(r.tidbits).toEqual(expect.arrayContaining(['A is a building.', 'B is a region.', 'F1']));
    expect(new Set(r.tidbits).size).toBe(TIDBIT_COUNT);
  });

  it('is deterministic for a given random source', () => {
    const pool = { memories: ['a', 'b', 'c', 'd'], places: ['p', 'q'] };
    expect(sampleTidbits(pool, seq([0.2, 0.7])).tidbits).toEqual(sampleTidbits(pool, seq([0.2, 0.7])).tidbits);
  });

  it('falls back (and says so) when the campaign has too little data, keeping the few real lines', () => {
    const r = sampleTidbits({ places: ['Only is a place.'] });
    expect(r.fallback).toBe(true);
    expect(r.tidbits).toContain('Only is a place.');
    expect(r.tidbits.length).toBeLessThanOrEqual(TIDBIT_COUNT);
    expect(r.tidbits.length).toBeGreaterThan(1);
  });

  it('an empty pool is all fallback', () => {
    const r = sampleTidbits({});
    expect(r.fallback).toBe(true);
    expect(r.tidbits.every((t) => FALLBACK_TIDBITS.includes(t))).toBe(true);
  });

  it('clips long text at a word', () => {
    const t = clip('word '.repeat(100), 40);
    expect(t.length).toBeLessThanOrEqual(41);
    expect(t.endsWith('…')).toBe(true);
  });
});
