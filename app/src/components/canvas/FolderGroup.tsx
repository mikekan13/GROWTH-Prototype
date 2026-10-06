'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import RestPanel from './RestPanel';
import type { CanvasFolder } from '@/types/canvas';
import { lodForZoom, folderLabelSize, depthHeaderFill, depthBodyFill, depthPrefix } from './canvas-lod';
import { ComplexTooltip } from '@/components/ui/ComplexTooltip';
import { locationTitleTooltip, countTooltip, characterChipTooltip, detailsTooltip, memberNames, subLocationNames } from './folder-tooltips';
import type { GrowthCharacter } from '@/types/growth';

interface NodePosition {
  x: number;
  y: number;
}

interface NodeDimensions {
  width: number;
  /** Distance from node center to top edge */
  topH: number;
  /** Distance from node center to bottom edge (includes overflow like TKV badge) */
  bottomH: number;
}

// Card extents by type and expanded state.
// topH/bottomH are measured from the node's center point.
// Character cards overflow downward (portrait, TKV badge use negative margins).
const CARD_SIZES: Record<string, { compact: NodeDimensions; expanded: NodeDimensions }> = {
  character: { compact: { width: 520, topH: 120, bottomH: 120 }, expanded: { width: 1920, topH: 250, bottomH: 480 } },
  location:  { compact: { width: 340, topH: 90, bottomH: 90 },   expanded: { width: 500, topH: 350, bottomH: 350 } },
  item:      { compact: { width: 300, topH: 80, bottomH: 80 },   expanded: { width: 440, topH: 300, bottomH: 300 } },
  npc:       { compact: { width: 80, topH: 40, bottomH: 40 },    expanded: { width: 80, topH: 40, bottomH: 40 } },
  quest:     { compact: { width: 80, topH: 40, bottomH: 40 },    expanded: { width: 80, topH: 40, bottomH: 40 } },
};

export function getNodeDimensions(nodeType: string, isExpanded: boolean): NodeDimensions {
  const sizes = CARD_SIZES[nodeType] || CARD_SIZES.character;
  return isExpanded ? sizes.expanded : sizes.compact;
}

interface CharacterInfo {
  id: string;
  name: string;
  data: GrowthCharacter;
  /** Portrait URL when one exists — header "who is here" chips use it, else initials. */
  portrait?: string | null;
}

interface FolderGroupProps {
  folder: CanvasFolder;
  nodePositions: Map<string, NodePosition>;
  dragOffsets: Map<string, { x: number; y: number }>;
  nodeTypes: Map<string, string>;
  expandedNodes: Set<string>;
  /** Child-folder footprints keyed by location id — lets a parent
   *  folder's area encompass its nested sub-folders. */
  childFolderRects?: Map<string, { x: number; y: number; width: number; height: number }>;
  characters: CharacterInfo[];
  campaignId: string;
  viewBox: { x: number; y: number; width: number; height: number };
  zoom: number;
  onFolderDragStart: (folderId: string, startSvg: { x: number; y: number }) => void;
  onRemoveFromFolder: (folderId: string, nodeId: string) => void;
  onFolderResize?: (folderId: string, width: number, height: number, posX?: number, posY?: number) => void;
  onRestComplete: () => void;
  isDropTarget?: boolean;
  /** Drill-in callback for the focal-entity navigation. Receives the
   *  entity id (the location backing this auto-folder) or null to clear. */
  onDrillIn?: (entityId: string | null) => void;
}

export const FOLDER_PADDING = 30;
const HEADER_HEIGHT = 80;
const CHROME_HEIGHT = 80; // top chrome strip with portrait/name/KRMA/counts
const PANEL_GAP = 6; // gap between chrome and panel
const PANEL_PADDING = 24; // panel padding top+bottom combined

/** Rough vertical estimate for the details panel content. Used to size the
 *  expanded Location-folder header so everything fits without scrolling. */
function locationDetailsPanelHeight(li: NonNullable<CanvasFolder['locationInfo']>): number {
  const CHARS_PER_LINE = 38;
  const descText = li.description || '(empty)';
  const descLines = Math.max(1, Math.ceil(descText.length / CHARS_PER_LINE));
  const descH = descLines * 30;
  const gridH = 2 * (24 + 30) + 8;
  const tagCount = li.tags?.length ?? 0;
  const tagsH = 24 + (tagCount > 8 ? 2 * 30 : 30);
  const notesText = li.notes || '(empty)';
  const notesLines = Math.max(1, Math.ceil(notesText.length / CHARS_PER_LINE));
  const notesH = 24 + notesLines * 28 + 14;
  const gaps = 4 * 10;
  return descH + gridH + tagsH + notesH + gaps + PANEL_PADDING;
}
const SOUL_BLUE = '#002f6c';
/** Name-tile size for an EMPTY location (canvas-layout.LAYOUT.emptyW/H mirror it). */
const TILE_W = 560;
const TILE_H = 150;
const HANDLE_SIZE = 36;
/** Finger-sized resize handles on touch devices (2026-10-06, with the mobile
 *  session). Read through useSyncExternalStore so the server snapshot (false)
 *  matches the first client render and SVG geometry never hydration-mismatches. */
const HANDLE_SIZE_COARSE = 52;
const coarseQuery = () => (typeof window !== 'undefined' ? window.matchMedia('(pointer: coarse)') : null);
function useCoarsePointer(): boolean {
  return React.useSyncExternalStore(
    (cb) => { const q = coarseQuery(); q?.addEventListener('change', cb); return () => q?.removeEventListener('change', cb); },
    () => coarseQuery()?.matches ?? false,
    () => false,
  );
}

/** Compact details strip: one-line essence + the expand affordance. */
const COMPACT_DETAILS_H = 44;

/** Effective header height. Location folders default to a COMPACT
 *  one-line details strip (A6: the always-full panel made every folder
 *  header a billboard); folder.detailsOpen expands the full panel.
 *  Plain folders keep 80px. */
export function locationHeaderHeight(folder: CanvasFolder): number {
  if (!folder.locationInfo) return HEADER_HEIGHT;
  if (!folder.detailsOpen) return CHROME_HEIGHT + PANEL_GAP + COMPACT_DETAILS_H + 12;
  return CHROME_HEIGHT + PANEL_GAP + locationDetailsPanelHeight(folder.locationInfo) + 12;
}

// ── Shared bounds calculation ──

export interface ContentBounds {
  x: number;
  y: number;
  minWidth: number;
  minHeight: number;
}

export function calcContentBounds(
  folder: CanvasFolder,
  nodePositions: Map<string, NodePosition>,
  dragOffsets: Map<string, { x: number; y: number }>,
  nodeTypes: Map<string, string>,
  expandedNodes: Set<string>,
  /** Recursive containment: rects of CHILD FOLDERS keyed by their
   *  location id. A member that is itself a container has no node
   *  position (Locations render as folders, not cards) — its computed
   *  folder rect is its footprint, so the parent's area encompasses the
   *  sub-folder. World-recursive design: folders nest. */
  childFolderRects?: Map<string, { x: number; y: number; width: number; height: number }>,
  /** Headroom reserved ABOVE each child folder for its label (drawn above its box) — without it a child's name lands in its parent's header (2026-09-28). */
  childLabelAllowance = 0,
): ContentBounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasNodes = false;

  for (const nodeId of folder.nodeIds) {
    const childRect = childFolderRects?.get(nodeId);
    if (childRect) {
      hasNodes = true;
      minX = Math.min(minX, childRect.x);
      minY = Math.min(minY, childRect.y - childLabelAllowance);
      maxX = Math.max(maxX, childRect.x + childRect.width);
      maxY = Math.max(maxY, childRect.y + childRect.height);
      continue;
    }
    const pos = nodePositions.get(nodeId);
    if (!pos) continue;
    hasNodes = true;
    const offset = dragOffsets.get(nodeId) || { x: 0, y: 0 };
    const cx = pos.x + offset.x;
    const cy = pos.y + offset.y;
    const dims = getNodeDimensions(nodeTypes.get(nodeId) || 'character', expandedNodes.has(nodeId));
    const halfW = dims.width / 2;

    minX = Math.min(minX, cx - halfW);
    minY = Math.min(minY, cy - dims.topH);
    maxX = Math.max(maxX, cx + halfW);
    maxY = Math.max(maxY, cy + dims.bottomH);
  }
  if (!hasNodes) return null;

  // Party folders: clamp bottom edge above KRMA line (y=0)
  if (folder.type === 'party' && maxY > 0) {
    maxY = 0;
  }

  const hh = locationHeaderHeight(folder);
  return {
    x: minX - FOLDER_PADDING,
    y: minY - FOLDER_PADDING - hh,
    minWidth: (maxX - minX) + FOLDER_PADDING * 2,
    minHeight: (maxY - minY) + FOLDER_PADDING * 2 + hh,
  };
}

/** Drafting (non-ACTIVE) location folders live BELOW the crystallization
 * line (y=0). Crossing above is the crystallize gesture's job — never a
 * side effect of expanding, resizing, or chrome height. Party folders
 * have the inverse clamp (bottom stays above the line). Applied at the
 * render-bounds level so the invariant holds regardless of which code
 * path produced the rect. */
export function clampDraftingRect<T extends { y: number; height: number }>(
  folder: CanvasFolder,
  rect: T,
): T {
  const isDraftingLocation =
    !!folder.locationInfo && folder.locationInfo.status !== 'ACTIVE';
  if (isDraftingLocation && rect.y < 0) {
    return { ...rect, y: 0, height: Math.max(0, rect.height + rect.y) };
  }
  return rect;
}

export function getDisplayBounds(content: ContentBounds, folder: CanvasFolder) {
  const width = Math.max(content.minWidth, folder.userWidth || 0);
  let height = Math.max(content.minHeight, folder.userHeight || 0);
  // Party folders: clamp so bottom edge stays above KRMA line (y=0)
  if (folder.type === 'party') {
    const maxH = -content.y; // bottom edge flush with KRMA line
    if (maxH > 0 && height > maxH) height = maxH;
  }
  // Keep position anchored to top-left (content determines origin)
  return { x: content.x, y: content.y, width, height };
}

// ── SVG Background Rect + Resize Handles ──

export function FolderGroupRect({
  nodeNames,
  folder,
  nodePositions,
  dragOffsets,
  nodeTypes,
  expandedNodes,
  childFolderRects,
  characters,
  onFolderResize,
  onFolderResizeEnd,
  onFolderResizeStart,
  onToggleDetails,
  onFolderDragStart,
  onActionsToggle,
  onToggleCollapsed,
  showActionsMenu,
  svgRef,
  viewBox,
  isDropTarget = false,
  onDrillIn,
  zoom = 1,
}: {
  folder: CanvasFolder;
  nodePositions: Map<string, NodePosition>;
  dragOffsets: Map<string, { x: number; y: number }>;
  nodeTypes: Map<string, string>;
  expandedNodes: Set<string>;
  childFolderRects?: Map<string, { x: number; y: number; width: number; height: number }>;
  characters: CharacterInfo[];
  /** Every canvas node id → display name (plus location folders keyed by
   *  locationInfo.locationId). Optional: the header tooltips list items and
   *  sub-locations by name when it is present, by count when it is not. */
  nodeNames?: Map<string, string>;
  onFolderResize?: (folderId: string, width: number, height: number, posX?: number, posY?: number) => void;
  /** Fired once when a resize gesture ENDS — compaction/overlap pass. */
  onFolderResizeEnd?: (folderId: string) => void;
  /** Fired on the handle's mousedown — the canvas must know a resize has begun BEFORE any drag could start on the same gesture (2026-10-01: a resize that also became a folder drag re-parented rooms into each other). */
  onFolderResizeStart?: (folderId: string) => void;
  /** Toggle the location details panel (compact strip ↔ full panel). */
  onToggleDetails?: (folderId: string) => void;
  onFolderDragStart: (folderId: string, startSvg: { x: number; y: number }) => void;
  onActionsToggle: (folderId: string) => void;
  /** currentRect = the exact bounds this folder is RENDERED with right
   *  now — the toggle handler pins the anchor to it, so collapse can
   *  never jump to a divergently-recomputed position. */
  onToggleCollapsed: (folderId: string, currentRect?: { x: number; y: number; width: number; height: number }) => void;
  showActionsMenu: boolean;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  viewBox?: { x: number; y: number; width: number; height: number };
  isDropTarget?: boolean;
  onDrillIn?: (entityId: string | null) => void;
  /** Canvas zoom (1 = in, 6 = out) — semantic zoom + label scaling (canvas-lod). */
  zoom?: number;
}) {
  const [resizing, setResizing] = useState<{
    edge: 'right' | 'bottom' | 'corner' | 'left' | 'left-corner' | 'top' | 'top-corner' | 'top-left-corner';
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startPosX: number;
    startPosY: number;
  } | null>(null);

  const content = useMemo(
    () => calcContentBounds(folder, nodePositions, dragOffsets, nodeTypes, expandedNodes, childFolderRects, folderLabelSize(zoom) + 16),
    [folder, nodePositions, dragOffsets, nodeTypes, expandedNodes, childFolderRects, zoom]
  );

  // Collapse chip — small (Mike 2026-08-03: much smaller), just enough
  // for the name + counts.
  const COLLAPSED_WIDTH = 340;

  // Much smaller floors (Mike 2026-08-03) — a room folder can be a tight
  // little box; the header still fits at 280 wide.
  // An EMPTY location is a compact folder — same header and chips as every other place, just small
  // (Mike 2026-09-28: places must all display the same way; the header portrait box is the icon slot).
  const handleSize = useCoarsePointer() ? HANDLE_SIZE_COARSE : HANDLE_SIZE;
  const isTile = !content && !!folder.locationInfo && !folder.collapsed;
  const MIN_FOLDER_W = isTile ? TILE_W : 280;
  const MIN_FOLDER_H = isTile ? TILE_H : 120;

  const bounds = useMemo(() => {
    if (!content) {
      // Empty folder — show a minimum-sized box at folder position
      const w = Math.max(MIN_FOLDER_W, folder.userWidth || 0);
      const h = Math.max(MIN_FOLDER_H, folder.userHeight || 0);
      const baseX = folder.posX ?? -MIN_FOLDER_W / 2;
      const baseY = folder.posY ?? (folder.type === 'party' ? -(MIN_FOLDER_H + 40) : 100);
      // Apply drag offset for visual feedback during drag
      const folderOffset = dragOffsets.get(`__folder__${folder.id}`) || { x: 0, y: 0 };
      return clampDraftingRect(folder, { x: baseX + folderOffset.x, y: baseY + folderOffset.y, width: w, height: h });
    }
    if (folder.collapsed) {
      const display = getDisplayBounds(content, folder);
      return clampDraftingRect(folder, { ...display, width: COLLAPSED_WIDTH });
    }
    // Folder always encompasses its members visually — membership = visual
    // containment. The GM can shrink the empty whitespace between userWidth
    // and content extent, but the folder will not shrink smaller than the
    // content itself. Drag the folder → all members move with it.
    const folderOffset = dragOffsets.get(`__folder__${folder.id}`) || { x: 0, y: 0 };
    const anchorX = (folder.posX != null ? Math.min(folder.posX + folderOffset.x, content.x) : content.x);
    const anchorY = (folder.posY != null ? Math.min(folder.posY + folderOffset.y, content.y) : content.y);
    const contentRight = content.x + content.minWidth;
    const contentBottom = content.y + content.minHeight;
    // Right/bottom edges measure the user size from the SAME anchor the box
    // is drawn from (2026-10-01: measuring it from posX/posY while drawing
    // from min(pos, content) made a right-edge drag jump the HEIGHT by the
    // anchor gap on its first frame — "instantly expanded past its sub
    // folder"). This matches getDisplayBounds / folderRectById / the settle
    // engine, so every consumer agrees on one rect.
    const rightEdge = Math.max(anchorX + MIN_FOLDER_W, anchorX + (folder.userWidth || 0), contentRight);
    const width = rightEdge - anchorX;
    const bottomEdge = Math.max(anchorY + MIN_FOLDER_H, anchorY + (folder.userHeight || 0), contentBottom);
    let height = bottomEdge - anchorY;
    // Party folders: clamp bottom edge above KRMA line (y=0)
    if (folder.type === 'party') {
      const maxH = -anchorY;
      if (maxH > 0 && height > maxH) height = maxH;
    }
    // Drafting location folders: chrome/top edge never crosses ABOVE the
    // line — crystallization is a gesture, not a resize side effect.
    return clampDraftingRect(folder, { x: anchorX, y: anchorY, width, height });
  }, [content, folder, dragOffsets]);

  // Resize mouse handlers
  const handleResizeStart = useCallback((
    e: React.MouseEvent,
    edge: 'right' | 'bottom' | 'corner' | 'left' | 'left-corner' | 'top' | 'top-corner' | 'top-left-corner',
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!bounds) return;
    onFolderResizeStart?.(folder.id);
    // Capture the folder's TRUE origin and user-padded size — not the
    // content-clamped display values. The resize math writes posX/userWidth
    // directly, so the start values must match what we're modifying;
    // otherwise drags silently no-op (when posX > content.x) and produce
    // unexpected jumps on subsequent drags. Falls back to displayed bounds
    // on first resize (no posX/userWidth stored yet).
    setResizing({
      edge,
      startX: e.clientX,
      startY: e.clientY,
      // The drawn rect IS the gesture's baseline — user sizes are measured
      // from the drawn anchor, so starting anywhere else makes the first
      // frame jump (2026-10-01).
      startW: bounds.width,
      startH: bounds.height,
      startPosX: bounds.x,
      startPosY: bounds.y,
    });
  }, [bounds, folder.id, folder.posX, folder.posY, folder.userWidth, folder.userHeight, onFolderResizeStart]);

  useEffect(() => {
    if (!resizing) return;

    // Location folders may shrink BELOW their content extent — release
    // triggers content compaction (contents reflow to fit, Mike
    // 2026-08-03). Party/manual folders keep the encompass-your-members
    // floor.
    const isLocation = !!folder.locationInfo;
    const minW = isLocation ? MIN_FOLDER_W : Math.max(content ? content.minWidth : 0, MIN_FOLDER_W);
    const minH = isLocation ? MIN_FOLDER_H : Math.max(content ? content.minHeight : 0, MIN_FOLDER_H);
    const boundsY = content ? Math.min(folder.posY ?? content.y, content.y) : (folder.posY ?? (folder.type === 'party' ? -(MIN_FOLDER_H + 40) : 100));

    const handleMove = (e: MouseEvent) => {
      if (!svgRef?.current || !viewBox) return;
      const rect = svgRef.current.getBoundingClientRect();
      const scaleX = viewBox.width / rect.width;
      const scaleY = viewBox.height / rect.height;
      const dx = (e.clientX - resizing.startX) * scaleX;
      const dy = (e.clientY - resizing.startY) * scaleY;

      let newW = resizing.startW;
      let newH = resizing.startH;
      let newPosX: number | undefined;
      let newPosY: number | undefined;

      if (resizing.edge === 'right' || resizing.edge === 'corner' || resizing.edge === 'top-corner') {
        newW = Math.max(minW, resizing.startW + dx);
      }
      if (resizing.edge === 'left' || resizing.edge === 'left-corner' || resizing.edge === 'top-left-corner') {
        // Left edge: dragging left increases width, dragging right decreases.
        // The right edge must stay anchored at startPosX + startW.
        const startRight = resizing.startPosX + resizing.startW;
        newW = Math.max(minW, resizing.startW - dx);
        newPosX = startRight - newW;
        // Folder must encompass content — posX can't exceed content.x
        // (visual left edge is anchored to leftmost member). Clamp the user
        // intent to that limit so the drag stops where the visual stops,
        // instead of silently writing an unreachable posX that breaks the
        // next drag's start values.
        if (!isLocation && content && newPosX > content.x) {
          newPosX = content.x;
          newW = startRight - newPosX;
        }
      }
      if (resizing.edge === 'bottom' || resizing.edge === 'corner' || resizing.edge === 'left-corner') {
        newH = Math.max(minH, resizing.startH + dy);
        // Party folders: bottom edge can't cross the KRMA line (y=0)
        if (folder.type === 'party') {
          const maxH = -boundsY; // bottom edge flush with KRMA line
          if (maxH > 0 && newH > maxH) newH = maxH;
        }
      }
      if (resizing.edge === 'top' || resizing.edge === 'top-corner' || resizing.edge === 'top-left-corner') {
        // Top edge: dragging up grows the folder upward, dragging down
        // shrinks it. The bottom edge stays anchored at startPosY + startH.
        const startBottom = resizing.startPosY + resizing.startH;
        newH = Math.max(minH, resizing.startH - dy);
        newPosY = startBottom - newH;
        // Encompass clamp (mirror of the left edge): non-location folders
        // can't push their top edge below the topmost member.
        if (!isLocation && content && newPosY > content.y) {
          newPosY = content.y;
          newH = startBottom - newPosY;
        }
        // Drafting locations live BELOW the crystallization line — the top
        // edge never crosses above y=0 as a resize side effect.
        const isDrafting = !!folder.locationInfo && folder.locationInfo.status !== 'ACTIVE';
        if (isDrafting && newPosY < 0) {
          newPosY = 0;
          newH = startBottom;
        }
      }

      onFolderResize?.(folder.id, newW, newH, newPosX, newPosY);
    };

    const handleUp = () => {
      setResizing(null);
      // Release hook: the parent runs content compaction + sibling
      // overlap resolution against the final size.
      onFolderResizeEnd?.(folder.id);
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };
  }, [resizing, content, folder.id, onFolderResize, svgRef, viewBox]);

  if (!bounds) return null;

  const color = folder.type === 'party' ? SOUL_BLUE : (folder.color || SOUL_BLUE);
  const collapsed = !!folder.collapsed;
  // Semantic zoom + depth encoding (Mike 2026-09-28): a place's palette steps
  // by how deep it sits; labels grow as the Watcher zooms out.
  const depth = folder.locationInfo?.depth;
  const lod = lodForZoom(zoom);
  const headerFill = folder.locationInfo ? depthHeaderFill(depth) : color;
  const bodyFill = folder.locationInfo ? depthBodyFill(depth) : '#19191930';
  const btnW = 160;
  const btnH = 42;
  const btnFontSize = 20;
  const toggleSize = 68;

  // TKV: sum of all characters' TKV in this folder
  const folderChars = characters.filter(c => folder.nodeIds.includes(c.id));

  // Title lives INSIDE the header bar (Mike 2026-10-06: "the title should be
  // within the header bar"). Near: a tidy first row beside the portrait, with
  // the action row under it. Mid/far: the action row hides (unreadable that
  // small anyway) and the title scales up with zoom, centred on the bar, so a
  // place stays legible zoomed out. Width is capped so it never runs into the
  // who-is-here chips or the collapse toggle; overflow ellipsises.
  const showActionRow = !!folder.locationInfo && lod === 'near';
  const showPortrait = !!folder.locationInfo && lod !== 'far';
  const chipCount = (!collapsed && folder.locationInfo && folderChars.length > 0)
    ? Math.min(folderChars.length, 6) + (folderChars.length > 6 ? 1 : 0) : 0;
  const titleLeft = showPortrait ? 84 : folder.type === 'party' ? btnW + 24 : 16;
  const titleRightReserve = toggleSize + 28 + chipCount * 60;
  const titleAvailW = Math.max(60, bounds.width - titleLeft - titleRightReserve);
  // Styled like the rulebook's section headers (Mike 2026-10-06: "gold text
  // and blue backgrounds"): Bebas Neue caps in --accent-gold on a Soul-blue
  // (#002f6c) badge that hugs the text like a tape strip (VISUAL-DESIGN-SPEC §5).
  const TITLE_PAD_X = 12;
  const titleChars = folder.name.length + (depth ?? 0) + String(folder.nodeIds.length).length + (folder.type === 'party' ? 7 : 4);
  const titleMax = lod === 'near' ? 32 : lod === 'mid' ? Math.min(folderLabelSize(zoom), 60) : folderLabelSize(zoom);
  // Bebas Neue is condensed: ~0.5em per char including the tracking.
  const titleFont = Math.max(18, Math.min(titleMax, Math.floor((titleAvailW - 2 * TITLE_PAD_X) / (titleChars * 0.5))));
  const titleLineH = Math.ceil(titleFont * 1.1) + 4;
  const titleTop = showActionRow ? 4 : (HEADER_HEIGHT - titleLineH) / 2;
  /** Rough rendered width — the TKV / KRMA tiles slide right of it. */
  const titleEstW = titleChars * titleFont * 0.5 + 2 * TITLE_PAD_X;

  // Header tooltips (Mike 2026-10-06): the dynamic ComplexTooltip with its
  // inception layer, on the title badge, the content counts, the who-is-here
  // chips and the dETAILS strip. Models live in folder-tooltips.ts. They close
  // while the folder is being dragged.
  const isFolderDragging = dragOffsets.has(`__folder__${folder.id}`);
  const li = folder.locationInfo;
  const itemNames = memberNames(folder, nodeTypes, 'item', nodeNames);
  const subNames = subLocationNames(folder, childFolderRects, nodeNames);
  const titleTip = li ? locationTitleTooltip(folder, li, folderChars, itemNames, subNames) : null;
  const tipTriggerStyle: React.CSSProperties = { pointerEvents: 'auto', cursor: 'help' };
  const totalTKV = folderChars.reduce((sum, c) => {
    const val = c.data?.tkv;
    return sum + (typeof val === 'number' ? val : typeof val === 'string' ? parseFloat(val) || 0 : 0);
  }, 0);

  // In collapsed mode, only show header bar (no body, no resize handles)
  const displayHeight = collapsed ? HEADER_HEIGHT : bounds.height;

  // Drag handler for header
  const handleHeaderDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!svgRef?.current || !viewBox) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = viewBox.x + ((e.clientX - rect.left) / rect.width) * viewBox.width;
    const svgY = viewBox.y + ((e.clientY - rect.top) / rect.height) * viewBox.height;
    onFolderDragStart(folder.id, { x: svgX, y: svgY });
  };

  return (
    <g>
      {/* Background rect — hidden when collapsed, pointerEvents none so cards on top receive clicks */}
      {!collapsed && (
        <rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={displayHeight}
          rx={8}
          ry={8}
          fill={isDropTarget ? '#22ab9440' : bodyFill}
          stroke={isDropTarget ? '#22ab94cc' : '#22ab9444'}
          strokeWidth={isDropTarget ? 4 : 2}
          style={{ pointerEvents: 'none', ...(isDropTarget ? { filter: 'drop-shadow(0 0 16px rgba(34,171,148,0.6))' } : undefined) }}
        />
      )}
      {/* Header background — expanded when the Location has detail fields.
          data-folder-location-id lets right-click on the folder surface the
          parent context to the JEWL dialog (so "create inside this place"
          works without drilling in). */}
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={collapsed ? HEADER_HEIGHT : locationHeaderHeight(folder)}
        rx={8}
        ry={8}
        fill={isDropTarget ? 'var(--terminal-prime)' : headerFill}
        fillOpacity={1}
        stroke={isDropTarget ? 'var(--terminal-prime)' : 'none'}
        strokeWidth={isDropTarget ? 3 : 0}
        data-folder-location-id={folder.locationInfo?.locationId || undefined}
        style={{ cursor: 'grab', pointerEvents: 'auto', ...(isDropTarget ? { filter: 'drop-shadow(0 0 12px rgba(34,171,148,0.5))' } : undefined) }}
        onPointerDown={handleHeaderDrag}
      />
      {/* Drop affordance: unmistakable "this is where it lands" pill —
          the tint alone read as "strange highlight" (Mike 2026-08-03). */}
      {isDropTarget && (
        <foreignObject
          x={bounds.x + bounds.width / 2 - 150}
          y={bounds.y - 44}
          width={300}
          height={40}
          style={{ pointerEvents: 'none', overflow: 'visible' }}
        >
          <div style={{
            background: '#000',
            border: '1px solid var(--terminal-prime, #22ab94)',
            boxShadow: '0 0 14px rgba(34,171,148,0.5)',
            color: '#fff',
            fontFamily: 'Consolas, monospace',
            fontSize: 15,
            padding: '6px 12px',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            ⤵ dROP iNTO <span style={{ color: 'var(--terminal-prime, #22ab94)' }}>{folder.name}</span>
          </div>
        </foreignObject>
      )}
      {/* Bottom corners square off where header meets body */}
      {!collapsed && (
        <rect
          x={bounds.x}
          y={bounds.y + locationHeaderHeight(folder) - 8}
          width={bounds.width}
          height={8}
          fill="#19191930"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Folder title — INSIDE the header bar (2026-10-06). Locations drop the
          □ glyph: the portrait box is the icon slot. The depth prefix (one ▸
          per level) stays, dimmed, so "inside inside" still reads. */}
      <foreignObject
        x={bounds.x + titleLeft}
        y={bounds.y + titleTop}
        width={titleAvailW}
        height={titleLineH}
        style={{ pointerEvents: 'none', overflow: 'visible' }}
      >
        {/* The badge is a tooltip trigger AND still a drag handle: pointerdown
            is forwarded to the header drag. data-folder-location-id lets the
            touch carry gesture find the folder from a finger on the title. */}
        <div
          style={{ width: '100%', overflow: 'hidden', whiteSpace: 'nowrap' }}
          data-folder-location-id={li?.locationId || undefined}
          data-folder-id={folder.id}
        >
          <ComplexTooltip
            inline
            disabled={!titleTip || isFolderDragging}
            title={titleTip?.title ?? folder.name}
            modifiers={titleTip?.modifiers ?? []}
            totalValue={0}
            totalLabel={titleTip?.totalLabel}
            totalText={titleTip?.totalText}
            hideTotal={titleTip?.hideTotal}
            triggerStyle={{ ...tipTriggerStyle, maxWidth: '100%', verticalAlign: 'top', cursor: 'grab' }}
            onTriggerPointerDown={handleHeaderDrag}
          >
          <div
            style={{
              display: 'inline-block',
              maxWidth: '100%',
              boxSizing: 'border-box',
              background: SOUL_BLUE, // #002f6c — Mike 2026-10-06: the badge blue is Soul blue, not surface-dark
              color: 'var(--accent-gold, #D0A030)',
              fontFamily: 'var(--font-bebas-neue), "Bebas Neue", Impact, sans-serif',
              fontSize: titleFont,
              fontWeight: 400,
              letterSpacing: '0.05em',
              lineHeight: 1.1,
              padding: `2px ${TITLE_PAD_X}px`,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              verticalAlign: 'top',
              // Tape-strip edge: a hair off square, like the rulebook badges.
              clipPath: 'polygon(0 3%, 100% 0, 99.7% 100%, 0.3% 96%)',
            }}
            title={folder.name}
          >
            {folder.type === 'party'
              ? <><span style={{ letterSpacing: '-0.53em' }}>{'\u265F'}<span style={{ fontSize: '1.15em' }}>{'\u265F'}</span>{'\u265F'}</span>{' '}</>
              : folder.locationInfo ? null : '\u25A1 '}
            {depthPrefix(depth) && <span style={{ opacity: 0.55 }}>{depthPrefix(depth)}</span>}
            {folder.name}
            <span style={{ opacity: 0.6, fontSize: '0.8em', marginLeft: '0.35em' }}>({folder.nodeIds.length})</span>
          </div>
          </ComplexTooltip>
        </div>
      </foreignObject>

      {/* TKV readout (party folders only) — standard red label over purple number, slides right if label is too close */}
      {folder.type === 'party' && (() => {
        const tkvW = 320;
        const labelRight = bounds.x + titleLeft + titleEstW + 16;
        const centeredX = bounds.x + bounds.width / 2 - tkvW / 2;
        const tkvX = Math.max(centeredX, labelRight);
        return (
          <foreignObject
            x={tkvX}
            y={bounds.y - 69}
            width={tkvW}
            height={144}
            style={{ pointerEvents: 'none', overflow: 'visible' }}
          >
            <div style={{
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              border: '4px solid var(--krma-gold)', borderRadius: 8,
              fontFamily: "'Bebas Neue', var(--font-bebas-neue), sans-serif",
            }}>
              <div style={{ backgroundColor: 'var(--pillar-body)', color: 'var(--krma-gold)', fontSize: 40, textAlign: 'center', lineHeight: '1', padding: '10px 20px', letterSpacing: '0.08em' }}>
                T<span style={{ fontFamily: "'Inknut Antiqua', var(--font-inknut-antiqua), serif", fontWeight: 900 }}>&#x049C;</span>V
              </div>
              <div style={{ backgroundColor: '#b4a7d6', color: '#8e7cc3', fontSize: 56, textAlign: 'center', lineHeight: '1.1', padding: '8px 20px', fontWeight: 700 }}>
                {totalTKV.toLocaleString()}
              </div>
            </div>
          </foreignObject>
        );
      })()}

      {/* Location header chrome — portrait + AI/Upload stubs + child-type
          counts. Renders only for Location auto-folders (those with
          locationInfo). Sits inside the 80 px header rectangle to the left
          of the KRMA reserve. */}
      {showPortrait && folder.locationInfo && (
        <>
          {/* Portrait box */}
          <foreignObject
            x={bounds.x + 8}
            y={bounds.y + 8}
            width={64}
            height={64}
            style={{ pointerEvents: 'none', overflow: 'visible' }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                border: '2px solid var(--krma-gold)',
                borderRadius: 4,
                background: 'rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {folder.locationInfo.imageUrl ? (
                <img
                  src={folder.locationInfo.imageUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ color: 'rgba(255,204,120,0.4)', fontSize: 32, lineHeight: 1 }}>{'❖'}</span>
              )}
            </div>
          </foreignObject>

          {/* Action row + content counts — the bar's second line, under the
              title (2026-10-06). Near LOD only: at mid/far these 11px buttons
              are unreadable and the title takes the whole bar. The row's own
              surface passes pointer events through so the header still drags;
              only the buttons catch them. */}
          {showActionRow && folder.locationInfo && (
            <foreignObject
              x={bounds.x + 84}
              y={bounds.y + 44}
              width={titleAvailW}
              height={32}
              style={{ pointerEvents: 'none', overflow: 'visible' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                {/* AI Generate button (stub — pipeline TBD). The unified AI image
                    generation is the SOLE path for getting visuals onto entities.
                    No file upload — generation is the design constraint. */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.dispatchEvent(
                      new CustomEvent('growth:ai-generate-image', {
                        detail: {
                          entityType: 'location',
                          entityId: folder.locationInfo?.locationId,
                          target: 'portrait',
                        },
                      }),
                    );
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    pointerEvents: 'auto',
                    padding: '5px 10px',
                    background: 'rgba(0,0,0,0.6)',
                    border: '1px solid rgba(34,171,148,0.6)',
                    color: 'var(--terminal-prime)',
                    fontFamily: 'var(--font-terminal), Consolas, monospace',
                    fontSize: 11,
                    letterSpacing: '0.08em',
                    cursor: 'pointer',
                    borderRadius: 2,
                    textShadow: '0 0 4px rgba(34,171,148,0.4)',
                  }}
                  title="Generate location portrait via the AI image pipeline"
                >
                  ✨ GENERATE
                </button>

                {/* Drill-in button — re-focuses the canvas on this location's
                    interior. The drilled-in view shows only this location's
                    immediate children + a breadcrumb at the top of the canvas. */}
                {onDrillIn && folder.locationInfo.locationId && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDrillIn(folder.locationInfo!.locationId);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{
                      pointerEvents: 'auto',
                      padding: '5px 10px',
                      background: 'rgba(0,0,0,0.6)',
                      border: '1px solid rgba(255,204,120,0.6)',
                      color: 'var(--krma-gold)',
                      fontFamily: 'var(--font-terminal), Consolas, monospace',
                      fontSize: 11,
                      letterSpacing: '0.08em',
                      cursor: 'pointer',
                      borderRadius: 2,
                      textShadow: '0 0 4px rgba(255,204,120,0.4)',
                    }}
                    title="Drill in: focus the canvas on this location's interior"
                  >
                    ▸ ENTER
                  </button>
                )}

                {/* CRYSTALLIZE button — visible only when the location is in
                    PLANNING status. Fires a custom event the canvas catches
                    and turns into a confirmation modal. */}
                {folder.locationInfo.status === 'PLANNING' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.dispatchEvent(
                        new CustomEvent('growth:crystallize-location', {
                          detail: {
                            locationId: folder.locationInfo?.locationId,
                            locationName: folder.name,
                            krmaReserve: folder.locationInfo?.krmaReserve,
                            contentCounts: folder.locationInfo?.contentCounts,
                          },
                        }),
                      );
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{
                      pointerEvents: 'auto',
                      padding: '5px 10px',
                      background: 'linear-gradient(135deg, var(--krma-gold), #d09f55)',
                      border: '1px solid var(--krma-gold)',
                      color: '#000',
                      fontFamily: 'var(--font-terminal), Consolas, monospace',
                      fontSize: 11,
                      letterSpacing: '0.12em',
                      fontWeight: 700,
                      cursor: 'pointer',
                      borderRadius: 2,
                      boxShadow: '0 0 12px rgba(255,204,120,0.5)',
                    }}
                    title="Crystallize: commit this location and its subtree to the active world"
                  >
                    ✦ CRYSTALLIZE
                  </button>
                )}

                {/* Content-type counts, same line, after the actions */}
                {folder.locationInfo.contentCounts && (
                  <div
                    style={{
                      display: 'flex',
                      gap: 18,
                      alignItems: 'center',
                      marginLeft: 10,
                      fontFamily: 'var(--font-terminal), Consolas, monospace',
                      fontSize: 22,
                      color: 'rgba(255,255,255,0.8)',
                    }}
                  >
                    {([
                      { kind: 'locations' as const, glyph: '⌂', color: 'var(--terminal-prime)', count: folder.locationInfo.contentCounts.locations ?? 0, names: subNames, chars: undefined },
                      { kind: 'characters' as const, glyph: '✴', color: 'var(--pillar-body)', count: folder.locationInfo.contentCounts.characters ?? 0, names: null, chars: folderChars },
                      { kind: 'npcs' as const, glyph: '✴', color: 'var(--krma-gold)', count: folder.locationInfo.contentCounts.npcs ?? 0, names: null, chars: folderChars },
                      { kind: 'items' as const, glyph: '❖', color: '#8e7cc3', count: folder.locationInfo.contentCounts.items ?? 0, names: itemNames, chars: undefined },
                    ]).filter(c => c.count > 0).map(c => {
                      const tip = countTooltip(c.kind, c.count, c.names, c.chars);
                      return (
                        <ComplexTooltip key={c.kind} inline title={tip.title} modifiers={tip.modifiers} totalValue={0} hideTotal
                          disabled={isFolderDragging} triggerStyle={tipTriggerStyle} onTriggerPointerDown={handleHeaderDrag}>
                          <span>
                            <span style={{ color: c.color, marginRight: 4 }}>{c.glyph}</span>
                            {c.count}
                          </span>
                        </ComplexTooltip>
                      );
                    })}
                  </div>
                )}
                {folder.locationInfo.locationType && (
                  <span
                    // Phones (< md): 14px world units and brighter, else it is a 10px smudge.
                    // Desktop keeps 10px / 40% exactly (md: classes).
                    className="text-[14px] md:text-[10px] text-white/70 md:text-white/40"
                    style={{
                      marginLeft: 'auto',
                      fontFamily: 'var(--font-terminal), Consolas, monospace',
                      textTransform: 'uppercase',
                      letterSpacing: '0.12em',
                    }}
                    title="Location type"
                  >
                    {folder.locationInfo.locationType.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
            </foreignObject>
          )}

          {/* Compact details strip (A6 default): one-line essence + the
              expand affordance. The full always-on panel made every
              folder header a billboard. */}
          {!folder.collapsed && !folder.detailsOpen && folder.locationInfo && (
            <foreignObject
              x={bounds.x + 12}
              y={bounds.y + 86}
              width={Math.max(bounds.width - 24, 200)}
              height={COMPACT_DETAILS_H}
              style={{ pointerEvents: 'auto', overflow: 'visible' }}
            >
              <div
                style={{
                  fontFamily: 'Consolas, monospace',
                  fontSize: 18,
                  color: 'rgba(255,255,255,0.75)',
                  background: 'rgba(0,0,0,0.45)',
                  border: '1px solid rgba(34,171,148,0.2)',
                  padding: '6px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleDetails?.(folder.id); }}
                  style={{ background: 'none', border: 'none', color: 'var(--terminal-prime, #22ab94)', cursor: 'pointer', fontFamily: 'Consolas, monospace', fontSize: 16, flexShrink: 0, padding: 0 }}
                  title="Show full details"
                >
                  {'▸'} dETAILS
                </button>
                {(() => {
                  const tip = detailsTooltip(folder.locationInfo);
                  return (
                    <ComplexTooltip title={tip.title} modifiers={tip.modifiers} totalValue={0} hideTotal disabled={isFolderDragging}
                      triggerStyle={{ flex: 1, minWidth: 0, width: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'help' }}>
                      {folder.locationInfo.description || <span style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.3)' }}>(no description)</span>}
                    </ComplexTooltip>
                  );
                })()}
              </div>
            </foreignObject>
          )}

          {/* Full details panel — every Location field; opt-in via the
              dETAILS toggle. Read-only; editing routes through JEWL. */}
          {!folder.collapsed && !!folder.detailsOpen && (() => {
            const li = folder.locationInfo!;
            const emptyPlaceholder = (
              <span style={{ color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>(empty)</span>
            );
            return (
              <foreignObject
                x={bounds.x + 12}
                y={bounds.y + 86}
                width={Math.max(bounds.width - 24, 200)}
                height={locationDetailsPanelHeight(li) + 8}
                style={{ pointerEvents: 'auto', overflow: 'visible' }}
              >
                <div
                  style={{
                    fontFamily: 'Consolas, monospace',
                    fontSize: 22,
                    color: '#fdfdfd',
                    background: 'rgba(0,0,0,0.55)',
                    border: '1px solid rgba(34,171,148,0.25)',
                    padding: '12px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleDetails?.(folder.id); }}
                    style={{ background: 'none', border: 'none', color: 'var(--terminal-prime, #22ab94)', cursor: 'pointer', fontFamily: 'Consolas, monospace', fontSize: 16, alignSelf: 'flex-start', padding: 0 }}
                    title="Collapse details"
                  >
                    {'▾'} dETAILS
                  </button>
                  <div style={{ fontSize: 22, lineHeight: 1.4, color: '#fdfdfd', whiteSpace: 'pre-wrap' }}>
                    {li.description || emptyPlaceholder}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 18px', marginTop: 4 }}>
                    <div>
                      <div style={{ fontSize: 18, letterSpacing: '0.15em', color: 'rgba(34,171,148,0.8)' }}>ENVIRONMENT</div>
                      <div style={{ fontSize: 22, color: '#fdfdfd' }}>{li.environment || emptyPlaceholder}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 18, letterSpacing: '0.15em', color: 'rgba(34,171,148,0.8)' }}>POPULATION</div>
                      <div style={{ fontSize: 22, color: '#fdfdfd' }}>{li.population || emptyPlaceholder}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 18, letterSpacing: '0.15em', color: 'rgba(34,171,148,0.8)' }}>DANGER</div>
                      <div style={{ fontSize: 22, color: li.dangerLevel == null ? undefined : li.dangerLevel >= 7 ? 'var(--pillar-body)' : li.dangerLevel >= 4 ? 'var(--krma-gold)' : 'var(--terminal-prime)' }}>
                        {li.dangerLevel != null ? `${li.dangerLevel} / 10` : emptyPlaceholder}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 18, letterSpacing: '0.15em', color: 'rgba(34,171,148,0.8)' }}>CONTROLLED BY</div>
                      <div style={{ fontSize: 22, color: '#fdfdfd' }}>{li.controlledBy || emptyPlaceholder}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 18, letterSpacing: '0.15em', color: 'rgba(34,171,148,0.8)', marginBottom: 4 }}>TAGS</div>
                    {li.tags && li.tags.length > 0 ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {li.tags.map((tag, i) => (
                          <span
                            key={i}
                            style={{
                              fontSize: 17,
                              padding: '3px 12px',
                              background: 'rgba(34,171,148,0.15)',
                              border: '1px solid rgba(34,171,148,0.4)',
                              color: 'var(--terminal-prime)',
                              letterSpacing: '0.08em',
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : <div style={{ fontSize: 22 }}>{emptyPlaceholder}</div>}
                  </div>
                  <div style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
                    <div style={{ fontSize: 18, letterSpacing: '0.15em', color: 'rgba(255,204,120,0.8)' }}>GM NOTES</div>
                    <div style={{ fontSize: 20, color: 'rgba(253,253,253,0.8)', whiteSpace: 'pre-wrap', lineHeight: 1.4, fontStyle: 'italic' }}>
                      {li.notes || emptyPlaceholder}
                    </div>
                  </div>
                </div>
              </foreignObject>
            );
          })()}
        </>
      )}

      {/* KRMA Reserve — when COLLAPSED, render as a compact pill ABOVE
          the folder (clear of the expand button which lives in the
          header's bottom-right corner). */}
      {folder.collapsed && folder.locationInfo && folder.locationInfo.krmaReserve != null && (() => {
        const reserve = folder.locationInfo.krmaReserve!;
        const formatReserve = (n: number): string => {
          const abs = Math.abs(n);
          if (abs >= 1e15) return `${(n / 1e15).toFixed(2)}P`;
          if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
          if (abs >= 1e9)  return `${(n / 1e9).toFixed(2)}B`;
          if (abs >= 1e6)  return `${(n / 1e6).toFixed(2)}M`;
          if (abs >= 1e3)  return `${(n / 1e3).toFixed(1)}K`;
          return n.toLocaleString();
        };
        return (
          <foreignObject
            x={bounds.x + bounds.width - 188}
            y={bounds.y - 40}
            width={180}
            height={30}
            style={{ pointerEvents: 'none', overflow: 'visible' }}
          >
            <div
              style={{
                padding: '4px 12px',
                background: 'rgba(0,0,0,0.6)',
                border: '1px solid rgba(255,204,120,0.55)',
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 6,
                fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                color: 'var(--krma-gold)',
              }}
              title={`${reserve.toLocaleString()} Ҝ — KRMA Reserve`}
            >
              <span style={{ fontSize: 10, letterSpacing: '0.15em', opacity: 0.75 }}>KRMA</span>
              <span style={{ fontSize: 18, letterSpacing: '0.04em' }}>
                {formatReserve(reserve)} <span style={{ fontSize: 12, opacity: 0.8 }}>Ҝ</span>
              </span>
            </div>
          </foreignObject>
        );
      })()}

      {/* KRMA Reserve readout — EXPANDED Location auto-folders. The folder
          IS the Location, so its ambient KRMA mass shows where the party
          TKV would. Same slide-right collision logic as TKV. */}
      {!folder.collapsed && folder.locationInfo && folder.locationInfo.krmaReserve != null && (() => {
        const reserve = folder.locationInfo.krmaReserve!;
        const formatReserve = (n: number): string => {
          const abs = Math.abs(n);
          if (abs >= 1e15) return `${(n / 1e15).toFixed(2)}P`;
          if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
          if (abs >= 1e9)  return `${(n / 1e9).toFixed(2)}B`;
          if (abs >= 1e6)  return `${(n / 1e6).toFixed(2)}M`;
          if (abs >= 1e3)  return `${(n / 1e3).toFixed(1)}K`;
          return n.toLocaleString();
        };
        const kW = 320;
        const labelRight = bounds.x + titleLeft + titleEstW + 16;
        const centeredX = bounds.x + bounds.width / 2 - kW / 2;
        const kX = Math.max(centeredX, labelRight);
        return (
          <foreignObject
            x={kX}
            y={bounds.y - 69}
            width={kW}
            height={144}
            style={{ pointerEvents: 'none', overflow: 'visible' }}
          >
            <div style={{
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              border: '4px solid var(--krma-gold)', borderRadius: 8,
              fontFamily: "'Bebas Neue', var(--font-bebas-neue), sans-serif",
            }}>
              <div style={{ backgroundColor: 'var(--pillar-body)', color: 'var(--krma-gold)', fontSize: 32, textAlign: 'center', lineHeight: '1', padding: '12px 20px', letterSpacing: '0.08em' }}>
                KRMA RES
              </div>
              <div style={{ backgroundColor: '#ffcc7822', color: 'var(--krma-gold)', fontSize: 56, textAlign: 'center', lineHeight: '1.1', padding: '8px 20px', fontWeight: 700 }}>
                {formatReserve(reserve)} <span style={{ fontSize: 36, opacity: 0.85 }}>Ҝ</span>
              </div>
            </div>
          </foreignObject>
        );
      })()}

      {/* ACTIONS button — inside header, left side */}
      {folder.type === 'party' && (
        <foreignObject
          x={bounds.x + 8}
          y={bounds.y + (HEADER_HEIGHT - btnH) / 2}
          width={btnW}
          height={btnH}
          style={{ pointerEvents: 'auto', overflow: 'visible' }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onActionsToggle(folder.id);
            }}
            style={{
              background: showActionsMenu ? `${color}33` : `${color}18`,
              border: `1px solid ${color}55`,
              borderRadius: 4,
              padding: '4px 14px',
              color: '#F5F4EF',
              fontSize: btnFontSize,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              letterSpacing: '0.08em',
              whiteSpace: 'nowrap',
            }}
          >
            ACTIONS ▾
          </button>
        </foreignObject>
      )}

      {/* Collapse/Expand toggle — right side of header */}
      <foreignObject
        x={bounds.x + bounds.width - toggleSize - 12}
        y={bounds.y + (HEADER_HEIGHT - toggleSize) / 2}
        width={toggleSize}
        height={toggleSize}
        style={{ pointerEvents: 'auto', overflow: 'visible' }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapsed(folder.id, bounds);
          }}
          style={{
            width: toggleSize,
            height: toggleSize,
            background: `${color}22`,
            border: `1px solid ${color}55`,
            borderRadius: '50%',
            color: '#F5F4EF',
            fontSize: 36,
            lineHeight: '1',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title={collapsed ? 'Expand folder' : 'Collapse folder'}
        >
          {collapsed ? '\u2295' : '\u2297'}
        </button>
      </foreignObject>

      {/* "Who is here" chips (2026-09-28): every character in this place, as a
          portrait/initials chip in the header bar — the room's headline is its people. */}
      {!collapsed && folder.locationInfo && folderChars.length > 0 && (() => {
        const CHIP = 26, STEP = 60, MAX = 6;
        const shown = folderChars.slice(0, MAX);
        const extra = folderChars.length - shown.length;
        const slots = shown.length + (extra > 0 ? 1 : 0);
        const rightEdge = bounds.x + bounds.width - toggleSize - 28;
        const rowW = slots * STEP;
        // HTML chips (not SVG circles) so each one can be a ComplexTooltip
        // trigger — hover for the person's pillars, inception into each pillar.
        return (
          <foreignObject
            x={rightEdge - rowW - CHIP}
            y={bounds.y + 40 - CHIP - 4}
            width={rowW}
            height={2 * CHIP + 8}
            style={{ pointerEvents: 'none', overflow: 'visible' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: STEP - 2 * CHIP, height: 2 * CHIP + 8 }}>
              {shown.map((c) => {
                const initials = c.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
                const tip = characterChipTooltip(c);
                return (
                  <ComplexTooltip key={c.id} inline title={tip.title} modifiers={tip.modifiers} totalValue={0}
                    totalLabel={tip.totalLabel} totalText={tip.totalText} disabled={isFolderDragging}
                    triggerStyle={tipTriggerStyle} onTriggerPointerDown={handleHeaderDrag}>
                    <div
                      title={c.name}
                      style={{
                        width: 2 * CHIP, height: 2 * CHIP, borderRadius: '50%', boxSizing: 'border-box',
                        background: '#0d0d1a', border: '3px solid var(--krma-gold)', overflow: 'hidden',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {c.portrait ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.portrait} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontWeight: 700, fontSize: CHIP * 1.05, color: 'var(--krma-gold)', lineHeight: 1 }}>{initials}</span>
                      )}
                    </div>
                  </ComplexTooltip>
                );
              })}
              {extra > 0 && (
                <span style={{ width: 2 * CHIP, textAlign: 'center', fontSize: 22, color: '#CBD9E8', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>+{extra}</span>
              )}
            </div>
          </foreignObject>
        );
      })()}

      {/* Resize handles — only when expanded */}
      {!collapsed && (
        <>
          {/* Right edge */}
          <rect
            x={bounds.x + bounds.width - handleSize / 2}
            y={bounds.y + displayHeight / 2 - 40}
            width={handleSize}
            height={80}
            rx={3}
            fill={`${color}${resizing?.edge === 'right' ? 'aa' : '66'}`}
            stroke={`${color}44`}
            strokeWidth={1}
            style={{ cursor: 'ew-resize', pointerEvents: 'auto' }}
            onPointerDown={(e) => handleResizeStart(e, 'right')}
          />
          {/* Left edge */}
          <rect
            x={bounds.x - handleSize / 2}
            y={bounds.y + displayHeight / 2 - 40}
            width={handleSize}
            height={80}
            rx={3}
            fill={`${color}${resizing?.edge === 'left' ? 'aa' : '66'}`}
            stroke={`${color}44`}
            strokeWidth={1}
            style={{ cursor: 'ew-resize', pointerEvents: 'auto' }}
            onPointerDown={(e) => handleResizeStart(e, 'left')}
          />
          {/* Bottom edge */}
          <rect
            x={bounds.x + bounds.width / 2 - 40}
            y={bounds.y + displayHeight - handleSize / 2}
            width={80}
            height={handleSize}
            rx={3}
            fill={`${color}${resizing?.edge === 'bottom' ? 'aa' : '66'}`}
            stroke={`${color}44`}
            strokeWidth={1}
            style={{ cursor: 'ns-resize', pointerEvents: 'auto' }}
            onPointerDown={(e) => handleResizeStart(e, 'bottom')}
          />
          {/* Bottom-right corner */}
          <rect
            x={bounds.x + bounds.width - handleSize}
            y={bounds.y + displayHeight - handleSize}
            width={handleSize}
            height={handleSize}
            rx={3}
            fill={`${color}${resizing?.edge === 'corner' ? 'aa' : '66'}`}
            stroke={`${color}44`}
            strokeWidth={1}
            style={{ cursor: 'nwse-resize', pointerEvents: 'auto' }}
            onPointerDown={(e) => handleResizeStart(e, 'corner')}
          />
          {/* Bottom-left corner */}
          <rect
            x={bounds.x}
            y={bounds.y + displayHeight - handleSize}
            width={handleSize}
            height={handleSize}
            rx={3}
            fill={`${color}${resizing?.edge === 'left-corner' ? 'aa' : '66'}`}
            stroke={`${color}44`}
            strokeWidth={1}
            style={{ cursor: 'nesw-resize', pointerEvents: 'auto' }}
            onPointerDown={(e) => handleResizeStart(e, 'left-corner')}
          />
          {/* Top edge — straddles the boundary so it never fights the
              title-bar drag inside the header chrome */}
          <rect
            x={bounds.x + bounds.width / 2 - 40}
            y={bounds.y - handleSize / 2}
            width={80}
            height={handleSize}
            rx={3}
            fill={`${color}${resizing?.edge === 'top' ? 'aa' : '66'}`}
            stroke={`${color}44`}
            strokeWidth={1}
            style={{ cursor: 'ns-resize', pointerEvents: 'auto' }}
            onPointerDown={(e) => handleResizeStart(e, 'top')}
          />
          {/* Top-right corner */}
          <rect
            x={bounds.x + bounds.width - handleSize / 2}
            y={bounds.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            rx={3}
            fill={`${color}${resizing?.edge === 'top-corner' ? 'aa' : '66'}`}
            stroke={`${color}44`}
            strokeWidth={1}
            style={{ cursor: 'nesw-resize', pointerEvents: 'auto' }}
            onPointerDown={(e) => handleResizeStart(e, 'top-corner')}
          />
          {/* Top-left corner */}
          <rect
            x={bounds.x - handleSize / 2}
            y={bounds.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            rx={3}
            fill={`${color}${resizing?.edge === 'top-left-corner' ? 'aa' : '66'}`}
            stroke={`${color}44`}
            strokeWidth={1}
            style={{ cursor: 'nwse-resize', pointerEvents: 'auto' }}
            onPointerDown={(e) => handleResizeStart(e, 'top-left-corner')}
          />
        </>
      )}
    </g>
  );
}

// ── HTML Overlay (dropdown menu + RestPanel only) ──
// Label and ACTIONS button are now SVG elements in FolderGroupRect.
// This overlay handles popups that need to stay readable at any zoom.

export default function FolderGroup({
  folder,
  nodePositions,
  dragOffsets,
  nodeTypes,
  expandedNodes,
  childFolderRects,
  characters,
  campaignId,
  viewBox,
  zoom,
  onFolderDragStart: _onFolderDragStart,
  onRemoveFromFolder: _onRemoveFromFolder,
  onRestComplete,
  isDropTarget = false,
  onDrillIn: _onDrillIn,
}: FolderGroupProps) {
  const [showRestPanel, setShowRestPanel] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!showActionsMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick, true);
    return () => document.removeEventListener('mousedown', handleClick, true);
  }, [showActionsMenu]);

  // Listen for actions-toggle events from SVG button
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.folderId === folder.id) {
        setShowActionsMenu(prev => !prev);
        setShowRestPanel(false);
      }
    };
    window.addEventListener('folder-actions-toggle', handler);
    return () => window.removeEventListener('folder-actions-toggle', handler);
  }, [folder.id]);

  const content = useMemo(
    () => calcContentBounds(folder, nodePositions, dragOffsets, nodeTypes, expandedNodes, childFolderRects, folderLabelSize(zoom) + 16),
    [folder, nodePositions, dragOffsets, nodeTypes, expandedNodes, childFolderRects, zoom]
  );

  const bounds = useMemo(() => {
    if (!content) return null;
    const display = clampDraftingRect(folder, getDisplayBounds(content, folder));
    return { x: display.x, y: display.y, width: display.width };
  }, [content, folder]);

  if (!bounds) return null;
  if (!showActionsMenu && !showRestPanel) return null;

  // Position the dropdown at the ACTIONS button location (left side of header)
  const btnSvgX = bounds.x + 8;
  const btnSvgY = bounds.y + HEADER_HEIGHT; // just below header
  const leftFraction = (btnSvgX - viewBox.x) / viewBox.width;
  const topFraction = (btnSvgY - viewBox.y) / viewBox.height;

  const folderChars = characters.filter(c => folder.nodeIds.includes(c.id));
  const color = folder.type === 'party' ? SOUL_BLUE : (folder.color || SOUL_BLUE);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        left: `${(leftFraction * 100).toFixed(4)}%`,
        top: `${(topFraction * 100).toFixed(4)}%`,
        zIndex: 50,
        pointerEvents: 'auto',
        userSelect: 'none',
        transform: `scale(${1 / zoom})`,
        transformOrigin: 'top left',
      }}
    >
      {/* Dropdown menu */}
      {showActionsMenu && (
        <div style={{
          background: '#1a1e2e',
          border: `1px solid ${color}44`,
          borderRadius: 6,
          padding: 4,
          minWidth: 160,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowRestPanel(!showRestPanel);
              setShowActionsMenu(false);
            }}
            style={{
              display: 'block',
              width: '100%',
              background: showRestPanel ? `${color}22` : 'transparent',
              border: 'none',
              borderRadius: 4,
              padding: '8px 12px',
              color: '#F5F4EF',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              letterSpacing: '0.06em',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.background = `${color}22`; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.background = showRestPanel ? `${color}22` : 'transparent'; }}
          >
            ☾ REST
          </button>
          {/* Future actions go here */}
        </div>
      )}

      {/* Rest Panel popup */}
      {showRestPanel && folder.type === 'party' && (
        <div style={{ marginTop: 4 }}>
          <RestPanel
            characters={folderChars}
            campaignId={campaignId}
            onClose={() => setShowRestPanel(false)}
            onRestComplete={() => {
              onRestComplete();
            }}
          />
        </div>
      )}
    </div>
  );
}
