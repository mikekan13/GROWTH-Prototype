import { describe, it, expect } from 'vitest';
import { sizeLien, computeThornLienDeathRouting, applyThornLienRouting } from './thorn-imposition';
import type { GrowthTrait } from '@/types/growth';

/**
 * Thorn liens (Mike rulings 2026-08-19 / 2026-08-21).
 *
 * SIZING LAW: lien = min(Kai's grade of the wound, the winner's attested
 * stake). Zero-stake winner = scar with no creditor.
 *
 * DEATH ROUTING (by the thorn's pillar, like everything else in death):
 *   body      → removed, holder paid the FULL lienKV
 *   soul      → holder paid floor(half); "(faded)" successor with the
 *               remaining half rides the Spirit Package (same holder)
 *   spirit    → untouched — rides forward with its full lien
 *   fated-age → removed with NO payment (Tara's claim IS the collection)
 */

function thorn(overrides: Partial<GrowthTrait>): GrowthTrait {
  return {
    name: 'Shattered Knee',
    type: 'thorn',
    category: 'injury',
    description: 'The bearer favors one leg.',
    pillar: 'body',
    lienHolderGodHeadId: 'gh-rival',
    lienHolderName: 'The Rival',
    lienKV: 100,
    lienOrigin: 'opposition-win',
    ...overrides,
  };
}

describe('lien sizing (staked-claims law, 2026-08-21)', () => {
  it('lien = the stake when the stake is smaller than the grade', () => {
    expect(sizeLien(100, 40)).toBe(40);
  });

  it('lien = the grade when the winner over-staked', () => {
    expect(sizeLien(35, 900)).toBe(35);
  });

  it('equal grade and stake pass through', () => {
    expect(sizeLien(50, 50)).toBe(50);
  });

  it('zero-stake winner = scar with no creditor (lien 0)', () => {
    expect(sizeLien(80, 0)).toBe(0);
  });

  it('never negative, and fractional inputs floor', () => {
    expect(sizeLien(10, -5)).toBe(0);
    expect(sizeLien(7.9, 7.2)).toBe(7);
  });
});

describe('death routing — body thorn', () => {
  it('removed and holder paid the FULL lienKV', () => {
    const orders = computeThornLienDeathRouting([thorn({ pillar: 'body', lienKV: 100 })]);
    expect(orders).toHaveLength(1);
    expect(orders[0].payKV).toBe(100);
    expect(orders[0].traitAction).toBe('remove');
    expect(orders[0].holderGodHeadId).toBe('gh-rival');
    expect(orders[0].successor).toBeUndefined();
  });
});

describe('death routing — soul thorn (half + successor)', () => {
  it('holder paid floor(half); successor carries the remaining half', () => {
    const orders = computeThornLienDeathRouting([thorn({ pillar: 'soul', lienKV: 101, name: 'Grief of the Fallen' })]);
    expect(orders).toHaveLength(1);
    expect(orders[0].payKV).toBe(50); // floor(101/2)
    expect(orders[0].traitAction).toBe('replace');
    const successor = orders[0].successor!;
    expect(successor.lienKV).toBe(51); // remaining half — nothing created or lost
    expect(orders[0].payKV + (successor.lienKV ?? 0)).toBe(101);
    expect(successor.name).toBe('Grief of the Fallen (faded)');
    expect(successor.type).toBe('thorn');
    expect(successor.pillar).toBe('soul'); // pillar stays soul
    expect(successor.lienHolderGodHeadId).toBe('gh-rival'); // same holder
    expect(successor.description).toContain('Residue');
  });

  it('even lien splits exactly in half', () => {
    const orders = computeThornLienDeathRouting([thorn({ pillar: 'soul', lienKV: 100 })]);
    expect(orders[0].payKV).toBe(50);
    expect(orders[0].successor!.lienKV).toBe(50);
  });

  it('successor penalties are less severe: flats halve toward zero, zeroed mods drop', () => {
    const orders = computeThornLienDeathRouting([
      thorn({
        pillar: 'soul',
        rollModifiers: [
          { flat: -3, skillNamePattern: 'stealth' },
          { flat: -1, governorAttribute: 'willpower' },
        ],
      }),
    ]);
    const mods = orders[0].successor!.rollModifiers!;
    expect(mods).toHaveLength(1);
    expect(mods[0].flat).toBe(-1); // trunc(-3/2)
  });
});

describe('death routing — spirit thorn', () => {
  it('untouched: rides forward with its full lien, no payment', () => {
    const orders = computeThornLienDeathRouting([thorn({ pillar: 'spirit', lienKV: 77 })]);
    expect(orders).toHaveLength(1);
    expect(orders[0].payKV).toBe(0);
    expect(orders[0].traitAction).toBe('keep');
  });
});

describe("death routing — Tara's fated-age claim markers", () => {
  it('removed with NO payment, regardless of pillar — her claim IS the collection', () => {
    const orders = computeThornLienDeathRouting([
      thorn({ pillar: 'body', lienOrigin: 'fated-age', lienHolderGodHeadId: 'gh-tara', lienHolderName: 'Lady Death' }),
      thorn({ name: 'Marked Hour', pillar: 'soul', lienOrigin: 'fated-age', lienHolderGodHeadId: 'gh-tara' }),
    ]);
    expect(orders).toHaveLength(2);
    for (const o of orders) {
      expect(o.payKV).toBe(0);
      expect(o.traitAction).toBe('remove');
    }
  });
});

describe('death routing — non-liened content is invisible to it', () => {
  it('thorns without a lien, nectars, and blossoms produce no orders', () => {
    const orders = computeThornLienDeathRouting([
      thorn({ lienHolderGodHeadId: undefined, lienKV: undefined }), // scar with no creditor
      { name: 'Keen Eye', type: 'nectar', category: 'utility', description: 'x', pillar: 'body' },
      { name: 'Borrowed Grace', type: 'blossom', category: 'boost', description: 'x', pillar: 'spirit', kv: 10 },
    ]);
    expect(orders).toHaveLength(0);
  });
});

describe('applyThornLienRouting (trait side on the ghost)', () => {
  it('removes settled originals, appends the soul successor, keeps spirit liens', () => {
    const traits: GrowthTrait[] = [
      thorn({ name: 'Broken Oath', pillar: 'soul', lienKV: 60 }),
      thorn({ name: 'Undying Debt', pillar: 'spirit', lienKV: 30 }),
      { name: 'Keen Eye', type: 'nectar', category: 'utility', description: 'x', pillar: 'spirit' },
    ];
    const orders = computeThornLienDeathRouting(traits);
    const out = applyThornLienRouting(traits, orders);
    expect(out.map(t => t.name)).toEqual(['Undying Debt', 'Keen Eye', 'Broken Oath (faded)']);
    expect(out.find(t => t.name === 'Broken Oath (faded)')!.lienKV).toBe(30);
  });

  it('does not remove an unliened thorn that shares a settled thorn name', () => {
    const liened = thorn({ name: 'Scarred', pillar: 'soul', lienKV: 10 });
    const scar = thorn({ name: 'Scarred', lienHolderGodHeadId: undefined, lienKV: undefined, pillar: 'soul' });
    const orders = computeThornLienDeathRouting([liened, scar]);
    const out = applyThornLienRouting([liened, scar], orders);
    expect(out.filter(t => t.name === 'Scarred')).toHaveLength(1);
    expect(out.find(t => t.name === 'Scarred')!.lienHolderGodHeadId).toBeUndefined();
  });
});
