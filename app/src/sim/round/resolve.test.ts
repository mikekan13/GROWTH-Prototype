import { describe, it, expect } from 'vitest';
import { resolveRound, type CheckFn, type DamageFn, DEFAULT_DR } from './resolve';
import { buildSlots, slotInputsFor } from './slots';
import { orderSlots } from './ordering';
import type { Intention, Participant } from './types';

function p(id: string, over: Partial<Participant> = {}): Participant {
  return {
    id, name: id, side: 'x', control: 'branch',
    pools: { body: 1, spirit: 1, soul: 1 }, actionMod: 0,
    gauges: { celerity: 20, frequency: 20, wisdom: 20 },
    skills: [{ name: 'Sword', level: 6, governors: ['clout', 'celerity'] }, { name: 'Dodge', level: 6, governors: ['celerity', 'flow'] }, { name: 'Lore', level: 6, governors: ['wit'] }],
    fateDie: 'd8', heldResist: 0, heldItemName: null, downed: false, ...over,
  };
}

/** Deterministic check: total = fixed per participant (+skill level). */
function fixedCheck(totals: Record<string, number>): CheckFn {
  return ({ participant, skillName, dr, effort }) => {
    const total = (totals[participant.id] ?? 5) + effort;
    return { total, success: total >= dr, margin: total - dr, dr, isSkilled: !!skillName, effort };
  };
}

function damageSink(opts: { downAt?: number } = {}) {
  const calls: Array<{ targetId: string; amount: number; damageType: string; piercingTargetPath?: string[] }> = [];
  const fn: DamageFn = async ({ targetId, amount, damageType, piercingTargetPath }) => {
    calls.push({ targetId, amount, damageType, piercingTargetPath });
    const down = opts.downAt !== undefined && amount >= opts.downAt;
    return { summary: `${amount} to ${targetId}`, vitalDestroyed: down, frequencyOut: false };
  };
  return { fn, calls };
}

async function run(participants: Participant[], intentions: Intention[], check: CheckFn, dmg: DamageFn) {
  const slots = buildSlots(slotInputsFor(participants, intentions));
  const ordered = await orderSlots(slots, participants, intentions);
  return resolveRound(1, ordered, participants, intentions, { check, applyDamage: dmg });
}

describe('resolveRound', () => {
  it('a hit deals baseDamage + margin; consequences land in the slot; a downed creature loses later actions', async () => {
    const a = p('A', { pools: { body: 2, spirit: 1, soul: 1 }, gauges: { celerity: 60, frequency: 5, wisdom: 5 } });
    const b = p('B', { pools: { body: 1, spirit: 1, soul: 1 }, gauges: { celerity: 5, frequency: 5, wisdom: 5 } });
    const ints: Intention[] = [
      { id: 'a1', participantId: 'A', pillar: 'body', kind: 'attack', description: 'swings', skillName: 'Sword', targetId: 'B', damageType: 'slashing', baseDamage: 3 },
      { id: 'b1', participantId: 'B', pillar: 'body', kind: 'attack', description: 'stabs back', skillName: 'Sword', targetId: 'A', damageType: 'piercing', baseDamage: 3 },
    ];
    const sink = damageSink({ downAt: 1 });
    const r = await run([a, b], ints, fixedCheck({ A: 14, B: 14 }), sink.fn);
    // A has 4 actions vs B's 3 → A1 solo, then lockstep. A's slot-1 swing hits (14 vs 10) for 3 + 4 = 7.
    expect(sink.calls[0]).toMatchObject({ targetId: 'B', amount: 7, damageType: 'slashing' });
    expect(r.downed).toEqual(['B']);
    // B never gets to stab: all of B's later entries are skipped.
    expect(sink.calls.length).toBe(1);
    expect(r.log.some(l => l.kind === 'skip' && l.actorId === 'B')).toBe(true);
  });

  it('negate is contested: attacker must BEAT the negate total, ties go to the defender', async () => {
    const a = p('A'); const b = p('B');
    const ints: Intention[] = [
      { id: 'a1', participantId: 'A', pillar: 'body', kind: 'attack', description: 'swings', skillName: 'Sword', targetId: 'B', baseDamage: 2 },
      { id: 'b1', participantId: 'B', pillar: 'body', kind: 'negate', description: 'dodges', skillName: 'Dodge', targetId: 'A' },
    ];
    const sink = damageSink();
    const r = await run([a, b], ints, fixedCheck({ A: 15, B: 15 }), sink.fn);
    expect(sink.calls.length).toBe(0);
    expect(r.log.some(l => l.kind === 'negate' && /completely/.test(l.text))).toBe(true);
  });

  it('negate requires a governor in common with the attacking skill', async () => {
    const a = p('A'); const b = p('B');
    const ints: Intention[] = [
      { id: 'a1', participantId: 'A', pillar: 'body', kind: 'attack', description: 'swings', skillName: 'Sword', targetId: 'B', baseDamage: 2 },
      { id: 'b1', participantId: 'B', pillar: 'soul', kind: 'negate', description: 'recites', skillName: 'Lore', targetId: 'A' }, // wit only — no match
    ];
    const sink = damageSink();
    const r = await run([a, b], ints, fixedCheck({ A: 12, B: 30 }), sink.fn);
    expect(sink.calls.length).toBe(1); // the negate didn't apply; 12 ≥ 10 hits
    expect(r.log.some(l => /no governor in common/.test(l.text))).toBe(true);
  });

  it('deliberate block skips the speed gate and adds its total to the held resist', async () => {
    const a = p('A', { gauges: { celerity: 200, frequency: 5, wisdom: 5 } });
    const b = p('B', { heldResist: 6, heldItemName: 'shield', gauges: { celerity: 1, frequency: 1, wisdom: 1 } });
    const ints: Intention[] = [
      { id: 'a1', participantId: 'A', pillar: 'body', kind: 'attack', description: 'swings', skillName: 'Sword', targetId: 'B', baseDamage: 2 },
      { id: 'b1', participantId: 'B', pillar: 'body', kind: 'block', description: 'raises shield', skillName: 'Sword', targetId: 'A' },
    ];
    const sink = damageSink();
    // A: 14 vs DR 10 → hit for 2 + 4 = 6. B's block total 9 + resist 6 = 15 ≥ 6 → nothing through.
    await run([a, b], ints, fixedCheck({ A: 14, B: 9 }), sink.fn);
    expect(sink.calls.length).toBe(0);
  });

  it('reflex redirect: free, needs an action in hand, defender-favored speed gate; interposes the held item', async () => {
    const a = p('A', { gauges: { celerity: 20, frequency: 5, wisdom: 5 }, pools: { body: 1, spirit: 1, soul: 1 } });
    // B is slightly slower on raw gauge but the 1.25 advantage carries: 18 × 1.25 = 22.5 ≥ 20
    const b = p('B', { heldResist: 4, heldItemName: 'buckler', gauges: { celerity: 18, frequency: 5, wisdom: 5 }, pools: { body: 1, spirit: 1, soul: 1 } });
    const ints: Intention[] = [
      { id: 'a1', participantId: 'A', pillar: 'body', kind: 'attack', description: 'swings', skillName: 'Sword', targetId: 'B', baseDamage: 2, },
      { id: 'b1', participantId: 'B', pillar: 'soul', kind: 'reserve', description: 'waits', redirectTo: 'held' },
    ];
    const sink = damageSink();
    const r = await run([a, b], ints, fixedCheck({ A: 12, B: 5 }), sink.fn);
    // hit for 2 + 2 = 4; buckler absorbs 4 → nothing through
    expect(sink.calls.length).toBe(0);
    expect(r.log.some(l => l.kind === 'redirect' && /buckler/.test(l.text))).toBe(true);
  });

  it('too slow to react: the attack lands as declared', async () => {
    const a = p('A', { gauges: { celerity: 200, frequency: 5, wisdom: 5 } });
    const b = p('B', { heldResist: 4, heldItemName: 'buckler', gauges: { celerity: 10, frequency: 5, wisdom: 5 } });
    const ints: Intention[] = [
      { id: 'a1', participantId: 'A', pillar: 'body', kind: 'attack', description: 'swings', skillName: 'Sword', targetId: 'B', baseDamage: 2 },
      { id: 'b1', participantId: 'B', pillar: 'soul', kind: 'reserve', description: 'waits' },
    ];
    const sink = damageSink();
    const r = await run([a, b], ints, fixedCheck({ A: 12, B: 5 }), sink.fn);
    expect(sink.calls[0]?.amount).toBe(4);
    expect(r.log.some(l => /can't react in time/.test(l.text))).toBe(true);
  });

  it('default DR is the v0 reality fallback', () => {
    expect(DEFAULT_DR).toBe(10);
  });
});
