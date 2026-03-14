'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import RestPanel from './RestPanel';
import type { CanvasFolder } from '@/types/canvas';
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
}

interface FolderGroupProps {
  folder: CanvasFolder;
  nodePositions: Map<string, NodePosition>;
  dragOffsets: Map<string, { x: number; y: number }>;
  nodeTypes: Map<string, string>;
  expandedNodes: Set<string>;
  characters: CharacterInfo[];
  campaignId: string;
  viewBox: { x: number; y: number; width: number; height: number };
  zoom: number;
  onFolderDragStart: (folderId: string, startSvg: { x: number; y: number }) => void;
  onRemoveFromFolder: (folderId: string, nodeId: string) => void;
  onFolderResize?: (folderId: string, width: number, height: number, posX?: number) => void;
  onRestComplete: () => void;
  isDropTarget?: boolean;
}

const FOLDER_PADDING = 30;
const HEADER_HEIGHT = 80;
const SOUL_BLUE = '#002f6c';
const HANDLE_SIZE = 36;

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
): ContentBounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasNodes = false;

  for (const nodeId of folder.nodeIds) {
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

  return {
    x: minX - FOLDER_PADDING,
    y: minY - FOLDER_PADDING - HEADER_HEIGHT,
    minWidth: (maxX - minX) + FOLDER_PADDING * 2,
    minHeight: (maxY - minY) + FOLDER_PADDING * 2 + HEADER_HEIGHT,
  };
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
  folder,
  nodePositions,
  dragOffsets,
  nodeTypes,
  expandedNodes,
  characters,
  onFolderResize,
  onFolderDragStart,
  onActionsToggle,
  onToggleCollapsed,
  showActionsMenu,
  svgRef,
  viewBox,
  isDropTarget = false,
}: {
  folder: CanvasFolder;
  nodePositions: Map<string, NodePosition>;
  dragOffsets: Map<string, { x: number; y: number }>;
  nodeTypes: Map<string, string>;
  expandedNodes: Set<string>;
  characters: CharacterInfo[];
  onFolderResize?: (folderId: string, width: number, height: number, posX?: number) => void;
  onFolderDragStart: (folderId: string, startSvg: { x: number; y: number }) => void;
  onActionsToggle: (folderId: string) => void;
  onToggleCollapsed: (folderId: string) => void;
  showActionsMenu: boolean;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  viewBox?: { x: number; y: number; width: number; height: number };
  isDropTarget?: boolean;
}) {
  const [resizing, setResizing] = useState<{
    edge: 'right' | 'bottom' | 'corner' | 'left' | 'left-corner';
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startPosX: number;
  } | null>(null);

  const content = useMemo(
    () => calcContentBounds(folder, nodePositions, dragOffsets, nodeTypes, expandedNodes),
    [folder, nodePositions, dragOffsets, nodeTypes, expandedNodes]
  );

  const COLLAPSED_WIDTH = 680;

  const MIN_FOLDER_W = 720;
  const MIN_FOLDER_H = 200;

  const bounds = useMemo(() => {
    if (!content) {
      // Empty folder — show a minimum-sized box at folder position
      const w = Math.max(MIN_FOLDER_W, folder.userWidth || 0);
      const h = Math.max(MIN_FOLDER_H, folder.userHeight || 0);
      const baseX = folder.posX ?? -MIN_FOLDER_W / 2;
      const baseY = folder.posY ?? (folder.type === 'party' ? -(MIN_FOLDER_H + 40) : 100);
      // Apply drag offset for visual feedback during drag
      const folderOffset = dragOffsets.get(`__folder__${folder.id}`) || { x: 0, y: 0 };
      return { x: baseX + folderOffset.x, y: baseY + folderOffset.y, width: w, height: h };
    }
    if (folder.collapsed) {
      const display = getDisplayBounds(content, folder);
      return { ...display, width: COLLAPSED_WIDTH };
    }
    // Use posX/posY as high-water mark — folder never shrinks past anchor
    // but grows if content extends beyond it.
    // During folder drag, apply folder offset so anchor translates with content.
    const folderOffset = dragOffsets.get(`__folder__${folder.id}`) || { x: 0, y: 0 };
    const anchorX = (folder.posX != null ? Math.min(folder.posX + folderOffset.x, content.x) : content.x);
    const anchorY = (folder.posY != null ? Math.min(folder.posY + folderOffset.y, content.y) : content.y);
    const contentRight = content.x + content.minWidth;
    const contentBottom = content.y + content.minHeight;
    // Compute right edge independently from anchorX so that moving content left
    // doesn't pull the right edge along. The right edge is anchored to posX-based
    // minimums and only grows when content extends past it.
    const basePosX = folder.posX != null ? folder.posX + folderOffset.x : content.x;
    const rightEdge = Math.max(basePosX + MIN_FOLDER_W, basePosX + (folder.userWidth || 0), contentRight);
    const width = rightEdge - anchorX;
    // Same for bottom edge — moving content up shouldn't pull the bottom edge up.
    const basePosY = folder.posY != null ? folder.posY + folderOffset.y : content.y;
    const bottomEdge = Math.max(basePosY + MIN_FOLDER_H, basePosY + (folder.userHeight || 0), contentBottom);
    let height = bottomEdge - anchorY;
    // Party folders: clamp bottom edge above KRMA line (y=0)
    if (folder.type === 'party') {
      const maxH = -anchorY; // bottom edge flush with KRMA line
      if (maxH > 0 && height > maxH) height = maxH;
    }
    return { x: anchorX, y: anchorY, width, height };
  }, [content, folder, dragOffsets]);

  // Resize mouse handlers
  const handleResizeStart = useCallback((
    e: React.MouseEvent,
    edge: 'right' | 'bottom' | 'corner' | 'left' | 'left-corner',
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!bounds) return;
    setResizing({ edge, startX: e.clientX, startY: e.clientY, startW: bounds.width, startH: bounds.height, startPosX: bounds.x });
  }, [bounds]);

  useEffect(() => {
    if (!resizing) return;

    const minW = Math.max(content ? content.minWidth : 0, MIN_FOLDER_W);
    const minH = Math.max(content ? content.minHeight : 0, MIN_FOLDER_H);
    // Use the actual visual top — anchorY = min(posY, content.y), matching FolderGroupRect bounds
    const contentY = content ? content.y : (folder.posY ?? (folder.type === 'party' ? -(MIN_FOLDER_H + 40) : 100));
    const anchorY = (content && folder.posY != null) ? Math.min(folder.posY, contentY) : contentY;
    const boundsY = anchorY;

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

      if (resizing.edge === 'right' || resizing.edge === 'corner') {
        newW = Math.max(minW, resizing.startW + dx);
      }
      if (resizing.edge === 'left' || resizing.edge === 'left-corner') {
        // Left edge: dragging left increases width, dragging right decreases.
        // The right edge must stay anchored at startPosX + startW.
        const startRight = resizing.startPosX + resizing.startW;
        newW = Math.max(minW, resizing.startW - dx);
        newPosX = startRight - newW;
      }
      if (resizing.edge === 'bottom' || resizing.edge === 'corner' || resizing.edge === 'left-corner') {
        newH = Math.max(minH, resizing.startH + dy);
        // Party folders: bottom edge can't cross the KRMA line (y=0)
        if (folder.type === 'party') {
          const maxH = -boundsY; // bottom edge flush with KRMA line
          if (maxH > 0 && newH > maxH) newH = maxH;
        }
      }

      onFolderResize?.(folder.id, newW, newH, newPosX);
    };

    const handleUp = () => setResizing(null);

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [resizing, content, folder.id, onFolderResize, svgRef, viewBox]);

  if (!bounds) return null;

  const color = folder.type === 'party' ? SOUL_BLUE : (folder.color || SOUL_BLUE);
  const collapsed = !!folder.collapsed;
  const labelFontSize = 36;
  const countFontSize = 32;
  const btnW = 160;
  const btnH = 42;
  const btnFontSize = 20;
  const toggleSize = 68;

  // TKV: sum of all characters' TKV in this folder
  const folderChars = characters.filter(c => folder.nodeIds.includes(c.id));
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
          fill={isDropTarget ? '#22ab9440' : '#19191930'}
          stroke={isDropTarget ? '#22ab94cc' : '#22ab9444'}
          strokeWidth={isDropTarget ? 4 : 2}
          style={{ pointerEvents: 'none', ...(isDropTarget ? { filter: 'drop-shadow(0 0 16px rgba(34,171,148,0.6))' } : undefined) }}
        />
      )}
      {/* Header background */}
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={HEADER_HEIGHT}
        rx={8}
        ry={8}
        fill={isDropTarget ? '#22ab94' : color}
        fillOpacity={1}
        stroke={isDropTarget ? '#22ab94' : 'none'}
        strokeWidth={isDropTarget ? 3 : 0}
        style={{ cursor: 'grab', pointerEvents: 'auto', ...(isDropTarget ? { filter: 'drop-shadow(0 0 12px rgba(34,171,148,0.5))' } : undefined) }}
        onMouseDown={handleHeaderDrag}
      />
      {/* Bottom corners square off where header meets body */}
      {!collapsed && (
        <rect
          x={bounds.x}
          y={bounds.y + HEADER_HEIGHT - 8}
          width={bounds.width}
          height={8}
          fill="#19191930"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Folder label — above the folder box */}
      <text
        x={bounds.x + 8}
        y={bounds.y - 6}
        fill={folder.type === 'party' ? '#22ab94' : color}
        fontSize={labelFontSize}
        fontWeight={700}
        fontFamily="var(--font-terminal), Consolas, monospace"
        letterSpacing="0.12em"
        style={{ pointerEvents: 'none' }}
      >
        {folder.type === 'party' ? <><tspan letterSpacing="-0.53em">{'\u265F'}<tspan fontSize="1.15em">{'\u265F'}</tspan>{'\u265F'}</tspan>{' '}</> : '\u25A1 '}{folder.name.toUpperCase()}
        <tspan fill={`${folder.type === 'party' ? '#22ab94' : color}99`} fontSize={countFontSize} dx={6}>
          ({folder.nodeIds.length})
        </tspan>
      </text>

      {/* TKV readout — standard red label over purple number, slides right if label is too close */}
      {(() => {
        const tkvW = 320;
        // Approximate label width: Consolas 36px + 0.12em letter-spacing ≈ 25px per char
        const charWidth = labelFontSize * 0.7;
        const labelChars = folder.name.length + ` (${folder.nodeIds.length})`.length;
        const chessPieceW = folder.type === 'party' ? 50 : 0; // ♟♟♟ prefix
        const labelRight = bounds.x + 8 + chessPieceW + labelChars * charWidth + 16;
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
              border: '4px solid #ffcc78', borderRadius: 8,
              fontFamily: "'Bebas Neue', var(--font-bebas-neue), sans-serif",
            }}>
              <div style={{ backgroundColor: '#f7525f', color: '#ffcc78', fontSize: 40, textAlign: 'center', lineHeight: '1', padding: '10px 20px', letterSpacing: '0.08em' }}>
                T<span style={{ fontFamily: "'Inknut Antiqua', var(--font-inknut-antiqua), serif", fontWeight: 900 }}>&#x049C;</span>V
              </div>
              <div style={{ backgroundColor: '#b4a7d6', color: '#582a72', fontSize: 56, textAlign: 'center', lineHeight: '1.1', padding: '8px 20px', fontWeight: 700 }}>
                {totalTKV.toLocaleString()}
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
            onToggleCollapsed(folder.id);
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

      {/* Resize handles — only when expanded */}
      {!collapsed && (
        <>
          {/* Right edge */}
          <rect
            x={bounds.x + bounds.width - HANDLE_SIZE / 2}
            y={bounds.y + displayHeight / 2 - 40}
            width={HANDLE_SIZE}
            height={80}
            rx={3}
            fill={`${color}${resizing?.edge === 'right' ? 'aa' : '66'}`}
            stroke={`${color}44`}
            strokeWidth={1}
            style={{ cursor: 'ew-resize', pointerEvents: 'auto' }}
            onMouseDown={(e) => handleResizeStart(e, 'right')}
          />
          {/* Left edge */}
          <rect
            x={bounds.x - HANDLE_SIZE / 2}
            y={bounds.y + displayHeight / 2 - 40}
            width={HANDLE_SIZE}
            height={80}
            rx={3}
            fill={`${color}${resizing?.edge === 'left' ? 'aa' : '66'}`}
            stroke={`${color}44`}
            strokeWidth={1}
            style={{ cursor: 'ew-resize', pointerEvents: 'auto' }}
            onMouseDown={(e) => handleResizeStart(e, 'left')}
          />
          {/* Bottom edge */}
          <rect
            x={bounds.x + bounds.width / 2 - 40}
            y={bounds.y + displayHeight - HANDLE_SIZE / 2}
            width={80}
            height={HANDLE_SIZE}
            rx={3}
            fill={`${color}${resizing?.edge === 'bottom' ? 'aa' : '66'}`}
            stroke={`${color}44`}
            strokeWidth={1}
            style={{ cursor: 'ns-resize', pointerEvents: 'auto' }}
            onMouseDown={(e) => handleResizeStart(e, 'bottom')}
          />
          {/* Bottom-right corner */}
          <rect
            x={bounds.x + bounds.width - HANDLE_SIZE}
            y={bounds.y + displayHeight - HANDLE_SIZE}
            width={HANDLE_SIZE}
            height={HANDLE_SIZE}
            rx={3}
            fill={`${color}${resizing?.edge === 'corner' ? 'aa' : '66'}`}
            stroke={`${color}44`}
            strokeWidth={1}
            style={{ cursor: 'nwse-resize', pointerEvents: 'auto' }}
            onMouseDown={(e) => handleResizeStart(e, 'corner')}
          />
          {/* Bottom-left corner */}
          <rect
            x={bounds.x}
            y={bounds.y + displayHeight - HANDLE_SIZE}
            width={HANDLE_SIZE}
            height={HANDLE_SIZE}
            rx={3}
            fill={`${color}${resizing?.edge === 'left-corner' ? 'aa' : '66'}`}
            stroke={`${color}44`}
            strokeWidth={1}
            style={{ cursor: 'nesw-resize', pointerEvents: 'auto' }}
            onMouseDown={(e) => handleResizeStart(e, 'left-corner')}
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
  characters,
  campaignId,
  viewBox,
  zoom,
  onFolderDragStart: _onFolderDragStart,
  onRemoveFromFolder: _onRemoveFromFolder,
  onRestComplete,
  isDropTarget = false,
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
    () => calcContentBounds(folder, nodePositions, dragOffsets, nodeTypes, expandedNodes),
    [folder, nodePositions, dragOffsets, nodeTypes, expandedNodes]
  );

  const bounds = useMemo(() => {
    if (!content) return null;
    const display = getDisplayBounds(content, folder);
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
