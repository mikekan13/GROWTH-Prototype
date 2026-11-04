import { describe, it, expect } from 'vitest';
import { nearestRosterName, rosterNamesIn } from './roster-match';

const K = { id: 'k', name: 'Kristopher' };
const V = { id: 'v', name: 'Violet' };
const roster = [V, K];

describe('nearestRosterName', () => {
  it('exact, case-insensitive', () => {
    expect(nearestRosterName('violet', roster)).toBe(V);
    expect(nearestRosterName('Kristopher', roster)).toBe(K);
  });
  it('Christopher -> Kristopher', () => {
    expect(nearestRosterName('Christopher', roster)).toBe(K);
  });
  it('Kristofer -> Kristopher', () => {
    expect(nearestRosterName('Kristofer', roster)).toBe(K);
  });
  it('possessive without apostrophe', () => {
    expect(nearestRosterName('Violets', roster)).toBe(V);
    expect(nearestRosterName("Violet's", roster)).toBe(V);
  });
  it('transposition', () => {
    expect(nearestRosterName('Voilet', roster)).toBe(V);
  });
  it('too short -> null', () => {
    expect(nearestRosterName('Vi', roster)).toBeNull();
  });
  it('ambiguous near miss -> null', () => {
    const r = [K, { id: 'k2', name: 'Kristopha' }];
    expect(nearestRosterName('Kristofer', r)).toBeNull();
  });
  it('unrelated name -> null', () => {
    expect(nearestRosterName('Daniel', roster)).toBeNull();
  });
});

describe('rosterNamesIn', () => {
  it('finds fuzzy and exact-ish hits with indices', () => {
    const text = 'Christopher sits in his car. Violets phone rings.';
    const hits = rosterNamesIn(text, roster);
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({ token: 'Christopher', index: 0, entry: K, exact: false });
    expect(hits[1]).toMatchObject({ token: 'Violets', index: text.indexOf('Violets'), entry: V, exact: false });
  });
});
