"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface InventoryItem {
  id: string;
  name: string;
  type: 'weapon' | 'armor' | 'accessory' | 'consumable' | 'tool' | 'misc';
  quantity: number;
  equipped?: boolean;
  description?: string;
  properties?: string[];
  value?: number;
  weight?: number;
  rarity?: 'common' | 'uncommon' | 'rare' | 'very rare' | 'legendary' | 'artifact';
}

interface InventoryCardProps {
  characterId: string;
  items: InventoryItem[];
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onItemEdit?: (item: InventoryItem) => void;
  onItemAdd?: () => void;
  className?: string;
}

export default function InventoryCard({
  characterId: _characterId,
  items,
  isExpanded = false,
  onToggleExpand,
  onItemEdit,
  onItemAdd,
  className
}: InventoryCardProps) {
  const [filter, setFilter] = useState<string>('all');

  // Ensure items is always an array
  const safeItems = Array.isArray(items) ? items : [];

  const getItemTypeIcon = (type: string) => {
    const icons = {
      weapon: '⚔️',
      armor: '🛡️',
      accessory: '📿',
      consumable: '🧪',
      tool: '🔧',
      misc: '📦'
    };
    return icons[type as keyof typeof icons] || '📦';
  };

  const getRarityColor = (rarity: string) => {
    const colors = {
      common: 'text-gray-400 border-gray-400',
      uncommon: 'text-green-400 border-green-400',
      rare: 'text-blue-400 border-blue-400',
      'very rare': 'text-purple-400 border-purple-400',
      legendary: 'text-orange-400 border-orange-400',
      artifact: 'text-red-400 border-red-400'
    };
    return colors[rarity as keyof typeof colors] || 'text-gray-400 border-gray-400';
  };

  const filteredItems = safeItems.filter(item =>
    filter === 'all' || item.type === filter || (filter === 'equipped' && item.equipped)
  );

  const totalWeight = safeItems.reduce((sum, item) => sum + ((item.weight || 0) * item.quantity), 0);
  const equippedItems = safeItems.filter(item => item.equipped);

  return (
    <div className={cn(
      "bg-gray-800/95 border border-purple-400/30 rounded-lg shadow-lg backdrop-blur-sm",
      "transition-all duration-200",
      className
    )}>
      {/* Header */}
      <div className="p-3 bg-gradient-to-r from-purple-600 to-purple-800 rounded-t-lg text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-lg">🎒</span>
            <div>
              <h3 className="font-semibold text-sm">Inventory</h3>
              <p className="text-xs opacity-90">{safeItems.length} items • {totalWeight.toFixed(1)} lbs</p>
            </div>
          </div>

          <button
            onClick={onToggleExpand}
            className="p-1 hover:bg-white/20 rounded transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            <svg
              className={cn("w-4 h-4 transition-transform", isExpanded ? "rotate-180" : "")}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4">
          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-1 mb-4">
            {['all', 'equipped', 'weapon', 'armor', 'consumable', 'misc'].map((filterType) => (
              <button
                key={filterType}
                onClick={() => setFilter(filterType)}
                className={cn(
                  "px-2 py-1 text-xs rounded transition-colors capitalize",
                  filter === filterType
                    ? "bg-purple-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                )}
              >
                {filterType}
              </button>
            ))}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-gray-700/50 rounded p-2 text-center">
              <div className="text-xs text-gray-400">Equipped</div>
              <div className="text-sm font-bold text-green-400">{equippedItems.length}</div>
            </div>
            <div className="bg-gray-700/50 rounded p-2 text-center">
              <div className="text-xs text-gray-400">Total Value</div>
              <div className="text-sm font-bold text-yellow-400">
                {safeItems.reduce((sum, item) => sum + ((item.value || 0) * item.quantity), 0)} gp
              </div>
            </div>
            <div className="bg-gray-700/50 rounded p-2 text-center">
              <div className="text-xs text-gray-400">Weight</div>
              <div className="text-sm font-bold text-blue-400">{totalWeight.toFixed(1)} lbs</div>
            </div>
          </div>

          {/* Items List */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {filteredItems.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-4">
                No items found
              </div>
            ) : (
              filteredItems.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "p-2 rounded border transition-colors cursor-pointer hover:bg-gray-700/50",
                    item.equipped ? "bg-green-900/20 border-green-600/30" : "bg-gray-700/30 border-gray-600/30",
                    item.rarity && getRarityColor(item.rarity)
                  )}
                  onClick={() => onItemEdit?.(item)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-2 flex-1 min-w-0">
                      <span className="text-sm">{getItemTypeIcon(item.type)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <h4 className="text-sm font-medium text-white truncate">{item.name}</h4>
                          {item.equipped && (
                            <span className="text-xs bg-green-600 text-white px-1 rounded">E</span>
                          )}
                          {item.quantity > 1 && (
                            <span className="text-xs bg-gray-600 text-white px-1 rounded">x{item.quantity}</span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2">{item.description}</p>
                        )}
                        {item.properties && item.properties.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.properties.slice(0, 3).map((prop, index) => (
                              <span key={index} className="text-xs bg-blue-600/20 text-blue-400 px-1 rounded">
                                {prop}
                              </span>
                            ))}
                            {item.properties.length > 3 && (
                              <span className="text-xs text-gray-400">+{item.properties.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-400 ml-2">
                      {item.value && <div>{item.value} gp</div>}
                      {item.weight && <div>{item.weight} lb</div>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add Item Button */}
          <button
            onClick={onItemAdd}
            className="w-full mt-4 p-2 border-2 border-dashed border-gray-600 hover:border-purple-400 text-gray-400 hover:text-purple-400 rounded transition-colors text-sm"
          >
            + Add Item
          </button>
        </div>
      )}
    </div>
  );
}