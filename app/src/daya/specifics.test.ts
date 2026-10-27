import { describe, it, expect } from 'vitest';
import { competingSpecific } from './specifics';

describe('competingSpecific (HW8 run 7 #6)', () => {
  const memory = ['I order from the same pizza place every day. Hawaiian plus black olives.'];
  it('catches the pepperoni invented against a recalled Hawaiian pizza', () => {
    const c = competingSpecific('He remembered the extra pepperoni on the pizza.', memory);
    expect(c?.kind).toBe('food');
    expect(c?.known).toContain('hawaiian');
  });
  it('lets a sentence that agrees with memory, or touches a different thing, stand', () => {
    expect(competingSpecific('The Hawaiian pizza, olives and all.', memory)).toBeNull();
    expect(competingSpecific('The radiator ticks twice.', memory)).toBeNull();
  });
});
