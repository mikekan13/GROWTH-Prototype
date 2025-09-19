"use client";

import NodeCard, { BaseNodeData } from './NodeCard';

export interface GoalData extends BaseNodeData {
  type: 'goal';
  goalDetails?: {
    description?: string;
    category?: string; // Personal, Party, Campaign, World
    priority?: 'Low' | 'Medium' | 'High' | 'Critical';
    progress?: number; // 0-100%
    deadline?: string;
    rewards?: string[];
    requirements?: string[];
    obstacles?: string[];
    stakeholders?: string[];
    milestones?: {
      name: string;
      completed: boolean;
      description?: string;
    }[];
    notes?: string;
  };
}

interface GoalCardProps {
  node: GoalData;
  isSelected?: boolean;
  isExpanded?: boolean;
  onNodeClick?: (node: GoalData) => void;
  onToggleExpand?: (nodeId: string) => void;
  onPositionChange?: (nodeId: string, x: number, y: number) => void;
  className?: string;
}

export default function GoalCard({
  node,
  isSelected,
  isExpanded,
  onNodeClick,
  onToggleExpand,
  onPositionChange,
  className
}: GoalCardProps) {
  const goal = node.goalDetails;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Critical': return 'text-red-400 bg-red-900/20';
      case 'High': return 'text-orange-400 bg-orange-900/20';
      case 'Medium': return 'text-yellow-400 bg-yellow-900/20';
      case 'Low': return 'text-green-400 bg-green-900/20';
      default: return 'text-gray-400 bg-gray-900/20';
    }
  };

  const renderGoalContent = () => {
    if (!goal) {
      return (
        <div className="text-center text-gray-400 text-sm py-4">
          <p>Goal data not loaded</p>
          <button className="mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors">
            Create Goal
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Basic Info */}
        <div className="space-y-2">
          {goal.description && (
            <div>
              <label className="text-xs text-gray-400">Description</label>
              <p className="text-sm text-gray-300 leading-relaxed">
                {goal.description.length > 120
                  ? `${goal.description.substring(0, 120)}...`
                  : goal.description}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {goal.category && (
              <div>
                <label className="text-xs text-gray-400">Category</label>
                <div className="text-white font-medium text-sm">{goal.category}</div>
              </div>
            )}
            {goal.priority && (
              <div>
                <label className="text-xs text-gray-400">Priority</label>
                <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(goal.priority)}`}>
                  {goal.priority}
                </span>
              </div>
            )}
          </div>

          {goal.deadline && (
            <div>
              <label className="text-xs text-gray-400">Deadline</label>
              <div className="text-white font-medium text-sm">{goal.deadline}</div>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {goal.progress !== undefined && (
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs text-gray-400">Progress</label>
              <span className="text-xs text-white font-mono">{goal.progress}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-blue-500 to-blue-400 h-2 rounded-full transition-all duration-300"
                style={{ width: `${goal.progress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Milestones */}
        {goal.milestones && goal.milestones.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-300 mb-2">Milestones</h4>
            <div className="space-y-2">
              {goal.milestones.slice(0, 4).map((milestone, index) => (
                <div key={index} className="flex items-start space-x-2">
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center mt-0.5 ${
                    milestone.completed
                      ? 'bg-green-600 border-green-600'
                      : 'border-gray-500'
                  }`}>
                    {milestone.completed && (
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium ${milestone.completed ? 'text-green-300 line-through' : 'text-white'}`}>
                      {milestone.name}
                    </div>
                    {milestone.description && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        {milestone.description}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {goal.milestones.length > 4 && (
                <div className="text-xs text-gray-400 ml-6">
                  +{goal.milestones.length - 4} more milestones...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Requirements */}
        {goal.requirements && goal.requirements.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-300 mb-2">Requirements</h4>
            <div className="space-y-1">
              {goal.requirements.slice(0, 3).map((req, index) => (
                <div key={index} className="text-xs text-gray-300 flex items-start">
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mr-2 mt-1.5 flex-shrink-0"></span>
                  {req}
                </div>
              ))}
              {goal.requirements.length > 3 && (
                <div className="text-xs text-gray-400">
                  +{goal.requirements.length - 3} more requirements...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rewards */}
        {goal.rewards && goal.rewards.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-300 mb-2">Rewards</h4>
            <div className="flex flex-wrap gap-1">
              {goal.rewards.slice(0, 4).map((reward, index) => (
                <span key={index} className="px-2 py-1 bg-green-600/20 text-green-400 text-xs rounded">
                  {reward}
                </span>
              ))}
              {goal.rewards.length > 4 && (
                <span className="px-2 py-1 bg-gray-600/20 text-gray-400 text-xs rounded">
                  +{goal.rewards.length - 4} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Obstacles */}
        {goal.obstacles && goal.obstacles.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-300 mb-2">Obstacles</h4>
            <div className="flex flex-wrap gap-1">
              {goal.obstacles.slice(0, 3).map((obstacle, index) => (
                <span key={index} className="px-2 py-1 bg-red-600/20 text-red-400 text-xs rounded">
                  {obstacle}
                </span>
              ))}
              {goal.obstacles.length > 3 && (
                <span className="px-2 py-1 bg-gray-600/20 text-gray-400 text-xs rounded">
                  +{goal.obstacles.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Stakeholders */}
        {goal.stakeholders && goal.stakeholders.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-300 mb-2">Stakeholders</h4>
            <div className="flex flex-wrap gap-1">
              {goal.stakeholders.map((stakeholder, index) => (
                <span key={index} className="px-2 py-1 bg-purple-600/20 text-purple-400 text-xs rounded">
                  {stakeholder}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {goal.notes && (
          <div className="pt-2 border-t border-gray-600">
            <h4 className="text-sm font-semibold text-gray-300 mb-1">Notes</h4>
            <p className="text-xs text-gray-300 leading-relaxed">
              {goal.notes.length > 100
                ? `${goal.notes.substring(0, 100)}...`
                : goal.notes}
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
      {renderGoalContent()}
    </NodeCard>
  );
}