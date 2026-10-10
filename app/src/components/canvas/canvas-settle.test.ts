import { describe, it, expect } from 'vitest';
import { settle, packFolder, deriveFolderRects, pickRoomAt, type SettleNode, type SettleFolder } from './canvas-settle';

const card = (id: string, x: number, y: number, folderId: string | null = null, w = 520, topH = 120, bottomH = 120): SettleNode => ({ id, x, y, w, topH, bottomH, folderId });
const folder = (id: string, parentId: string | null = null, extra: Partial<SettleFolder> = {}): SettleFolder => ({ id, parentId, drafting: true, headerH: 96, ...extra });

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('settle — cards', () => {
  it('a dropped card never yields; the card it landed on is pushed clear with the gap', () => {
    const nodes = [card('violet', 0, 2360, 'room'), card('danny', 60, 2380, 'room')];
    const r = settle(nodes, [folder('room')], { kind: 'node', id: 'violet' });
    expect(r.nodeMoves.has('violet')).toBe(false);
    const d = r.nodeMoves.get('danny')!;
    expect(d).toBeDefined();
    // Pushed along the shortest axis (y: overlap 220 vs x: overlap 460) → down.
    expect(d.y).toBeGreaterThanOrEqual(2360 + 240 + 16);
    expect(d.x).toBe(60);
  });

  it('leaves non-overlapping cards alone and reports one round', () => {
    const nodes = [card('a', 0, 0, 'room'), card('b', 600, 0, 'room')];
    const r = settle(nodes, [folder('room')], { kind: 'node', id: 'a' });
    expect(r.nodeMoves.size).toBe(0);
    expect(r.rounds).toBe(1);
  });

  it('is idempotent: settling a settled layout moves nothing', () => {
    const nodes = [card('a', 0, 0, 'room'), card('b', 100, 10, 'room'), card('c', 200, 20, 'room')];
    const first = settle(nodes, [folder('room')], { kind: 'node', id: 'a' });
    const settled = nodes.map((n) => ({ ...n, ...(first.nodeMoves.get(n.id) ?? {}) }));
    const second = settle(settled, [folder('room')], { kind: 'node', id: 'a' });
    expect(second.nodeMoves.size).toBe(0);
  });

  it('cards in different folders do not push each other (the folders do)', () => {
    const nodes = [card('a', 0, 0, 'r1'), card('b', 10, 0, 'r2')];
    const r = settle(nodes, [folder('r1', 'apt'), folder('r2', 'apt'), folder('apt')], { kind: 'node', id: 'a' });
    // b moved because r2 was pushed off r1, not by a card-card push.
    expect(r.folderShifts.has('r2')).toBe(true);
    expect(r.folderShifts.has('r1')).toBe(false);
    const r1 = r.folderRects.get('r1')!, r2 = r.folderRects.get('r2')!;
    expect(overlaps(r1, r2)).toBe(false);
  });
});

describe('settle — folders', () => {
  it('a resized room pushes its sibling room, and the apartment grows to contain both', () => {
    const nodes = [card('a', 0, 500, 'kitchen'), card('b', 900, 500, 'bath')];
    const folders = [folder('kitchen', 'apt', { userWidth: 1400 }), folder('bath', 'apt'), folder('apt')];
    const r = settle(nodes, folders, { kind: 'folder', id: 'kitchen' });
    expect(r.folderShifts.has('kitchen')).toBe(false);
    expect(r.folderShifts.has('bath')).toBe(true);
    const k = r.folderRects.get('kitchen')!, b = r.folderRects.get('bath')!, apt = r.folderRects.get('apt')!;
    expect(overlaps(k, b)).toBe(false);
    expect(apt.x).toBeLessThanOrEqual(Math.min(k.x, b.x));
    expect(apt.x + apt.width).toBeGreaterThanOrEqual(Math.max(k.x + k.width, b.x + b.width));
    // The pushed room's card went with it, by exactly the folder's shift.
    const shift = r.folderShifts.get('bath')!;
    expect(r.nodeMoves.get('b')).toEqual({ x: 900 + shift.dx, y: 500 + shift.dy });
    expect(shift.dx !== 0 || shift.dy !== 0).toBe(true);
  });

  it('never pushes a drafting folder above the crystallization line; it deflects sideways', () => {
    const nodes = [card('a', 0, 300, 'r1'), card('b', 0, 330, 'r2')];
    const folders = [folder('r1', null, { drafting: true }), folder('r2', null, { drafting: true })];
    const r = settle(nodes, folders, { kind: 'folder', id: 'r1' });
    const r2 = r.folderRects.get('r2')!;
    expect(r2.y).toBeGreaterThanOrEqual(0);
    expect(overlaps(r.folderRects.get('r1')!, r2)).toBe(false);
  });

  it('a deep tree settles within the round budget and every ancestor contains its children', () => {
    const nodes = [card('a', 0, 2000, 'room1'), card('b', 30, 2010, 'room2'), card('c', 2000, 2000, 'room3')];
    const folders = [
      folder('block'), folder('bldg', 'block'), folder('apt', 'bldg'),
      folder('room1', 'apt'), folder('room2', 'apt'), folder('room3', 'bldg'),
    ];
    const r = settle(nodes, folders, { kind: 'node', id: 'a' });
    expect(r.rounds).toBeLessThanOrEqual(6);
    const contains = (p: { x: number; y: number; width: number; height: number }, c: { x: number; y: number; width: number; height: number }) =>
      p.x <= c.x && p.y <= c.y && p.x + p.width >= c.x + c.width && p.y + p.height >= c.y + c.height;
    for (const f of folders) {
      if (!f.parentId) continue;
      expect(contains(r.folderRects.get(f.parentId)!, r.folderRects.get(f.id)!)).toBe(true);
    }
    expect(overlaps(r.folderRects.get('room1')!, r.folderRects.get('room2')!)).toBe(false);
  });
});

describe('deriveFolderRects / packFolder', () => {
  it('a folder is exactly its members plus padding and header, never smaller than the user size', () => {
    const nodes = [card('a', 0, 0, 'room')];
    const rects = deriveFolderRects(nodes, [folder('room', null, { userWidth: 2000, drafting: false })], { gap: 24, padding: 30, labelAllowance: 0, maxRounds: 6, emptyFolderSize: { width: 560, height: 150 } });
    const r = rects.get('room')!;
    expect(r.x).toBe(-260 - 30);
    expect(r.y).toBe(-120 - 30 - 96);
    expect(r.width).toBe(2000);
    expect(r.height).toBe(240 + 60 + 96);
  });

  it('packFolder moves the overflowing member to a new row and reports the new height', () => {
    // Below the line (y ≥ 0), as a drafting folder's cards always are.
    const nodes = [card('a', 0, 500, 'room', 300, 80, 80), card('b', 320, 500, 'room', 300, 80, 80), card('c', 640, 500, 'room', 300, 80, 80)];
    const res = packFolder('room', 700, nodes, [folder('room')]);
    expect(res).not.toBeNull();
    expect(res!.nodeMoves.size).toBeGreaterThan(0);
    // Two rows: the third card wraps.
    const ys = new Set([...res!.nodeMoves.values()].map((m) => m.y).concat(nodes.filter((n) => !res!.nodeMoves.has(n.id)).map((n) => n.y)));
    expect(ys.size).toBe(2);
    expect(res!.height).toBeGreaterThan(160 + 96 + 60);
  });

  it('packFolder returns null when nothing overflows', () => {
    const nodes = [card('a', 0, 0, 'room', 300, 80, 80)];
    expect(packFolder('room', 2000, nodes, [folder('room')])).toBeNull();
  });
});

describe('settle — cross-level (option a, 2026-10-06: a card never moves a room)', () => {
  it('a card filed under the building, dropped on a card inside a room, is laid out as that room\'s member: it pushes the card, never the room', () => {
    // Violet's EDGE says building; her card lands in the MAIN ROOM inside the APARTMENT inside the building.
    const nodes = [card('violet', 0, 2360, 'bldg'), card('danny', 60, 2380, 'room')];
    const folders = [folder('bldg'), folder('apt', 'bldg'), folder('room', 'apt')];
    const r = settle(nodes, folders, { kind: 'node', id: 'violet' });
    expect(r.nodeMoves.has('violet')).toBe(false);
    expect(r.folderShifts.size).toBe(0);
    // Danny is pushed clear by a card-vs-card push (down: y overlap 220 < x overlap 460).
    const d = r.nodeMoves.get('danny')!;
    expect(d).toBeDefined();
    expect(d.y).toBeGreaterThanOrEqual(2360 + 240 + 16);
    // The room grew to hold both; the apartment and the building still contain it.
    const room = r.folderRects.get('room')!, apt = r.folderRects.get('apt')!, b = r.folderRects.get('bldg')!;
    const contains = (p: { x: number; y: number; width: number; height: number }, c: { x: number; y: number; width: number; height: number }) =>
      p.x <= c.x && p.y <= c.y && p.x + p.width >= c.x + c.width && p.y + p.height >= c.y + c.height;
    expect(contains(room, { x: -260, y: 2240, width: 520, height: 240 })).toBe(true);
    expect(contains(apt, room)).toBe(true);
    expect(contains(b, apt)).toBe(true);
  });

  it('a stray card drawn inside a room (edge: the apartment) moves nothing when something else is dragged — measured 10-06 as a 286 px jump of a 19-card room', () => {
    // Violet's edge = apt; her card sits among the room's cards. Danny (room) is dragged elsewhere in the room, no overlap.
    const nodes = [card('violet', 0, 2360, 'apt'), card('danny', 600, 2360, 'room'), card('ruth', 1200, 2360, 'room')];
    const folders = [folder('apt'), folder('room', 'apt')];
    const r = settle(nodes, folders, { kind: 'node', id: 'danny' });
    expect(r.nodeMoves.size).toBe(0);
    expect(r.folderShifts.size).toBe(0);
    // And when the ROOM is the thing moved (a resize), the stray card still does not move it.
    const r2 = settle(nodes, folders, { kind: 'folder', id: 'room' });
    expect(r2.folderShifts.size).toBe(0);
    expect(r2.nodeMoves.size).toBe(0);
  });

  it('a loose card overlapping a room block (centre outside it) is pushed out of the room; the room stays', () => {
    const nodes = [card('a', 0, 500, 'room'), card('loose', 500, 520, null)];
    const folders = [folder('room')];
    // The room is what moved (resized); the loose card has no business inside it.
    const r = settle(nodes, folders, { kind: 'folder', id: 'room' });
    expect(r.folderShifts.size).toBe(0);
    expect(r.nodeMoves.has('a')).toBe(false);
    const l = r.nodeMoves.get('loose')!;
    expect(l).toBeDefined();
    expect(overlaps({ x: l.x - 260, y: l.y - 120, width: 520, height: 240 }, r.folderRects.get('room')!)).toBe(false);
  });

  it('the card in hand yields to nothing: held over a sibling room\'s header band, neither moves', () => {
    // Loose card dropped so that its centre is OUTSIDE the room box (no adoption) but its body overlaps it.
    const nodes = [card('a', 0, 500, 'room'), card('held', 700, 500, null)];
    const folders = [folder('room')];
    const r = settle(nodes, folders, { kind: 'node', id: 'held' });
    expect(r.nodeMoves.size).toBe(0);
    expect(r.folderShifts.size).toBe(0);
  });

  it('rooms still push rooms, carrying their cards', () => {
    const nodes = [card('a', 0, 500, 'r1'), card('b', 300, 520, 'r2')];
    const folders = [folder('r1', 'apt'), folder('r2', 'apt'), folder('apt')];
    const r = settle(nodes, folders, { kind: 'folder', id: 'r1' });
    expect(r.folderShifts.has('r1')).toBe(false);
    expect(r.folderShifts.has('r2')).toBe(true);
    expect(overlaps(r.folderRects.get('r1')!, r.folderRects.get('r2')!)).toBe(false);
    const s = r.folderShifts.get('r2')!;
    expect(r.nodeMoves.get('b')).toEqual({ x: 300 + s.dx, y: 520 + s.dy });
  });
});

describe('packFolder — only the overflowing members move (option a, 2026-10-06)', () => {
  it('a shrink that cuts off one card relocates that card only; the others stay exactly where they were', () => {
    const nodes = [card('a', 0, 500, 'room', 300, 80, 80), card('b', 320, 500, 'room', 300, 80, 80), card('c', 640, 500, 'room', 300, 80, 80), card('d', 0, 700, 'room', 300, 80, 80)];
    const res = packFolder('room', 700, nodes, [folder('room')]);
    expect(res).not.toBeNull();
    expect([...res!.nodeMoves.keys()]).toEqual(['c']);
    const c = res!.nodeMoves.get('c')!;
    // c landed in free space, clear of a, b and d (with the gap), inside the new width.
    const rc = { x: c.x - 150, y: c.y - 80, width: 300, height: 160 };
    for (const o of nodes.filter((n) => n.id !== 'c')) {
      expect(overlaps({ x: rc.x - 20, y: rc.y - 20, width: rc.width + 40, height: rc.height + 40 }, { x: o.x - 150, y: o.y - 80, width: 300, height: 160 })).toBe(false);
    }
    expect(rc.x + rc.width).toBeLessThanOrEqual(-180 + 700 - 30);
  });
});

describe('packFolder — a sub-folder is never larger than its parent', () => {
  it('shrinking a parent caps a wider child to the interior and repacks the child into rows', () => {
    // Child room holds three 520-wide cards in a row (≈1640 wide); parent packed to 1000.
    const nodes = [card('a', 0, 0, 'room'), card('b', 560, 0, 'room'), card('c', 1120, 0, 'room')];
    const folders = [folder('apt'), folder('room', 'apt')];
    const res = packFolder('apt', 1000, nodes, folders);
    expect(res).not.toBeNull();
    const cap = res!.folderSizes.get('room');
    expect(cap).toBeDefined();
    expect(cap!.width).toBeLessThanOrEqual(1000 - 60);
    // The child's cards no longer sit on one row.
    const ys = new Set(nodes.map((n) => res!.nodeMoves.get(n.id)?.y ?? n.y));
    expect(ys.size).toBeGreaterThan(1);
  });

  it('leaves a child that already fits alone', () => {
    const nodes = [card('a', 0, 0, 'room')];
    const folders = [folder('apt'), folder('room', 'apt')];
    expect(packFolder('apt', 2000, nodes, folders)).toBeNull();
  });
});

describe('pickRoomAt — the room a dropped card is filed with', () => {
  // Apartment holding a Main Room, as drawn (Violet/Ruth geometry, 10-06).
  const apt = { id: 'apt', rect: { x: -1600, y: 1000, width: 2600, height: 2000 } };
  const main = { id: 'main', rect: { x: -1300, y: 1200, width: 2060, height: 1600 } };
  const rooms = [apt, main];

  it('a card centre hugging the room edge (inside the box) files with the room, not the parent', () => {
    // 4 px inside the right edge — the old 12 px inset filed this with the apartment.
    expect(pickRoomAt(main.rect.x + main.rect.width - 4, 2530, rooms)).toBe('main');
    expect(pickRoomAt(main.rect.x + 2, 2530, rooms)).toBe('main');
    expect(pickRoomAt(0, main.rect.y + main.rect.height - 1, rooms)).toBe('main');
  });

  it('a card centre on the room header band files with the room', () => {
    // 40 px below the top edge — inside the old 96 px header exclusion.
    expect(pickRoomAt(0, main.rect.y + 40, rooms)).toBe('main');
  });

  it('a card centre outside the room box but inside the apartment files with the apartment', () => {
    expect(pickRoomAt(main.rect.x + main.rect.width + 20, 2530, rooms)).toBe('apt');
    expect(pickRoomAt(0, main.rect.y - 10, rooms)).toBe('apt');
  });

  it('outside every room box → null (membership left alone); collapsed rooms never capture', () => {
    expect(pickRoomAt(5000, 5000, rooms)).toBeNull();
    expect(pickRoomAt(0, 2530, [apt, { ...main, collapsed: true }])).toBe('apt');
  });
});
