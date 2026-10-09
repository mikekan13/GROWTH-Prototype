import { describe, it, expect } from 'vitest';
import { fallbackWrongValue, parseWrongImpression, wrongImpressionFor, buildWrongImpressionPrompt } from './wrong-impression';
import { aspectFact, aspectFacts, type AspectSubject } from './aspect-values';

const SWORD: AspectSubject = { item: { weightLbs: 3, baseResist: 12, value: 40, condition: 3, primaryMaterial: 'Silver', subordinateMaterials: ['Brass'], damage: { slashing: 4 } as never, itemAbilities: [{ name: 'Flame Tongue', description: 'burns' }] }, description: 'A slim sword with a silver guard.' };

// Mike 2026-10-09: "saw a golden button on a blouse but it was actually silver. Then it shows as gold for that entity until it is 'fixed'".
describe('fallbackWrongValue — a plausible wrong value, worded as believed fact', () => {
  it('numbers are pushed off and worded at F3; never the truth', () => {
    for (const key of ['weight', 'hardness', 'value', 'damage']) {
      const wrong = fallbackWrongValue(key, SWORD, 'seed-a');
      expect(wrong).toBeTruthy();
      expect(wrong).not.toBe(aspectFact(key, 3, SWORD)?.value);
    }
  });

  it('categories shift: condition to a neighbour tier, material to one of its own, an ability to mundane', () => {
    expect(fallbackWrongValue('condition', SWORD, 's')).toBe('Worn');
    expect(fallbackWrongValue('material', SWORD, 's')).toBe('Brass');
    expect(fallbackWrongValue('ability:flame-tongue', SWORD, 's')).toBe('nothing special about it');
  });

  it('is deterministic per seed, and null where only the model can misjudge (appearance, history)', () => {
    expect(fallbackWrongValue('weight', SWORD, 'x')).toBe(fallbackWrongValue('weight', SWORD, 'x'));
    expect(fallbackWrongValue('appearance', SWORD, 'x')).toBeNull();
    expect(fallbackWrongValue('history', SWORD, 'x')).toBeNull();
    expect(fallbackWrongValue('material', { item: { primaryMaterial: 'Iron' } }, 'x')).toBeNull();
  });
});

describe('wrongImpressionFor — the small model first, the fallback always behind it', () => {
  it('takes the model value; refuses the truth, junk and a failing call', async () => {
    expect(await wrongImpressionFor('appearance', SWORD, { seed: 's', subjectName: 'sword', model: async () => '{"value":"A slim sword with a gold guard."}' })).toEqual({ value: 'A slim sword with a gold guard.', source: 'model' });
    expect((await wrongImpressionFor('weight', SWORD, { seed: 's', subjectName: 'sword', model: async () => '{"value":"3 lbs"}' })).source).toBe('fallback');
    expect((await wrongImpressionFor('weight', SWORD, { seed: 's', subjectName: 'sword', model: async () => 'no idea' })).source).toBe('fallback');
    expect((await wrongImpressionFor('weight', SWORD, { seed: 's', subjectName: 'sword', model: async () => { throw new Error('down'); } })).source).toBe('fallback');
    expect(await wrongImpressionFor('appearance', SWORD, { seed: 's', subjectName: 'sword', model: null })).toEqual({ value: null, source: 'none' });
  });

  it('the prompt carries the true value; parse strips fences and caps length', () => {
    const p = buildWrongImpressionPrompt('material', SWORD, 'the sword');
    expect(p?.user).toContain('True value: Silver, Brass.');
    expect(parseWrongImpression('```json\n{"value":"  gold  "}\n```', 'Silver')).toBe('gold');
    expect(() => parseWrongImpression(`{"value":"${'x'.repeat(120)}"}`, null)).toThrow();
  });
});

describe('aspectFacts — a wrong impression shows as plain fact, no marker', () => {
  it('replaces the line whatever the fidelity (even F0), labelled like the true one', () => {
    const facts = aspectFacts([{ aspectKind: 'material', fidelity: 0, impression: 'gold' }, { aspectKind: 'weight', fidelity: 5 }], SWORD);
    expect(facts).toEqual([{ aspect: 'material', label: aspectFact('material', 5, SWORD)!.label, value: 'gold' }, aspectFact('weight', 5, SWORD)]);
    expect(aspectFacts([{ aspectKind: 'attribute:wit', fidelity: 0, impression: 'sharp as a tack' }], {})[0]).toEqual({ aspect: 'attribute:wit', label: 'Wit', value: 'sharp as a tack' });
  });
});
