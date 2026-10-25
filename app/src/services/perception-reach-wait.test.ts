import { describe, it, expect } from 'vitest';
import { awaitLaneForReach, placeAtSource } from './perception-reach';

describe('the judge waits for a cold lane and places an unplaced line at its source (HW7 2026-10-25)', () => {
  it('awaitLaneForReach polls until ready, and gives up at the wait', async () => {
    const phases = ['host', 'loading', 'ready'];
    const phase = await awaitLaneForReach(async () => ({ phase: phases.shift() ?? 'ready' }), 10_000, 1);
    expect(phase).toBe('ready');
    expect(await awaitLaneForReach(async () => ({ phase: 'loading' }), 5, 1)).toBe('loading');
    expect(await awaitLaneForReach(async () => ({ phase: 'offline' }), 10_000, 1)).toBe('offline');
  });
  it('placeAtSource: a line from a known being happens where that being is; a placed or sourceless line is left alone', () => {
    const beings = [{ id: 'kris', name: 'Kristopher', locationId: 'landing', locationName: 'Landing', senses: { effectiveness: { sight: 1, hearing: 1 } } } as never];
    expect(placeAtSource({ kind: 'narration', text: 'He knocks.', sourceId: 'kris' }, beings)).toMatchObject({ locationId: 'landing', locationName: 'Landing' });
    expect(placeAtSource({ kind: 'narration', text: 'The radiator ticks.' }, beings).locationId).toBeUndefined();
    expect(placeAtSource({ kind: 'narration', text: 'He knocks.', sourceId: 'kris', locationId: 'hall' }, beings).locationId).toBe('hall');
  });
});
