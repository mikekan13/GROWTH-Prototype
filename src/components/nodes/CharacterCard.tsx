"use client";

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';

// Interface for GROWTH attribute structure
export interface GROWTHAttribute {
  current: number;
  level: number;
  modifier: number;
  augmentPositive: number;
  augmentNegative: number;
}

// Interface for Google Sheets character data
interface SheetCharacterData {
  name: string;
  portrait?: string;
  tkv: string;
  attributes: {
    clout: { current: number; max: number };
    celerity: { current: number; max: number };
    constitution: { current: number; max: number };
    focus: { current: number; max: number };
    frequency: { current: number; max: number };
    flow: { current: number; max: number };
    willpower: { current: number; max: number };
    wisdom: { current: number; max: number };
    wit: { current: number; max: number };
  };
  levels?: {
    healthLevel: number;
    techLevel: number;
    wealthLevel: number;
  };
}

export interface CharacterData {
  id: string;
  type: 'character';
  name: string;
  krmaValue: number;
  x: number;
  y: number;
  connections: string[];
  color: string;
  details?: {
    resistance?: number;
    opportunity?: number;
    status?: string;
  };
  characterDetails?: {
    playerEmail?: string;
    characterImage?: string;
    identity?: {
      name: string;
    };
    levels?: {
      healthLevel: number;
      wealthLevel: number;
      techLevel: number;
    };
    attributes?: {
      clout: { current: number; level: number; modifier: number; augmentPositive: number; augmentNegative: number };
      celerity: { current: number; level: number; modifier: number; augmentPositive: number; augmentNegative: number };
      constitution: { current: number; level: number; modifier: number; augmentPositive: number; augmentNegative: number };
      flow: { current: number; level: number; modifier: number; augmentPositive: number; augmentNegative: number };
      frequency: { current: number; level: number; modifier: number; augmentPositive: number; augmentNegative: number };
      focus: { current: number; level: number; modifier: number; augmentPositive: number; augmentNegative: number };
      willpower: { current: number; level: number; modifier: number; augmentPositive: number; augmentNegative: number };
      wisdom: { current: number; level: number; modifier: number; augmentPositive: number; augmentNegative: number };
      wit: { current: number; level: number; modifier: number; augmentPositive: number; augmentNegative: number };
    };
    conditions?: {
      weak: boolean;
      clumsy: boolean;
      exhausted: boolean;
      muted: boolean;
      deathsDoor: boolean;
      deafened: boolean;
      overwhelmed: boolean;
      confused: boolean;
      incoherent: boolean;
    };
  };
}

interface CharacterCardProps {
  node: CharacterData;
  isSelected?: boolean;
  isExpanded?: boolean;
  onNodeClick?: (node: CharacterData) => void;
  onToggleExpand?: (nodeId: string) => void;
  onPositionChange?: (nodeId: string, x: number, y: number) => void;
  onDragOffsetChange?: (nodeId: string, offsetX: number, offsetY: number) => void;
  onDelete?: (nodeId: string) => void;
  className?: string;
}

const CharacterCard: React.FC<CharacterCardProps> = React.memo(({
  node,
  isSelected: _isSelected = false,
  isExpanded = false,
  onToggleExpand,
  onPositionChange,
  onDragOffsetChange,
  onDelete
}) => {
  const [sheetData, setSheetData] = useState<SheetCharacterData | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  // Fetch character card data from database
  useEffect(() => {
    const fetchSheetData = async () => {
      if (!node?.id) {
        console.log('⚠️ CharacterCard: No node ID, skipping sheet data fetch');
        return;
      }

      console.log('🔄 CharacterCard: Fetching sheet data for', node.id);
      setSheetLoading(true);

      try {
        const response = await fetch(`/api/characters/${node.id}/card-data`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            setSheetData(result.data);
            console.log(`📊 Loaded character data (source: ${result.source})`, result.data);
          } else if (result.fallback) {
            setSheetData(result.fallback);
            console.log("⚠️ Using fallback character data");
          } else {
            console.log("ℹ️ No sheet data or fallback available");
          }
        } else {
          console.warn("⚠️ Sheet data fetch failed with status:", response.status);
        }
      } catch (error) {
        console.error("❌ Failed to fetch character sheet data:", error);
      } finally {
        setSheetLoading(false);
      }
    };

    fetchSheetData();
  }, [node?.id]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setShowContextMenu(false);
      }
    };

    if (showContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showContextMenu]);

  console.log('🎯 ULTRA DEBUG - CharacterCard rendering:', {
    nodeId: node?.id,
    nodeName: node?.name,
    hasCharacterDetails: !!node?.characterDetails,
    hasSheetData: !!sheetData,
    isExpanded,
    sheetLoading,
    characterDetailsKeys: node?.characterDetails ? Object.keys(node.characterDetails) : 'none'
  });

  // Early return if no valid node data
  if (!node?.id || !node?.name) {
    console.warn('⚠️ CharacterCard: Invalid node data, not rendering');
    return null;
  }

  const character = node.characterDetails;
  const levels = character?.levels;
  const attributes = character?.attributes;

  // Context menu handler
  const handleContextMenu = (e: React.MouseEvent) => {
    // Only show context menu if onDelete is provided
    if (!onDelete) return;

    e.preventDefault();
    e.stopPropagation();

    // Use pageX/pageY which include scroll offsets
    setContextMenuPos({ x: e.pageX, y: e.pageY });
    setShowContextMenu(true);
  };

  // DRAG: Update parent with SVG coordinate offsets during drag
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only handle left mouse button clicks (button 0)
    if (e.button !== 0) return;

    if (!onPositionChange || !onDragOffsetChange) return;

    e.preventDefault();
    e.stopPropagation(); // Prevent canvas panning

    setIsDragging(true);

    // Get SVG element
    const foreignObject = (e.target as Element).closest('foreignObject');
    const svg = foreignObject?.closest('svg') as SVGSVGElement | null;

    if (!svg) return;

    // Create SVG point for accurate coordinate conversion
    const svgPoint = svg.createSVGPoint();

    // Helper function to convert screen coordinates to SVG coordinates
    const screenToSVG = (clientX: number, clientY: number) => {
      svgPoint.x = clientX;
      svgPoint.y = clientY;
      const transformed = svgPoint.matrixTransform(svg.getScreenCTM()!.inverse());
      return { x: transformed.x, y: transformed.y };
    };

    // Get initial SVG coordinates
    const startSVGCoords = screenToSVG(e.clientX, e.clientY);
    dragStartPosRef.current = { x: node.x, y: node.y };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartPosRef.current) return;

      // Convert current mouse position to SVG coordinates
      const currentSVGCoords = screenToSVG(moveEvent.clientX, moveEvent.clientY);

      // Calculate SVG delta
      const svgDeltaX = currentSVGCoords.x - startSVGCoords.x;
      const svgDeltaY = currentSVGCoords.y - startSVGCoords.y;

      // Update parent with SVG offset - parent will update foreignObject position
      onDragOffsetChange(node.id, svgDeltaX, svgDeltaY);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      if (!dragStartPosRef.current) return;

      // Convert final mouse position to SVG coordinates
      const finalSVGCoords = screenToSVG(upEvent.clientX, upEvent.clientY);

      // Calculate SVG delta
      const svgDeltaX = finalSVGCoords.x - startSVGCoords.x;
      const svgDeltaY = finalSVGCoords.y - startSVGCoords.y;

      // Calculate final position
      const finalX = dragStartPosRef.current.x + svgDeltaX;
      const finalY = dragStartPosRef.current.y + svgDeltaY;

      // Clear drag offset
      onDragOffsetChange(node.id, 0, 0);

      // COMMIT final position to state/database
      onPositionChange(node.id, finalX, finalY);

      // Reset drag state
      setIsDragging(false);
      dragStartPosRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };


  // Compacted view - 500x200px
  if (!isExpanded) {
    return (
      <div className="relative">
        <div
          className={`flex bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-gray-700/50 rounded-lg p-3 text-white shadow-lg hover:border-gray-600 transition-shadow select-none ${
            isDragging ? 'cursor-grabbing shadow-2xl' : 'cursor-grab'
          }`}
          style={{
            width: '500px',
            height: '200px',
            userSelect: 'none',
          }}
          onMouseDown={handleMouseDown}
          onContextMenu={handleContextMenu}
        >
          {/* Profile Picture Section - Left */}
          <div className="flex-shrink-0 w-20 h-20 mr-3">
            <div className="w-full h-full bg-gray-600 rounded border border-gray-500 flex items-center justify-center text-xs text-gray-300 relative">
              {!imageError && (sheetData?.portrait || character?.characterImage) ? (
                <Image
                  src={sheetData?.portrait || character?.characterImage || ''}
                  alt={sheetData?.name || node.name}
                  fill
                  className="object-cover rounded"
                  onError={() => setImageError(true)}
                  sizes="80px"
                />
              ) : (
                <span className="text-xl font-bold">
                  {(sheetData?.name || node.name)?.charAt(0)?.toUpperCase() || '?'}
                </span>
              )}
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col">
            {/* Character Name */}
            <div className="text-sm font-bold text-white mb-2 truncate">
              {sheetData?.name || node.name || 'Unnamed Character'}
              {sheetLoading && <span className="ml-2 text-yellow-400">📊</span>}
            </div>

            {/* WTH Levels Row */}
            <div className="flex gap-3 mb-3">
              <div className="text-xs">
                <span className="text-green-400">W:</span> {sheetData?.levels?.wealthLevel || levels?.wealthLevel || 1}
              </div>
              <div className="text-xs">
                <span className="text-blue-400">T:</span> {sheetData?.levels?.techLevel || levels?.techLevel || 1}
              </div>
              <div className="text-xs">
                <span className="text-red-400">H:</span> {sheetData?.levels?.healthLevel || levels?.healthLevel || 1}
              </div>
            </div>

            {/* 9 Attribute Bars in 3x3 Grid (Body: 3, Soul: 3, Spirit: 3) */}
            <div className="grid grid-cols-3 gap-2 flex-1">
              {/* Body Pillar - Orange */}
              <div className="flex flex-col">
                <div className="text-xs text-orange-400 mb-1">CLO</div>
                <div className="flex-1 bg-gray-700 rounded mb-1">
                  <div
                    className="h-2 bg-orange-500 rounded"
                    style={{
                      width: `${sheetData?.attributes?.clout ?
                        (sheetData.attributes.clout.current / sheetData.attributes.clout.max) * 100 :
                        ((attributes?.clout?.current || 0) / 20) * 100}%`
                    }}
                  />
                </div>
                <div className="text-xs text-center">
                  {sheetData?.attributes?.clout ?
                    `${sheetData.attributes.clout.current}/${sheetData.attributes.clout.max}` :
                    (attributes?.clout?.current || 0)
                  }
                </div>
              </div>
              <div className="flex flex-col">
                <div className="text-xs text-orange-400 mb-1">CEL</div>
                <div className="flex-1 bg-gray-700 rounded mb-1">
                  <div
                    className="h-2 bg-orange-500 rounded"
                    style={{
                      width: `${sheetData?.attributes?.celerity ?
                        (sheetData.attributes.celerity.current / sheetData.attributes.celerity.max) * 100 :
                        ((attributes?.celerity?.current || 0) / 20) * 100}%`
                    }}
                  />
                </div>
                <div className="text-xs text-center">
                  {sheetData?.attributes?.celerity ?
                    `${sheetData.attributes.celerity.current}/${sheetData.attributes.celerity.max}` :
                    (attributes?.celerity?.current || 0)
                  }
                </div>
              </div>
              <div className="flex flex-col">
                <div className="text-xs text-orange-400 mb-1">CON</div>
                <div className="flex-1 bg-gray-700 rounded mb-1">
                  <div
                    className="h-2 bg-orange-500 rounded"
                    style={{
                      width: `${sheetData?.attributes?.constitution ?
                        (sheetData.attributes.constitution.current / sheetData.attributes.constitution.max) * 100 :
                        ((attributes?.constitution?.current || 0) / 20) * 100}%`
                    }}
                  />
                </div>
                <div className="text-xs text-center">
                  {sheetData?.attributes?.constitution ?
                    `${sheetData.attributes.constitution.current}/${sheetData.attributes.constitution.max}` :
                    (attributes?.constitution?.current || 0)
                  }
                </div>
              </div>

              {/* Soul Pillar - Blue */}
              <div className="flex flex-col">
                <div className="text-xs text-blue-400 mb-1">FLO</div>
                <div className="flex-1 bg-gray-700 rounded mb-1">
                  <div
                    className="h-2 bg-blue-500 rounded"
                    style={{
                      width: `${sheetData?.attributes?.flow ?
                        (sheetData.attributes.flow.current / sheetData.attributes.flow.max) * 100 :
                        ((attributes?.flow?.current || 0) / 20) * 100}%`
                    }}
                  />
                </div>
                <div className="text-xs text-center">
                  {sheetData?.attributes?.flow ?
                    `${sheetData.attributes.flow.current}/${sheetData.attributes.flow.max}` :
                    (attributes?.flow?.current || 0)
                  }
                </div>
              </div>
              <div className="flex flex-col">
                <div className="text-xs text-blue-400 mb-1">FRE</div>
                <div className="flex-1 bg-gray-700 rounded mb-1">
                  <div
                    className="h-2 bg-blue-500 rounded"
                    style={{
                      width: `${sheetData?.attributes?.frequency ?
                        (sheetData.attributes.frequency.current / sheetData.attributes.frequency.max) * 100 :
                        ((attributes?.frequency?.current || 0) / 20) * 100}%`
                    }}
                  />
                </div>
                <div className="text-xs text-center">
                  {sheetData?.attributes?.frequency ?
                    `${sheetData.attributes.frequency.current}/${sheetData.attributes.frequency.max}` :
                    (attributes?.frequency?.current || 0)
                  }
                </div>
              </div>
              <div className="flex flex-col">
                <div className="text-xs text-blue-400 mb-1">FOC</div>
                <div className="flex-1 bg-gray-700 rounded mb-1">
                  <div
                    className="h-2 bg-blue-500 rounded"
                    style={{
                      width: `${sheetData?.attributes?.focus ?
                        (sheetData.attributes.focus.current / sheetData.attributes.focus.max) * 100 :
                        ((attributes?.focus?.current || 0) / 20) * 100}%`
                    }}
                  />
                </div>
                <div className="text-xs text-center">
                  {sheetData?.attributes?.focus ?
                    `${sheetData.attributes.focus.current}/${sheetData.attributes.focus.max}` :
                    (attributes?.focus?.current || 0)
                  }
                </div>
              </div>

              {/* Spirit Pillar - Purple (3 attributes) */}
              <div className="flex flex-col">
                <div className="text-xs text-purple-400 mb-1">WIL</div>
                <div className="flex-1 bg-gray-700 rounded mb-1">
                  <div
                    className="h-2 bg-purple-500 rounded"
                    style={{
                      width: `${sheetData?.attributes?.willpower ?
                        (sheetData.attributes.willpower.current / sheetData.attributes.willpower.max) * 100 :
                        ((attributes?.willpower?.current || 0) / 20) * 100}%`
                    }}
                  />
                </div>
                <div className="text-xs text-center">
                  {sheetData?.attributes?.willpower ?
                    `${sheetData.attributes.willpower.current}/${sheetData.attributes.willpower.max}` :
                    (attributes?.willpower?.current || 0)
                  }
                </div>
              </div>
              <div className="flex flex-col">
                <div className="text-xs text-purple-400 mb-1">WIS</div>
                <div className="flex-1 bg-gray-700 rounded mb-1">
                  <div
                    className="h-2 bg-purple-500 rounded"
                    style={{
                      width: `${sheetData?.attributes?.wisdom ?
                        (sheetData.attributes.wisdom.current / sheetData.attributes.wisdom.max) * 100 :
                        ((attributes?.wisdom?.current || 0) / 20) * 100}%`
                    }}
                  />
                </div>
                <div className="text-xs text-center">
                  {sheetData?.attributes?.wisdom ?
                    `${sheetData.attributes.wisdom.current}/${sheetData.attributes.wisdom.max}` :
                    (attributes?.wisdom?.current || 0)
                  }
                </div>
              </div>
              {/* Wit - Third Spirit attribute */}
              <div className="flex flex-col">
                <div className="text-xs text-purple-400 mb-1">WIT</div>
                <div className="flex-1 bg-gray-700 rounded mb-1">
                  <div
                    className="h-2 bg-purple-500 rounded"
                    style={{
                      width: `${sheetData?.attributes?.wit ?
                        (sheetData.attributes.wit.current / sheetData.attributes.wit.max) * 100 :
                        ((attributes?.wit?.current || 0) / 20) * 100}%`
                    }}
                  />
                </div>
                <div className="text-xs text-center">
                  {sheetData?.attributes?.wit ?
                    `${sheetData.attributes.wit.current}/${sheetData.attributes.wit.max}` :
                    (attributes?.wit?.current || 0)
                  }
                </div>
              </div>
            </div>
          </div>

          {/* TKV Box - Right */}
          <div className="flex-shrink-0 w-16 ml-3">
            {/* TKV Display */}
            <div className="bg-gray-700 rounded border border-gray-500 p-1">
              <div className="text-xs text-gray-300 mb-1">TKV</div>
              <div className="text-xs text-center text-yellow-400">
                {sheetData?.tkv || (node.krmaValue ? node.krmaValue.toLocaleString() : '0')}
              </div>
              <div className="text-xs text-center text-green-400 mt-1">
                {sheetData ? '📊' : 'DB'}
              </div>
            </div>
          </div>

          {/* Expand Button */}
          {onToggleExpand && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(node.id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute bottom-1 right-1 w-4 h-4 bg-gray-600 hover:bg-gray-500 rounded text-xs flex items-center justify-center text-white cursor-pointer"
            >
              +
            </button>
          )}
        </div>

        {/* Context Menu - Rendered via Portal */}
        {showContextMenu && typeof window !== 'undefined' && createPortal(
          <div
            ref={contextMenuRef}
            className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-2xl py-1 z-50"
            style={{
              left: `${contextMenuPos.x}px`,
              top: `${contextMenuPos.y}px`,
              minWidth: '160px'
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowContextMenu(false);
                onDelete?.(node.id);
              }}
              className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Character
            </button>
          </div>,
          document.body
        )}
      </div>
    );
  }

  // Expanded view - simple for now
  return (
    <div className="relative">
      <div
        className={`bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-gray-700/50 rounded-lg p-6 text-white shadow-lg hover:border-gray-600 transition-shadow select-none ${
          isDragging ? 'cursor-grabbing shadow-2xl' : 'cursor-grab'
        }`}
        style={{
          width: '400px',
          minHeight: '600px',
          willChange: 'transform',
          userSelect: 'none',
        }}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
      >
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-bold">{node.name}</h3>
          {onToggleExpand && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(node.id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="text-gray-400 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
        <p className="text-gray-300">Expanded character sheet - TODO</p>
      </div>

      {/* Context Menu - Rendered via Portal */}
      {showContextMenu && typeof window !== 'undefined' && createPortal(
        <div
          ref={contextMenuRef}
          className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-2xl py-1 z-50"
          style={{
            left: `${contextMenuPos.x}px`,
            top: `${contextMenuPos.y}px`,
            minWidth: '160px'
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowContextMenu(false);
              onDelete?.(node.id);
            }}
            className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete Character
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for memo - only re-render if these change
  return (
    prevProps.node.id === nextProps.node.id &&
    prevProps.node.x === nextProps.node.x &&
    prevProps.node.y === nextProps.node.y &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isExpanded === nextProps.isExpanded
  );
});

CharacterCard.displayName = 'CharacterCard';

export default CharacterCard;