/**
 * Catalog-first only when there is a catalog (perf pass 2026-10-12).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: {} }));

import { catalogGuidance, planWorkCycle } from './work-cycle-text';

const session = { id: 's1', goal: 'Character genesis: Violet [c1] — gestate', plan: 'BRIEF', cycleCount: 3, stage: 'BUILDING' };

describe('catalogGuidance', () => {
  it('near-empty catalog → says so, names what exists, withholds search_catalog', () => {
    const g = catalogGuidance({ counts: { seed: 1 }, total: 1, entries: [{ type: 'seed', name: 'Human' }] });
    expect(g.excludedTools).toEqual(['search_catalog']);
    expect(g.line).toContain('empty for root/branch/skill/nectar/thorn/blossom/item');
    expect(g.line).toContain('seed "Human"');
    expect(g.line).toContain('Do NOT search');
  });

  it('a stocked catalog → one bulk search, empty kinds named, nothing withheld', () => {
    const g = catalogGuidance({ counts: { item: 120, skill: 40, nectar: 12 }, total: 172 });
    expect(g.excludedTools).toBeUndefined();
    expect(g.line).toContain('queries:[');
    expect(g.line).toContain('Empty for seed/root/branch/thorn/blossom');
  });
});

describe('planWorkCycle with a catalog snapshot', () => {
  it('a build cycle carries the CATALOG line and the exclusion', () => {
    const out = planWorkCycle(session, [], '', [], { counts: {}, total: 0 });
    expect(out.text).toContain('CATALOG: the stock catalog is empty');
    expect(out.excludedTools).toEqual(['search_catalog']);
  });

  it('no snapshot → the cycle text is unchanged', () => {
    const out = planWorkCycle(session, [], '', []);
    expect(out.text).not.toContain('CATALOG:');
    expect(out.excludedTools).toBeUndefined();
  });

  it('the prod stage never gets the catalog line', () => {
    const out = planWorkCycle({ ...session, stage: 'PRODDING' }, [], '', [], { counts: {}, total: 0 });
    expect(out.text).not.toContain('CATALOG:');
    expect(out.allowedTools).toEqual(['raise_prod', 'end_prod_round']);
  });
});
