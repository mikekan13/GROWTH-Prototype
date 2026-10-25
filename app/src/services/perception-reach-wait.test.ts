import { describe, it, expect } from 'vitest';
import { awaitLaneForReach, placeAtSource, throughWalls } from './perception-reach';

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

describe('a wall is a wall (HW7 2026-10-25): sight does not cross a closed door', () => {
  const landing = { kind: 'narration' as const, text: 'His smile widens.', sourceId: 'kris', locationId: 'landing', locationName: 'Fourth-floor landing' };
  const violet = { id: 'violet', name: 'Violet', locationId: 'main', locationName: 'Main Room', senses: { effectiveness: { sight: 1, hearing: 1 } } } as never;
  const doors = [{ name: 'Entry door', between: ['Main Room', 'Fourth-floor landing'], state: 'locked' }];
  it('sight comes off through a locked door; hearing stays; nothing left = not reached', () => {
    expect(throughWalls(landing, violet, { beingId: 'violet', reaches: true, via: ['sight', 'hearing'], noticed: true, salience: 0.5, clarity: { sight: 1, hearing: 1 } }, doors)).toMatchObject({ reaches: true, via: ['hearing'], clarity: { hearing: 1 } });
    expect(throughWalls(landing, violet, { beingId: 'violet', reaches: true, via: ['sight'], noticed: true, salience: 0.3 }, doors)).toMatchObject({ reaches: false, via: [] });
  });
  it('an open door, the same room, or the being\'s own act leave the verdict alone', () => {
    const v = { beingId: 'violet', reaches: true, via: ['sight'], noticed: true, salience: 0.3 };
    expect(throughWalls(landing, violet, v, [{ ...doors[0], state: 'open' }])).toBe(v);
    expect(throughWalls({ ...landing, locationId: 'main', locationName: 'Main Room' }, violet, v, doors)).toBe(v);
    expect(throughWalls(landing, violet, { ...v, via: ['self'] }, doors)).toMatchObject({ via: ['self'] });
  });
});
