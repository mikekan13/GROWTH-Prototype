"use client";

import React, { useState, useEffect } from 'react';

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
  };
}

export interface CharacterData {
  id: string;
  type: 'character';
  name: string;
  krmaValue: number;
  x: number;
  y: number;
  connections: any[];
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
  className?: string;
}

const CharacterCard: React.FC<CharacterCardProps> = ({
  node,
  isSelected = false,
  isExpanded = false,
  onToggleExpand,
  onPositionChange
}) => {
  const [sheetData, setSheetData] = useState<SheetCharacterData | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [imageError, setImageError] = useState(false);

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

  // Fetch character card data from Google Sheets
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
            console.log("📊 Loaded character data from Google Sheets:", result.data);
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

  const character = node.characterDetails;
  const levels = character?.levels;
  const attributes = character?.attributes;

  // Drag functionality for SVG coordinate system
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!onPositionChange) return;

    e.preventDefault();
    e.stopPropagation(); // Prevent canvas panning

    const startX = e.clientX;
    const startY = e.clientY;
    const startNodeX = node.x;
    const startNodeY = node.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      // Get the SVG element to calculate proper scaling
      const foreignObject = (e.target as Element).closest('foreignObject');
      const svg = foreignObject?.closest('svg');

      if (svg) {
        const rect = svg.getBoundingClientRect();
        const viewBox = svg.viewBox.baseVal;

        // Calculate scaling factor based on viewBox vs container size (same as KRMALine)
        const scaleX = viewBox.width / rect.width;
        const scaleY = viewBox.height / rect.height;

        const newX = startNodeX + (deltaX * scaleX);
        const newY = startNodeY + (deltaY * scaleY);

        onPositionChange(node.id, newX, newY);
      } else {
        // Fallback without scaling if SVG not found
        const newX = startNodeX + deltaX;
        const newY = startNodeY + deltaY;
        onPositionChange(node.id, newX, newY);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };


  // Compacted view - 500x200px
  if (!isExpanded) {
    return (
      <div className="relative">
        <div
          className="flex bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-gray-700/50 rounded-lg p-3 text-white shadow-lg cursor-move hover:border-gray-600"
          style={{ width: '500px', height: '200px' }}
          onMouseDown={handleMouseDown}
        >
          {/* Profile Picture Section - Left */}
          <div className="flex-shrink-0 w-20 h-20 mr-3">
            <div className="w-full h-full bg-gray-600 rounded border border-gray-500 flex items-center justify-center text-xs text-gray-300">
              {!imageError && (sheetData?.portrait || character?.characterImage) ? (
                <img
                  src={sheetData?.portrait || character?.characterImage}
                  alt={sheetData?.name || node.name}
                  className="w-full h-full object-cover rounded"
                  onError={() => setImageError(true)}
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
                <span className="text-green-400">W:</span> {levels?.wealthLevel || 1}
              </div>
              <div className="text-xs">
                <span className="text-blue-400">T:</span> {levels?.techLevel || 1}
              </div>
              <div className="text-xs">
                <span className="text-red-400">H:</span> {levels?.healthLevel || 1}
              </div>
            </div>

            {/* 8 Attribute Bars in 3x3 Grid (Body: 3, Soul: 3, Spirit: 2) */}
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

              {/* Spirit Pillar - Purple (2 attributes only) */}
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
              {/* Empty slot for 8-attribute layout */}
              <div className="flex flex-col opacity-30">
                <div className="text-xs text-gray-500 mb-1">---</div>
                <div className="flex-1 bg-gray-700 rounded mb-1">
                  <div className="h-2 bg-gray-600 rounded" style={{ width: '0%' }} />
                </div>
                <div className="text-xs text-center text-gray-500">--</div>
              </div>
            </div>
          </div>

          {/* TKV Box - Right */}
          <div className="flex-shrink-0 w-16 h-20 ml-3 bg-gray-700 rounded border border-gray-500 p-1">
            <div className="text-xs text-gray-300 mb-1">TKV</div>
            <div className="text-xs text-center text-yellow-400">
              {sheetData?.tkv || (node.krmaValue ? node.krmaValue.toLocaleString() : '0')}
            </div>
            <div className="text-xs text-center text-green-400 mt-1">
              {sheetData ? '📊' : 'DB'}
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
      </div>
    );
  }

  // Expanded view - simple for now
  return (
    <div
      className="bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-gray-700/50 rounded-lg p-6 text-white shadow-lg cursor-move hover:border-gray-600"
      style={{ width: '400px', minHeight: '600px' }}
      onMouseDown={handleMouseDown}
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
  );
};

export default CharacterCard;