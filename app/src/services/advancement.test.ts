import { describe, it, expect } from 'vitest';
import { createDefaultCharacter } from '@/lib/defaults';
import { restLong } from '@/lib/character-actions';
import {
  markAttributeTrainable,
  markSkillTrainable,
  listTrainables,
  applyAdvancements,
  clearTrainables,
  AdvancementError,
} from './advancement';
import type { GrowthCharacter, GrowthSkill } from '@/types/growth';

function fixture(): GrowthCharacter {
  const c = createDefaultCharacter('Advancement Test');
  // Give a comfortable Frequency pool to spend from.
  c.attributes.frequency.level = 10;
  c.attributes.frequency.current = 10;
  const skill: GrowthSkill = { name: 'Lockpicking', level: 3, governors: ['celerity', 'wit'] };
  c.skills = [skill];
  return c;
}

describe('advancement — trainable → Long-Rest upgrade loop (r-2026-07-15-01)', () => {
  it('marks attributes and skills trainable, and never marks frequency', () => {
    let c = fixture();
    c = markAttributeTrainable(c, 'clout');
    c = markAttributeTrainable(c, 'frequency'); // must be ignored
    c = markSkillTrainable(c, 'lockpicking'); // case-insensitive

    const items = listTrainables(c);
    expect(items.map(i => `${i.kind}:${i.name}`).sort()).toEqual(['attribute:clout', 'skill:Lockpicking']);
    expect(items.find(i => i.name === 'frequency')).toBeUndefined();
  });

  it('groups a skill under all its governors\' pillars', () => {
    let c = fixture();
    c = markSkillTrainable(c, 'Lockpicking'); // governors celerity(body) + wit(soul)
    const skillItem = listTrainables(c).find(i => i.kind === 'skill')!;
    expect(skillItem.pillars.sort()).toEqual(['body', 'soul']);
  });

  it('advancing is TKV-neutral: max Frequency −cost, target +1', () => {
    let c = fixture();
    c = markAttributeTrainable(c, 'clout');
    const cloutBefore = c.attributes.clout.level;
    const freqBefore = c.attributes.frequency.level;

    const res = applyAdvancements(c, [{ kind: 'attribute', name: 'clout' }]);
    expect(res.frequencySpent).toBe(1);
    expect(res.character.attributes.clout.level).toBe(cloutBefore + 1);
    expect(res.character.attributes.frequency.level).toBe(freqBefore - 1);
    // Net folder-move: Freq lost exactly what the stat gained.
    expect(res.applied).toEqual([{ kind: 'attribute', name: 'clout', from: cloutBefore, to: cloutBefore + 1, cost: 1 }]);
  });

  it('advances multiple trainables at once (not capped), summing the cost', () => {
    let c = fixture();
    c = markAttributeTrainable(c, 'clout');
    c = markAttributeTrainable(c, 'wisdom');
    c = markSkillTrainable(c, 'Lockpicking');
    const freqBefore = c.attributes.frequency.level;

    const res = applyAdvancements(c, [
      { kind: 'attribute', name: 'clout' },
      { kind: 'attribute', name: 'wisdom' },
      { kind: 'skill', name: 'Lockpicking' },
    ]);
    expect(res.frequencySpent).toBe(3);
    expect(res.character.attributes.frequency.level).toBe(freqBefore - 3);
    expect(res.character.skills[0].level).toBe(4);
  });

  it('rejects a pick that is not trainable', () => {
    const c = fixture(); // nothing marked
    expect(() => applyAdvancements(c, [{ kind: 'attribute', name: 'clout' }])).toThrow(AdvancementError);
  });

  it('rejects when the total cost would drop max Frequency below 1', () => {
    let c = fixture();
    c.attributes.frequency.level = 2;
    c.attributes.frequency.current = 2;
    c = markAttributeTrainable(c, 'clout');
    c = markAttributeTrainable(c, 'wisdom');
    // 2 picks cost 2; max is 2 → would land at 0 (< 1) → reject, all-or-nothing.
    expect(() => applyAdvancements(c, [
      { kind: 'attribute', name: 'clout' },
      { kind: 'attribute', name: 'wisdom' },
    ])).toThrow(AdvancementError);
  });

  it('rejects duplicate picks', () => {
    let c = fixture();
    c = markAttributeTrainable(c, 'clout');
    expect(() => applyAdvancements(c, [
      { kind: 'attribute', name: 'clout' },
      { kind: 'attribute', name: 'clout' },
    ])).toThrow(AdvancementError);
  });

  it('clearTrainables clears every mark', () => {
    let c = fixture();
    c = markAttributeTrainable(c, 'clout');
    c = markSkillTrainable(c, 'Lockpicking');
    c = clearTrainables(c);
    expect(listTrainables(c)).toEqual([]);
  });

  it('restLong clears remaining trainable marks and restores pools at the new max', () => {
    let c = fixture();
    c = markAttributeTrainable(c, 'clout');
    c = markSkillTrainable(c, 'Lockpicking');

    // Advance only clout (Freq 10 → 9); Lockpicking mark stays… until the rest.
    const advanced = applyAdvancements(c, [{ kind: 'attribute', name: 'clout' }]).character;
    const rested = restLong(advanced);

    expect(rested.applied).toBe(true);
    expect(listTrainables(rested.character)).toEqual([]); // ALL marks wiped
    // Pools refill at the NEW max Frequency (9, not 10).
    expect(rested.character.attributes.frequency.level).toBe(9);
    expect(rested.character.attributes.frequency.current).toBe(9);
    expect(rested.changes.some(ch => ch.includes('Trainable marks cleared'))).toBe(true);
  });
});
