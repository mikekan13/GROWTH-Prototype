import { describe, it, expect } from 'vitest';
import { participantFromCharacter, parseState, emptyState } from './state';
import type { GrowthCharacter } from '@/types/growth';

function attr(level: number, current = level) {
  return { level, current, augmentPositive: 0, augmentNegative: 0 };
}

const sheet = {
  attributes: {
    clout: attr(30), celerity: attr(30, 12), constitution: attr(15),
    flow: attr(20), frequency: { level: 26, current: 19 }, focus: attr(30),
    willpower: attr(26), wisdom: attr(20), wit: attr(4),
  },
  skills: [{ name: 'Archery', level: 7, governors: ['celerity', 'focus', 'flow', 'wisdom'] }],
  creation: { seed: { baseFateDie: 'd8' } },
} as unknown as GrowthCharacter;

describe('participantFromCharacter', () => {
  it('derives pools by canon, gauges from max pools, attrs with currents, control by entityType', () => {
    const pc = participantFromCharacter({ id: 'v', name: 'V', entityType: 'PLAYER_CHARACTER', sheet, side: 'party', held: { id: 'it1', name: 'buckler', baseResist: 4, condition: 3 } });
    // Body 75/25 = 3; Spirit (20+30)/25 = 2 (Frequency excluded); Soul (26+20+4)/25 = 2
    expect(pc.pools).toEqual({ body: 3, spirit: 2, soul: 2 });
    expect(pc.gauges).toEqual({ celerity: 30, frequency: 26, wisdom: 20 });
    expect(pc.attrs.celerity).toEqual({ current: 12, max: 30 });
    expect(pc.attrs.frequency).toEqual({ current: 19, max: 26 });
    expect(pc.control).toBe('player');
    expect(pc.heldResist).toBe(4);
    expect(pc.heldCondition).toBe(3);
    // Broken (1) = half resist; Destroyed (0) = none
    expect(participantFromCharacter({ id: 'x', name: 'X', entityType: 'NPC', sheet, side: 'a', held: { id: 'i', name: 'b', baseResist: 5, condition: 1 } }).heldResist).toBe(2);
    expect(participantFromCharacter({ id: 'x', name: 'X', entityType: 'NPC', sheet, side: 'a', held: { id: 'i', name: 'b', baseResist: 5, condition: 0 } }).heldResist).toBe(0);
    expect(pc.skills[0].governors).toContain('wisdom');
    const npc = participantFromCharacter({ id: 'n', name: 'N', entityType: 'NPC', sheet: null, side: 'hostile' });
    expect(npc.control).toBe('branch');
    expect(npc.pools).toEqual({ body: 1, spirit: 1, soul: 1 });
    expect(npc.attrs.frequency).toEqual({ current: 0, max: 0 });
  });
  it('parseState tolerates garbage', () => {
    expect(parseState('not json')).toEqual(emptyState());
  });
});
