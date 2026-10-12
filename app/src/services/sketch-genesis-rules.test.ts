/** SKETCH genesis — repair + wallet clamp are pure and canon-exact (2026-10-12). */
import { describe, it, expect } from 'vitest';
import { createDefaultCharacter } from '@/lib/defaults';
import { calculateCharacterTKV } from '@/lib/kv-calculator';
import {
  SKETCH_ATTRS,
  buildSketchSheet,
  extractJson,
  fitToBudget,
  levelForDie,
  normalizeProposal,
  normalizeSkill,
} from './sketch-genesis-rules';

const tkv = (c: Parameters<typeof calculateCharacterTKV>[0]) => calculateCharacterTKV(c).total;

describe('skill tiers', () => {
  it('a d2 or d3 tier becomes d4 (level 4); real dice map to their tier floor', () => {
    expect(levelForDie('d2')).toBe(4);
    expect(levelForDie('d3')).toBe(4);
    expect(levelForDie('d4')).toBe(4);
    expect(levelForDie('d6')).toBe(6);
    expect(levelForDie('d8')).toBe(8);
    expect(levelForDie('d12')).toBe(12);
    expect(levelForDie('d20')).toBe(20);
    const repairs: string[] = [];
    const s = normalizeSkill({ name: 'Brewing', die: 'd2', governors: ['wit'] }, repairs);
    expect(s).toMatchObject({ name: 'Brewing', level: 4, governors: ['wit'] });
    expect(repairs.join(' ')).toMatch(/d2 → d4/);
  });

  it('levels clamp to 1–20, flat-bonus levels 1–3 stay valid, bad governors fall back to focus', () => {
    const r: string[] = [];
    expect(normalizeSkill({ name: 'A', level: 25, governors: ['clout'] }, r)!.level).toBe(20);
    expect(normalizeSkill({ name: 'B', level: 0, governors: ['clout'] }, r)!.level).toBe(1);
    expect(normalizeSkill({ name: 'C', level: 2, governors: ['clout'] }, r)!.level).toBe(2);
    expect(normalizeSkill({ name: 'D', level: 5, governors: ['frequency', 'nonsense'] }, r)!.governors).toEqual(['focus']);
    expect(normalizeSkill({ level: 5 }, r)).toBeNull();
  });
});

describe('normalizeProposal', () => {
  it('clamps attributes out of range and never sets frequency', () => {
    const p = normalizeProposal({ name: 'Mog', attributes: { clout: 40, celerity: -3, wit: 'x', frequency: 99 } }, 'a grumpy innkeeper');
    expect(p.attributes.clout).toBe(20);
    expect(p.attributes.celerity).toBe(1);
    expect(p.attributes.wit).toBe(1);
    expect((p.attributes as Record<string, number>).frequency).toBeUndefined();
    expect(p.repairs.join(' ')).toMatch(/clout 40 → 20/);
  });

  it('an unreadable answer still yields a usable bare sketch (never a length/shape failure)', () => {
    const p = normalizeProposal(null, 'a grumpy innkeeper who waters the ale');
    expect(p.name).toBe('Stranger');
    expect(p.persona).toMatch(/innkeeper/);
    for (const k of SKETCH_ATTRS) expect(p.attributes[k]).toBe(1);
    expect(p.skills).toEqual([]);
  });

  it('clips over-long text instead of refusing; caps memories, skills and trait hints', () => {
    const long = 'word '.repeat(400);
    const p = normalizeProposal({
      name: long, persona: long, voice: long,
      memories: Array.from({ length: 9 }, (_, i) => `memory ${i} ${long}`),
      skills: Array.from({ length: 12 }, (_, i) => ({ name: `S${i}`, level: i + 1, governors: ['wit'] })),
      traitHints: [{ name: 'Iron Gut', type: 'nectar' }, { name: 'Grudge', type: 'thorn' }, { name: 'Third', type: 'nectar' }],
    }, 'x');
    expect(p.name.length).toBeLessThanOrEqual(61);
    expect(p.persona.length).toBeLessThanOrEqual(241);
    expect(p.memories).toHaveLength(5);
    for (const m of p.memories) expect(m.length).toBeLessThanOrEqual(281);
    expect(p.skills).toHaveLength(8);
    expect(p.traitHints).toHaveLength(2);
  });
});

describe('fitToBudget (the wallet clamp)', () => {
  function bigSheet() {
    const p = normalizeProposal({
      name: 'Hulda',
      attributes: Object.fromEntries(SKETCH_ATTRS.map((k) => [k, 10])),
      skills: [{ name: 'Brawling', level: 8, governors: ['clout'] }, { name: 'Haggling', level: 6, governors: ['wit'] }],
      traitHints: [{ name: 'Iron Gut', type: 'nectar' }],
    }, 'x');
    return buildSketchSheet(createDefaultCharacter('Hulda'), p, 'x');
  }

  it('fits under budget untouched', () => {
    const s = bigSheet();
    const f = fitToBudget(s, 10_000);
    expect(f.clamped).toBe(false);
    expect(f.tkv).toBe(tkv(s));
  });

  it('over-wallet KV is clamped down to the wallet — skills first, then attributes — and stays valid', () => {
    const s = bigSheet();
    const full = tkv(s);
    const f = fitToBudget(s, full - 10);
    expect(f.clamped).toBe(true);
    expect(f.tkv).toBeLessThanOrEqual(full - 10);
    expect(f.tkv).toBe(tkv(f.sheet));
    // 10 KRMA came off skills only; attributes untouched.
    for (const k of SKETCH_ATTRS) expect(f.sheet.attributes[k].level).toBe(10);
    const g = fitToBudget(s, f.floorTkv + 5);
    expect(g.tkv).toBeLessThanOrEqual(f.floorTkv + 5);
    expect(g.sheet.skills).toEqual([]);
    for (const k of SKETCH_ATTRS) {
      expect(g.sheet.attributes[k].level).toBeGreaterThanOrEqual(1);
      expect(g.sheet.attributes[k].current).toBe(g.sheet.attributes[k].level + (g.sheet.attributes[k].augmentPositive ?? 0) - (g.sheet.attributes[k].augmentNegative ?? 0));
    }
  });

  it('a wallet below the bare floor is unaffordable (never bypassed)', () => {
    const s = bigSheet();
    const f = fitToBudget(s, 0);
    expect(f.affordable).toBe(false);
  });

  it('trait hints are plain text, not priced traits', () => {
    const s = bigSheet();
    expect(s.traits).toEqual([]);
    expect((s as unknown as { _sketch: { traitHints: unknown[] } })._sketch.traitHints).toHaveLength(1);
  });
});

describe('extractJson', () => {
  it('finds the object through fences and braces inside strings', () => {
    expect(extractJson('sure! ```json\n{"name":"a {b}","x":1}\n```')).toEqual({ name: 'a {b}', x: 1 });
    expect(extractJson('no json here')).toBeNull();
    expect(extractJson('{"broken": ')).toBeNull();
  });
});
