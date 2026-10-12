/** Genesis build cycles carry the archetype law, reuse-first, and rejected shapes. */
import { describe, it, expect } from 'vitest';
import { planWorkCycle, catalogGuidance } from './work-cycle-text';

const session = { id: 's1', goal: 'Character genesis: Violet [ch1]', plan: 'BRIEF', cycleCount: 3, stage: 'BUILDING' };

describe('drafting guidance in a genesis build cycle', () => {
  it('carries the law, the campaign blocks to reuse, and rejected shapes verbatim', () => {
    const { text } = planWorkCycle(session, [], '', [], { counts: {}, total: 0 }, {
      campaignBlocks: [{ type: 'root', name: 'Raised by Grandmother' }],
      rejected: ['root "Raised by Rosemary" — generalise Rosemary'],
    });
    expect(text).toContain('ARCHETYPE LAW');
    expect(text).toContain('REUSE FIRST, EVEN WHEN DRAFTING');
    expect(text).toContain('CAMPAIGN BLOCKS (attach_block before drafting): root "Raised by Grandmother"');
    expect(text).toContain('- root "Raised by Rosemary" — generalise Rosemary');
  });
  it('the near-empty catalog line no longer says draft everything directly', () => {
    const g = catalogGuidance({ counts: { seed: 1 }, total: 1 });
    expect(g.line).toContain('attach_block');
    expect(g.line).toContain('true gaps');
  });
  it('a PRODDING cycle carries none of it', () => {
    const { text } = planWorkCycle({ ...session, stage: 'PRODDING' }, [], '', [], null, { rejected: ['x'] });
    expect(text).not.toContain('ARCHETYPE LAW');
  });
});
