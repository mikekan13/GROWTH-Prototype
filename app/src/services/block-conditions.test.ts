import { describe, it, expect } from 'vitest';
import { evaluateBlockConditions, buildConditionContext } from './block-conditions';

const ctx = buildConditionContext(
  { name: 'Elven' },
  [{ name: 'Raised by a Grandparent', data: { ageAdded: 17, attributes: { willpower: 2, wisdom: 1 }, skills: [{ name: 'Household Craft', level: 2 }] } }],
  [{ name: 'First Lease', data: { ageAdded: 1, attributes: { willpower: 1, focus: 1 }, skills: [{ name: 'Self-Sufficiency', level: 2 }], nectars: ['Fault Line Quiet'] } }],
);

describe('block-conditions (enforced, ruling 2026-08-19)', () => {
  it('assembles age, levels, skills, and trait names order-independently', () => {
    expect(ctx.age).toBe(18);
    expect(ctx.attributeLevels.willpower).toBe(3);
    expect(ctx.skillLevels['Household Craft']).toBe(2);
    expect(ctx.blocks).toContainEqual({ type: 'trait', name: 'Fault Line Quiet' });
  });

  it('requires: seed match passes and fails correctly', () => {
    expect(evaluateBlockConditions('X', { requires: [{ type: 'seed', name: 'elven' }] }, ctx).ok).toBe(true);
    const fail = evaluateBlockConditions('X', { requires: [{ type: 'seed', name: 'Dwarven' }] }, ctx);
    expect(fail.ok).toBe(false);
    expect(fail.failures[0]).toMatch(/requires seed Dwarven/);
  });

  it('requires: minAge uses summed ageAdded', () => {
    expect(evaluateBlockConditions('X', { requires: [{ type: 'minAge', years: 18 }] }, ctx).ok).toBe(true);
    expect(evaluateBlockConditions('X', { requires: [{ type: 'minAge', years: 21 }] }, ctx).ok).toBe(false);
  });

  it('requires: block and skill conditions', () => {
    expect(evaluateBlockConditions('X', { requires: [{ type: 'block', blockType: 'branch', name: 'First Lease' }] }, ctx).ok).toBe(true);
    expect(evaluateBlockConditions('X', { requires: [{ type: 'skill', name: 'household craft', min: 2 }] }, ctx).ok).toBe(true);
    expect(evaluateBlockConditions('X', { requires: [{ type: 'skill', name: 'Household Craft', min: 5 }] }, ctx).ok).toBe(false);
  });

  it('restricted: presence of the condition fails the block', () => {
    const r = evaluateBlockConditions('Ironborn Vow', { restricted: [{ type: 'seed', name: 'Elven' }] }, ctx);
    expect(r.ok).toBe(false);
    expect(r.failures[0]).toMatch(/restricted: seed Elven not allowed/);
  });

  it('attribute level condition reads assembled levels', () => {
    expect(evaluateBlockConditions('X', { requires: [{ type: 'attribute', name: 'willpower', min: 3 }] }, ctx).ok).toBe(true);
    expect(evaluateBlockConditions('X', { requires: [{ type: 'attribute', name: 'clout', min: 1 }] }, ctx).ok).toBe(false);
  });

  it('no conditions = ok', () => {
    expect(evaluateBlockConditions('X', {}, ctx).ok).toBe(true);
  });

  it('pool max: seed augs stack onto levels for attribute conditions', () => {
    const augCtx = buildConditionContext(
      { name: 'Elven', data: { attributes: { wit: 25 } } },
      [{ name: 'Scholar', data: { ageAdded: 20, attributes: { wit: 5 } } }],
      [],
    );
    expect(evaluateBlockConditions('X', { requires: [{ type: 'attribute', name: 'wit', min: 30 }] }, augCtx).ok).toBe(true);
    expect(evaluateBlockConditions('X', { requires: [{ type: 'attribute', name: 'wit', min: 31 }] }, augCtx).ok).toBe(false);
  });

  it('custom prose conditions fail closed as pending adjudications', () => {
    const r = evaluateBlockConditions('Oathbound', {
      requires: [{ type: 'custom', text: 'has taken a life' }],
      restricted: [{ type: 'custom', text: 'owns anything of iron' }],
    }, ctx);
    expect(r.ok).toBe(true); // no deterministic failure...
    expect(r.pendingAdjudications).toHaveLength(2); // ...but JEWL must clear both
    expect(r.pendingAdjudications[0]).toEqual({ blockName: 'Oathbound', mode: 'requires', text: 'has taken a life' });
    expect(r.pendingAdjudications[1].mode).toBe('restricted');
  });
});
