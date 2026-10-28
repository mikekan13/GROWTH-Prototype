import { describe, it, expect } from 'vitest';
import { applyLiveEvent, sameModel, pointAlong, tweenDurationMs, roomOfNode, type LiveModel } from './live-model';
import type { CanvasNode, CanvasFolder } from '@/types/canvas';

const node = (p: Partial<CanvasNode> & { id: string; type: CanvasNode['type'] }): CanvasNode => ({ name: p.id, x: 0, y: 0, ...p });
const room = (locId: string, nodeIds: string[], extra: Partial<NonNullable<CanvasFolder['locationInfo']>> = {}): CanvasFolder => ({
  id: `auto-${locId}`, name: locId, type: 'group', nodeIds,
  locationInfo: { locationId: locId, contentCounts: { locations: 0, characters: 0, npcs: 0, items: 0 }, ...extra },
});

function fixture(): LiveModel {
  return {
    nodes: [
      node({ id: 'kris', type: 'character', x: -100, y: 800, placedAt: 10 }),
      node({ id: 'violet', type: 'character', x: 200, y: 800, placedAt: 10, characterData: { entityType: 'NPC' } }),
      node({ id: 'bill', type: 'item', x: 50, y: 700, roomId: 'main', locationName: 'main', itemData: {} as never }),
    ],
    autoFolders: [
      room('landing', ['kris']),
      room('main', ['violet', 'bill'], { openings: [{ id: 'op-1', kind: 'door', a: { x: 0, y: 600 }, b: { x: 0, y: 700 }, between: ['main', 'landing'], state: 'locked' }] }),
      room('bath', []),
    ],
    locatedAtEdges: [{ child: 'kris', parent: 'landing' }, { child: 'violet', parent: 'main' }, { child: 'bill', parent: 'main' }],
  };
}

describe('applyLiveEvent · token_moved', () => {
  it('moves the token in place and stamps placedAt', () => {
    const m = fixture();
    const r = applyLiveEvent(m, { kind: 'token_moved', entityId: 'violet', entityType: 'character', x: 20, y: 650, placedAt: 99, roomId: 'main', cause: 'sim' });
    expect(r.changed).toBe(true);
    expect(r.needsReload).toBe(false);
    const v = r.model.nodes.find(n => n.id === 'violet')!;
    expect([v.x, v.y, v.placedAt]).toEqual([20, 650, 99]);
    expect(r.model.autoFolders).toBe(m.autoFolders); // same room: folders untouched
  });

  it('refiles a being that changed rooms: folders, counts and the parent graph follow', () => {
    const r = applyLiveEvent(fixture(), { kind: 'token_moved', entityId: 'kris', entityType: 'character', x: 20, y: 650, placedAt: 99, roomId: 'main', cause: 'sim' });
    expect(roomOfNode(r.model, 'kris')?.id).toBe('auto-main');
    expect(r.model.autoFolders.find(f => f.id === 'auto-landing')!.nodeIds).toEqual([]);
    expect(r.model.autoFolders.find(f => f.id === 'auto-landing')!.locationInfo!.contentCounts!.characters).toBe(0);
    const main = r.model.autoFolders.find(f => f.id === 'auto-main')!;
    expect(main.nodeIds).toEqual(['violet', 'bill', 'kris']);
    expect(main.locationInfo!.contentCounts).toEqual({ locations: 0, characters: 1, npcs: 1, items: 1 });
    expect(r.model.locatedAtEdges).toContainEqual({ child: 'kris', parent: 'main' });
    expect(r.model.locatedAtEdges.filter(e => e.child === 'kris')).toHaveLength(1);
  });

  it('an item token carries its new room name', () => {
    const r = applyLiveEvent(fixture(), { kind: 'token_moved', entityId: 'bill', entityType: 'item', x: 1, y: 2, placedAt: 5, roomId: 'bath', roomName: 'Bathroom', cause: 'gm' });
    const b = r.model.nodes.find(n => n.id === 'bill')!;
    expect(b.roomId).toBe('bath');
    expect(b.locationName).toBe('Bathroom');
    expect(roomOfNode(r.model, 'bill')?.id).toBe('auto-bath');
  });

  it('a token the canvas does not hold asks for a re-fetch', () => {
    const r = applyLiveEvent(fixture(), { kind: 'token_moved', entityId: 'ghost', entityType: 'character', x: 0, y: 0, placedAt: 1, roomId: null, cause: 'sim' });
    expect(r.changed).toBe(false);
    expect(r.needsReload).toBe(true);
  });
});

describe('applyLiveEvent · door_changed', () => {
  it('patches the opening state on the home folder', () => {
    const r = applyLiveEvent(fixture(), { kind: 'door_changed', locationId: 'main', openingId: 'op-1', state: 'open' });
    expect(r.changed).toBe(true);
    expect(r.model.autoFolders.find(f => f.id === 'auto-main')!.locationInfo!.openings![0].state).toBe('open');
  });
  it('is a no-op when the state already matches', () => {
    const m = fixture();
    const r = applyLiveEvent(m, { kind: 'door_changed', locationId: 'main', openingId: 'op-1', state: 'locked' });
    expect(r.changed).toBe(false);
    expect(r.needsReload).toBe(false);
    expect(r.model).toBe(m);
  });
  it('an unknown opening asks for a re-fetch', () => {
    const r = applyLiveEvent(fixture(), { kind: 'door_changed', locationId: 'main', openingId: 'op-9', state: 'open' });
    expect(r.needsReload).toBe(true);
  });
});

describe('applyLiveEvent · item_changed', () => {
  it('a taken thing leaves the floor and names its holder', () => {
    const r = applyLiveEvent(fixture(), { kind: 'item_changed', itemId: 'bill', holderId: 'violet', locationId: 'main' });
    const b = r.model.nodes.find(n => n.id === 'bill')!;
    expect(b.holderId).toBe('violet');
    expect(b.holderName).toBe('violet');
    expect(b.roomId).toBeUndefined();
    expect(roomOfNode(r.model, 'bill')).toBeNull();
    expect(r.model.autoFolders.find(f => f.id === 'auto-main')!.locationInfo!.contentCounts!.items).toBe(0);
  });
  it('a thing put down lands on the room floor where it was put', () => {
    const taken = applyLiveEvent(fixture(), { kind: 'item_changed', itemId: 'bill', holderId: 'violet', locationId: 'main' }).model;
    const r = applyLiveEvent(taken, { kind: 'item_changed', itemId: 'bill', holderId: null, locationId: 'bath', x: 30, y: 950, placedAt: 7 });
    const b = r.model.nodes.find(n => n.id === 'bill')!;
    expect(b.holderId).toBeNull();
    expect(b.roomId).toBe('bath');
    expect([b.x, b.y, b.placedAt]).toEqual([30, 950, 7]);
    expect(roomOfNode(r.model, 'bill')?.id).toBe('auto-bath');
  });
});

describe('applyLiveEvent · fallbacks', () => {
  it('map_changed and character_update ask for a re-fetch, never navigation', () => {
    expect(applyLiveEvent(fixture(), { kind: 'map_changed', locationIds: [], characterIds: [] }).needsReload).toBe(true);
    expect(applyLiveEvent(fixture(), { kind: 'character_update', characterId: 'x', characterName: 'x', fields: ['world'] }).needsReload).toBe(true);
  });
  it('an unrelated event changes nothing', () => {
    const m = fixture();
    const r = applyLiveEvent(m, { kind: 'board_changed' });
    expect(r.model).toBe(m);
    expect(r.needsReload).toBe(false);
  });
});

describe('sameModel', () => {
  it('equal pictures compare equal; a moved token does not', () => {
    expect(sameModel(fixture(), fixture())).toBe(true);
    const moved = applyLiveEvent(fixture(), { kind: 'token_moved', entityId: 'violet', entityType: 'character', x: 21, y: 650, placedAt: 99, roomId: 'main', cause: 'sim' }).model;
    expect(sameModel(fixture(), moved)).toBe(false);
  });
});

describe('tween helpers', () => {
  const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  it('pointAlong walks the polyline by distance', () => {
    expect(pointAlong(path, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAlong(path, 0.5)).toEqual({ x: 100, y: 0 });
    expect(pointAlong(path, 0.75)).toEqual({ x: 100, y: 50 });
    expect(pointAlong(path, 1)).toEqual({ x: 100, y: 100 });
  });
  it('tweenDurationMs is 3 ms per unit clamped to 0.4–2.5 s', () => {
    expect(tweenDurationMs(path)).toBe(600);
    expect(tweenDurationMs([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe(400);
    expect(tweenDurationMs([{ x: 0, y: 0 }, { x: 5000, y: 0 }])).toBe(2500);
  });
});
