import { describe, it, expect } from 'vitest';
import { resolveRound, type CheckFn, type DamageFn, type WearFn, DEFAULT_DR } from './resolve';
import { buildSlots, slotInputsFor } from './slots';
import { orderSlots } from './ordering';
import type { Intention, Participant } from './types';

const attrs = (): Participant['attrs'] => ({
  clout: { current: 10, max: 10 }, celerity: { current: 10, max: 10 }, constitution: { current: 10, max: 10 },
  flow: { current: 10, max: 10 }, frequency: { current: 20, max: 20 }, focus: { current: 10, max: 10 },
  willpower: { current: 10, max: 10 }, wisdom: { current: 10, max: 10 }, wit: { current: 10, max: 10 },
});

function p(id: string, over: Partial<Participant> = {}): Participant {
  return {
    id, name: id, side: 'x', control: 'branch',
    pools: { body: 1, spirit: 1, soul: 1 }, actionMod: 0,
    gauges: { celerity: 20, frequency: 20, wisdom: 20 },
    skills: [{ name: 'Sword', level: 6, governors: ['clout', 'celerity'] }, { name: 'Dodge', level: 6, governors: ['celerity', 'flow'] }, { name: 'Lore', level: 6, governors: ['wit'] }],
    fateDie: 'd8', attrs: attrs(), heldResist: 0, heldBaseResist: 0, heldCondition: 0, heldItemId: null, heldItemName: null, downed: false, ...over,
  };
}
const shield = (base: number, condition = 3): Partial<Participant> => ({ heldResist: base, heldBaseResist: base, heldCondition: condition, heldItemId: 'it1', heldItemName: 'shield' });

/** Deterministic check: total = fixed per participant (+effort). */
function fixedCheck(totals: Record<string, number>): CheckFn {
  return ({ participant, skillName, dr, effort, effortAttribute }) => {
    const total = (totals[participant.id] ?? 5) + effort;
    return { total, success: total >= dr, margin: total - dr, dr, isSkilled: !!skillName, effort, effortAttribute };
  };
}

function damageSink(opts: { downAt?: number; freqOutAt?: number; throwOn?: string } = {}) {
  const calls: Array<{ targetId: string; amount: number; damageType: string; piercingTargetPath?: string[] }> = [];
  const fn: DamageFn = async ({ targetId, amount, damageType, piercingTargetPath }) => {
    if (opts.throwOn === targetId) throw new Error('db exploded');
    calls.push({ targetId, amount, damageType, piercingTargetPath });
    return {
      summary: `${amount} to ${targetId}`,
      vitalDestroyed: opts.downAt !== undefined && amount >= opts.downAt,
      frequencyOut: opts.freqOutAt !== undefined && amount >= opts.freqOutAt,
    };
  };
  return { fn, calls };
}

async function run(participants: Participant[], intentions: Intention[], check: CheckFn, dmg: DamageFn, wearHeld?: WearFn) {
  const slots = buildSlots(slotInputsFor(participants, intentions));
  const ordered = await orderSlots(slots, participants, intentions);
  return resolveRound(1, ordered, participants, intentions, { check, applyDamage: dmg, wearHeld });
}

const atk = (id: string, who: string, target: string, over: Partial<Intention> = {}): Intention =>
  ({ id, participantId: who, pillar: 'body', kind: 'attack', description: 'swings', skillName: 'Sword', targetId: target, damageType: 'slashing', baseDamage: 2, ...over });
const reserve = (id: string, who: string, pillar: Intention['pillar'], over: Partial<Intention> = {}): Intention =>
  ({ id, participantId: who, pillar, kind: 'reserve', description: 'waits', ...over });

describe('resolveRound', () => {
  it('a hit deals baseDamage + margin; consequences land in the slot; a downed creature loses later actions', async () => {
    const a = p('A', { pools: { body: 2, spirit: 1, soul: 1 }, gauges: { celerity: 60, frequency: 5, wisdom: 5 } });
    const b = p('B', { gauges: { celerity: 5, frequency: 5, wisdom: 5 } });
    const sink = damageSink({ downAt: 1 });
    const r = await run([a, b], [atk('a1', 'A', 'B', { baseDamage: 3 }), atk('b1', 'B', 'A', { baseDamage: 3, damageType: 'piercing' })], fixedCheck({ A: 14, B: 14 }), sink.fn);
    expect(sink.calls[0]).toMatchObject({ targetId: 'B', amount: 7, damageType: 'slashing' });
    expect(r.downed).toEqual(['B']);
    expect(sink.calls.length).toBe(1);
    expect(r.log.some(l => l.kind === 'skip' && l.actorId === 'B')).toBe(true);
  });

  it('Frequency crossing to ≤ 0 downs the target (Facing Death trigger a)', async () => {
    const sink = damageSink({ freqOutAt: 1 });
    const r = await run([p('A', { gauges: { celerity: 60, frequency: 5, wisdom: 5 } }), p('B', { gauges: { celerity: 5, frequency: 5, wisdom: 5 } })], [atk('a1', 'A', 'B')], fixedCheck({ A: 14, B: 5 }), sink.fn);
    expect(r.downed).toEqual(['B']);
    expect(r.log.some(l => l.kind === 'downed' && /Frequency is gone/.test(l.text))).toBe(true);
  });

  it('negate is contested: attacker must BEAT the negate total, ties go to the defender', async () => {
    const sink = damageSink();
    const r = await run([p('A'), p('B')], [
      atk('a1', 'A', 'B'),
      { id: 'b1', participantId: 'B', pillar: 'body', kind: 'negate', description: 'dodges', skillName: 'Dodge', targetId: 'A' },
    ], fixedCheck({ A: 15, B: 15 }), sink.fn);
    expect(sink.calls.length).toBe(0);
    expect(r.log.some(l => l.kind === 'negate' && /completely/.test(l.text))).toBe(true);
  });

  it('a weak negate never makes the attack easier than the situational DR', async () => {
    const sink = damageSink();
    // negate total 4; attacker rolls 8 — beats 4 but NOT the DR 10 floor → miss
    const r = await run([p('A'), p('B')], [
      atk('a1', 'A', 'B'),
      { id: 'b1', participantId: 'B', pillar: 'body', kind: 'negate', description: 'dodges', skillName: 'Dodge', targetId: 'A' },
    ], fixedCheck({ A: 8, B: 4 }), sink.fn);
    expect(sink.calls.length).toBe(0);
    expect(r.log.find(l => l.kind === 'check')?.text).toMatch(/vs DR 10 → MISS/);
  });

  it('a negate that cannot apply (wrong governors / no skill) is NOT consumed and stays in hand', async () => {
    const sink = damageSink();
    const r1 = await run([p('A'), p('B')], [
      atk('a1', 'A', 'B'),
      { id: 'b1', participantId: 'B', pillar: 'soul', kind: 'negate', description: 'recites', skillName: 'Lore', targetId: 'A' },
    ], fixedCheck({ A: 12, B: 30 }), sink.fn);
    expect(sink.calls.length).toBe(1);
    expect(r1.log.some(l => /shares no governor/.test(l.text))).toBe(true);
    expect(r1.log.some(l => /stays readied to negate/.test(l.text))).toBe(true); // its own slot entry still shows it unused

    const sink2 = damageSink();
    const r2 = await run([p('A'), p('B')], [
      atk('a1', 'A', 'B'),
      { id: 'b1', participantId: 'B', pillar: 'body', kind: 'negate', description: 'flails', targetId: 'A' },
    ], fixedCheck({ A: 12, B: 30 }), sink2.fn);
    expect(sink2.calls.length).toBe(1);
    expect(r2.log.some(l => /has no skill/.test(l.text))).toBe(true);
  });

  it('a readied negate is consumed once — a second attacker in the same round is not negated', async () => {
    const a = p('A', { gauges: { celerity: 30, frequency: 5, wisdom: 5 } });
    const c = p('C', { gauges: { celerity: 25, frequency: 5, wisdom: 5 } });
    const b = p('B', { gauges: { celerity: 5, frequency: 5, wisdom: 5 } });
    const sink = damageSink();
    await run([a, b, c], [
      atk('a1', 'A', 'B'), atk('c1', 'C', 'B'),
      { id: 'b1', participantId: 'B', pillar: 'body', kind: 'negate', description: 'dodges', skillName: 'Dodge' },
    ], fixedCheck({ A: 12, C: 12, B: 20 }), sink.fn);
    expect(sink.calls.length).toBe(1);
  });

  it('deliberate block skips the speed gate, adds its total to the held resist, and needs something to interpose', async () => {
    const a = p('A', { gauges: { celerity: 200, frequency: 5, wisdom: 5 } });
    const b = p('B', { ...shield(6), gauges: { celerity: 1, frequency: 1, wisdom: 1 } });
    const blockInt: Intention = { id: 'b1', participantId: 'B', pillar: 'body', kind: 'block', description: 'raises shield', skillName: 'Sword', targetId: 'A' };
    const sink = damageSink();
    await run([a, b], [atk('a1', 'A', 'B'), blockInt], fixedCheck({ A: 14, B: 9 }), sink.fn);
    expect(sink.calls.length).toBe(0);

    const sink2 = damageSink();
    const r2 = await run([a, p('B', { gauges: { celerity: 1, frequency: 1, wisdom: 1 } })], [atk('a1', 'A', 'B'), blockInt], fixedCheck({ A: 14, B: 9 }), sink2.fn);
    expect(sink2.calls.length).toBe(1);
    expect(r2.log.some(l => /holds nothing to interpose/.test(l.text))).toBe(true);
  });

  it('the interposed item wears: a hit reaching its resist drops one condition tier; 3× destroys it', async () => {
    const worn: Array<{ condition: number; destroyed: boolean }> = [];
    const wear: WearFn = async ({ condition, destroyed }) => { worn.push({ condition, destroyed }); };
    const a = p('A', { gauges: { celerity: 20, frequency: 5, wisdom: 5 } });
    const b = p('B', { ...shield(4), gauges: { celerity: 20, frequency: 5, wisdom: 5 } });
    const sink = damageSink();
    // hit for 2 + 2 = 4 → reaches resist 4 → tick 3→2; 4 absorbed, nothing through
    const r = await run([a, b], [atk('a1', 'A', 'B'), reserve('b1', 'B', 'soul', { redirectTo: 'held' })], fixedCheck({ A: 12, B: 5 }), sink.fn, wear);
    expect(sink.calls.length).toBe(0);
    expect(worn).toEqual([{ condition: 2, destroyed: false }]);
    expect(r.log.some(l => /condition 3→2/.test(l.text))).toBe(true);

    const worn2: Array<{ condition: number; destroyed: boolean }> = [];
    const wear2: WearFn = async ({ condition, destroyed }) => { worn2.push({ condition, destroyed }); };
    const b2 = p('B', { ...shield(2), gauges: { celerity: 20, frequency: 5, wisdom: 5 } });
    const sink2 = damageSink();
    // hit for 2 + 4 = 6 ≥ 3×2 → destroyed; 2 absorbed, 4 through
    await run([a, b2], [atk('a1', 'A', 'B'), reserve('b1', 'B', 'soul', { redirectTo: 'held' })], fixedCheck({ A: 14, B: 5 }), sink2.fn, wear2);
    expect(worn2).toEqual([{ condition: 0, destroyed: true }]);
    expect(sink2.calls[0]?.amount).toBe(4);
    expect(b2.heldResist).toBe(0);
  });

  it('reflex redirect: free, defender-favored; a reserve action kept in hand still counts even if its slot passed', async () => {
    // Both have 2 actions. B is faster, so B's entries resolve first in each slot. B keeps
    // both actions in reserve — unspent — so when A attacks in the LAST slot B can still react.
    const a = p('A', { pools: { body: 1, spirit: 1, soul: 0 } as Participant['pools'], gauges: { celerity: 10, frequency: 5, wisdom: 5 } });
    const b = p('B', { ...shield(4), pools: { body: 1, spirit: 1, soul: 0 } as Participant['pools'], gauges: { celerity: 12, frequency: 5, wisdom: 5 } });
    const sink = damageSink();
    const r = await run([a, b], [
      reserve('a1', 'A', 'body'), atk('a2', 'A', 'B', { pillar: 'spirit', skillName: undefined, baseDamage: 2 }),
      reserve('b1', 'B', 'body', { redirectTo: 'held' }), reserve('b2', 'B', 'spirit'),
    ], fixedCheck({ A: 12, B: 5 }), sink.fn);
    expect(r.log.some(l => l.kind === 'redirect' && /shield/.test(l.text))).toBe(true);
    expect(sink.calls.length).toBe(0);
  });

  it("Mike's rule: no UNSPENT action → no redirect", async () => {
    // B has one action and spends it attacking first (faster); A then attacks B → B has nothing in hand.
    const a = p('A', { pools: { body: 1, spirit: 0, soul: 0 } as Participant['pools'], gauges: { celerity: 10, frequency: 5, wisdom: 5 } });
    const b = p('B', { ...shield(4), pools: { body: 1, spirit: 0, soul: 0 } as Participant['pools'], gauges: { celerity: 12, frequency: 5, wisdom: 5 } });
    const sink = damageSink();
    const r = await run([a, b], [atk('a1', 'A', 'B'), atk('b1', 'B', 'A')], fixedCheck({ A: 12, B: 5 }), sink.fn);
    expect(r.log.some(l => /no action left to react with/.test(l.text))).toBe(true);
    expect(sink.calls.find(c => c.targetId === 'B')?.amount).toBe(4);
  });

  it('speed gate bands: too slow = no reaction; near = constrained (held item only)', async () => {
    const fast = p('A', { gauges: { celerity: 200, frequency: 5, wisdom: 5 } });
    const slow = p('B', { ...shield(4), gauges: { celerity: 10, frequency: 5, wisdom: 5 } });
    const sink = damageSink();
    const r = await run([fast, slow], [atk('a1', 'A', 'B'), reserve('b1', 'B', 'soul')], fixedCheck({ A: 12, B: 5 }), sink.fn);
    expect(sink.calls[0]?.amount).toBe(4);
    expect(r.log.some(l => /can't react in time/.test(l.text))).toBe(true);

    // Attack speed = 20 × 1.0 (body) × 0.76 (tier 4 Sword? no — Sword is clout/celerity → tier 4 (4+1=5?)).
    // Use unskilled attack: tier 4 → ×0.76 → 15.2. Defender celerity 9 × 1.5 = 13.5 → ratio 0.89 → constrained.
    const mid = p('B', { ...shield(4), gauges: { celerity: 9, frequency: 5, wisdom: 5 } });
    const sink2 = damageSink();
    const r2 = await run([p('A', { gauges: { celerity: 20, frequency: 5, wisdom: 5 } }), mid], [atk('a1', 'A', 'B', { skillName: undefined }), reserve('b1', 'B', 'soul', { redirectTo: 'Left Eye' })], fixedCheck({ A: 12, B: 5 }), sink2.fn);
    expect(r2.log.some(l => /barely/.test(l.text))).toBe(true); // constrained → held item, not the chosen part
  });

  it('Effort reported by the check shows in the record', async () => {
    const sink = damageSink();
    const r = await run([p('A', { gauges: { celerity: 60, frequency: 5, wisdom: 5 } }), p('B', { gauges: { celerity: 5, frequency: 5, wisdom: 5 } })], [atk('a1', 'A', 'B', { effort: 3, effortAttribute: 'clout' })], fixedCheck({ A: 9, B: 5 }), sink.fn);
    expect(r.log.find(l => l.kind === 'check' && l.actorId === 'A')?.text).toMatch(/12 \+3 Effort from clout vs DR 10 → HIT/);
  });

  it('every consequential entry carries a diegetic narration with no numbers', async () => {
    const sink = damageSink();
    const r = await run([p('A', { gauges: { celerity: 60, frequency: 5, wisdom: 5 } }), p('B', { gauges: { celerity: 5, frequency: 5, wisdom: 5 } })], [atk('a1', 'A', 'B')], fixedCheck({ A: 14, B: 5 }), sink.fn);
    const narrated = r.log.filter(l => l.kind === 'check' || l.kind === 'damage');
    expect(narrated.length).toBeGreaterThan(0);
    for (const l of narrated) {
      expect(l.narration).toBeTruthy();
      expect(l.narration).not.toMatch(/\d/);
    }
  });

  it('a failure inside one action is logged and the round continues', async () => {
    const a = p('A', { pools: { body: 2, spirit: 1, soul: 1 }, gauges: { celerity: 60, frequency: 5, wisdom: 5 } });
    const b = p('B'); const c = p('C');
    const sink = damageSink({ throwOn: 'B' });
    const r = await run([a, b, c], [atk('a1', 'A', 'B'), atk('a2', 'A', 'C'), reserve('b1', 'B', 'body'), reserve('c1', 'C', 'body')], fixedCheck({ A: 14, B: 5, C: 5 }), sink.fn);
    expect(r.log.some(l => /could not be resolved: db exploded/.test(l.text))).toBe(true);
    expect(sink.calls.some(x => x.targetId === 'C')).toBe(true);
  });

  it('three-way: every living participant acts, order log lists each slot', async () => {
    const a = p('A', { pools: { body: 2, spirit: 1, soul: 1 } });
    const sink = damageSink();
    const r = await run([a, p('B'), p('C')], [atk('a1', 'A', 'B'), atk('b1', 'B', 'C'), atk('c1', 'C', 'A')], fixedCheck({ A: 11, B: 11, C: 11 }), sink.fn);
    expect(r.slots.length).toBe(4);
    expect(sink.calls.map(x => x.targetId).sort()).toEqual(['A', 'B', 'C']);
    expect(r.log.filter(l => l.kind === 'order').length).toBe(4);
  });

  it('default DR is the v0 reality fallback', () => {
    expect(DEFAULT_DR).toBe(10);
  });
});
