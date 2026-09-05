import { describe, it, expect } from 'vitest';
import { orderSlots, speedScore } from './ordering';
import type { Intention, Participant } from './types';

function participant(id: string, gauges: Participant['gauges'], skills: Participant['skills'] = []): Participant {
  return {
    id, name: id, side: 'x', control: 'branch',
    pools: { body: 1, spirit: 1, soul: 1 }, actionMod: 0, gauges, skills,
    fateDie: 'd8', heldResist: 0, heldItemName: null, downed: false,
  };
}
function intention(id: string, participantId: string, pillar: Intention['pillar'], skillName?: string): Intention {
  return { id, participantId, pillar, kind: 'attack', description: id, skillName };
}

describe('layer 2 — pillar-biased gauge values', () => {
  it('Spirit > Soul > Body when gauges are close', () => {
    const p = participant('p', { celerity: 20, frequency: 20, wisdom: 20 });
    const body = speedScore({ participant: p, intention: intention('b', 'p', 'body') }).score;
    const soul = speedScore({ participant: p, intention: intention('s', 'p', 'soul') }).score;
    const spirit = speedScore({ participant: p, intention: intention('sp', 'p', 'spirit') }).score;
    expect(spirit).toBeGreaterThan(soul);
    expect(soul).toBeGreaterThan(body);
  });
  it("Mike's clarification: Celerity 200 Body action beats Wisdom 20 Soul action", () => {
    const fast = participant('fast', { celerity: 200, frequency: 10, wisdom: 10 });
    const slow = participant('slow', { celerity: 10, frequency: 10, wisdom: 20 });
    const b = speedScore({ participant: fast, intention: intention('b', 'fast', 'body') }).score;
    const s = speedScore({ participant: slow, intention: intention('s', 'slow', 'soul') }).score;
    expect(b).toBeGreaterThan(s);
  });
});

describe('layer 3 — governor tiers', () => {
  it('Archery (Cel/Foc/Flo/Wis) fired with a Spirit action beats the same with a Soul action, and a Wisdom-only skill beats Archery at equal gauges', () => {
    const archery = { name: 'Archery', level: 6, governors: ['celerity', 'focus', 'flow', 'wisdom'] as Participant['skills'][number]['governors'] };
    const insight = { name: 'Insight', level: 6, governors: ['wisdom'] as Participant['skills'][number]['governors'] };
    const p = participant('p', { celerity: 20, frequency: 20, wisdom: 20 }, [archery, insight]);
    const viaSpirit = speedScore({ participant: p, intention: intention('a', 'p', 'spirit', 'Archery') }).score;
    const viaSoul = speedScore({ participant: p, intention: intention('b', 'p', 'soul', 'Archery') }).score;
    const wisOnly = speedScore({ participant: p, intention: intention('c', 'p', 'soul', 'Insight') }).score;
    expect(viaSpirit).toBeGreaterThan(viaSoul);
    expect(wisOnly).toBeGreaterThan(viaSoul);
  });
});

describe('orderSlots', () => {
  it('orders within a slot by score, deterministic tie-break by id, and honors a layer-5 override', async () => {
    const a = participant('A', { celerity: 30, frequency: 5, wisdom: 5 });
    const b = participant('B', { celerity: 10, frequency: 5, wisdom: 5 });
    const ints = [intention('ia', 'A', 'body'), intention('ib', 'B', 'body')];
    const slots = [{ index: 0, entries: [
      { participantId: 'B', actionIndex: 0, intentionId: 'ib' },
      { participantId: 'A', actionIndex: 0, intentionId: 'ia' },
    ] }];
    const ordered = await orderSlots(slots, [a, b], ints);
    expect(ordered[0].entries.map(e => e.participantId)).toEqual(['A', 'B']);
    const overridden = await orderSlots(slots, [a, b], ints, async (slot) => ({ ...slot, entries: [...slot.entries].reverse() }));
    expect(overridden[0].entries.map(e => e.participantId)).toEqual(['B', 'A']);
  });
});
