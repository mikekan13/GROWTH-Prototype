"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

export interface BaseNodeData {
  id: string;
  type: 'character' | 'goal' | 'godhead' | 'npc' | 'quest' | 'location';
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
}

interface NodeCardProps {
  node: BaseNodeData;
  isSelected?: boolean;
  isExpanded?: boolean;
  onNodeClick?: (node: BaseNodeData) => void;
  onToggleExpand?: (nodeId: string) => void;
  onPositionChange?: (nodeId: string, x: number, y: number) => void;
  children?: React.ReactNode;
  className?: string;
}

export default function NodeCard({
  node,
  isSelected = false,
  isExpanded = false,
  onNodeClick,
  onToggleExpand,
  onPositionChange,
  children,
  className
}: NodeCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, nodeX: 0, nodeY: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  // Get node type emoji and colors
  const getNodeDisplay = (type: string) => {
    const displays = {
      character: { emoji: '👤', color: 'from-green-400 to-emerald-600', border: 'border-green-400' },
      goal: { emoji: '🎯', color: 'from-blue-400 to-blue-600', border: 'border-blue-400' },
      godhead: { emoji: '✨', color: 'from-purple-400 to-purple-600', border: 'border-purple-400' },
      npc: { emoji: '🗣️', color: 'from-orange-400 to-orange-600', border: 'border-orange-400' },
      quest: { emoji: '📜', color: 'from-lime-400 to-lime-600', border: 'border-lime-400' },
      location: { emoji: '📍', color: 'from-red-400 to-red-600', border: 'border-red-400' },
    };
    return displays[type as keyof typeof displays] || { emoji: '❓', color: 'from-gray-400 to-gray-600', border: 'border-gray-400' };
  };

  const nodeDisplay = getNodeDisplay(node.type);

  // Handle drag start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start drag if clicking on the header, not on content
    const target = e.target as HTMLElement;
    if (target.closest('.node-content') && isExpanded) {
      return; // Don't drag when clicking on expanded content
    }

    e.preventDefault();
    e.stopPropagation();

    // Get the SVG element for coordinate calculations
    const svgElement = document.querySelector('svg');
    if (!svgElement) return;

    const rect = svgElement.getBoundingClientRect();
    if (!rect) return;

    // Convert current mouse position to SVG coordinates for reference
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const viewBoxAttr = svgElement.getAttribute('viewBox');
    if (!viewBoxAttr) return;

    const [vbX, vbY, vbWidth, vbHeight] = viewBoxAttr.split(' ').map(Number);
    const scaleX = vbWidth / rect.width;
    const scaleY = vbHeight / rect.height;

    // Convert to SVG coordinates
    const svgX = vbX + mouseX * scaleX;
    const svgY = vbY + mouseY * scaleY;

    setIsDragging(true);
    setDragStart({
      x: svgX, // Store SVG coordinates this time
      y: svgY,
      nodeX: node.x, // Current node position in SVG space
      nodeY: node.y
    });
  }, [node.x, node.y, isExpanded]);

  // Handle drag move
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    // Get the SVG element to convert screen coordinates to SVG coordinates
    const svgElement = document.querySelector('svg');
    if (!svgElement) return;

    const rect = svgElement.getBoundingClientRect();
    if (!rect) return;

    // Convert current mouse position to SVG coordinates
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const viewBoxAttr = svgElement.getAttribute('viewBox');
    if (!viewBoxAttr) return;

    const [vbX, vbY, vbWidth, vbHeight] = viewBoxAttr.split(' ').map(Number);
    const scaleX = vbWidth / rect.width;
    const scaleY = vbHeight / rect.height;

    // Convert to SVG coordinates
    const currentSvgX = vbX + mouseX * scaleX;
    const currentSvgY = vbY + mouseY * scaleY;

    // Calculate delta in SVG space (both start and current are now in SVG coordinates)
    const dx = currentSvgX - dragStart.x;
    const dy = currentSvgY - dragStart.y;

    const newX = dragStart.nodeX + dx;
    const newY = dragStart.nodeY + dy;

    onPositionChange?.(node.id, newX, newY);
  }, [isDragging, dragStart, node.id, onPositionChange]);

  // Handle drag end
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Attach global mouse events for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDragging) {
      onNodeClick?.(node);
    }
  };

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand?.(node.id);
  };

  return (
    <div
      ref={cardRef}
      className={cn(
        "relative transition-all duration-200",
        "bg-gray-900/95 border-2 rounded-lg shadow-lg backdrop-blur-sm",
        isSelected ? "ring-2 ring-white ring-opacity-60" : "",
        isDragging ? "cursor-grabbing scale-105" : "cursor-grab",
        nodeDisplay.border,
        className
      )}
      style={{
        minWidth: isExpanded ? '300px' : '120px',
        maxWidth: isExpanded ? '400px' : '120px',
      }}
      onMouseDown={handleMouseDown}
      onClick={handleCardClick}
    >
      {/* Header */}
      <div className={cn(
        "p-3 rounded-t-lg bg-gradient-to-r text-white cursor-grab",
        nodeDisplay.color,
        isDragging ? "cursor-grabbing" : ""
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 min-w-0">
            <span className="text-lg">{nodeDisplay.emoji}</span>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{node.name}</h3>
              <p className="text-xs opacity-90 capitalize">{node.type}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* KRMA Value */}
            <div className="text-right">
              <div className="text-xs font-mono font-bold">
                {node.krmaValue > 0 ? '+' : ''}{node.krmaValue}
              </div>
              <div className="text-xs opacity-75">KRMA</div>
            </div>

            {/* Expand/Collapse Button */}
            <button
              onClick={handleToggleExpand}
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

        {/* Connection count indicator */}
        {node.connections.length > 0 && (
          <div className="flex items-center space-x-1 mt-2">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span className="text-xs">{node.connections.length} connections</span>
          </div>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="node-content p-4 bg-gray-800/95 rounded-b-lg border-t border-gray-600">
          {/* Status and Details */}
          {node.details && (
            <div className="space-y-2 mb-4">
              {node.details.status && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Status:</span>
                  <span className="text-cyan-400 font-medium">{node.details.status}</span>
                </div>
              )}
              {node.details.resistance !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Resistance:</span>
                  <span className="text-red-400 font-medium">{node.details.resistance}</span>
                </div>
              )}
              {node.details.opportunity !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Opportunity:</span>
                  <span className="text-green-400 font-medium">{node.details.opportunity}</span>
                </div>
              )}
            </div>
          )}

          {/* Type-specific content */}
          {children}

          {/* Action Buttons */}
          <div className="flex space-x-2 mt-4 pt-3 border-t border-gray-600">
            <button className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors">
              Edit
            </button>
            <button className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors">
              View Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
}