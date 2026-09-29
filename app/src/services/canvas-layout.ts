/**
 * Canvas layout — deterministic geometry for a location tree, matching the
 * renderer's laws (2026-09-26, found while making JEWL's layout visible):
 *   - a drafting (non-ACTIVE) location lives BELOW the crystallization line
 *     (y > 0); the canvas clamps its folder there (FolderGroup.clampDraftingRect);
 *   - a populated folder's rectangle is derived from its MEMBERS; only an
 *     empty folder sits at its own anchor (min 720 × 200);
 *   - items with no stored position are gridded near their room's anchor:
 *     3 columns 260 apart, rows 150 apart, from (anchor.x − 250, anchor.y + 160)
 *     (app/campaign/[id]/page.tsx);
 *   - a character card is 520 × 240, centred; a location folder adds
 *     FOLDER_PADDING 30 around its content and a header of ~140.
 *
 * JEWL decides the TREE and the reading ORDER; this decides the numbers, so
 * what he intends is what the canvas shows. Pure and unit-tested.
 */

export interface LayoutNode {
  id: string;
  name: string;
  status: string;
  /** Direct child locations, in reading order (left to right). */
  children: LayoutNode[];
  /** Items whose stored position is absent (the canvas grids them near the anchor). */
  itemCount: number;
  /** The room's items in creation order (the page's grid order) — when given, each gets an explicit grid position. */
  itemIds?: string[];
  /** Characters located here, in order. */
  characterIds: string[];
}

export interface LayoutResult {
  /** Location id → folder anchor (top-left of its area). */
  locations: Map<string, { x: number; y: number; w: number; h: number }>;
  /** Character id → card centre. */
  characters: Map<string, { x: number; y: number }>;
  /** Item id → card centre (the page's grid formula, made explicit so stale browser positions can be overruled). */
  items: Map<string, { x: number; y: number }>;
}

export const LAYOUT = {
  itemCols: 3, itemDX: 260, itemDY: 150, itemGridTop: 160, itemGridLeft: -250, itemW: 300,
  charW: 520, charH: 240, charGap: 40,
  /** an EMPTY place renders as a name tile (FolderGroup TILE_W/H) */
  emptyW: 560, emptyH: 150,
  /** header chrome (142) + a zoomed-out label above it (up to ~108) — a child's label must not run into its parent's bar */
  pad: 30, header: 260,
  siblingGap: 150, buildingGap: 300,
  /** first drafting row starts here (below the line) */
  draftingTop: 120,
} as const;

/** The area a leaf room's own members take, relative to the room anchor: items grid + characters row. */
function leafExtent(n: LayoutNode): { w: number; h: number; charRowY: number } {
  const rows = Math.ceil(n.itemCount / LAYOUT.itemCols);
  const gridH = n.itemCount > 0 ? LAYOUT.itemGridTop + rows * LAYOUT.itemDY : 0;
  const gridW = n.itemCount > 0 ? Math.min(n.itemCount, LAYOUT.itemCols) * LAYOUT.itemDX + LAYOUT.itemW / 2 : 0;
  const charsW = n.characterIds.length ? n.characterIds.length * (LAYOUT.charW + LAYOUT.charGap) : 0;
  const charRowY = (n.itemCount > 0 ? gridH : LAYOUT.itemGridTop) + LAYOUT.charH / 2 + 20;
  const charsH = n.characterIds.length ? charRowY + LAYOUT.charH / 2 + 20 : 0;
  const w = Math.max(LAYOUT.emptyW, gridW + 250 + 50, charsW + 100);
  const h = Math.max(LAYOUT.emptyH, gridH + 40, charsH);
  return { w, h, charRowY };
}

/**
 * Lay out a forest of location trees below the line, left to right.
 * Returns anchors for every location and centres for every character.
 */
export function layoutForest(roots: LayoutNode[], origin = { x: -1600, y: LAYOUT.draftingTop }): LayoutResult {
  const out: LayoutResult = { locations: new Map(), characters: new Map(), items: new Map() };
  let cursorX = origin.x;
  for (const root of roots) {
    const size = place(root, cursorX, origin.y, out);
    cursorX += size.w + LAYOUT.buildingGap;
  }
  return out;
}

/** Place a node with its top-left at (x, y); returns the area it occupies. */
function place(n: LayoutNode, x: number, y: number, out: LayoutResult): { w: number; h: number } {
  const ext = leafExtent(n);
  // The node's own members (items grid + characters) sit at the top of its area, under the header.
  const anchorX = x + LAYOUT.pad - LAYOUT.itemGridLeft; // so the item grid's left edge lands at x + pad
  const anchorY = y + LAYOUT.header;
  const ownW = n.itemCount > 0 || n.characterIds.length > 0 ? ext.w : 0;
  const ownH = n.itemCount > 0 || n.characterIds.length > 0 ? ext.h : 0;
  (n.itemIds ?? []).forEach((iid, i) => {
    out.items.set(iid, { x: anchorX + LAYOUT.itemGridLeft + (i % LAYOUT.itemCols) * LAYOUT.itemDX, y: anchorY + LAYOUT.itemGridTop + Math.floor(i / LAYOUT.itemCols) * LAYOUT.itemDY });
  });
  n.characterIds.forEach((cid, i) => {
    out.characters.set(cid, { x: anchorX + LAYOUT.itemGridLeft + LAYOUT.charW / 2 + i * (LAYOUT.charW + LAYOUT.charGap), y: anchorY + ext.charRowY });
  });
  // Children side by side below the node's own members.
  let childX = x + LAYOUT.pad;
  const childY = anchorY + ownH + (ownH > 0 ? LAYOUT.siblingGap : 0);
  let childrenW = 0, childrenH = 0;
  for (const c of n.children) {
    const size = place(c, childX, childY, out);
    childX += size.w + LAYOUT.siblingGap;
    childrenW += size.w + LAYOUT.siblingGap;
    childrenH = Math.max(childrenH, size.h);
  }
  if (childrenW > 0) childrenW -= LAYOUT.siblingGap;
  const w = Math.max(LAYOUT.emptyW, ownW, childrenW) + LAYOUT.pad * 2;
  const h = LAYOUT.header + Math.max(LAYOUT.emptyH, ownH + (childrenH > 0 ? LAYOUT.siblingGap + childrenH : 0)) + LAYOUT.pad;
  out.locations.set(n.id, { x: anchorX, y: anchorY, w, h });
  return { w, h };
}
