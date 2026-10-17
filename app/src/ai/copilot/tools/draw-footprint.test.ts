/** draw_footprint: feet → map units (Mike 2026-10-17: JEWL draws places from their descriptions). */
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/services/placement-geometry', () => ({ setLocationGeometry: vi.fn() }));
vi.mock('./registry', () => ({ registerJewlTool: vi.fn() }));
vi.mock('./create-location', () => ({ resolveLocationRef: vi.fn() }));
const { outlineToFootprintPoints } = await import('./draw-footprint');

describe('draw_footprint', () => {
  it('an L-shaped 20×24 ft studio becomes map units at 0.05 ft/unit, area preserved', () => {
    const pts = outlineToFootprintPoints([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 24 }, { x: 8, y: 24 }, { x: 8, y: 14 }, { x: 0, y: 14 }]);
    expect(pts[1]).toEqual({ x: 400, y: 0 });
    expect(pts[2]).toEqual({ x: 400, y: 480 });
    expect(pts).toHaveLength(6);
  });
});
