/** Completion stages after the sheet (2026-10-12; order 2026-10-16): order, gates, detection, age math. */
import { describe, it, expect } from 'vitest';
import {
  GENESIS_POST_SHEET_STAGES,
  briefAge,
  gateBlockedReason,
  isBuildPhaseStage,
  isGateBlocked,
  isGateStage,
  isPostSheetStage,
  missingStages,
  nextGenesisStage,
  normalizeStage,
  startingAgeFromLinks,
} from './genesis-stages';

const ALL = new Set<string>(GENESIS_POST_SHEET_STAGES);

describe('stage order (Mike 2026-10-16: look → world → memories → vines → portrait → done)', () => {
  it('runs AGE → APPEARANCE → WORLD → MEMORIES → VINES → PORTRAIT after the sheet, then Born', () => {
    expect([...GENESIS_POST_SHEET_STAGES]).toEqual(['AGE', 'APPEARANCE', 'WORLD', 'MEMORIES', 'VINES', 'PORTRAIT']);
    const walk: Array<string | null> = [];
    let s: string | null = 'BUILDING';
    while (s) { s = nextGenesisStage(s, ALL); walk.push(s); }
    expect(walk).toEqual(['AGE', 'APPEARANCE', 'WORLD', 'MEMORIES', 'VINES', 'PORTRAIT', null]);
  });

  it('skips stages the character already has, and never walks backwards', () => {
    const missing = new Set(['WORLD', 'VINES']);
    expect(nextGenesisStage('BUILDING', missing)).toBe('WORLD');
    expect(nextGenesisStage('WORLD', missing)).toBe('VINES');
    expect(nextGenesisStage('VINES', missing)).toBeNull();
    expect(nextGenesisStage('MEMORIES', new Set(['AGE']))).toBeNull();
  });

  it('legacy stage names on in-flight sessions map into WORLD', () => {
    expect(normalizeStage('POSSESSIONS')).toBe('WORLD');
    expect(normalizeStage('SEEDS')).toBe('WORLD');
    expect(normalizeStage('WORLD_FACTS')).toBe('WORLD');
    expect(isPostSheetStage('SEEDS')).toBe(true);
    expect(nextGenesisStage('SEEDS', ALL)).toBe('MEMORIES');
  });

  it('unknown evidence walks every later stage (the PORTRAIT gate only when it is on); PRODDING / legacy stages are not build-phase', () => {
    expect(nextGenesisStage('WORLD', null)).toBe('MEMORIES');
    expect(nextGenesisStage('VINES', null)).toBeNull();
    expect(nextGenesisStage('VINES', null, { portraitGate: true })).toBe('PORTRAIT');
    expect(isBuildPhaseStage('BUILDING')).toBe(true);
    expect(isBuildPhaseStage('VINES')).toBe(true);
    expect(isBuildPhaseStage('PRODDING')).toBe(false);
    expect(isBuildPhaseStage(null)).toBe(false);
  });

  it('APPEARANCE and PORTRAIT are gates a person settles at the designer', () => {
    expect(isGateStage('APPEARANCE')).toBe(true);
    expect(isGateStage('PORTRAIT')).toBe(true);
    expect(isGateStage('WORLD')).toBe(false);
    expect(isGateBlocked(gateBlockedReason('APPEARANCE'))).toBe(true);
    expect(gateBlockedReason('APPEARANCE')).toMatch(/face and body/);
    expect(isGateBlocked('waiting on the GM — prods')).toBe(false);
  });
});

describe('age is additive', () => {
  it('sums instance years over roots + branches; seeds add 0; instance years beat the archetype', () => {
    expect(startingAgeFromLinks([
      { type: 'seed', instanceYears: null, archetypeYears: 30 },
      { type: 'root', instanceYears: 17, archetypeYears: 18 },
      { type: 'branch', instanceYears: null, archetypeYears: 2 },
      { type: 'branch', instanceYears: null, archetypeYears: 6 },
      { type: 'thorn', instanceYears: 9, archetypeYears: 9 },
    ])).toBe(25);
  });

  it('reads AGE from the brief', () => {
    expect(briefAge('NAME: Violet\nAGE: 25\nSEED PREFERENCE: Human')).toBe(25);
    expect(briefAge('no age here')).toBeNull();
  });
});

describe('missing stages', () => {
  const none = { stamps: {}, ageOk: false, heldItems: 0, ownsEdges: 0, npcSeeds: 0, placeEdges: 0, vines: 0 };
  it('a born character with nothing lacks every stage but the portrait gate (off until it exists)', () => {
    expect([...missingStages(none)]).toEqual(['AGE', 'APPEARANCE', 'WORLD', 'MEMORIES', 'VINES']);
    expect([...missingStages({ ...none, portraitGate: true })]).toContain('PORTRAIT');
  });
  it('evidence or a stamp settles a stage; WORLD needs things AND people/places, or its legacy stamps', () => {
    const m = missingStages({ ...none, ageOk: true, lookOk: true, ownsEdges: 1, npcSeeds: 2, vines: 3, stamps: { MEMORIES: 'x' }, portraitGate: true, portraitOk: true });
    expect(m.size).toBe(0);
    expect([...missingStages({ ...none, ownsEdges: 1 })]).toContain('WORLD');
    expect([...missingStages({ ...none, stamps: { POSSESSIONS: 'x', SEEDS: 'x', WORLD_FACTS: 'x' } })]).not.toContain('WORLD');
    expect([...missingStages({ ...none, stamps: { WORLD: 'x', VINES: 'x' } })]).toEqual(['AGE', 'APPEARANCE', 'MEMORIES']);
  });
  it('the look is a gate: an approved face + body passes it', () => {
    expect([...missingStages({ ...none, lookOk: true })]).not.toContain('APPEARANCE');
  });
});
