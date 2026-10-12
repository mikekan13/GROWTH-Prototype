/** Completion stages after the sheet (2026-10-12): order, detection, age math. */
import { describe, it, expect } from 'vitest';
import {
  GENESIS_POST_SHEET_STAGES,
  briefAge,
  isBuildPhaseStage,
  missingStages,
  nextGenesisStage,
  startingAgeFromLinks,
} from './genesis-stages';

const ALL = new Set<string>(GENESIS_POST_SHEET_STAGES);

describe('stage order', () => {
  it('runs AGE → POSSESSIONS → SEEDS → WORLD_FACTS → VINES after the sheet, then Born', () => {
    expect([...GENESIS_POST_SHEET_STAGES]).toEqual(['AGE', 'POSSESSIONS', 'SEEDS', 'WORLD_FACTS', 'VINES']);
    const walk: Array<string | null> = [];
    let s: string | null = 'BUILDING';
    while (s) { s = nextGenesisStage(s, ALL); walk.push(s); }
    expect(walk).toEqual(['AGE', 'POSSESSIONS', 'SEEDS', 'WORLD_FACTS', 'VINES', null]);
  });

  it('skips stages the character already has, and never walks backwards', () => {
    const missing = new Set(['POSSESSIONS', 'VINES']);
    expect(nextGenesisStage('BUILDING', missing)).toBe('POSSESSIONS');
    expect(nextGenesisStage('POSSESSIONS', missing)).toBe('VINES');
    expect(nextGenesisStage('VINES', missing)).toBeNull();
    expect(nextGenesisStage('SEEDS', new Set(['AGE']))).toBeNull();
  });

  it('unknown evidence walks every later stage; PRODDING / legacy stages are not build-phase', () => {
    expect(nextGenesisStage('SEEDS', null)).toBe('WORLD_FACTS');
    expect(isBuildPhaseStage('BUILDING')).toBe(true);
    expect(isBuildPhaseStage('VINES')).toBe(true);
    expect(isBuildPhaseStage('PRODDING')).toBe(false);
    expect(isBuildPhaseStage(null)).toBe(false);
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
  it('a born character with nothing (Violet) lacks every stage', () => {
    expect([...missingStages(none)]).toEqual(['AGE', 'POSSESSIONS', 'SEEDS', 'WORLD_FACTS', 'VINES']);
  });
  it('evidence or a stamp settles a stage', () => {
    const m = missingStages({ ...none, ageOk: true, ownsEdges: 1, npcSeeds: 2, vines: 3, stamps: { WORLD_FACTS: 'x' } });
    expect(m.size).toBe(0);
    expect([...missingStages({ ...none, stamps: { POSSESSIONS: 'x', VINES: 'x' } })]).toEqual(['AGE', 'SEEDS', 'WORLD_FACTS']);
  });
});
