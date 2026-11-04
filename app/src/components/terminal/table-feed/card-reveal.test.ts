import { describe, it, expect } from 'vitest';
import { createCardReveal, revealChars, revealDuration, truncateSegments, segmentChars } from './card-reveal';

describe('card-reveal', () => {
  it('types at ~18 ms per character and caps at 6 s', () => {
    expect(revealDuration(100)).toBe(1800);
    expect(revealDuration(10000)).toBe(6000);
    expect(revealChars(100, 900)).toBe(50);
    expect(revealChars(100, 5000)).toBe(100);
    expect(revealChars(10000, 3000)).toBe(5000);
  });
  it('truncates segments by characters', () => {
    const segs = [{ kind: 'thought' as const, text: 'abcd' }, { kind: 'speech' as const, text: 'efgh' }];
    expect(segmentChars(segs)).toBe(8);
    expect(truncateSegments(segs, 6).map((s) => s.text)).toEqual(['abcd', 'ef']);
    expect(truncateSegments(segs, 0)).toEqual([]);
  });
  it('seeds history, types only later cards, once', () => {
    const r = createCardReveal();
    expect(r.observe(['old1', 'old2'], 0)).toEqual([]);
    expect(r.startOf('old1')).toBeUndefined();
    expect(r.observe(['old1', 'old2', 'new1'], 100)).toEqual(['new1']);
    expect(r.startOf('new1')).toBe(100);
    expect(r.observe(['old1', 'old2', 'new1'], 5000)).toEqual([]);
    expect(r.startOf('new1')).toBe(100);
    r.reset();
    expect(r.observe(['new1'], 9)).toEqual([]);
  });
  it('persists shown ids so a reload does not re-type history', () => {
    const store = new Map<string, string>();
    const g = globalThis as unknown as { sessionStorage?: unknown };
    const prev = g.sessionStorage;
    g.sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    try {
      const a = createCardReveal('k');
      a.observe(['c1'], 0);
      expect(a.observe(['c1', 'c2'], 5)).toEqual(['c2']);
      const b = createCardReveal('k'); // reload
      expect(b.observe(['c1', 'c2'], 10)).toEqual([]);
      expect(b.observe(['c1', 'c2', 'c3'], 20)).toEqual(['c3']);
      b.reset();
      expect(b.observe(['c1', 'c2', 'c3'], 30)).toEqual([]);
      expect(b.observe(['c1', 'c2', 'c3', 'c4'], 40)).toEqual(['c4']);
    } finally { g.sessionStorage = prev; }
  });
  it('falls back to memory when storage throws', () => {
    const g = globalThis as unknown as { sessionStorage?: unknown };
    const prev = g.sessionStorage;
    const boom = () => { throw new Error('denied'); };
    g.sessionStorage = { getItem: boom, setItem: boom };
    try {
      const r = createCardReveal('k');
      r.observe(['a'], 0);
      expect(r.observe(['a', 'b'], 1)).toEqual(['b']);
    } finally { g.sessionStorage = prev; }
  });
});
