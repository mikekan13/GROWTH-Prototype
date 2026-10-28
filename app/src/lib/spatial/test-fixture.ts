/** Test fixture — the live Incubator map: Violet's Apartment (3 rooms) and the fourth-floor landing. Not part of the public API. */
import type { DoorState, Point } from '@/lib/canvas-geometry';
import { buildLevelMap } from './level-map';
import type { LevelMap } from './types';

const P = (x: number, y: number): Point => ({ x, y });

export interface FixtureOpts {
  entry?: DoorState;
  bathroom?: DoorState;
  items?: Array<{ id: string; name: string; centre: Point; mapShapeFt?: { points: Point[] } | null }>;
}

/** The apartment + landing, with the entry and bathroom door states chosen per test. */
export function fixture(opts: FixtureOpts = {}): LevelMap {
  const entry = opts.entry ?? 'locked';
  const bathroom = opts.bathroom ?? 'closed';
  const fp = (points: Point[]) => ({ points, scale: 0.05, level: 0 });
  return buildLevelMap({
    level: 0,
    items: opts.items,
    locations: [
      {
        id: 'home', name: "Violet's Apartment",
        data: {
          footprint: fp([P(0, 600), P(400, 600), P(400, 1050), P(0, 1050)]),
          openings: [
            { id: 'op-1', kind: 'door', name: 'Entry door', a: P(0, 600), b: P(0, 700), between: ['Main Room', 'Fourth-floor landing'], state: entry },
            { id: 'op-2', kind: 'door', name: 'Bathroom door', a: P(100, 900), b: P(100, 1000), between: ['Bathroom', 'Main Room'], state: bathroom },
            { id: 'op-3', kind: 'archway', a: P(300, 600), b: P(300, 750), between: ['Kitchenette', 'Main Room'] },
            { id: 'op-4', kind: 'window', a: P(120, 1050), b: P(270, 1050), between: ['Main Room', 'outside'] },
          ],
        },
      },
      { id: 'main', name: 'Main Room', data: { footprint: fp([P(0, 600), P(300, 600), P(300, 750), P(400, 750), P(400, 1050), P(100, 1050), P(100, 900), P(0, 900)]) } },
      { id: 'kitchen', name: 'Kitchenette', data: { footprint: fp([P(300, 600), P(400, 600), P(400, 750), P(300, 750)]) } },
      { id: 'bath', name: 'Bathroom', data: { footprint: fp([P(0, 900), P(100, 900), P(100, 1050), P(0, 1050)]) } },
      {
        id: 'landing', name: 'Fourth-floor landing',
        data: {
          footprint: fp([P(-200, 600), P(0, 600), P(0, 1000), P(-200, 1000)]),
          openings: [{ id: 'op-5', kind: 'opening', a: P(-200, 900), b: P(-200, 1000), between: ['Fourth-floor landing', 'stairs down'] }],
        },
      },
    ],
  });
}

export { P };
