"use client";

import NodeCard, { BaseNodeData } from './NodeCard';

export interface NPCData extends BaseNodeData {
  type: 'npc';
  npcDetails?: {
    description?: string;
    occupation?: string;
    location?: string;
    faction?: string;
    relationship?: string;
    personalityTraits?: string[];
    motivations?: string[];
    secrets?: string[];
    stats?: {
      level?: number;
      hitPoints?: number;
      armorClass?: number;
      challengeRating?: string;
    };
    abilities?: string[];
    loot?: string[];
    notes?: string;
  };
}

interface NPCCardProps {
  node: NPCData;
  isSelected?: boolean;
  isExpanded?: boolean;
  onNodeClick?: (node: BaseNodeData) => void;
  onToggleExpand?: (nodeId: string) => void;
  onPositionChange?: (nodeId: string, x: number, y: number) => void;
  className?: string;
}

export default function NPCCard({
  node,
  isSelected,
  isExpanded,
  onNodeClick,
  onToggleExpand,
  onPositionChange,
  className
}: NPCCardProps) {
  const npc = node.npcDetails;

  const renderNPCContent = () => {
    if (!npc) {
      return (
        <div className="text-center text-gray-400 text-sm py-4">
          <p>NPC data not loaded</p>
          <button className="mt-2 px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white text-xs rounded transition-colors">
            Create NPC Sheet
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Basic Info */}
        <div className="space-y-2">
          {npc.description && (
            <div>
              <label className="text-xs text-gray-400">Description</label>
              <p className="text-sm text-gray-300 leading-relaxed">
                {npc.description.length > 120
                  ? `${npc.description.substring(0, 120)}...`
                  : npc.description}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {npc.occupation && (
              <div>
                <label className="text-xs text-gray-400">Occupation</label>
                <div className="text-white font-medium text-sm">{npc.occupation}</div>
              </div>
            )}
            {npc.location && (
              <div>
                <label className="text-xs text-gray-400">Location</label>
                <div className="text-white font-medium text-sm">{npc.location}</div>
              </div>
            )}
            {npc.faction && (
              <div>
                <label className="text-xs text-gray-400">Faction</label>
                <div className="text-white font-medium text-sm">{npc.faction}</div>
              </div>
            )}
            {npc.relationship && (
              <div>
                <label className="text-xs text-gray-400">Relationship</label>
                <div className="text-white font-medium text-sm">{npc.relationship}</div>
              </div>
            )}
          </div>
        </div>

        {/* Combat Stats */}
        {npc.stats && (
          <div>
            <h4 className="text-sm font-semibold text-gray-300 mb-2">Combat Stats</h4>
            <div className="grid grid-cols-2 gap-2 text-center">
              {npc.stats.challengeRating && (
                <div className="bg-gray-700/50 rounded p-2">
                  <div className="text-xs text-gray-400">CR</div>
                  <div className="text-sm font-mono text-red-400">{npc.stats.challengeRating}</div>
                </div>
              )}
              {npc.stats.hitPoints && (
                <div className="bg-gray-700/50 rounded p-2">
                  <div className="text-xs text-gray-400">HP</div>
                  <div className="text-sm font-mono text-green-400">{npc.stats.hitPoints}</div>
                </div>
              )}
              {npc.stats.armorClass && (
                <div className="bg-gray-700/50 rounded p-2">
                  <div className="text-xs text-gray-400">AC</div>
                  <div className="text-sm font-mono text-blue-400">{npc.stats.armorClass}</div>
                </div>
              )}
              {npc.stats.level && (
                <div className="bg-gray-700/50 rounded p-2">
                  <div className="text-xs text-gray-400">Level</div>
                  <div className="text-sm font-mono text-yellow-400">{npc.stats.level}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Personality Traits */}
        {npc.personalityTraits && npc.personalityTraits.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-300 mb-2">Personality</h4>
            <div className="space-y-1">
              {npc.personalityTraits.slice(0, 3).map((trait, index) => (
                <div key={index} className="text-xs text-gray-300 flex items-start">
                  <span className="w-1.5 h-1.5 bg-purple-400 rounded-full mr-2 mt-1.5 flex-shrink-0"></span>
                  {trait}
                </div>
              ))}
              {npc.personalityTraits.length > 3 && (
                <div className="text-xs text-gray-400">
                  +{npc.personalityTraits.length - 3} more traits...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Motivations */}
        {npc.motivations && npc.motivations.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-300 mb-2">Motivations</h4>
            <div className="flex flex-wrap gap-1">
              {npc.motivations.slice(0, 4).map((motivation, index) => (
                <span key={index} className="px-2 py-1 bg-yellow-600/20 text-yellow-400 text-xs rounded">
                  {motivation}
                </span>
              ))}
              {npc.motivations.length > 4 && (
                <span className="px-2 py-1 bg-gray-600/20 text-gray-400 text-xs rounded">
                  +{npc.motivations.length - 4} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Abilities */}
        {npc.abilities && npc.abilities.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-300 mb-2">Abilities</h4>
            <div className="flex flex-wrap gap-1">
              {npc.abilities.slice(0, 4).map((ability, index) => (
                <span key={index} className="px-2 py-1 bg-red-600/20 text-red-400 text-xs rounded">
                  {ability}
                </span>
              ))}
              {npc.abilities.length > 4 && (
                <span className="px-2 py-1 bg-gray-600/20 text-gray-400 text-xs rounded">
                  +{npc.abilities.length - 4} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Secrets (GM Only) */}
        {npc.secrets && npc.secrets.length > 0 && (
          <div className="bg-red-900/20 border border-red-800/30 rounded p-2">
            <h4 className="text-sm font-semibold text-red-300 mb-2 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Secrets (GM Only)
            </h4>
            <div className="space-y-1">
              {npc.secrets.slice(0, 2).map((secret, index) => (
                <div key={index} className="text-xs text-red-200 italic">
                  • {secret}
                </div>
              ))}
              {npc.secrets.length > 2 && (
                <div className="text-xs text-red-300">
                  +{npc.secrets.length - 2} more secrets...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loot */}
        {npc.loot && npc.loot.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-300 mb-2">Loot</h4>
            <div className="space-y-1">
              {npc.loot.slice(0, 3).map((item, index) => (
                <div key={index} className="text-xs text-gray-300 flex items-center">
                  <span className="w-2 h-2 bg-yellow-400 rounded-full mr-2"></span>
                  {item}
                </div>
              ))}
              {npc.loot.length > 3 && (
                <div className="text-xs text-gray-400">
                  and {npc.loot.length - 3} more items...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notes */}
        {npc.notes && (
          <div className="pt-2 border-t border-gray-600">
            <h4 className="text-sm font-semibold text-gray-300 mb-1">GM Notes</h4>
            <p className="text-xs text-gray-300 leading-relaxed">
              {npc.notes.length > 100
                ? `${npc.notes.substring(0, 100)}...`
                : npc.notes}
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <NodeCard
      node={node}
      isSelected={isSelected}
      isExpanded={isExpanded}
      onNodeClick={onNodeClick}
      onToggleExpand={onToggleExpand}
      onPositionChange={onPositionChange}
      className={className}
    >
      {renderNPCContent()}
    </NodeCard>
  );
}