import { describe, it, expect } from 'vitest';
import { createDefaultCharacter } from '@/lib/defaults';
import { addTrait } from './character-actions';

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

  it('does not stamp duration fields on non-blossom traits', () => {
    let c = createDefaultCharacter('Trait Field Test');
    c.traits = [];
    c = addTrait(c, { name: 'Iron Will', type: 'nectar', pillar: 'soul', durationCycles: 3 }).character;
    const t = c.traits[0];
    expect(t.durationCycles).toBeUndefined();
    expect(t.expiresAtCycle).toBeUndefined();
  });
});
