import { describe, it, expect } from 'vitest';
import { settle, packFolder, deriveFolderRects, type SettleNode, type SettleFolder } from './canvas-settle';

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

  it('packFolder repacks overflowing members into rows and reports the new height', () => {
    const nodes = [card('a', 0, 0, 'room', 300, 80, 80), card('b', 320, 0, 'room', 300, 80, 80), card('c', 640, 0, 'room', 300, 80, 80)];
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

describe('settle — cross-level', () => {
  it('a card filed under the building, dropped on a card inside a room, pushes the room block clear', () => {
    // Violet is a member of the BUILDING; Danny is in the MAIN ROOM inside the APARTMENT inside the building.
    const nodes = [card('violet', 0, 2360, 'bldg'), card('danny', 60, 2380, 'room')];
    const folders = [folder('bldg'), folder('apt', 'bldg'), folder('room', 'apt')];
    const r = settle(nodes, folders, { kind: 'node', id: 'violet' });
    expect(r.nodeMoves.has('violet')).toBe(false);
    const v = { x: -260, y: 2240, width: 520, height: 240 };
    expect(overlaps(v, r.folderRects.get('room')!)).toBe(false);
    expect(overlaps(v, r.folderRects.get('apt')!)).toBe(false);
    // Danny moved with his room, and the building still contains everything.
    expect(r.nodeMoves.has('danny')).toBe(true);
    const b = r.folderRects.get('bldg')!, a = r.folderRects.get('apt')!;
    expect(b.x <= a.x && b.x + b.width >= a.x + a.width).toBe(true);
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
