/**
 * Settle-once canvas layout (Mike 2026-10-01, ruling: free placement +
 * settle on release).
 *
 *   "Anything can go anywhere; nothing may END on top of anything else.
 *    While held, only the held thing moves. On release the world settles
 *    once, deterministically, from committed geometry."
 *
 * Pure: no React, no DOM, no refs. The canvas feeds it committed node
 * positions + folder tree, names what was just moved (the priority — it
 * never yields), and applies the returned moves in one batch. Because
 * every measurement here reads the same committed snapshot, the pass
 * cannot oscillate the way the per-frame physics did (measured 10-01: a
 * corner resize drifted a folder 8415→7918 across ten frames and
 * relocated every ancestor on release).
 *
 * Per round, repeated until nothing moves (or maxRounds), deepest parents
 * first: every parent's DIRECT member cards and DIRECT child folders (as
 * blocks) push apart on the shortest axis (+gap). The thing in hand and
 * every folder on its ancestor chain never yield; otherwise the later one
 * yields. A pushed folder carries its whole subtree. Folder rects are
 * re-derived from members after every move (a folder grows to contain its
 * members + padding; never shrinks below them). A drafting folder is never
 * pushed across the crystallization line (y < 0) — it deflects sideways.
 *
 * Option (a), Mike 2026-10-06 — the two-line rule:
 *   1. Only true overlaps are resolved, and only between peers: a card
 *      pushes a card, a room pushes a room; a card never moves a room, and
 *      the thing in your hand never moves.
 *   2. A card drawn inside a room's box is laid out as that room's member
 *      whatever its edge says, and if it must yield it is pushed out of the
 *      room, never the room out from under it; a resize repacks only the
 *      members that overflow, the rest stay put.
 */

export interface SettleNode {
  id: string;
  /** Card centre (the canvas's node position convention). */
  x: number;
  y: number;
  w: number;
  topH: number;
  bottomH: number;
  /** Location folder this card is a direct member of (null = loose). */
  folderId: string | null;
}

export interface SettleFolder {
  /** Location id (the canvas folder id is `auto-${id}`). */
  id: string;
  parentId: string | null;
  /** User-set minimums (the folder never renders smaller than content). */
  userWidth?: number;
  userHeight?: number;
  /** Anchor used only when the folder has no members. */
  posX?: number;
  posY?: number;
  collapsed?: boolean;
  /** Non-ACTIVE location: lives below the crystallization line (y ≥ 0). */
  drafting: boolean;
  headerH: number;
}

export type SettlePriority = { kind: 'node'; id: string } | { kind: 'folder'; id: string } | null;

export interface SettleOptions {
  /** Breathing room between settled neighbours. */
  gap?: number;
  padding?: number;
  /** Headroom reserved above a child folder for its label. */
  labelAllowance?: number;
  maxRounds?: number;
  /** Rect of an EMPTY folder (matches the canvas's fallback). */
  emptyFolderSize?: { width: number; height: number };
}

export interface Rect { x: number; y: number; width: number; height: number }

export interface SettleResult {
  /** New centre per moved node. */
  nodeMoves: Map<string, { x: number; y: number }>;
  /** Shift applied to a folder's own anchor (posX/posY) — its member
   *  nodes are already in nodeMoves. Only folders that were pushed. */
  folderShifts: Map<string, { dx: number; dy: number }>;
  /** Final rects, for callers that want to animate or assert. */
  folderRects: Map<string, Rect>;
  rounds: number;
  /** Pushes applied per round — a diagnostic; a non-decreasing tail means oscillation. */
  roundMoves: number[];
}

// gap must sit BELOW the grid gaps the page/JEWL lay things out with (20) or
// every settle nudges every grid and the pass never converges (10-01).
const DEFAULTS = { gap: 16, padding: 30, labelAllowance: 0, maxRounds: 10, emptyFolderSize: { width: 560, height: 150 } };

function nodeRect(n: SettleNode): Rect {
  return { x: n.x - n.w / 2, y: n.y - n.topH, width: n.w, height: n.topH + n.bottomH };
}

/** Folder rects derived from members, bottom-up — the single geometry
 *  authority. Mirrors the canvas's render-time computation
 *  (calcContentBounds → getDisplayBounds → collapsed/drafting clamps). */
export function deriveFolderRects(nodes: SettleNode[], folders: SettleFolder[], opts: Required<SettleOptions>): Map<string, Rect> {
  const rects = new Map<string, Rect>();
  const byId = new Map(folders.map((f) => [f.id, f]));
  const children = new Map<string, string[]>();
  for (const f of folders) {
    if (f.parentId && byId.has(f.parentId)) children.set(f.parentId, [...(children.get(f.parentId) ?? []), f.id]);
  }
  const membersOf = new Map<string, SettleNode[]>();
  for (const n of nodes) if (n.folderId) membersOf.set(n.folderId, [...(membersOf.get(n.folderId) ?? []), n]);

  // Post-order: children before parents.
  const order: string[] = [];
  const visit = (id: string, seen: Set<string>) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const c of children.get(id) ?? []) visit(c, seen);
    order.push(id);
  };
  const seen = new Set<string>();
  for (const f of folders) if (!f.parentId || !byId.has(f.parentId)) visit(f.id, seen);
  for (const f of folders) visit(f.id, seen); // cycles/orphans still get a rect

  for (const id of order) {
    const f = byId.get(id)!;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, has = false;
    for (const n of membersOf.get(id) ?? []) {
      const r = nodeRect(n); has = true;
      minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.width); maxY = Math.max(maxY, r.y + r.height);
    }
    for (const c of children.get(id) ?? []) {
      const r = rects.get(c); if (!r) continue; has = true;
      minX = Math.min(minX, r.x); minY = Math.min(minY, r.y - opts.labelAllowance);
      maxX = Math.max(maxX, r.x + r.width); maxY = Math.max(maxY, r.y + r.height);
    }
    let rect: Rect;
    if (!has) {
      rect = { x: f.posX ?? -360, y: f.posY ?? 100, width: Math.max(opts.emptyFolderSize.width, f.userWidth ?? 0), height: Math.max(opts.emptyFolderSize.height, f.userHeight ?? 0) };
    } else {
      const minW = (maxX - minX) + opts.padding * 2;
      const minH = (maxY - minY) + opts.padding * 2 + f.headerH;
      rect = { x: minX - opts.padding, y: minY - opts.padding - f.headerH, width: Math.max(minW, f.userWidth ?? 0), height: Math.max(minH, f.userHeight ?? 0) };
    }
    if (f.collapsed) rect = { ...rect, width: 340, height: 80 };
    if (f.drafting && rect.y < 0) rect = { ...rect, y: 0, height: Math.max(0, rect.height + rect.y) };
    rects.set(id, rect);
  }
  return rects;
}

/** Push `b` out of `a` along the axis of least penetration. Returns the
 *  displacement to apply to `b` (zero when they do not overlap). */
function pushVector(a: Rect, b: Rect, gap: number): { dx: number; dy: number } {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (overlapX <= 0 || overlapY <= 0) return { dx: 0, dy: 0 };
  const bRight = b.x + b.width / 2 >= a.x + a.width / 2;
  const bBelow = b.y + b.height / 2 >= a.y + a.height / 2;
  if (overlapX < overlapY) return { dx: bRight ? overlapX + gap : -(overlapX + gap), dy: 0 };
  return { dx: 0, dy: bBelow ? overlapY + gap : -(overlapY + gap) };
}

/** Resolve overlaps inside one group of rects. `fixed` never moves. Pushes
 *  propagate OUTWARD from the fixed rects: a rect pushed by a fixed (or
 *  already-pinned) rect becomes pinned for the rest of the call, so a rect
 *  squeezed between the moved thing and a neighbour is never ping-ponged
 *  (measured 10-01: 32 pushes per round, forever). Between two unpinned
 *  rects the later one in `ids` yields (deterministic).
 *
 *  Peers only (Mike 2026-10-06, option a): a card pushes a card, a room
 *  pushes a room. A card never moves a room — a card overlapping a sibling
 *  room block is itself pushed out of it; if that card is the one in hand,
 *  nothing moves. Measured before this rule: one stray card relocated a
 *  19-card room by 286 px on every gesture. */
function resolveGroup(
  ids: string[],
  rectOf: (id: string) => Rect,
  isFolder: (id: string) => boolean,
  fixed: Set<string>,
  gap: number,
  apply: (id: string, dx: number, dy: number) => void,
  constrain?: (id: string, r: Rect, dx: number, dy: number) => { dx: number; dy: number },
): boolean {
  let movedAny = false;
  const pinned = new Set(fixed);
  for (let iter = 0; iter < 16; iter++) {
    let moved = false;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const A = ids[i], B = ids[j];
        const aFolder = isFolder(A), bFolder = isFolder(B);
        let anchor = A, mover = B;
        if (aFolder !== bFolder) {
          // Card vs room: the card yields, never the room. The held card
          // (fixed) yields to nothing, so that pair simply stays as it is.
          const cardId = aFolder ? B : A;
          if (fixed.has(cardId)) continue;
          anchor = aFolder ? A : B; mover = cardId;
        } else {
          const aPinned = pinned.has(A), bPinned = pinned.has(B);
          if (aPinned && bPinned) continue; // over-constrained: both already settled this pass
          if (bPinned && !aPinned) { anchor = B; mover = A; }
        }
        const v = pushVector(rectOf(anchor), rectOf(mover), gap);
        if (v.dx === 0 && v.dy === 0) continue;
        const c = constrain ? constrain(mover, rectOf(mover), v.dx, v.dy) : v;
        if (c.dx === 0 && c.dy === 0) continue;
        apply(mover, c.dx, c.dy);
        if (aFolder !== bFolder || pinned.has(anchor)) pinned.add(mover); // pushed by something settled → settled
        moved = true; movedAny = true;
      }
    }
    if (!moved) break;
  }
  return movedAny;
}

export function settle(nodesIn: SettleNode[], foldersIn: SettleFolder[], priority: SettlePriority, options: SettleOptions = {}): SettleResult {
  const opts: Required<SettleOptions> = { ...DEFAULTS, ...options, emptyFolderSize: options.emptyFolderSize ?? DEFAULTS.emptyFolderSize };
  const nodes = nodesIn.map((n) => ({ ...n }));
  const folders = foldersIn.map((f) => ({ ...f }));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const childrenOf = new Map<string, string[]>();
  for (const f of folders) {
    const p = f.parentId && folderById.has(f.parentId) ? f.parentId : null;
    childrenOf.set(p ?? '__root__', [...(childrenOf.get(p ?? '__root__') ?? []), f.id]);
  }
  const folderShifts = new Map<string, { dx: number; dy: number }>();

  let rects = deriveFolderRects(nodes, folders, opts);

  // A card drawn inside a room's box is laid out as that room's member,
  // whatever its edge says (Mike 2026-10-06, option a). Measured before
  // this: Violet's edge pointed at the apartment while her card sat in the
  // Main Room, and every settle shoved her — or the whole room — 286 px.
  // Only a POPULATED room can adopt (an empty room's box is a placeholder
  // the canvas draws elsewhere), and only one strictly smaller than the
  // card's own folder, so two rooms of equal size that happen to overlap
  // keep their members (their boxes are what the folder pass resolves).
  // Layout-only: the returned moves never change membership.
  {
    const populated = new Set<string>();
    for (const n of nodes) if (n.folderId && folderById.has(n.folderId)) populated.add(n.folderId);
    for (const f of folders) if (f.parentId && folderById.has(f.parentId)) populated.add(f.parentId);
    let adopted = false;
    for (const n of nodes) {
      const own = n.folderId && folderById.has(n.folderId) ? rects.get(n.folderId) : undefined;
      const ownArea = own ? own.width * own.height : Infinity;
      let best: { id: string; area: number } | null = null;
      for (const f of folders) {
        if (f.id === n.folderId || !populated.has(f.id) || f.collapsed) continue;
        const r = rects.get(f.id);
        if (!r || n.x <= r.x || n.x >= r.x + r.width || n.y <= r.y || n.y >= r.y + r.height) continue;
        const area = r.width * r.height;
        if (area < ownArea && (!best || area < best.area)) best = { id: f.id, area };
      }
      if (best) { n.folderId = best.id; adopted = true; }
    }
    if (adopted) rects = deriveFolderRects(nodes, folders, opts);
  }

  // The priority chain: the moved thing and every ancestor folder never yield
  // at their own level (the thing in your hand wins; the room it sits in wins
  // against its siblings; and so on up).
  const fixedNodes = new Set<string>();
  const fixedFolders = new Set<string>();
  {
    let folderId: string | null = null;
    if (priority?.kind === 'node') { fixedNodes.add(priority.id); folderId = nodeById.get(priority.id)?.folderId ?? null; }
    else if (priority?.kind === 'folder') folderId = priority.id;
    while (folderId && folderById.has(folderId) && !fixedFolders.has(folderId)) {
      fixedFolders.add(folderId);
      folderId = folderById.get(folderId)!.parentId;
    }
  }

  const shiftSubtree = (folderId: string, dx: number, dy: number) => {
    const stack = [folderId];
    while (stack.length) {
      const id = stack.pop()!;
      const s = folderShifts.get(id) ?? { dx: 0, dy: 0 };
      folderShifts.set(id, { dx: s.dx + dx, dy: s.dy + dy });
      const f = folderById.get(id);
      if (f) { if (f.posX != null) f.posX += dx; if (f.posY != null) f.posY += dy; }
      for (const n of nodes) if (n.folderId === id) { n.x += dx; n.y += dy; }
      for (const c of childrenOf.get(id) ?? []) stack.push(c);
    }
  };

  let rounds = 0;
  const roundMoves: number[] = [];
  let pushes = 0;
  // Group key: a folder id, or '__root__' for loose cards + root folders.
  // Each group = the parent's DIRECT member cards + its DIRECT child folders
  // (as blocks). Resolving them together is what keeps a card from ending on
  // top of a sub-room it is not in (Violet filed under the building, dropped
  // on Danny in the Main Room — 2026-10-01).
  const depthOf = new Map<string, number>();
  const depth = (id: string): number => {
    if (depthOf.has(id)) return depthOf.get(id)!;
    const p = folderById.get(id)?.parentId;
    const d = p && folderById.has(p) ? depth(p) + 1 : 0;
    depthOf.set(id, d); return d;
  };
  const isFolder = (id: string) => folderById.has(id);
  for (; rounds < opts.maxRounds; rounds++) {
    let moved = false;
    const groups = new Map<string, string[]>();
    for (const n of nodes) { const k = n.folderId && folderById.has(n.folderId) ? n.folderId : '__root__'; groups.set(k, [...(groups.get(k) ?? []), n.id]); }
    for (const [parent, kids] of childrenOf) groups.set(parent, [...(groups.get(parent) ?? []), ...kids]);
    // Deepest parents first: a child's contents settle before the child is
    // measured as a block among its own siblings.
    const order = [...groups.keys()].sort((a, b) => (b === '__root__' ? -1 : depth(b)) - (a === '__root__' ? -1 : depth(a)));
    for (const parent of order) {
      const ids = groups.get(parent)!;
      if (ids.length < 2) continue;
      const fixed = new Set<string>([...fixedNodes, ...fixedFolders]);
      const movedHere = resolveGroup(
        ids,
        (id) => (isFolder(id) ? rects.get(id)! : nodeRect(nodeById.get(id)!)),
        isFolder,
        fixed,
        opts.gap,
        (id, dx, dy) => {
          pushes++;
          if (isFolder(id)) { shiftSubtree(id, dx, dy); rects = deriveFolderRects(nodes, folders, opts); }
          else { const n = nodeById.get(id)!; n.x += dx; n.y += dy; }
        },
        (id, r, dx, dy) => {
          if (!isFolder(id)) return { dx, dy };
          const f = folderById.get(id)!;
          // Never shove a drafting folder across the crystallization line.
          if (f.drafting && dy < 0 && r.y + dy < 0) {
            const other = ids.find((o) => o !== id);
            const or = other ? (isFolder(other) ? rects.get(other) : nodeRect(nodeById.get(other)!)) : undefined;
            const sign = or && or.x + or.width / 2 > r.x + r.width / 2 ? -1 : 1;
            return { dx: sign * (r.width + opts.gap), dy: 0 };
          }
          return { dx, dy };
        },
      );
      moved = moved || movedHere;
      // Member moves change this parent's rect for the next (shallower) group.
      rects = deriveFolderRects(nodes, folders, opts);
    }
    roundMoves.push(pushes); pushes = 0;
    if (!moved) break;
  }

  const nodeMoves = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const o = nodesIn.find((x) => x.id === n.id)!;
    if (n.x !== o.x || n.y !== o.y) nodeMoves.set(n.id, { x: n.x, y: n.y });
  }
  for (const [id, s] of [...folderShifts]) if (s.dx === 0 && s.dy === 0) folderShifts.delete(id);
  return { nodeMoves, folderShifts, folderRects: rects, rounds: rounds + 1, roundMoves };
}

export interface PackResult {
  nodeMoves: Map<string, { x: number; y: number }>;
  folderShifts: Map<string, { dx: number; dy: number }>;
  /** Child folders capped to fit (Mike 2026-10-01: a sub-folder is never
   *  larger than its parent) — the caller writes these as user sizes. */
  folderSizes: Map<string, { width: number; height: number }>;
  height: number;
}

/** One-shot shelf-pack of a folder's DIRECT members into a target width,
 *  used after a resize when the contents overflow the new size (Mike
 *  08-03: shrinking a parent repacks its children — now once, on release,
 *  not per frame). Child folders pack as blocks; a child wider than the
 *  parent's interior is first capped to it and packed itself (cascade,
 *  depth ≤ 4). Returns null when nothing had to change. */
export function packFolder(
  folderId: string,
  targetWidth: number,
  nodesIn: SettleNode[],
  foldersIn: SettleFolder[],
  options: SettleOptions = {},
  _depth = 0,
): PackResult | null {
  const opts: Required<SettleOptions> = { ...DEFAULTS, ...options, emptyFolderSize: options.emptyFolderSize ?? DEFAULTS.emptyFolderSize };
  const nodes = nodesIn.map((n) => ({ ...n }));
  const folders = foldersIn.map((f) => ({ ...f }));
  const f = folders.find((x) => x.id === folderId);
  if (!f || f.collapsed) return null;
  const nodeMoves = new Map<string, { x: number; y: number }>();
  const folderShifts = new Map<string, { dx: number; dy: number }>();
  const folderSizes = new Map<string, { width: number; height: number }>();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const applyShift = (id: string, dx: number, dy: number) => {
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      const sh = folderShifts.get(cur) ?? { dx: 0, dy: 0 };
      folderShifts.set(cur, { dx: sh.dx + dx, dy: sh.dy + dy });
      const cf = folders.find((x) => x.id === cur);
      if (cf) { if (cf.posX != null) cf.posX += dx; if (cf.posY != null) cf.posY += dy; }
      for (const n of nodes) if (n.folderId === cur) { n.x += dx; n.y += dy; nodeMoves.set(n.id, { x: n.x, y: n.y }); }
      for (const c of folders) if (c.parentId === cur) stack.push(c.id);
    }
  };

  // Cascade: children wider than the interior shrink to it first.
  const inner = targetWidth - opts.padding * 2;
  let rects = deriveFolderRects(nodes, folders, opts);
  if (_depth < 4) {
    for (const c of folders) {
      if (c.parentId !== folderId) continue;
      const r = rects.get(c.id);
      if (!r || r.width <= inner) continue;
      c.userWidth = Math.min(c.userWidth ?? inner, inner);
      const sub = packFolder(c.id, inner, nodes, folders, opts, _depth + 1);
      if (sub) {
        for (const [id, m] of sub.nodeMoves) { const n = nodeById.get(id); if (n) { n.x = m.x; n.y = m.y; } nodeMoves.set(id, m); }
        for (const [id, sh] of sub.folderShifts) {
          const cf = folders.find((x) => x.id === id);
          if (cf) { if (cf.posX != null) cf.posX += sh.dx; if (cf.posY != null) cf.posY += sh.dy; }
          const prev = folderShifts.get(id) ?? { dx: 0, dy: 0 };
          folderShifts.set(id, { dx: prev.dx + sh.dx, dy: prev.dy + sh.dy });
        }
        for (const [id, sz] of sub.folderSizes) folderSizes.set(id, sz);
      }
      rects = deriveFolderRects(nodes, folders, opts);
      folderSizes.set(c.id, { width: Math.min(inner, rects.get(c.id)?.width ?? inner), height: rects.get(c.id)?.height ?? r.height });
    }
  }

  const self = rects.get(folderId);
  if (!self) return null;
  type Member = { id: string; kind: 'node' | 'folder'; x: number; y: number; w: number; h: number };
  const members: Member[] = [];
  for (const n of nodes) if (n.folderId === folderId) { const r = nodeRect(n); members.push({ id: n.id, kind: 'node', x: r.x, y: r.y, w: r.width, h: r.height }); }
  for (const c of folders) if (c.parentId === folderId) { const r = rects.get(c.id); if (r) members.push({ id: c.id, kind: 'folder', x: r.x, y: r.y - opts.labelAllowance, w: r.width, h: r.height + opts.labelAllowance }); }
  const changed = folderSizes.size > 0 || nodeMoves.size > 0;
  if (!members.length) return changed ? { nodeMoves, folderShifts, folderSizes, height: self.height } : null;
  const anchorX = self.x, anchorY = self.y;
  const left = anchorX + opts.padding, fitRight = anchorX + targetWidth - opts.padding;
  const isOverflow = (m: Member) => m.x + m.w > fitRight || m.x < left;
  if (!members.some(isOverflow)) return changed ? { nodeMoves, folderShifts, folderSizes, height: self.height } : null;
  // Only the members that overflow move (Mike 2026-10-06, option a: "a
  // resize repacks only the members that overflow, the rest stay put").
  // Each one takes the first free spot scanning the interior row by row,
  // below everything already placed if there is none; measured before
  // this, a 250 px shrink re-laid all six kitchen cards into fresh rows.
  const GAP = 20, STEP = 20;
  const placed: Member[] = members.filter((m) => !isOverflow(m));
  const clear = (x: number, y: number, w: number, h: number) =>
    !placed.some((p) => x < p.x + p.w + GAP && p.x < x + w + GAP && y < p.y + p.h + GAP && p.y < y + h + GAP);
  const top = anchorY + f.headerH + opts.padding;
  for (const m of members.filter(isOverflow).sort((a, b) => (a.y - b.y) || (a.x - b.x))) {
    const bottomOfPlaced = placed.reduce((b, p) => Math.max(b, p.y + p.h), top);
    let spot: { x: number; y: number } | null = null;
    for (let y = top; y <= bottomOfPlaced + GAP && !spot; y += STEP) {
      for (let x = left; x + m.w <= fitRight; x += STEP) {
        if (clear(x, y, m.w, m.h)) { spot = { x, y }; break; }
      }
    }
    if (!spot) spot = { x: left, y: bottomOfPlaced + GAP };
    const dx = spot.x - m.x, dy = spot.y - m.y;
    if (dx !== 0 || dy !== 0) {
      if (m.kind === 'node') { const n = nodeById.get(m.id)!; n.x += dx; n.y += dy; nodeMoves.set(m.id, { x: n.x, y: n.y }); }
      else applyShift(m.id, dx, dy);
    }
    placed.push({ ...m, x: spot.x, y: spot.y });
  }
  const bottom = placed.reduce((b, p) => Math.max(b, p.y + p.h), top);
  return { nodeMoves, folderShifts, folderSizes, height: (bottom + opts.padding) - anchorY };
}
