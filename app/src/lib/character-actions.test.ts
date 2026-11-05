import { describe, it, expect } from 'vitest';
import { createDefaultCharacter } from '@/lib/defaults';
import { addTrait, spendAttribute } from './character-actions';

describe('addTrait — INV-07 Fate-Die cap + blossom duration (T23)', () => {
  it('blocks nectars/thorns beyond the Fate Die cap; blossoms are exempt', () => {
    let c = createDefaultCharacter('Trait Cap Test'); // baseFateDie d6 → cap 6
    c.traits = [];
    for (let i = 0; i < 6; i++) {
      c = addTrait(c, { name: `Trait ${i}`, type: i % 2 ? 'thorn' : 'nectar', pillar: 'body' }).character;
    }
    expect(c.traits.length).toBe(6);

    const blocked = addTrait(c, { name: 'One Too Many', type: 'nectar', pillar: 'soul' });
    expect(blocked.character.traits.length).toBe(6);
    expect(blocked.changes[0]).toContain('Trait cap reached');

    // Blossoms bypass the cap and carry their duration/expiry.
    const res = addTrait(c, {
      name: 'Borrowed Grace', type: 'blossom', pillar: 'spirit',
      durationCycles: 5, expiresAtCycle: 12,
    });
    expect(res.character.traits.length).toBe(7);
    const b = res.character.traits.find(t => t.type === 'blossom')!;
    expect(b.durationCycles).toBe(5);
    expect(b.expiresAtCycle).toBe(12);
  });

  it('T25 overflow chain: attribute → 0 applies its condition, excess depletes Frequency current', () => {
    const c = createDefaultCharacter('Overflow Test');
    c.attributes.clout.current = 2;
    c.attributes.frequency.current = 4;

    const res = spendAttribute(c, 'clout', 5); // 2 absorbed, 3 overflow
    expect(res.character.attributes.clout.current).toBe(0);
    expect(res.character.conditions.weak).toBe(true); // clout's depletion condition
    expect(res.character.attributes.frequency.current).toBe(1); // 4 − 3
    expect(res.changes.join(' ')).toContain('Overflow: 3 damage to Frequency');
    // INV-43: overflow is a Deplete — max Frequency untouched.
    expect(res.character.attributes.frequency.level).toBe(c.attributes.frequency.level);
  });

  it('does not stamp duration fields on non-blossom traits', () => {
    let c = createDefaultCharacter('Trait Field Test');
    c.traits = [];
    c = addTrait(c, { name: 'Iron Will', type: 'nectar', pillar: 'soul', durationCycles: 3 }).character;
    const t = c.traits[0];
    expect(t.durationCycles).toBeUndefined();
    expect(t.expiresAtCycle).toBeUndefined();
  });
});

// ── Dialed to Eleven (Michael 2026-11-05): trait mechanics as data ────────────
import { restoreAttribute, restShort, effortAllOrNothingViolation } from './character-actions';
import type { GrowthCharacter, GrowthTrait } from '@/types/growth';

const SOUL = ['willpower', 'wisdom', 'wit'] as const;
const dialed: GrowthTrait = {
  name: 'Dialed to Eleven', type: 'thorn', category: 'resolve', pillar: 'soul', description: 'Everything lands twice.',
  mechanics: [
    { kind: 'pool_multiplier', pools: [...SOUL], factor: 2, direction: 'both' },
    { kind: 'generate_blossom', when: { pool: 'willpower', at: 0 }, blossom: {
      name: 'Splitting', description: 'All or nothing.', pillar: 'soul',
      mechanics: [{ kind: 'effort_all_or_nothing' }],
      expiry: { kind: 'trigger', text: 'Willpower above 0', pool: 'willpower', above: 0 },
    } },
  ],
};
function kristopher(): GrowthCharacter {
  const c = createDefaultCharacter('Kristopher');
  c.traits = [dialed];
  for (const a of SOUL) { c.attributes[a].level = 10; c.attributes[a].augmentPositive = 0; c.attributes[a].augmentNegative = 0; c.attributes[a].current = 6; }
  c.attributes.frequency.level = 10; c.attributes.frequency.current = 10;
  return c;
}

describe('Dialed to Eleven mechanics', () => {
  it('doubles damage out; level untouched', () => {
    const r = spendAttribute(kristopher(), 'willpower', 2).character;
    expect(r.attributes.willpower.current).toBe(2);
    expect(r.attributes.willpower.level).toBe(10);
  });
  it('does not touch non-listed pools', () => {
    const c = kristopher(); c.attributes.clout.level = 10; c.attributes.clout.current = 6;
    expect(spendAttribute(c, 'clout', 2).character.attributes.clout.current).toBe(4);
  });
  it('doubles recovery, clamped at max', () => {
    const c = kristopher(); c.attributes.wit.current = 3;
    expect(restoreAttribute(c, 'wit', 2).character.attributes.wit.current).toBe(7);
    expect(restoreAttribute(c, 'wit', 9).character.attributes.wit.current).toBe(10);
  });
  it('exempt skips the multiplier', () => {
    expect(spendAttribute(kristopher(), 'wisdom', 2, { exempt: true }).character.attributes.wisdom.current).toBe(4);
  });
  it('overflow to Frequency is whatever spills, not doubled again', () => {
    const c = kristopher(); c.attributes.willpower.current = 3;
    const r = spendAttribute(c, 'willpower', 2).character; // 2 -> 4 > 3
    expect(r.attributes.willpower.current).toBe(0);
    expect(r.attributes.frequency.current).toBe(9);
  });
  it('Splitting is generated at Willpower 0, once, and removed above 0', () => {
    let c = kristopher(); c.attributes.willpower.current = 3;
    c = spendAttribute(c, 'willpower', 2).character;
    const live = () => c.traits.filter(t => t.name === 'Splitting');
    expect(live()).toHaveLength(1);
    expect(live()[0]).toMatchObject({ type: 'blossom', source: 'Dialed to Eleven', pillar: 'soul' });
    expect(live()[0].lienHolderGodHeadId).toBeUndefined();
    expect(live()[0].grantedByGodHeadId).toBeUndefined();
    c = spendAttribute(c, 'willpower', 1).character; // already 0: still once
    expect(live()).toHaveLength(1);
    expect(effortAllOrNothingViolation(c, 2, 5)).toContain('Splitting');
    expect(effortAllOrNothingViolation(c, 5, 5)).toBeNull();
    expect(effortAllOrNothingViolation(c, 0, 5)).toBeNull();
    c = restoreAttribute(c, 'willpower', 1).character; // doubled -> 2
    expect(c.attributes.willpower.current).toBe(2);
    expect(live()).toHaveLength(0);
    expect(effortAllOrNothingViolation(c, 2, 5)).toBeNull();
  });
  it('Short Rest gives 2 to Soul pools and 1 to others', () => {
    const c = kristopher(); c.attributes.clout.current = 3; c.attributes.clout.level = 10;
    c.attributes.willpower.current = 3;
    const r = restShort(c).character;
    expect(r.attributes.willpower.current).toBe(5);
    expect(r.attributes.clout.current).toBe(4);
    expect(r.attributes.frequency.current).toBe(9);
  });
});
