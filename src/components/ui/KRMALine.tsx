"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import CharacterCard, { CharacterData } from "@/components/nodes/CharacterCard";
import { ToolsCard } from "./ToolsCard";

interface KRMANode {
  id: string;
  type: 'character' | 'goal' | 'godhead' | 'npc' | 'quest' | 'location';
  name: string;
  krmaValue: number;
  x: number;
  y: number;
  connections: string[]; // IDs of connected nodes
  color: string;
  details?: {
    resistance?: number;
    opportunity?: number;
    status?: string;
  };
  characterDetails?: any; // GROWTH character data for character nodes
}

interface KRMAConnection {
  from: string;
  to: string;
  krmaFlow: number; // Positive = flowing to, Negative = flowing from
  type: 'goal' | 'resistance' | 'opportunity' | 'alliance' | 'conflict';
  strength: number; // 1-5 scale
}

interface KRMALineProps {
  nodes: KRMANode[];
  connections: KRMAConnection[];
  className?: string;
  campaignId?: string;
  onNodeClick?: (node: KRMANode) => void;
  onConnectionClick?: (connection: KRMAConnection) => void;
  onCharacterCreated?: () => void;
}

export default function KRMALine({
  nodes = [],
  connections = [],
  className,
  campaignId,
  onNodeClick,
  onConnectionClick,
  onCharacterCreated
}: KRMALineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredConnection, setHoveredConnection] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [viewBox, setViewBox] = useState({ x: -600, y: -400, width: 1200, height: 800 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, viewBoxX: 0, viewBoxY: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [animationTime, setAnimationTime] = useState(0);
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  // Animation timer for flowing particles
  useEffect(() => {
    const interval = setInterval(() => {
      setAnimationTime(prev => prev + 0.05);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // Memoized color calculation for neon/bright theme to match mockup
  const getNodeColor = useCallback((type: string, krmaValue: number) => {
    const intensity = Math.min(Math.abs(krmaValue) / 100, 1);
    const alpha = 0.6 + intensity * 0.4; // Brighter base colors

    const colors = {
      character: krmaValue >= 0 ? `rgba(0, 255, 127, ${alpha})` : `rgba(255, 20, 147, ${alpha})`, // Bright green/pink
      goal: `rgba(0, 191, 255, ${alpha})`, // Bright blue
      godhead: `rgba(138, 43, 226, ${alpha})`, // Bright purple
      npc: `rgba(255, 165, 0, ${alpha})`, // Bright orange
      quest: `rgba(50, 205, 50, ${alpha})`, // Bright lime green
      location: `rgba(255, 69, 0, ${alpha})`, // Bright red-orange
      default: 'rgba(128, 128, 128, 0.8)' // Brighter gray
    };

    return colors[type as keyof typeof colors] || colors.default;
  }, []);

  // Get bright stroke color for nodes
  const getNodeStroke = useCallback((type: string, isSelected: boolean, isHovered: boolean) => {
    const colors = {
      character: '#00FF7F', // Spring green
      goal: '#00BFFF', // Deep sky blue
      godhead: '#8A2BE2', // Blue violet
      npc: '#FFA500', // Orange
      quest: '#32CD32', // Lime green
      location: '#FF4500', // Orange red
      default: '#808080'
    };

    const baseColor = colors[type as keyof typeof colors] || colors.default;

    if (isSelected) return '#FFFFFF'; // White when selected
    if (isHovered) return baseColor;
    return baseColor;
  }, []);

  // Calculate connection styles with neon colors
  const getConnectionStyle = (connection: KRMAConnection) => {
    const baseWidth = 1.5;
    const width = baseWidth + (connection.strength * 1.5);

    let color;
    switch (connection.type) {
      case 'goal':
        color = '#00BFFF'; // Bright blue
        break;
      case 'resistance':
        color = '#FF1493'; // Deep pink
        break;
      case 'opportunity':
        color = '#00FF7F'; // Spring green
        break;
      case 'alliance':
        color = '#8A2BE2'; // Blue violet
        break;
      case 'conflict':
        color = '#FF4500'; // Orange red
        break;
      default:
        color = '#808080'; // Gray
    }

    const isHovered = hoveredConnection === `${connection.from}-${connection.to}`;

    return {
      stroke: color,
      strokeWidth: width,
      opacity: isHovered ? 1.0 : 0.7,
      strokeDasharray: connection.krmaFlow < 0 ? '8,4' : 'none',
      filter: isHovered ? 'url(#glow)' : 'none' // Add glow effect when hovered
    };
  };

  // Fixed mouse event handlers for reliable interaction at all zoom levels
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    // More reliable target detection for panning
    const target = e.target as Element;
    const isBackgroundTarget = target === svgRef.current ||
                              target.closest('rect[fill="url(#grid)"]') ||
                              target.closest('rect[fill="url(#circuits)"]') ||
                              target.tagName === 'svg';

    if (isBackgroundTarget) {
      setIsPanning(true);
      setIsDragging(true);
      setPanStart({
        x: e.clientX,
        y: e.clientY,
        viewBoxX: viewBox.x,
        viewBoxY: viewBox.y
      });
      e.preventDefault();
      e.stopPropagation();
    }
  }, [viewBox.x, viewBox.y]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isPanning || !isDragging) return;

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;

    // Improved scaling calculation - ensure both axes work correctly
    const scaleX = viewBox.width / rect.width;
    const scaleY = viewBox.height / rect.height;

    const newX = panStart.viewBoxX - (dx * scaleX);
    const newY = panStart.viewBoxY - (dy * scaleY);


    setViewBox(prev => ({
      ...prev,
      x: newX,
      y: newY
    }));
  }, [isPanning, isDragging, panStart, viewBox]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setIsDragging(false);
  }, []);

  // Global mouse event listeners for panning
  useEffect(() => {
    if (isPanning && isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isPanning, isDragging, handleMouseMove, handleMouseUp]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.cancelable) {
      e.preventDefault();
    }
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert to SVG coordinates
    const svgX = viewBox.x + (mouseX / rect.width) * viewBox.width;
    const svgY = viewBox.y + (mouseY / rect.height) * viewBox.height;

    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.1, Math.min(5, zoom * zoomFactor));

    if (newZoom !== zoom) {
      const scaleFactor = newZoom / zoom;
      setZoom(newZoom);

      // Zoom towards mouse position
      setViewBox(prev => ({
        x: svgX - (svgX - prev.x) * scaleFactor,
        y: svgY - (svgY - prev.y) * scaleFactor,
        width: prev.width * scaleFactor,
        height: prev.height * scaleFactor
      }));
    }
  }, [viewBox, zoom]);

  // Render connection line with arrow
  const renderConnection = (connection: KRMAConnection) => {
    const fromNode = nodes.find(n => n.id === connection.from);
    const toNode = nodes.find(n => n.id === connection.to);

    if (!fromNode || !toNode) return null;

    // Use dynamic positions
    const fromPos = getNodePosition(fromNode.id, fromNode.x, fromNode.y);
    const toPos = getNodePosition(toNode.id, toNode.x, toNode.y);

    const style = getConnectionStyle(connection);
    const connectionId = `${connection.from}-${connection.to}`;

    // Calculate arrow position using dynamic positions
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const unitX = dx / length;
    const unitY = dy / length;

    // Offset from node centers (larger offset for card nodes)
    const offset = fromNode.type === 'character' || toNode.type === 'character' ? 60 : 30;
    const startX = fromPos.x + unitX * offset;
    const startY = fromPos.y + unitY * offset;
    const endX = toPos.x - unitX * offset;
    const endY = toPos.y - unitY * offset;

    return (
      <g key={connectionId}>
        {/* Connection line */}
        <line
          x1={startX}
          y1={startY}
          x2={endX}
          y2={endY}
          {...style}
          className="cursor-pointer transition-all duration-200"
          onMouseEnter={() => setHoveredConnection(connectionId)}
          onMouseLeave={() => setHoveredConnection(null)}
          onClick={() => onConnectionClick?.(connection)}
        />

        {/* Arrow head */}
        <polygon
          points={`${endX},${endY} ${endX - 8 * unitX + 4 * unitY},${endY - 8 * unitY - 4 * unitX} ${endX - 8 * unitX - 4 * unitY},${endY - 8 * unitY + 4 * unitX}`}
          fill={style.stroke}
          opacity={style.opacity}
          className="cursor-pointer"
          onMouseEnter={() => setHoveredConnection(connectionId)}
          onMouseLeave={() => setHoveredConnection(null)}
          onClick={() => onConnectionClick?.(connection)}
        />

        {/* KRMA flow indicator */}
        {Math.abs(connection.krmaFlow) > 0 && (
          <text
            x={(startX + endX) / 2}
            y={(startY + endY) / 2 - 5}
            fontSize="10"
            fill={style.stroke}
            textAnchor="middle"
            className="pointer-events-none font-mono font-bold"
          >
            {connection.krmaFlow > 0 ? '+' : ''}{connection.krmaFlow}
          </text>
        )}
      </g>
    );
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedNode(null);
      } else if (e.key === ' ') {
        e.preventDefault();
        // Center view on selected node or reset
        if (selectedNode) {
          const node = nodes.find(n => n.id === selectedNode);
          if (node) {
            setViewBox({
              x: node.x - 600,
              y: node.y - 400,
              width: 1200,
              height: 800
            });
            setZoom(1);
          }
        } else {
          setViewBox({ x: -600, y: -400, width: 1200, height: 800 });
          setZoom(1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, nodes]);

  // Initialize node positions from props
  useEffect(() => {
    const newPositions = new Map();
    nodes.forEach(node => {
      newPositions.set(node.id, { x: node.x, y: node.y });
    });
    setNodePositions(newPositions);
  }, [nodes]);

  // Handle node expansion toggle
  const handleToggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  }, []);

  // Handle node position change (for drag and drop) - store absolute world coordinates
  const handleNodePositionChange = useCallback((nodeId: string, x: number, y: number) => {
    // Store absolute world coordinates - this makes positions independent of viewport/camera
    console.log(`🎯 Node ${nodeId} position updated to absolute world coordinates: (${x}, ${y})`);

    setNodePositions(prev => {
      const newMap = new Map(prev);
      newMap.set(nodeId, { x, y });
      return newMap;
    });

    // Also update the database for character nodes
    if (campaignId && nodeId.startsWith('cm')) { // Character IDs start with 'cm'
      fetch(`/api/characters/${nodeId}/position`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y })
      }).catch(error => console.error('Failed to save position:', error));
    }
  }, [campaignId]);

  // Get current position for a node - return absolute world coordinates
  const getNodePosition = useCallback((nodeId: string, fallbackX: number, fallbackY: number) => {
    const absolutePosition = nodePositions.get(nodeId);

    if (absolutePosition) {
      // Return absolute world coordinates - these don't change with viewport/camera movement
      return {
        x: absolutePosition.x,
        y: absolutePosition.y
      };
    }

    // Use fallback coordinates from database/props as absolute world coordinates
    return { x: fallbackX, y: fallbackY };
  }, [nodePositions]);

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full h-full bg-black rounded-lg overflow-hidden select-none", className)}
      style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
    >
      {/* Minimal integrated controls for when used as fullscreen canvas */}

      {/* Main SVG */}
      <svg
        ref={svgRef}
        className="w-full h-full"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        {/* Definitions for effects and patterns */}
        <defs>
          {/* Dark grid pattern */}
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#1a1a1a" strokeWidth="1" opacity="0.5"/>
          </pattern>

          {/* Glow effects */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          {/* KRMA Line glow effect - more intense */}
          <filter id="krmaLineGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="8" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          {/* Lightsaber glow effect - intense and bright */}
          <filter id="lightsaberGlow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="20" result="glow1"/>
            <feGaussianBlur stdDeviation="12" result="glow2"/>
            <feGaussianBlur stdDeviation="6" result="glow3"/>
            <feGaussianBlur stdDeviation="3" result="glow4"/>
            <feMerge>
              <feMergeNode in="glow1"/>
              <feMergeNode in="glow2"/>
              <feMergeNode in="glow3"/>
              <feMergeNode in="glow4"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          {/* Intense core glow */}
          <filter id="coreGlow" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="8" result="coreBlur"/>
            <feMerge>
              <feMergeNode in="coreBlur"/>
              <feMergeNode in="coreBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>

          {/* Gold gradient for KRMA Line center */}
          <linearGradient id="goldGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#FFD700', stopOpacity: 1 }} />
            <stop offset="50%" style={{ stopColor: '#FFA500', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#FFD700', stopOpacity: 1 }} />
          </linearGradient>

          {/* Mystical artery gradient - flowing and ethereal */}
          <linearGradient id="mysticalFlow" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: '#8B00FF', stopOpacity: 0.3 }} />
            <stop offset="25%" style={{ stopColor: '#9400D3', stopOpacity: 0.7 }} />
            <stop offset="50%" style={{ stopColor: '#8B00FF', stopOpacity: 0.9 }} />
            <stop offset="75%" style={{ stopColor: '#6A0DAD', stopOpacity: 0.7 }} />
            <stop offset="100%" style={{ stopColor: '#8B00FF', stopOpacity: 0.3 }} />
          </linearGradient>

          {/* Ethereal purple mist */}
          <radialGradient id="purpleMist" cx="50%" cy="50%" r="50%">
            <stop offset="0%" style={{ stopColor: '#8B00FF', stopOpacity: 0.8 }} />
            <stop offset="30%" style={{ stopColor: '#9400D3', stopOpacity: 0.6 }} />
            <stop offset="70%" style={{ stopColor: '#6A0DAD', stopOpacity: 0.3 }} />
            <stop offset="100%" style={{ stopColor: '#8B00FF', stopOpacity: 0.1 }} />
          </radialGradient>

          {/* Pulsing energy gradient */}
          <linearGradient id="pulsingEnergy" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#8B00FF', stopOpacity: 0.4 }} />
            <stop offset="50%" style={{ stopColor: '#9400D3', stopOpacity: 0.8 }} />
            <stop offset="100%" style={{ stopColor: '#8B00FF', stopOpacity: 0.4 }} />
          </linearGradient>

          {/* Circuit-like patterns for background */}
          <pattern id="circuits" width="100" height="100" patternUnits="userSpaceOnUse">
            <path d="M0,50 Q25,25 50,50 Q75,75 100,50" fill="none" stroke="#0a4d4a" strokeWidth="0.5" opacity="0.3"/>
            <path d="M50,0 Q75,25 50,50 Q25,75 50,100" fill="none" stroke="#0a4d4a" strokeWidth="0.5" opacity="0.3"/>
            <circle cx="50" cy="50" r="2" fill="#00ffff" opacity="0.2"/>
          </pattern>
        </defs>

        {/* Background */}
        <rect width="100%" height="100%" fill="url(#grid)" />
        <rect width="100%" height="100%" fill="url(#circuits)" opacity="0.3" />

        {/* THE KRMA LINE - Glowing lightsaber with wave distortion */}
        <g>
          {/* Generate wavy path for organic distortion */}
          {(() => {
            const segments = [];
            const numSegments = 50;
            const extraWidth = viewBox.width * 0.5; // Extend line by 50% on each side instead of massive amount
            const segmentWidth = (viewBox.width + extraWidth * 2) / numSegments;

            for (let i = 0; i <= numSegments; i++) {
              const x = viewBox.x - extraWidth + (i * segmentWidth);
              const waveOffset = Math.sin(animationTime * 0.8 + x * 0.001) * 3 +
                               Math.sin(animationTime * 1.2 + x * 0.0015) * 2;
              segments.push(`${x},${waveOffset}`);
            }

            const pathData = `M ${segments.join(' L ')}`;

            return (
              <>
                {/* MASSIVE LIGHTSABER GLOW - outer field */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="#8B00FF"
                  strokeWidth="100"
                  filter="url(#lightsaberGlow)"
                  opacity="0.4"
                />

                {/* BRIGHT PURPLE CORE GLOW */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="#9400D3"
                  strokeWidth="60"
                  filter="url(#coreGlow)"
                  opacity={0.6 + Math.abs(Math.sin(animationTime * 0.7)) * 0.3}
                />

                {/* GLOWING PURPLE LAYER */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="#8B00FF"
                  strokeWidth={35 + Math.sin(animationTime * 1.2) * 5}
                  filter="url(#krmaLineGlow)"
                  opacity={0.7 + Math.abs(Math.sin(animationTime * 0.9)) * 0.2}
                />

                {/* INTENSE CORE LAYER */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="#A020F0"
                  strokeWidth={20 + Math.sin(animationTime * 1.5) * 3}
                  opacity={0.8 + Math.abs(Math.sin(animationTime * 1.1)) * 0.2}
                />

                {/* BRIGHT GOLD ENERGY CORE */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="url(#goldGradient)"
                  strokeWidth={8 + Math.sin(animationTime * 2.5) * 2}
                  filter="url(#krmaLineGlow)"
                  opacity="1.0"
                />

                {/* WHITE HOT CENTER */}
                <path
                  d={pathData}
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth={2 + Math.sin(animationTime * 3) * 1}
                  filter="url(#coreGlow)"
                  opacity={0.9 + Math.abs(Math.sin(animationTime * 2)) * 0.1}
                />
              </>
            );
          })()}

          {/* Flowing energy particles - mix of circles and KRMA symbols */}
          <g>
            {Array.from({ length: 40 }, (_, i) => {
              const flowSpeed = 100; // Speed of flow
              const spacing = viewBox.width / 30;
              const xPos = viewBox.x + ((animationTime * flowSpeed + i * spacing) % (viewBox.width * 2)) - viewBox.width * 0.5;
              const yOffset = Math.sin(animationTime * 2 + i * 0.5) * 6;
              const isKrmaSymbol = i % 4 === 0; // Every 4th particle is a Ҝ symbol

              if (isKrmaSymbol) {
                return (
                  <text
                    key={`krma-${i}`}
                    x={xPos}
                    y={yOffset + 2}
                    fontSize="12"
                    fontWeight="bold"
                    fill="#FFD700"
                    opacity="0.9"
                    filter="url(#nodeGlow)"
                    textAnchor="middle"
                    className="pointer-events-none"
                  >
                    Ҝ
                  </text>
                );
              } else {
                return (
                  <circle
                    key={i}
                    cx={xPos}
                    cy={yOffset}
                    r="2"
                    fill="#FFD700"
                    opacity="0.8"
                    filter="url(#nodeGlow)"
                  />
                );
              }
            })}
          </g>

          {/* Additional KRMA symbol particles - slower flow */}
          <g>
            {Array.from({ length: 15 }, (_, i) => {
              const flowSpeed = 60; // Slower speed
              const spacing = viewBox.width / 12;
              const xPos = viewBox.x + ((animationTime * flowSpeed + i * spacing) % (viewBox.width * 2)) - viewBox.width * 0.5;
              const yOffset = Math.sin(animationTime * 1.5 + i * 0.8) * 8;
              const scale = 0.8 + Math.sin(animationTime * 3 + i) * 0.3;

              return (
                <text
                  key={`krma-slow-${i}`}
                  x={xPos}
                  y={yOffset + 3}
                  fontSize={14 * scale}
                  fontWeight="bold"
                  fill="#8B00FF"
                  opacity="0.7"
                  filter="url(#nodeGlow)"
                  textAnchor="middle"
                  className="pointer-events-none"
                >
                  Ҝ
                </text>
              );
            })}
          </g>

          {/* Energy sparks - twinkling along the line */}
          <g>
            {Array.from({ length: 20 }, (_, i) => {
              const sparkX = viewBox.x + (i * viewBox.width / 20) + Math.sin(animationTime + i) * 50;
              const sparkY = Math.sin(animationTime * 3 + i * 0.8) * 6;
              const opacity = 0.3 + Math.abs(Math.sin(animationTime * 4 + i * 1.2)) * 0.7;
              return (
                <circle
                  key={`spark-${i}`}
                  cx={sparkX}
                  cy={sparkY}
                  r="1.5"
                  fill="#FFFFFF"
                  opacity={opacity}
                  filter="url(#nodeGlow)"
                />
              );
            })}
          </g>

          {/* Larger energy nodes - pulsing power points */}
          <g>
            {Array.from({ length: 7 }, (_, i) => {
              const nodeX = viewBox.x + (viewBox.width * (i + 1)) / 8;
              const nodeY = Math.sin(animationTime * 1.5 + i * 2) * 3;
              const radius = 4 + Math.sin(animationTime * 2 + i) * 2;
              const opacity = 0.5 + Math.abs(Math.sin(animationTime + i * 0.7)) * 0.4;
              return (
                <circle
                  key={`node-${i}`}
                  cx={nodeX}
                  cy={nodeY}
                  r={radius}
                  fill="none"
                  stroke="#FFD700"
                  strokeWidth="2"
                  opacity={opacity}
                  filter="url(#krmaLineGlow)"
                />
              );
            })}
          </g>
        </g>

        {/* Render connections first (behind nodes) */}
        {connections.map(connection => renderConnection(connection))}

        {/* Render character cards as SVG foreignObjects */}
        {nodes.filter(node => node.type === 'character' && node.id).map(node => {
          const position = getNodePosition(node.id, node.x, node.y);
          const isSelected = selectedNode === node.id;
          const isExpanded = expandedNodes.has(node.id);

          // Use the node directly - it already has the correct structure
          const characterData = node;

          // Ensure we have a valid character before rendering
          if (!characterData.id || !characterData.name) {
            console.warn('⚠️ Skipping invalid character node:', characterData);
            return null;
          }

          // DEBUG: Log what we're about to pass to CharacterCard
          console.log('🎯 KRMALine character node debug:', {
            nodeId: node.id,
            nodeName: node.name,
            hasCharacterDetails: !!node.characterDetails,
            characterDataKeys: Object.keys(characterData),
            nodeType: node.type
          });

          const cardWidth = isExpanded ? 400 : 500;
          const cardHeight = isExpanded ? 600 : 200;

          return (
            <foreignObject
              key={node.id}
              x={position.x - cardWidth / 2}
              y={position.y - cardHeight / 2}
              width={cardWidth}
              height={cardHeight}
              style={{ overflow: 'visible' }}
            >
              <CharacterCard
                node={characterData}
                isSelected={isSelected}
                isExpanded={isExpanded}
                onNodeClick={(clickedNode) => {
                  setSelectedNode(clickedNode.id);
                  onNodeClick?.(clickedNode);
                }}
                onToggleExpand={handleToggleExpand}
                onPositionChange={handleNodePositionChange}
              />
            </foreignObject>
          );
        })}

        {/* KRMA Tools Card - Fixed at world center (0,0) */}
        <foreignObject
          x={-180}
          y={-150}
          width={360}
          height={300}
          style={{ overflow: 'visible' }}
        >
          <ToolsCard
            campaignId={campaignId}
            onCreateCharacter={async (characterName) => {
              console.log(`✅ Character "${characterName}" created via ToolsCard`);
              onCharacterCreated?.();
            }}
            className="transform scale-90 origin-center"
          />
        </foreignObject>

        {/* Render non-character nodes as simple circles */}
        {nodes.filter(node => node.type !== 'character').map(node => {
          const isSelected = selectedNode === node.id;
          const isHovered = hoveredNode === node.id;
          const strokeColor = getNodeStroke(node.type, isSelected, isHovered);
          const position = getNodePosition(node.id, node.x, node.y);

          return (
            <g key={node.id}>
              {/* Node background with glow */}
              <circle
                cx={position.x}
                cy={position.y}
                r="30"
                fill={getNodeColor(node.type, node.krmaValue)}
                stroke={strokeColor}
                strokeWidth={isSelected ? "4" : isHovered ? "3" : "2"}
                filter={isSelected || isHovered ? "url(#nodeGlow)" : "none"}
                className="cursor-pointer transition-all duration-200"
                onClick={() => {
                  setSelectedNode(node.id);
                  onNodeClick?.(node);
                }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              />

              {/* Inner ring for selected nodes */}
              {isSelected && (
                <circle
                  cx={position.x}
                  cy={position.y}
                  r="20"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="1"
                  opacity="0.8"
                  className="pointer-events-none"
                />
              )}

              {/* Node type icon */}
              <text
                x={position.x}
                y={position.y - 8}
                textAnchor="middle"
                fontSize="14"
                fontWeight="bold"
                fill="white"
                className="pointer-events-none"
                style={{ filter: 'drop-shadow(0px 0px 3px rgba(0,0,0,0.8))' }}
              >
                {node.type === 'goal' ? '🎯' :
                 node.type === 'godhead' ? '✨' :
                 node.type === 'npc' ? '🗣️' :
                 node.type === 'quest' ? '📜' :
                 node.type === 'location' ? '📍' : '❓'}
              </text>

              {/* KRMA value */}
              <text
                x={position.x}
                y={position.y + 6}
                textAnchor="middle"
                fontSize="10"
                fontWeight="bold"
                fill="white"
                className="pointer-events-none font-mono"
                style={{ filter: 'drop-shadow(0px 0px 2px rgba(0,0,0,0.8))' }}
              >
                {node.krmaValue > 0 ? '+' : ''}{node.krmaValue}
              </text>

              {/* Node name */}
              <text
                x={position.x}
                y={position.y + 50}
                textAnchor="middle"
                fontSize="11"
                fill="white"
                fontWeight="medium"
                className="pointer-events-none"
                style={{ filter: 'drop-shadow(0px 0px 3px rgba(0,0,0,0.9))' }}
              >
                {node.name.length > 12 ? `${node.name.substring(0, 12)}...` : node.name}
              </text>

              {/* Connection count indicator */}
              {node.connections.length > 0 && (
                <circle
                  cx={position.x + 20}
                  cy={position.y - 20}
                  r="8"
                  fill="rgba(0, 0, 0, 0.8)"
                  stroke={strokeColor}
                  strokeWidth="1"
                  className="pointer-events-none"
                />
              )}

              {node.connections.length > 0 && (
                <text
                  x={position.x + 20}
                  y={position.y - 17}
                  textAnchor="middle"
                  fontSize="8"
                  fill="white"
                  fontWeight="bold"
                  className="pointer-events-none font-mono"
                >
                  {node.connections.length}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Node details panel */}
      {selectedNode && (
        <div className="absolute bottom-4 left-4 bg-gray-900 border border-gray-600 shadow-lg rounded-lg p-4 max-w-sm">
          {(() => {
            const node = nodes.find(n => n.id === selectedNode);
            if (!node) return null;

            const nodeStroke = getNodeStroke(node.type, true, false);

            return (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full border-2"
                      style={{
                        backgroundColor: getNodeColor(node.type, node.krmaValue),
                        borderColor: nodeStroke
                      }}
                    ></div>
                    <h3 className="font-semibold text-white">{node.name}</h3>
                  </div>
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Type:</span>
                    <span className="text-white font-medium capitalize">{node.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">KRMA Value:</span>
                    <span
                      className="font-mono font-bold"
                      style={{ color: node.krmaValue >= 0 ? '#00FF7F' : '#FF1493' }}
                    >
                      {node.krmaValue > 0 ? '+' : ''}{node.krmaValue}
                    </span>
                  </div>
                  {node.details?.resistance && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Resistance:</span>
                      <span className="text-red-400 font-medium">{node.details.resistance}</span>
                    </div>
                  )}
                  {node.details?.opportunity && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Opportunity:</span>
                      <span className="text-green-400 font-medium">{node.details.opportunity}</span>
                    </div>
                  )}
                  {node.details?.status && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Status:</span>
                      <span className="text-cyan-400 font-medium">{node.details.status}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-gray-700 pt-2 mt-3">
                    <span className="text-gray-400">Connections:</span>
                    <span className="text-white font-bold">{node.connections.length}</span>
                  </div>
                </div>

                {/* Connected nodes preview */}
                {node.connections.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <div className="text-xs text-gray-400 mb-2">Connected to:</div>
                    <div className="flex flex-wrap gap-1">
                      {node.connections.slice(0, 4).map(connId => {
                        const connNode = nodes.find(n => n.id === connId);
                        return connNode ? (
                          <div
                            key={connId}
                            className="px-2 py-1 bg-gray-800 rounded text-xs text-white border"
                            style={{ borderColor: getNodeStroke(connNode.type, false, false) }}
                          >
                            {connNode.name.length > 8 ? `${connNode.name.substring(0, 8)}...` : connNode.name}
                          </div>
                        ) : null;
                      })}
                      {node.connections.length > 4 && (
                        <div className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-400">
                          +{node.connections.length - 4} more
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}