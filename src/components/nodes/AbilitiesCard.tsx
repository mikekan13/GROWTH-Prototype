"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface Ability {
  id: string;
  name: string;
  type: 'spell' | 'feature' | 'action' | 'bonus_action' | 'reaction' | 'passive';
  level?: number; // For spells
  school?: string; // For spells
  castingTime?: string;
  range?: string;
  duration?: string;
  components?: string[];
  description: string;
  damage?: string;
  savingThrow?: string;
  uses?: {
    current: number;
    max: number;
    rechargeOn?: 'short_rest' | 'long_rest' | 'dawn' | 'turn';
  };
  source?: string; // Class, race, feat, etc.
  prepared?: boolean; // For spells
  ritual?: boolean; // For spells
  concentration?: boolean; // For spells
}

interface AbilitiesCardProps {
  characterId: string;
  abilities: Ability[];
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onAbilityEdit?: (ability: Ability) => void;
  onAbilityUse?: (abilityId: string) => void;
  onAbilityAdd?: () => void;
  className?: string;
}

export default function AbilitiesCard({
  characterId: _characterId,
  abilities,
  isExpanded = false,
  onToggleExpand,
  onAbilityEdit,
  onAbilityUse,
  onAbilityAdd,
  className
}: AbilitiesCardProps) {
  const [filter, setFilter] = useState<string>('all');

  const getAbilityIcon = (type: string) => {
    const icons = {
      spell: '🔮',
      feature: '⚡',
      action: '⚔️',
      bonus_action: '🏃',
      reaction: '🛡️',
      passive: '🌟'
    };
    return icons[type as keyof typeof icons] || '⚡';
  };

  const getSpellLevelColor = (level: number | undefined) => {
    if (!level) return 'text-gray-400';
    const colors = {
      0: 'text-gray-400', // Cantrip
      1: 'text-red-400',
      2: 'text-orange-400',
      3: 'text-yellow-400',
      4: 'text-green-400',
      5: 'text-blue-400',
      6: 'text-purple-400',
      7: 'text-pink-400',
      8: 'text-red-500',
      9: 'text-yellow-500'
    };
    return colors[level as keyof typeof colors] || 'text-white';
  };

  const filteredAbilities = abilities.filter(ability => {
    if (filter === 'all') return true;
    if (filter === 'spells') return ability.type === 'spell';
    if (filter === 'features') return ability.type === 'feature';
    if (filter === 'actions') return ['action', 'bonus_action', 'reaction'].includes(ability.type);
    if (filter === 'prepared') return ability.prepared;
    if (filter === 'available') return !ability.uses || ability.uses.current > 0;
    return ability.type === filter;
  });

  const spellSlots = abilities
    .filter(a => a.type === 'spell' && a.level && a.level > 0)
    .reduce((slots, spell) => {
      const level = spell.level!;
      if (!slots[level]) slots[level] = { total: 0, used: 0 };
      slots[level].total++;
      return slots;
    }, {} as Record<number, { total: number; used: number }>);

  const cantrips = abilities.filter(a => a.type === 'spell' && a.level === 0);
  const features = abilities.filter(a => a.type === 'feature');

  return (
    <div className={cn(
      "bg-gray-800/95 border border-blue-400/30 rounded-lg shadow-lg backdrop-blur-sm",
      "transition-all duration-200",
      className
    )}>
      {/* Header */}
      <div className="p-3 bg-gradient-to-r from-blue-600 to-blue-800 rounded-t-lg text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-lg">📜</span>
            <div>
              <h3 className="font-semibold text-sm">Abilities & Spells</h3>
              <p className="text-xs opacity-90">
                {cantrips.length} cantrips • {features.length} features
              </p>
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
            {['all', 'spells', 'features', 'actions', 'prepared', 'available'].map((filterType) => (
              <button
                key={filterType}
                onClick={() => setFilter(filterType)}
                className={cn(
                  "px-2 py-1 text-xs rounded transition-colors capitalize",
                  filter === filterType
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                )}
              >
                {filterType}
              </button>
            ))}
          </div>

          {/* Spell Slots */}
          {Object.keys(spellSlots).length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-300 mb-2">Spell Slots</h4>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(spellSlots).map(([level, slots]) => (
                  <div key={level} className="bg-gray-700/50 rounded p-2 text-center">
                    <div className="text-xs text-gray-400">Level {level}</div>
                    <div className={cn("text-sm font-bold", getSpellLevelColor(parseInt(level)))}>
                      {slots.total - slots.used}/{slots.total}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Abilities List */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {filteredAbilities.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-4">
                No abilities found
              </div>
            ) : (
              filteredAbilities.map((ability) => (
                <div
                  key={ability.id}
                  className={cn(
                    "p-3 rounded border transition-colors cursor-pointer hover:bg-gray-700/50",
                    ability.prepared ? "bg-blue-900/20 border-blue-600/30" : "bg-gray-700/30 border-gray-600/30",
                    ability.uses && ability.uses.current === 0 ? "opacity-50" : ""
                  )}
                  onClick={() => onAbilityEdit?.(ability)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-2 flex-1 min-w-0">
                      <span className="text-sm">{getAbilityIcon(ability.type)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="text-sm font-medium text-white">{ability.name}</h4>
                          {ability.type === 'spell' && ability.level !== undefined && (
                            <span className={cn("text-xs px-1 rounded", getSpellLevelColor(ability.level))}>
                              {ability.level === 0 ? 'Cantrip' : `L${ability.level}`}
                            </span>
                          )}
                          {ability.prepared && (
                            <span className="text-xs bg-blue-600 text-white px-1 rounded">P</span>
                          )}
                          {ability.concentration && (
                            <span className="text-xs bg-purple-600 text-white px-1 rounded">C</span>
                          )}
                          {ability.ritual && (
                            <span className="text-xs bg-yellow-600 text-white px-1 rounded">R</span>
                          )}
                        </div>

                        {/* Quick Info */}
                        <div className="flex flex-wrap gap-2 mb-2 text-xs text-gray-400">
                          {ability.castingTime && (
                            <span>{ability.castingTime}</span>
                          )}
                          {ability.range && (
                            <span>• {ability.range}</span>
                          )}
                          {ability.duration && (
                            <span>• {ability.duration}</span>
                          )}
                        </div>

                        <p className="text-xs text-gray-300 leading-relaxed line-clamp-2">
                          {ability.description}
                        </p>

                        {ability.source && (
                          <div className="mt-1">
                            <span className="text-xs bg-gray-600/50 text-gray-300 px-1 rounded">
                              {ability.source}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end space-y-1 ml-2">
                      {ability.uses && (
                        <div className="text-xs text-center">
                          <div className="text-gray-400">Uses</div>
                          <div className={cn(
                            "font-bold",
                            ability.uses.current > 0 ? "text-green-400" : "text-red-400"
                          )}>
                            {ability.uses.current}/{ability.uses.max}
                          </div>
                        </div>
                      )}

                      {ability.uses && ability.uses.current > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAbilityUse?.(ability.id);
                          }}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                        >
                          Use
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add Ability Button */}
          <button
            onClick={onAbilityAdd}
            className="w-full mt-4 p-2 border-2 border-dashed border-gray-600 hover:border-blue-400 text-gray-400 hover:text-blue-400 rounded transition-colors text-sm"
          >
            + Add Ability/Spell
          </button>
        </div>
      )}
    </div>
  );
}