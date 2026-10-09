import { describe, it, expect } from 'vitest';
import { aspectFact, aspectFacts, numericAt } from './aspect-values';

const sword = {
  description: 'A long blade with a worn leather grip. The crossguard is shaped like wings.',
  item: {
    description: 'x', weightLbs: 3.2, baseResist: 18, value: 40, quality: 8, rarity: 7, condition: 2,
    primaryMaterial: 'Steel', subordinateMaterials: ['Leather'], materialClass: 'Hard' as const,
    properties: ['Sharp'], damage: { slashing: 6, piercing: 2, bashing: 0, heat: 0, cold: 0, decay: 0, energy: 0 },
    itemAbilities: [{ name: 'Flame Tongue', description: 'The edge burns when named.', mechanicalEffect: '+2 heat damage' }],
  },
};

describe('aspect values at the viewer\'s fidelity', () => {
  it('F5 = the raw value; lower = nearer, rougher, relational, vague', () => {
    expect([5, 4, 3, 2, 1].map((f) => aspectFact('weight', f, sword)?.value)).toEqual([
      '3.2 lbs', '3-ish lbs', 'roughly 2–4 lbs', 'about as heavy as a sword', 'light',
    ]);
    expect(aspectFact('hardness', 5, sword)?.value).toBe('18');
    expect(aspectFact('hardness', 2, sword)?.value).toBe('hard — it would take real force');
    expect(aspectFact('damage', 5, sword)?.value).toBe('slashing 6 · piercing 2');
    expect(aspectFact('damage', 2, sword)?.value).toBe('cuts hard, pierces lightly');
    expect(aspectFact('condition', 5, sword)?.value).toBe('Worn (2 of 4)');
    expect(aspectFact('condition', 3, sword)?.value).toBe('Worn');
    expect(aspectFact('condition', 1, sword)?.value).toBe('looks used');
    expect(aspectFact('material', 4, sword)?.value).toBe('Steel, Leather');
    expect(aspectFact('material', 2, sword)?.value).toBe('probably something hard');
    expect(aspectFact('ability:flame-tongue', 5, sword)?.value).toBe('Flame Tongue — The edge burns when named. — +2 heat damage');
    expect(aspectFact('ability:flame-tongue', 3, sword)?.value).toBe('Flame Tongue');
    expect(aspectFact('ability:flame-tongue', 2, sword)?.value).not.toContain('Flame');
    expect(aspectFact('appearance', 3, sword)?.value).toBe('A long blade with a worn leather grip.');
    expect(aspectFact('quality', 5, sword)?.value).toBe('8 — Masterwork');
  });

  it('F0 / unknown → no line; identity, thoughts and history (no stored value) → no line', () => {
    expect(aspectFact('weight', 0, sword)).toBeNull();
    expect(aspectFact('identity', 5, sword)).toBeNull();
    expect(aspectFact('thoughts', 5, sword)).toBeNull();
    expect(aspectFact('history', 5, sword)).toBeNull();
    expect(aspectFact('weight', 5, { description: 'a stone' })).toBeNull();
    expect(aspectFacts([{ aspectKind: 'weight', fidelity: 2 }, { aspectKind: 'value', fidelity: 0 }], sword).map((f) => f.aspect)).toEqual(['weight']);
  });

  it('never a level number, never "fidelity" / "distort"', () => {
    for (let f = 1; f <= 4; f++) {
      for (const k of ['weight', 'hardness', 'value', 'quality', 'rarity', 'condition', 'material', 'property:sharp', 'damage', 'ability:flame-tongue', 'appearance']) {
        const v = aspectFact(k, f, sword)?.value ?? '';
        expect(v).not.toMatch(/\bF[0-5]\b|fidelity|distort|level/i);
      }
    }
  });

  it('numericAt bands are deterministic', () => {
    expect(numericAt(100, 3, ' KV', [{ max: Infinity, f2: 'a', f1: 'b' }])).toBe('roughly 75–125 KV');
    expect(numericAt(100, 3, ' KV', [{ max: Infinity, f2: 'a', f1: 'b' }])).toBe(numericAt(100, 3, ' KV', [{ max: Infinity, f2: 'a', f1: 'b' }]));
  });
});
