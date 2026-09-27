import { describe, it, expect } from 'vitest';
import { layoutForest, LAYOUT, type LayoutNode } from './canvas-layout';

const room = (id: string, itemCount: number, characterIds: string[] = []): LayoutNode => ({ id, name: id, status: 'PLANNING', children: [], itemCount, characterIds });

describe('layoutForest — geometry the renderer will agree with', () => {
  const apartment: LayoutNode = { id: 'apt', name: 'apt', status: 'PLANNING', children: [room('main', 20, ['violet', 'danny']), room('kitchen', 8), room('bath', 11)], itemCount: 0, characterIds: [] };
  const building: LayoutNode = { id: 'arms', name: 'arms', status: 'PLANNING', children: [apartment], itemCount: 0, characterIds: [] };
  const block: LayoutNode = { id: 'block', name: 'block', status: 'PLANNING', children: [building, room('shelter', 0), room('napoli', 0)], itemCount: 0, characterIds: [] };

  it('everything sits below the line, rooms do not overlap, and characters sit inside their room below its items', () => {
    const r = layoutForest([block]);
    for (const [, a] of r.locations) expect(a.y).toBeGreaterThan(0);
    const main = r.locations.get('main')!, kitchen = r.locations.get('kitchen')!, bath = r.locations.get('bath')!;
    // item grids span anchor.x-250 .. anchor.x+ (3 cols): siblings must clear each other
    expect(kitchen.x - LAYOUT.itemGridLeft * -1).toBeGreaterThan(main.x + 3 * LAYOUT.itemDX);
    expect(bath.x).toBeGreaterThan(kitchen.x + 3 * LAYOUT.itemDX);
    const violet = r.characters.get('violet')!, danny = r.characters.get('danny')!;
    const mainRows = Math.ceil(20 / LAYOUT.itemCols);
    expect(violet.y).toBeGreaterThan(main.y + LAYOUT.itemGridTop + mainRows * LAYOUT.itemDY);
    expect(danny.x - violet.x).toBe(LAYOUT.charW + LAYOUT.charGap);
    expect(violet.x).toBeGreaterThan(main.x + LAYOUT.itemGridLeft);
  });
  it('a parent wraps its children; siblings buildings are spaced apart; empty places get the minimum box', () => {
    const r = layoutForest([block]);
    const blockA = r.locations.get('block')!, arms = r.locations.get('arms')!, shelter = r.locations.get('shelter')!;
    expect(arms.y).toBeGreaterThan(blockA.y);
    expect(shelter.x).toBeGreaterThan(arms.x + arms.w);
    expect(shelter.w).toBeGreaterThanOrEqual(LAYOUT.emptyW);
    expect(blockA.w).toBeGreaterThan(arms.w + shelter.w);
  });
  it('is deterministic and lays roots left to right', () => {
    const a = layoutForest([block, room('lone', 0)]);
    const b = layoutForest([block, room('lone', 0)]);
    expect([...a.locations.entries()]).toEqual([...b.locations.entries()]);
    expect(a.locations.get('lone')!.x).toBeGreaterThan(a.locations.get('block')!.x + a.locations.get('block')!.w);
  });
});
