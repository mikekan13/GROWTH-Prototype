import { describe, it, expect } from 'vitest';
import { calculateCharacterTKV } from './kv-calculator';
import { calculateTKV } from '@/services/krma/evaluator';
import type { GrowthCharacter } from '@/types/growth';

/**
 * T16: the client lib (kv-calculator, browser-safe) and the server evaluator
 * (services/krma/evaluator) must compute IDENTICAL TKV — a divergence would let
 * the sheet show one number while the ledger charges another. This locks that
 * they agree, and that all four "locked" components (attribute augments, Fate
 * Die KV, Fated Age KV, seed-granted trait KV) are included (INV-22/25/26).
 */

type AttrKey =
  | 'clout' | 'celerity' | 'constitution'
  | 'flow' | 'frequency' | 'focus'
  | 'willpower' | 'wisdom' | 'wit';

function attr(level: number, augPos = 0, augNeg = 0) {
  return { level, current: level, augmentPositive: augPos, augmentNegative: augNeg };
}

// A rich fixture exercising every TKV component with hand-computable values:
//   body:      clout 4                                   = 4
//   spirit:    flow 3 + frequency 5                      = 8
//   soul:      willpower 6                               = 6
//   skills:    Sword lvl 4 (×1)                          = 4
//   magic:     Restoration lvl 2 (×2)                    = 4
//   bodyResist: 3 × 2                                    = 6
//   traits:    one nectar tagged "KV:15"                 = 15
//   augs:      clout augPos 2 + augNeg 1 (both count)    = 3
//   Fate Die:  d8                                        = 20
//   Fated Age: ceil(80 × 0.5)                            = 40
//   ------------------------------------------------------------
//   TOTAL                                                = 110
const fixture: GrowthCharacter = {
  attributes: {
    clout: attr(4, 2, 1), celerity: attr(0), constitution: attr(0),
    flow: attr(3), frequency: attr(5), focus: attr(0),
    willpower: attr(6), wisdom: attr(0), wit: attr(0),
  },
  skills: [{ name: 'Sword', level: 4, governors: ['clout'] }],
  traits: [{
    name: 'Blessed Edge', type: 'nectar', category: 'utility',
    description: 'test', pillar: 'body', mechanicalEffect: 'KV:15',
  }],
  magic: {
    mercy: { skillLevels: { restoration: 2 } },
    severity: { skillLevels: {} },
    balance: { skillLevels: {} },
  },
  vitals: { baseResist: 3 },
  creation: { seed: { baseFateDie: 'd8' }, fatedAge: 80 },
} as unknown as GrowthCharacter;

describe('TKV — client lib ⇄ server evaluator parity (T16)', () => {
  const lib = calculateCharacterTKV(fixture);
  const server = calculateTKV(fixture);

  it('matches the hand-computed total (all four locked components present)', () => {
    expect(lib.total).toBe(110);
  });

  it('client lib and server evaluator return identical totals', () => {
    expect(lib.total).toBe(server.total);
  });

  it('every subtotal agrees between the two implementations', () => {
    expect(lib.body.subtotal).toBe(server.body.subtotal);
    expect(lib.spirit.subtotal).toBe(server.spirit.subtotal);
    expect(lib.soul.subtotal).toBe(server.soul.subtotal);
    expect(lib.skillsTotal).toBe(server.skillsTotal);
    expect(lib.magicTotal).toBe(server.magicTotal);
    expect(lib.bodyResist.total).toBe(server.bodyResist.total);
    expect(lib.traitsTotal).toBe(server.traitsTotal);
    expect(lib.augs.total).toBe(server.augs.total);
    expect(lib.fateDie.kv).toBe(server.fateDie.kv);
    expect(lib.fatedAge.kv).toBe(server.fatedAge.kv);
  });

  it('the four locked components each contribute as expected', () => {
    expect(lib.augs.total).toBe(3);      // augPos 2 + augNeg 1
    expect(lib.fateDie.kv).toBe(20);     // d8
    expect(lib.fatedAge.kv).toBe(40);    // ceil(80 × 0.5)
    expect(lib.traitsTotal).toBe(15);    // seed-granted trait KV
  });
});
