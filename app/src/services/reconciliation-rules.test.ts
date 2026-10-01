import { describe, it, expect } from 'vitest';
import { matchCandidate, presenceNeeds, estimatePlan, isCemented, titleCase, IMPROV_TUNING, type PlanItem } from './reconciliation-rules';
import { parseTableProse } from './table-prose';

const places = [
  { id: 'apt', name: 'Main Room', description: "Violet's living room — a couch, a window on the street." },
  { id: 'napoli', name: 'Napoli Slice', description: 'A pizza counter, two booths, a jukebox that only plays Sinatra.' },
  { id: 'inn', name: 'The Rusted Tankard', description: 'A lively inn: a long bar, a hearth, flame-licked meat and spiced mead.' },
];

describe('matchCandidate — reuse what the campaign already has', () => {
  it('finds the planned inn from the narration, and nothing for a place that does not exist', () => {
    expect(matchCandidate({ name: 'the inn', description: 'a lively inn with a bar, flame licked meat and spicy mead' }, places)?.id).toBe('inn');
    expect(matchCandidate({ name: 'the observatory', description: 'a brass telescope under a dome' }, places)).toBeNull();
  });
});

describe('presenceNeeds — people the prose introduces that the roster lacks', () => {
  const roster = [{ id: 'ruth', name: 'Ruth' }];
  it('the bright eyed lass needs an entity; Ruth does not; "someone present" is too vague to stub', () => {
    const p = parseTableProse('A bright eyed lass behind the bar gives you a wink. "Hey scruffy?" Ruth sighs. "Leave him." "Who goes there?"', roster);
    const needs = presenceNeeds(p);
    expect(needs).toHaveLength(1);
    expect(needs[0]).toMatchObject({ kind: 'npc', name: 'Bright Eyed Lass Behind The Bar' });
    expect(needs[0].description).toContain('gives you a wink');
  });
  it('titleCase drops the article', () => {
    expect(titleCase('a bright eyed lass')).toBe('Bright Eyed Lass');
  });
});

describe('estimatePlan — DoorDash rule: hold more than it is worth', () => {
  it('matched elements cost nothing; stubs are held at the over-estimate', () => {
    const plan: PlanItem[] = [
      { kind: 'location', description: 'inn', name: 'the inn', matchId: 'inn', matchName: 'The Rusted Tankard', baseKrma: 0 },
      { kind: 'npc', description: 'lass', name: 'Lass', matchId: null, matchName: null, baseKrma: IMPROV_TUNING.npcBaseKrma },
    ];
    const e = estimatePlan(plan);
    expect(e.real).toBe(IMPROV_TUNING.npcBaseKrma);
    expect(e.held).toBe(Math.ceil(IMPROV_TUNING.npcBaseKrma * IMPROV_TUNING.overEstimate));
    expect(e.held).toBeGreaterThan(e.real);
  });
});

describe('isCemented — the GM locks it in by building on it', () => {
  it('nothing resting on it = fluid; enough memories/vines/events = cemented', () => {
    expect(isCemented({ memories: 0, vines: 0, laterEvents: 0 })).toBe(false);
    expect(isCemented({ memories: 1, vines: 1, laterEvents: 1 })).toBe(true);
  });
});
