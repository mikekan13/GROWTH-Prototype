import { describe, it, expect } from 'vitest';
import { parseBridgePlan, tripProseFor, fallbackPlan, describeMinutes, BRIDGE_TUNING } from './bridge';

describe('parseBridgePlan — the forecast, bounded and ordered', () => {
  it('keeps steps in time order, drops names that are not travellers, bounds elapsed time', () => {
    const p = parseBridgePlan(`Here you go: {"elapsedMinutes": 35, "steps": [
      {"narration": "Violet reaches the inn's door.", "minutesFromStart": 30, "involves": ["Violet"]},
      {"narration": "Violet slips out past the bolted stairwell door.", "minutesFromStart": 0, "involves": ["Violet", "Stranger"]},
      {"narration": "The street is wet and half-lit.", "minutesFromStart": 10, "involves": []}
    ]}`, ['Violet']);
    expect(p).not.toBeNull();
    expect(p!.elapsedMinutes).toBe(35);
    expect(p!.steps.map(s => s.minutesFromStart)).toEqual([0, 10, 30]);
    expect(p!.steps[0].involves).toEqual(['Violet']);
    expect(p!.steps[1].involves).toEqual([]);
  });
  it('rejects junk and caps the step count and duration', () => {
    expect(parseBridgePlan('no json here', ['V'])).toBeNull();
    expect(parseBridgePlan('{"steps": []}', ['V'])).toBeNull();
    const many = { elapsedMinutes: 99999, steps: Array.from({ length: 12 }, (_, i) => ({ narration: `step ${i}`, minutesFromStart: i, involves: [] })) };
    const p = parseBridgePlan(JSON.stringify(many), ['V'])!;
    expect(p.steps).toHaveLength(BRIDGE_TUNING.maxSteps);
    expect(p.elapsedMinutes).toBe(BRIDGE_TUNING.maxElapsedMinutes);
  });
});

describe('tripProseFor — what one traveller lived', () => {
  it('includes the world\'s own steps and the traveller\'s, not another traveller\'s private steps', () => {
    const plan = { elapsedMinutes: 20, steps: [
      { narration: 'Violet leaves.', minutesFromStart: 0, involves: ['Violet'] },
      { narration: 'Danny stays behind, listening at the door.', minutesFromStart: 1, involves: ['Danny'] },
      { narration: 'Rain starts.', minutesFromStart: 5, involves: [] },
    ] };
    expect(tripProseFor(plan, 'Violet')).toBe('Violet leaves. Rain starts.');
    expect(tripProseFor(plan, 'Danny')).toBe('Danny stays behind, listening at the door. Rain starts.');
  });
});

describe('fallbackPlan / describeMinutes — no gap even without a forecast', () => {
  it('writes leave / way / arrive', () => {
    const p = fallbackPlan(['Violet'], 'Main Room', 'The Inn');
    expect(p.steps.map(s => s.narration)).toEqual(['Violet leaves Main Room.', 'Violet makes the way to The Inn.', 'Violet arrives at The Inn.']);
    expect(describeMinutes(20)).toBe('20 minutes');
    expect(describeMinutes(150)).toBe('2 hours and 30 minutes');
  });
});
