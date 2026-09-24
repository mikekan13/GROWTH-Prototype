import { describe, it, expect } from 'vitest';
import { classifyDomains, DOMAINS, pillarOfDomain } from './domains';
import { makeChain, parseChain, goalsTouched, EMPTY_CHAIN } from './chain';

describe('domain registry', () => {
  it('has exactly ten domains with unique keys; labels and seats blank until ruled', () => {
    expect(DOMAINS).toHaveLength(10);
    expect(new Set(DOMAINS.map(d => d.key)).size).toBe(10);
    expect(DOMAINS.every(d => d.label === null && d.pillar === null)).toBe(true); // blank until Mike names/seats them
  });
  it('classifies death text to Death, overlap allowed, ties by registry order', () => {
    const c = classifyDomains('Danny drives a fist into his gut — it connects. Mr. Carrasco goes down; he is dying.');
    expect(c.primary).toBe('dissolution');
    expect(c.all).toContain('force');
    expect(c.all.indexOf('dissolution')).toBeLessThan(c.all.indexOf('force'));
  });
  it('returns null primary on nothing matched; pillar null until seated', () => {
    expect(classifyDomains('the').primary).toBeNull();
    expect(pillarOfDomain('dissolution')).toBeNull();
  });
});

describe('memory chain', () => {
  it('makeChain dedupes and fills defaults; parseChain tolerates garbage', () => {
    const c = makeChain({ entities: ['a', 'a', 'b'], truthRefs: ['t'] });
    expect(c.entities).toEqual(['a', 'b']);
    expect(c.items).toEqual([]);
    expect(c.locationId).toBeNull();
    expect(parseChain('nope')).toEqual(EMPTY_CHAIN);
    expect(parseChain(JSON.stringify(c))).toEqual(c);
  });
  it('goalsTouched = keyword overlap with the goal description', () => {
    const goals = [{ id: 'g1', description: 'Collect the rent Danny owes before the month ends' }, { id: 'g2', description: 'Adopt the gray cat from the shelter' }];
    expect(goalsTouched('Danny still owes rent and the month is nearly over', goals)).toEqual(['g1']);
    expect(goalsTouched('A quiet afternoon in the library', goals)).toEqual([]);
  });
});
