import { describe, it, expect } from 'vitest';
import { detectInspectIntent, planInspection, inspectSteps, exposureByDomain, INSPECT_TUNING, type InspectAspect } from './inspect';

describe('detectInspectIntent — the player\'s words', () => {
  it('reads target and an optional named skill, first person only', () => {
    expect(detectInspectIntent('I inspect the sword')).toEqual({ target: 'sword', skill: null });
    expect(detectInspectIntent('I examine the map using my Cartography skill.')).toEqual({ target: 'map', skill: 'Cartography' });
    expect(detectInspectIntent('I inspect the sword with my swordsmanship')).toEqual({ target: 'sword', skill: 'swordsmanship' });
    expect(detectInspectIntent('I want to use my swordsmanship skill to inspect this sword')).toEqual({ target: 'sword', skill: 'swordsmanship' });
    expect(detectInspectIntent('I take a closer look at the old ring')).toEqual({ target: 'old ring', skill: null });
    expect(detectInspectIntent('I look at it with my eyes')).toEqual({ target: 'it', skill: null });
  });
  it('ignores narration, questions to others, and plain talk', () => {
    expect(detectInspectIntent('She inspects the sword')).toBeNull();
    expect(detectInspectIntent('"Can you inspect this?" I ask')).toBeNull();
    expect(detectInspectIntent('I draw my sword')).toBeNull();
    expect(detectInspectIntent('')).toBeNull();
  });
});

const sword: InspectAspect[] = [
  { key: 'identity', domains: ['divination'] },
  { key: 'appearance', domains: ['divination'] },
  { key: 'damage', domains: ['force'] },
  { key: 'hardness', domains: ['abjuration'] },
  { key: 'history', domains: ['divination'] },
  { key: 'value', domains: ['fortune'] },
  { key: 'ability:flame-tongue', domains: ['fortune', 'force'] },
];

describe('planInspection', () => {
  const swordsmanship = ['force', 'abjuration'];

  it('skilled success raises the skill\'s domains, scaled by margin over DR', () => {
    const at = (margin: number) => planInspection({ aspects: sword, skillDomains: swordsmanship, exposure: {}, current: {} }, { success: true, margin, skilled: true, witEffort: 0 });
    const lo = at(0);
    expect(lo.filter((w) => w.op === 'grow').map((w) => w.aspectKind)).toEqual(['damage', 'hardness', 'ability:flame-tongue']);
    expect(lo.every((w) => w.op !== 'grow' || w.times === 1)).toBe(true);
    const hi = at(9);
    expect(hi.find((w) => w.aspectKind === 'damage')).toMatchObject({ op: 'grow', times: inspectSteps(9) });
    expect(inspectSteps(9)).toBeGreaterThan(1);
    expect(inspectSteps(999)).toBe(INSPECT_TUNING.maxSteps);
  });

  it('a strong result flags adjacent aspects at F1 only ("it\'s a relic"), never history in full', () => {
    const w = planInspection({ aspects: sword, skillDomains: swordsmanship, exposure: {}, current: { history: 0.5 } }, { success: true, margin: INSPECT_TUNING.relicMargin, skilled: true, witEffort: 0 });
    expect(w.find((x) => x.aspectKind === 'value')).toEqual({ aspectKind: 'value', op: 'flag', score: INSPECT_TUNING.relicScore });
    expect(w.find((x) => x.aspectKind === 'history')).toBeUndefined(); // already known above F1 — never lowered
    const weak = planInspection({ aspects: sword, skillDomains: swordsmanship, exposure: {}, current: {} }, { success: true, margin: 1, skilled: true, witEffort: 0 });
    expect(weak.some((x) => x.op === 'flag')).toBe(false);
  });

  it('Wit effort reaches related aspects only where the domain has some familiarity', () => {
    const w = planInspection({ aspects: sword, skillDomains: swordsmanship, exposure: { fortune: 0.4 }, current: {} }, { success: true, margin: 1, skilled: true, witEffort: 2 });
    expect(w.find((x) => x.aspectKind === 'value')).toMatchObject({ op: 'grow', times: 1, why: 'wit' });
    expect(w.find((x) => x.aspectKind === 'history')).toBeUndefined(); // divination: no exposure
  });

  it('raw Wisdom cannot raise an aspect in a domain with zero exposure', () => {
    const w = planInspection({ aspects: sword, skillDomains: [], exposure: { divination: 0.3 }, current: {} }, { success: true, margin: 4, skilled: false, witEffort: 0 });
    expect(w.map((x) => x.aspectKind)).toEqual(['identity', 'appearance', 'history']);
    expect(w.every((x) => x.op === 'grow' && x.why === 'wisdom')).toBe(true);
    // the enchantment (fortune+force) stays closed to someone with no magic / combat exposure
    expect(w.some((x) => x.aspectKind.startsWith('ability'))).toBe(false);
  });

  it('failure = no gain; a bad failure leaves ONE wrong impression on an unknown aspect in reach', () => {
    const fail = planInspection({ aspects: sword, skillDomains: swordsmanship, exposure: {}, current: {} }, { success: false, margin: -2, skilled: true, witEffort: 0 });
    expect(fail).toEqual([]);
    const bad = planInspection({ aspects: sword, skillDomains: swordsmanship, exposure: {}, current: { damage: 0.6 } }, { success: false, margin: INSPECT_TUNING.wrongMargin, skilled: true, witEffort: 0 });
    expect(bad).toEqual([{ aspectKind: 'hardness', op: 'wrong' }]);
  });

  it('exposureByDomain = best score on any aspect tagged with the domain', () => {
    expect(exposureByDomain([{ aspectKind: 'damage', score: 0.3 }, { aspectKind: 'ability:x', score: 0.5 }, { aspectKind: 'history', score: 0.1 }]))
      .toMatchObject({ force: 0.3, fortune: 0.5, divination: 0.1 });
  });
});
