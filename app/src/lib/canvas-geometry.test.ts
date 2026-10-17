import { describe, it, expect } from 'vitest';
import {
  defaultFootprintFromRect, footprintBounds, isRectangular, fitPolygonToRect, pointInPolygon,
  parseFootprint, parsePassageLinks, parseTokenPosition, fractionToWorld, worldToFraction,
  tokenArea, autoLayoutGrid, autoLayoutRows, tokenMark, tokenRingColor, levelsPresent, visibleOnLevel,
  levelLabel, footprintSizeLabel, TOKEN_CELL, DEFAULT_SCALE_FT_PER_UNIT,
} from './canvas-geometry';

const rect = { x: -480, y: 360, width: 1000, height: 600 };
const L = { x: 0, y: 0 }, L2 = { x: 100, y: 0 }, L3 = { x: 100, y: 50 }, L4 = { x: 50, y: 50 }, L5 = { x: 50, y: 100 }, L6 = { x: 0, y: 100 };
const lShape = [L, L2, L3, L4, L5, L6];

describe('footprints', () => {
  it('default footprint is the folder rectangle, clockwise from the top-left', () => {
    const fp = defaultFootprintFromRect(rect, 4);
    expect(fp.points).toEqual([
      { x: -480, y: 360 }, { x: 520, y: 360 }, { x: 520, y: 960 }, { x: -480, y: 960 },
    ]);
    expect(fp.level).toBe(4);
    expect(fp.scale).toBe(DEFAULT_SCALE_FT_PER_UNIT);
    expect(isRectangular(fp.points)).toBe(true);
    expect(footprintBounds(fp.points)).toEqual(rect);
  });

  it('an L-shape is not rectangular and its bounds are the enclosing box', () => {
    expect(isRectangular(lShape)).toBe(false);
    expect(footprintBounds(lShape)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it('fits a polygon into the drawn rect, keeping the shape', () => {
    const fitted = fitPolygonToRect(lShape, { x: 1000, y: 2000, width: 200, height: 400 });
    expect(fitted[0]).toEqual({ x: 1000, y: 2000 });
    expect(fitted[1]).toEqual({ x: 1200, y: 2000 });
    expect(fitted[3]).toEqual({ x: 1100, y: 2200 });
    expect(fitted[4]).toEqual({ x: 1100, y: 2400 });
  });

  it('point in polygon: inside, outside, the notch, an edge', () => {
    expect(pointInPolygon({ x: 25, y: 25 }, lShape)).toBe(true);
    expect(pointInPolygon({ x: 25, y: 75 }, lShape)).toBe(true);
    expect(pointInPolygon({ x: 75, y: 75 }, lShape)).toBe(false); // the notch
    expect(pointInPolygon({ x: 150, y: 25 }, lShape)).toBe(false);
    expect(pointInPolygon({ x: 0, y: 50 }, lShape)).toBe(true); // on the left edge
    expect(pointInPolygon({ x: 1, y: 1 }, [L, L2])).toBe(false); // degenerate
  });

  it('parses a stored footprint and rejects junk', () => {
    expect(parseFootprint(null)).toBeNull();
    expect(parseFootprint({ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] })).toBeNull();
    expect(parseFootprint({ points: [{ x: 0, y: 0 }, { x: 1, y: 'a' }, { x: 1, y: 1 }] })).toBeNull();
    const fp = parseFootprint({ points: lShape, scale: 0.1, level: 2.2, height: 9.5 });
    expect(fp).toEqual({ points: lShape, scale: 0.1, level: 2, height: 9.5 });
    const defaults = parseFootprint({ points: lShape, scale: -1 });
    expect(defaults?.scale).toBe(DEFAULT_SCALE_FT_PER_UNIT);
    expect(defaults?.level).toBe(0);
    expect(defaults?.height).toBeUndefined();
  });

  it('parses passage links', () => {
    expect(parsePassageLinks(undefined)).toEqual([]);
    expect(parsePassageLinks([{ locationId: 'a', level: 1 }, { locationId: 3 }, { locationId: 'b', level: 0.4 }]))
      .toEqual([{ locationId: 'a', level: 1 }, { locationId: 'b', level: 0 }]);
  });

  it('labels', () => {
    expect(levelLabel(0)).toBe('G');
    expect(levelLabel(3)).toBe('L3');
    expect(levelLabel(-1)).toBe('B1');
    expect(footprintSizeLabel({ points: lShape, scale: 0.5, level: 0 })).toBe('50 × 50 ft');
  });
});

describe('tokens', () => {
  it('fraction ↔ world round-trips and clamps', () => {
    const box = { x: 100, y: 200, width: 400, height: 300 };
    expect(fractionToWorld({ x: 0.5, y: 0.25 }, box)).toEqual({ x: 300, y: 275 });
    expect(worldToFraction({ x: 300, y: 275 }, box)).toEqual({ x: 0.5, y: 0.25 });
    expect(worldToFraction({ x: -50, y: 9999 }, box)).toEqual({ x: 0, y: 1 });
    expect(fractionToWorld({ x: 2, y: -1 }, box)).toEqual({ x: 500, y: 200 });
    expect(parseTokenPosition({ x: 0.3, y: 1.7 })).toEqual({ x: 0.3, y: 1 });
    expect(parseTokenPosition({ x: 'a' })).toBeNull();
  });

  it('token area sits under the header with padding and never collapses', () => {
    const a = tokenArea({ x: 0, y: 0, width: 1000, height: 600 }, 142, 30);
    expect(a).toEqual({ x: 30, y: 172, width: 940, height: 398 });
    const tiny = tokenArea({ x: 0, y: 0, width: 50, height: 50 }, 142);
    expect(tiny.width).toBe(TOKEN_CELL);
    expect(tiny.height).toBe(TOKEN_CELL);
  });

  it('auto-layout grid: row-major, cell-centred, as many columns as fit', () => {
    const area = { x: 0, y: 0, width: 300, height: 300 };
    const pts = autoLayoutGrid(5, area, 100);
    expect(pts).toEqual([
      { x: 50, y: 50 }, { x: 150, y: 50 }, { x: 250, y: 50 },
      { x: 50, y: 150 }, { x: 150, y: 150 },
    ]);
    expect(autoLayoutRows(5, area, 100)).toBe(2);
    expect(autoLayoutGrid(0, area)).toEqual([]);
    // Narrower than one cell still yields one column.
    expect(autoLayoutGrid(2, { x: 0, y: 0, width: 10, height: 10 }, 100)).toEqual([{ x: 50, y: 50 }, { x: 50, y: 150 }]);
  });

  it('token marks', () => {
    expect(tokenMark('The desk lamp')).toBe('DL');
    expect(tokenMark("Rosemary's recipes")).toBe('RR');
    expect(tokenMark('Lamp')).toBe('LA');
    expect(tokenMark('Her writing machine')).toBe('WM');
    expect(tokenMark('')).toBe('?');
  });

  it('ring colours follow the pillars', () => {
    expect(tokenRingColor('weapon')).toBe('#f7525f');
    expect(tokenRingColor('consumable')).toBe('#582a72');
    expect(tokenRingColor('artifact')).toBe('#002f6c');
    expect(tokenRingColor('misc')).toBe('#22ab94');
    expect(tokenRingColor(undefined)).toBe('#22ab94');
  });
});

describe('levels', () => {
  const places = [
    { id: 'apt', level: 4 },
    { id: 'street', level: 0 },
    { id: 'stairs', level: 0, connects: [1, 2, 3, 4] },
  ];
  it('lists levels highest first, including those only a passage reaches', () => {
    expect(levelsPresent(places)).toEqual([4, 3, 2, 1, 0]);
  });
  it('a place shows on its level, a passage on every level it links, everything on ALL', () => {
    expect(visibleOnLevel(places[0], 4)).toBe(true);
    expect(visibleOnLevel(places[0], 0)).toBe(false);
    expect(visibleOnLevel(places[2], 3)).toBe(true);
    expect(visibleOnLevel(places[1], null)).toBe(true);
  });
});

describe('openings (doors, windows — 2026-10-17)', () => {
  it('a tapped door cycles closed → open → locked → closed', async () => {
    const { nextDoorState } = await import('./canvas-geometry');
    expect(nextDoorState('closed')).toBe('open');
    expect(nextDoorState('open')).toBe('locked');
    expect(nextDoorState('locked')).toBe('closed');
    expect(nextDoorState(undefined)).toBe('open');
  });
  it('parseOpenings keeps well-formed openings and drops the rest', async () => {
    const { parseOpenings } = await import('./canvas-geometry');
    const out = parseOpenings([
      { id: 'op-1', kind: 'door', a: { x: 0, y: 0 }, b: { x: 60, y: 0 }, between: ['Main Room', 'outside'], state: 'locked' },
      { id: 'op-2', kind: 'window', a: { x: 0, y: 0 }, b: { x: 80, y: 0 }, between: ['Main Room'] },
      { id: 'bad', kind: 'portal', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } },
      { kind: 'door', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } },
    ]);
    expect(out.map(o => o.id)).toEqual(['op-1', 'op-2']);
    expect(out[0].state).toBe('locked');
    expect(out[1].state).toBeUndefined();
  });
});

describe('grid snapping + walls (2026-10-17)', () => {
  it('walls snap to half-squares; people to square centres', async () => {
    const { snapOutline, cellCentre } = await import('./canvas-geometry');
    expect(snapOutline([{ x: 0.4, y: 0 }, { x: 19.8, y: 0 }, { x: 20, y: 8.2 }, { x: 0, y: 7.9 }])).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 7.5 }, { x: 0, y: 7.5 }]);
    expect(cellCentre(7.3, 5)).toBe(7.5);
    expect(cellCentre(12, 5)).toBe(12.5);
  });
  it('a door on the bathroom\'s outer wall joins the bathroom and OUTSIDE; on the shared wall it joins both rooms', async () => {
    const { openingSides, snapOpeningToWall, wallEdges } = await import('./canvas-geometry');
    const home = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 22 }, { x: 0, y: 22 }];
    const bath = { owner: 'Bathroom', points: [{ x: 0, y: 15 }, { x: 5, y: 15 }, { x: 5, y: 22 }, { x: 0, y: 22 }] };
    const main = { owner: 'Main Room', points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 22 }, { x: 5, y: 22 }, { x: 5, y: 15 }, { x: 0, y: 15 }] };
    expect(openingSides({ x: 0, y: 17 }, { x: 0, y: 20 }, [bath, main], home)).toEqual(['Bathroom', 'outside']);
    expect(openingSides({ x: 5, y: 17 }, { x: 5, y: 20 }, [bath, main], home).sort()).toEqual(['Bathroom', 'Main Room']);
    const snapped = snapOpeningToWall({ x: 4.6, y: 17 }, { x: 4.7, y: 20 }, wallEdges([bath, main]));
    expect(snapped.from.x).toBe(5);
    expect(snapped.to.x).toBe(5);
  });
});
