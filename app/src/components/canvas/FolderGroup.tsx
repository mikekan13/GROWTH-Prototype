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

function getNodeDimensions(nodeType: string, isExpanded: boolean): NodeDimensions {
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
  onFolderResize?: (folderId: string, width: number, height: number) => void;
  onRestComplete: () => void;
}

const FOLDER_PADDING = 30;
const HEADER_HEIGHT = 64;
const SOUL_BLUE = '#002f6c';
const HANDLE_SIZE = 14;

// ── Shared bounds calculation ──

interface ContentBounds {
  x: number;
  y: number;
  minWidth: number;
  minHeight: number;
}

function calcContentBounds(
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
  if (folder.type === 'party' && maxY > -20) {
    maxY = -20;
  }

  return {
    x: minX - FOLDER_PADDING,
    y: minY - FOLDER_PADDING - HEADER_HEIGHT,
    minWidth: (maxX - minX) + FOLDER_PADDING * 2,
    minHeight: (maxY - minY) + FOLDER_PADDING * 2 + HEADER_HEIGHT,
  };
}

function getDisplayBounds(content: ContentBounds, folder: CanvasFolder) {
  const width = Math.max(content.minWidth, folder.userWidth || 0);
  let height = Math.max(content.minHeight, folder.userHeight || 0);
  // Party folders: clamp so bottom edge stays above KRMA line (y=0)
  if (folder.type === 'party') {
    const maxH = -content.y - 20; // 20px gap above line
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
}: {
  folder: CanvasFolder;
  nodePositions: Map<string, NodePosition>;
  dragOffsets: Map<string, { x: number; y: number }>;
  nodeTypes: Map<string, string>;
  expandedNodes: Set<string>;
  characters: CharacterInfo[];
  onFolderResize?: (folderId: string, width: number, height: number) => void;
  onFolderDragStart: (folderId: string, startSvg: { x: number; y: number }) => void;
  onActionsToggle: (folderId: string) => void;
  onToggleCollapsed: (folderId: string) => void;
  showActionsMenu: boolean;
  svgRef?: React.RefObject<SVGSVGElement | null>;
  viewBox?: { x: number; y: number; width: number; height: number };
}) {
  const [resizing, setResizing] = useState<{
    edge: 'right' | 'bottom' | 'corner';
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const content = useMemo(
    () => calcContentBounds(folder, nodePositions, dragOffsets, nodeTypes, expandedNodes),
    [folder, nodePositions, dragOffsets, nodeTypes, expandedNodes]
  );

  const COLLAPSED_WIDTH = 400;

  const bounds = useMemo(() => {
    if (!content) return null;
    const display = getDisplayBounds(content, folder);
    if (folder.collapsed) {
      return { ...display, width: COLLAPSED_WIDTH };
    }
    return display;
  }, [content, folder]);

  // Resize mouse handlers
  const handleResizeStart = useCallback((
    e: React.MouseEvent,
    edge: 'right' | 'bottom' | 'corner',
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!bounds) return;
    setResizing({ edge, startX: e.clientX, startY: e.clientY, startW: bounds.width, startH: bounds.height });
  }, [bounds]);

  useEffect(() => {
    if (!resizing || !content) return;

    const handleMove = (e: MouseEvent) => {
      if (!svgRef?.current || !viewBox) return;
      const rect = svgRef.current.getBoundingClientRect();
      const scaleX = viewBox.width / rect.width;
      const scaleY = viewBox.height / rect.height;
      const dx = (e.clientX - resizing.startX) * scaleX;
      const dy = (e.clientY - resizing.startY) * scaleY;

      let newW = resizing.startW;
      let newH = resizing.startH;

      if (resizing.edge === 'right' || resizing.edge === 'corner') {
        newW = Math.max(content.minWidth, resizing.startW + dx);
      }
      if (resizing.edge === 'bottom' || resizing.edge === 'corner') {
        newH = Math.max(content.minHeight, resizing.startH + dy);
        // Party folders: bottom edge can't cross the KRMA line (y=0)
        if (folder.type === 'party' && content) {
          const maxH = -content.y - 20; // 20px buffer above line
          if (maxH > 0 && newH > maxH) newH = maxH;
        }
      }

      onFolderResize?.(folder.id, newW, newH);
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
  const labelFontSize = 20;
  const countFontSize = 14;
  const btnW = 120;
  const btnH = 32;
  const btnFontSize = 14;
  const toggleSize = 28;

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
      {/* Background rect — hidden when collapsed */}
      {!collapsed && (
        <rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={displayHeight}
          rx={8}
          ry={8}
          fill={`${color}08`}
          stroke={`${color}44`}
          strokeWidth={2}
          strokeDasharray="12 6"
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
        fill={color}
        fillOpacity={1}
        style={{ cursor: 'grab', pointerEvents: 'auto' }}
        onMouseDown={handleHeaderDrag}
      />
      {/* Bottom corners square off where header meets body */}
      {!collapsed && (
        <rect
          x={bounds.x}
          y={bounds.y + HEADER_HEIGHT - 8}
          width={bounds.width}
          height={8}
          fill={`${color}18`}
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
        {folder.type === 'party' ? '\u2694 ' : '\u25A1 '}{folder.name.toUpperCase()}
        <tspan fill={`${folder.type === 'party' ? '#22ab94' : color}99`} fontSize={countFontSize} dx={6}>
          ({folder.nodeIds.length})
        </tspan>
      </text>

      {/* TKV readout — label above header, number centered in header */}
      <text
        x={bounds.x + bounds.width / 2}
        y={bounds.y - 4}
        fill="#D0A030"
        fontSize={28}
        fontWeight={700}
        fontFamily="var(--font-bebas-neue), Bebas Neue, sans-serif"
        textAnchor="middle"
        style={{ pointerEvents: 'none' }}
      >
        T&#x049C;V
      </text>
      <rect
        x={bounds.x + bounds.width / 2 - 60}
        y={bounds.y + HEADER_HEIGHT / 2 - 20}
        width={120}
        height={40}
        rx={3}
        fill="#582a72"
        fillOpacity={1}
        stroke="#D0A030"
        strokeWidth={1}
        strokeOpacity={0.4}
        style={{ pointerEvents: 'none' }}
      />
      <text
        x={bounds.x + bounds.width / 2}
        y={bounds.y + HEADER_HEIGHT / 2}
        fill="#D0A030"
        fontSize={32}
        fontWeight={700}
        fontFamily="var(--font-bebas-neue), Bebas Neue, sans-serif"
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ pointerEvents: 'none' }}
      >
        {totalTKV.toLocaleString()}
      </text>

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
            fontSize: 18,
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
          <rect
            x={bounds.x + bounds.width - HANDLE_SIZE / 2}
            y={bounds.y + displayHeight / 2 - 20}
            width={HANDLE_SIZE}
            height={40}
            rx={3}
            fill={`${color}${resizing?.edge === 'right' ? '66' : '22'}`}
            stroke={`${color}44`}
            strokeWidth={1}
            style={{ cursor: 'ew-resize', pointerEvents: 'auto' }}
            onMouseDown={(e) => handleResizeStart(e, 'right')}
          />
          <rect
            x={bounds.x + bounds.width / 2 - 20}
            y={bounds.y + displayHeight - HANDLE_SIZE / 2}
            width={40}
            height={HANDLE_SIZE}
            rx={3}
            fill={`${color}${resizing?.edge === 'bottom' ? '66' : '22'}`}
            stroke={`${color}44`}
            strokeWidth={1}
            style={{ cursor: 'ns-resize', pointerEvents: 'auto' }}
            onMouseDown={(e) => handleResizeStart(e, 'bottom')}
          />
          <rect
            x={bounds.x + bounds.width - HANDLE_SIZE}
            y={bounds.y + displayHeight - HANDLE_SIZE}
            width={HANDLE_SIZE}
            height={HANDLE_SIZE}
            rx={3}
            fill={`${color}${resizing?.edge === 'corner' ? '66' : '22'}`}
            stroke={`${color}44`}
            strokeWidth={1}
            style={{ cursor: 'nwse-resize', pointerEvents: 'auto' }}
            onMouseDown={(e) => handleResizeStart(e, 'corner')}
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
