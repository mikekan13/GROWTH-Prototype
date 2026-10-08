import { describe, it, expect } from 'vitest';
import { clampCamera, clampCameraToContent, contentBoxOf, maxZoomForContent } from './camera-bounds';

const VP = { baseW: 1000, baseH: 500 };
const PAD = 250;
const BOX = { minX: 0, minY: 0, maxX: 4000, maxY: 2000 };

describe('camera-bounds', () => {
  it('leaves a camera inside the content alone', () => {
    expect(clampCamera({ x: 1000, y: 500 }, 1, VP, BOX, PAD)).toEqual({ x: 1000, y: 500 });
  });

  it('stops past each edge with the viewport centre on the content edge (zoomed in)', () => {
    // viewport 1000×500 → half 500×250; margin = min(half, pad) = 250×250
    expect(clampCamera({ x: -1e6, y: 1000 }, 1, VP, BOX, PAD).x).toBe(-250);
    expect(clampCamera({ x: 1e6, y: 1000 }, 1, VP, BOX, PAD).x).toBe(4000 + 250 - 1000);
    expect(clampCamera({ x: 1000, y: -1e6 }, 1, VP, BOX, PAD).y).toBe(-250);
    expect(clampCamera({ x: 1000, y: 1e6 }, 1, VP, BOX, PAD).y).toBe(2000 + 250 - 500);
  });

  it('a camera stranded far away comes back overlapping content', () => {
    const c = clampCamera({ x: 1e6, y: 1e6 }, 0.5, VP, BOX, PAD);
    // viewport 500×250; centre must be inside the box
    expect(c.x + 250).toBeLessThanOrEqual(4000);
    expect(c.y + 125).toBeLessThanOrEqual(2000);
  });

  it('zoomed out beyond the content: centred on it', () => {
    const c = clampCamera({ x: 123, y: -999 }, 10, VP, BOX, PAD); // 10000×5000 view
    expect(c).toEqual({ x: 2000 - 5000, y: 1000 - 2500 });
  });

  it('content smaller than the viewport is centred', () => {
    const small = { minX: 100, minY: 100, maxX: 300, maxY: 200 };
    expect(clampCamera({ x: 5000, y: 5000 }, 1, VP, small, 50)).toEqual({ x: 200 - 500, y: 150 - 250 });
  });

  it('empty campaign: no clamp, no zoom ceiling', () => {
    expect(clampCamera({ x: 1e6, y: -1e6 }, 1, VP, null, PAD)).toEqual({ x: 1e6, y: -1e6 });
    expect(contentBoxOf([])).toBeNull();
    expect(maxZoomForContent(null, 1000, 500, PAD)).toBe(Infinity);
  });

  it('zoom-out ceiling fits content + pad on both axes', () => {
    // (4000+500)/1000 = 4.5 ; (2000+500)/500 = 5 → 5
    expect(maxZoomForContent(BOX, 1000, 500, PAD)).toBe(5);
    // at the ceiling the camera is pinned (centred) on both axes
    const c = clampCamera({ x: -1e5, y: 1e5 }, 5, VP, BOX, PAD);
    expect(c).toEqual({ x: 2000 - 2500, y: 1000 - 1250 });
  });

  it('an empty corner of the bounding box is not a resting place: snaps to the nearest content', () => {
    // content top-left and bottom-right; bottom-left corner is void
    const rects = [
      { x: 0, y: 0, width: 400, height: 200 },
      { x: 3600, y: 1800, width: 400, height: 200 },
    ];
    const c = clampCameraToContent({ x: -1e6, y: 1e6 }, 1, VP, rects, PAD);
    const shows = (r: { x: number; y: number; width: number; height: number }) =>
      r.x < c.x + 1000 && r.x + r.width > c.x && r.y < c.y + 500 && r.y + r.height > c.y;
    expect(rects.some(shows)).toBe(true);
    // a camera already showing content is left alone
    expect(clampCameraToContent({ x: 0, y: 0 }, 1, VP, rects, PAD)).toEqual({ x: 0, y: 0 });
    // empty → untouched
    expect(clampCameraToContent({ x: 9, y: 9 }, 1, VP, [], PAD)).toEqual({ x: 9, y: 9 });
  });

  it('contentBoxOf unions rects and skips non-finite ones', () => {
    expect(contentBoxOf([
      { x: 0, y: 0, width: 10, height: 10 },
      { x: -5, y: 20, width: 10, height: 10 },
      { x: NaN, y: 0, width: 1, height: 1 },
    ])).toEqual({ minX: -5, minY: 0, maxX: 10, maxY: 30 });
  });
});
