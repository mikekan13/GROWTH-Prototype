"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import CharacterCard from "./CharacterCard";
import type { CharacterNodeData } from "./CharacterCard";
import InventoryCard from "./InventoryCard";
import type { InventoryItem } from "./InventoryCard";
import type { GrowthCharacter } from "@/types/growth";
import { addSkill, removeSkill, updateSkillLevel } from "@/lib/character-actions";
import VitalsCard from "./VitalsCard";
import TraitsCard from "./TraitsCard";
import SkillsCard from "./SkillsCard";
import type { SkillItem } from "./SkillsCard";
import MagicCard from "./MagicCard";
import BackstoryCard from "./BackstoryCard";
import HarvestCard from "./HarvestCard";

// ── Interfaces ──────────────────────────────────────────────────────────────

interface CanvasNode {
  id: string;
  type: "character" | "npc" | "location" | "quest";
  name: string;
  x: number;
  y: number;
  status?: string;
  color?: string;
  portrait?: string | null;
  characterData?: Record<string, unknown> | null;
}

interface CanvasConnection {
  from: string;
  to: string;
  type: "alliance" | "conflict" | "goal" | "resistance" | "opportunity";
  strength: number;
}

interface RelationsCanvasProps {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  campaignId: string;
  onNodeClick?: (node: CanvasNode) => void;
  onNodePositionChange?: (nodeId: string, x: number, y: number) => void;
  onCreateCharacter?: (name: string) => void;
  onDeleteCharacter?: (nodeId: string) => void;
  onCharacterUpdate?: (nodeId: string, character: GrowthCharacter, changes: string[]) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function RelationsCanvas({
  nodes = [],
  connections = [],
  campaignId,
  onNodeClick,
  onNodePositionChange,
  onCreateCharacter,
  onDeleteCharacter,
  onCharacterUpdate,
}: RelationsCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── localStorage helpers ──
  const storageKey = (key: string) => `canvas-${campaignId}-${key}`;

  function loadJSON<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback;
    try {
      const raw = localStorage.getItem(storageKey(key));
      if (raw) return JSON.parse(raw) as T;
    } catch { /* ignore */ }
    return fallback;
  }

  function saveJSON(key: string, value: unknown) {
    try { localStorage.setItem(storageKey(key), JSON.stringify(value)); } catch { /* ignore */ }
  }

  // ── Core canvas state ──
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredConnection, setHoveredConnection] = useState<string | null>(null);
  const [viewBox, setViewBox] = useState(() => loadJSON('viewBox', { x: -693, y: -462, width: 1386, height: 924 }));
  const [zoom, setZoom] = useState(() => loadJSON('zoom', 1));
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, viewBoxX: 0, viewBoxY: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [animationTime, setAnimationTime] = useState(0);

  // ── Node position & layering state ──
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(() => {
    const stored = loadJSON<[string, { x: number; y: number }][]>('positions', []);
    return new Map(stored);
  });
  const [dragOffsets, setDragOffsets] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [nodeZIndices, setNodeZIndices] = useState<Map<string, number>>(() => {
    const stored = loadJSON<[string, number][]>('zIndices', []);
    return new Map(stored);
  });
  const [maxZIndex, setMaxZIndex] = useState(() => {
    const stored = loadJSON<[string, number][]>('zIndices', []);
    return stored.length > 0 ? Math.max(...stored.map(([, z]) => z)) + 1 : 1;
  });

  // ── Node expand/collapse state (persisted per campaign) ──
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    return new Set(loadJSON<string[]>('expanded', []));
  });

  // ── Inventory sub-panel state ──
  const [inventoryOpenNodes, setInventoryOpenNodes] = useState<Set<string>>(() => {
    return new Set(loadJSON<string[]>('inventoryOpen', []));
  });
  const [inventoryOffsets, setInventoryOffsets] = useState<Map<string, { x: number; y: number }>>(() => {
    const stored = loadJSON<[string, { x: number; y: number }][]>('inventoryOffsets', []);
    return new Map(stored);
  });
  const MAX_TETHER_DISTANCE = 2000;
  const EMPTY_PANEL_SET = useRef(new Set<string>()).current;

  // Cached circle positions: measured once from DOM, stored as card-relative offsets (dx, dy from card center)
  const circleOffsetsRef = useRef<Map<string, { dx: number; dy: number }>>(new Map());
  const circleOffsetVersion = useRef(0);

  // Panel z-order: each panel gets an incrementing z-index when dragged; higher = on top
  const [panelZOrder, setPanelZOrder] = useState<Map<string, number>>(new Map());
  const panelZCounterRef = useRef(1);

  // ── Sub-panel state (vitals, traits, skills, magic, backstory, harvests) ──
  const [panelOpenNodes, setPanelOpenNodes] = useState<Map<string, Set<string>>>(() => {
    const stored = loadJSON<[string, string[]][]>('panelOpen', []);
    return new Map(stored.map(([id, panels]) => [id, new Set(panels)]));
  });
  const [panelOffsets, setPanelOffsets] = useState<Map<string, { x: number; y: number }>>(() => {
    const stored = loadJSON<[string, { x: number; y: number }][]>('panelOffsets', []);
    return new Map(stored);
  });

  // ── Persist all canvas state ──
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced save — batches rapid state changes into one write
  const persistState = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      saveJSON('viewBox', viewBox);
      saveJSON('zoom', zoom);
      saveJSON('positions', [...nodePositions.entries()]);
      saveJSON('zIndices', [...nodeZIndices.entries()]);
      saveJSON('expanded', [...expandedNodes]);
      saveJSON('inventoryOpen', [...inventoryOpenNodes]);
      saveJSON('inventoryOffsets', [...inventoryOffsets.entries()]);
      saveJSON('panelOpen', [...panelOpenNodes.entries()].map(([id, s]) => [id, [...s]]));
      saveJSON('panelOffsets', [...panelOffsets.entries()]);
    }, 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewBox, zoom, nodePositions, nodeZIndices, expandedNodes, inventoryOpenNodes, inventoryOffsets, panelOpenNodes, panelOffsets]);

  useEffect(() => {
    persistState();
  }, [persistState]);

  // Measure circle positions from DOM once after expand/panel changes settle.
  // Stored as offsets from the foreignObject's top-left in SVG units, so they
  // don't change with zoom/pan/drag — just add current card position at render time.
  useEffect(() => {
    const timer = setTimeout(() => {
      const svg = svgRef.current;
      if (!svg) return;
      const circles = svg.querySelectorAll('[data-panel-circle]') as NodeListOf<HTMLElement>;
      if (circles.length === 0) return;
      circles.forEach((el) => {
        const panelName = el.getAttribute('data-panel-circle');
        if (!panelName) return;
        const fo = el.closest('foreignObject');
        if (!fo) return;
        const foW = parseFloat(fo.getAttribute('width') || '1');
        const foH = parseFloat(fo.getAttribute('height') || '1');
        const foRect = fo.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        // Circle center relative to foreignObject top-left, in screen pixels
        const relScreenX = (elRect.left + elRect.width / 2) - foRect.left;
        const relScreenY = (elRect.top + elRect.height / 2) - foRect.top;
        // Convert screen-relative to SVG-unit-relative (foreignObject maps foW SVG units → foRect.width screen px)
        const dx = (relScreenX / foRect.width) * foW;
        const dy = (relScreenY / foRect.height) * foH;
        circleOffsetsRef.current.set(panelName, { dx, dy });
      });
      circleOffsetVersion.current += 1;
    }, 50);
    return () => clearTimeout(timer);
  }, [expandedNodes, panelOpenNodes, inventoryOpenNodes]);

  const toggleExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
        // Close all sub-panels and inventory when collapsing
        setInventoryOpenNodes((inv) => {
          const nextInv = new Set(inv);
          nextInv.delete(nodeId);
          return nextInv;
        });
        setPanelOpenNodes((panels) => {
          const nextPanels = new Map(panels);
          nextPanels.delete(nodeId);
          return nextPanels;
        });
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const toggleInventory = useCallback((nodeId: string) => {
    setInventoryOpenNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
        // Default position: above the button
        setInventoryOffsets((offsets) => {
          const nextOffsets = new Map(offsets);
          if (!nextOffsets.has(nodeId)) {
            nextOffsets.set(nodeId, { x: 0, y: -450 });
          }
          return nextOffsets;
        });
      }
      return next;
    });
  }, []);

  const togglePanel = useCallback((nodeId: string, panel: string) => {
    setPanelOpenNodes((prev) => {
      const next = new Map(prev);
      const current = next.get(nodeId) || new Set<string>();
      const updated = new Set(current);
      if (updated.has(panel)) {
        updated.delete(panel);
      } else {
        updated.add(panel);
        // Set default offset for this panel if none exists
        const offsetKey = `${nodeId}__${panel}`;
        setPanelOffsets((offsets) => {
          const nextOffsets = new Map(offsets);
          if (!nextOffsets.has(offsetKey)) {
            nextOffsets.set(offsetKey, { x: 0, y: 10 });
          }
          return nextOffsets;
        });
      }
      if (updated.size === 0) next.delete(nodeId);
      else next.set(nodeId, updated);
      return next;
    });
  }, []);

  // ── Debug overlay state ──
  const [showDebug, setShowDebug] = useState(false);
  const [fps, setFps] = useState(0);
  const fpsFramesRef = useRef(0);
  const fpsLastTimeRef = useRef(performance.now());

  // FPS counter
  useEffect(() => {
    const interval = setInterval(() => {
      const now = performance.now();
      const elapsed = now - fpsLastTimeRef.current;
      setFps(Math.round((fpsFramesRef.current / elapsed) * 1000));
      fpsFramesRef.current = 0;
      fpsLastTimeRef.current = now;
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Count frames
  useEffect(() => {
    fpsFramesRef.current++;
  });

  // ── Node dragging state ──
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [dragStartSvg, setDragStartSvg] = useState<{ x: number; y: number } | null>(null);

  // Refs for RAF throttling
  const animationRafRef = useRef<number>(0);
  const panRafRef = useRef<number>(0);

  // ── Animation timer (RAF-based) ──
  useEffect(() => {
    let lastTime = performance.now();
    const animate = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;
      setAnimationTime((prev) => prev + deltaTime * 2);
      animationRafRef.current = requestAnimationFrame(animate);
    };
    animationRafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationRafRef.current);
  }, []);

  // ── Initialize node positions & z-indices from props ──
  useEffect(() => {
    setNodePositions((prev) => {
      const next = new Map(prev);
      nodes.forEach((node) => {
        if (!next.has(node.id)) {
          next.set(node.id, { x: node.x, y: node.y });
        }
      });
      return next;
    });

    setNodeZIndices((prev) => {
      const next = new Map(prev);
      let currentMax = maxZIndex;
      nodes.forEach((node, index) => {
        if (!next.has(node.id)) {
          const z = index + 1;
          next.set(node.id, z);
          currentMax = Math.max(currentMax, z);
        }
      });
      if (currentMax > maxZIndex) setMaxZIndex(currentMax);
      return next;
    });
  }, [nodes, maxZIndex]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getNodePosition = useCallback(
    (nodeId: string, fallbackX: number, fallbackY: number) => {
      const pos = nodePositions.get(nodeId);
      return pos ?? { x: fallbackX, y: fallbackY };
    },
    [nodePositions]
  );

  const bringNodeToFront = useCallback((nodeId: string) => {
    setNodeZIndices((prev) => {
      let currentMax = 0;
      prev.forEach((z) => { if (z > currentMax) currentMax = z; });
      const currentZ = prev.get(nodeId);
      if (currentZ === currentMax && currentMax > 0) return prev;
      const next = new Map(prev);
      const newMax = currentMax + 1;
      next.set(nodeId, newMax);
      setMaxZIndex(newMax);
      return next;
    });
  }, []);

  /** Convert client-space coords to SVG world coords */
  const clientToSvg = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.width,
        y: viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.height,
      };
    },
    [viewBox]
  );

  // ── Connection styling ────────────────────────────────────────────────────

  const getConnectionColor = useCallback((type: CanvasConnection["type"]) => {
    switch (type) {
      case "goal":        return "var(--accent-teal)";
      case "resistance":  return "var(--pillar-body)";
      case "opportunity": return "var(--accent-gold)";
      case "alliance":    return "var(--pillar-spirit)";
      case "conflict":    return "var(--pillar-soul)";
      default:            return "#808080";
    }
  }, []);

  // ── Node type helpers ─────────────────────────────────────────────────────

  const getNodeTypeIcon = useCallback((type: CanvasNode["type"]) => {
    switch (type) {
      case "character": return "\u{1F9D1}";
      case "npc":       return "\u{1F5E3}";
      case "quest":     return "\u{1F4DC}";
      case "location":  return "\u{1F4CD}";
      default:          return "?";
    }
  }, []);

  const getNodeFill = useCallback((type: CanvasNode["type"], color?: string) => {
    if (color) return color;
    switch (type) {
      case "character": return "var(--accent-teal)";
      case "npc":       return "var(--accent-gold)";
      case "quest":     return "var(--pillar-spirit)";
      case "location":  return "var(--pillar-soul)";
      default:          return "#808080";
    }
  }, []);

  // ── Pan handlers ──────────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as Element;
      const isBackground =
        target === svgRef.current ||
        target.closest('rect[data-bg="grid"]') !== null ||
        target.closest('rect[data-bg="circuits"]') !== null ||
        target.tagName === "svg";

      if (isBackground) {
        setIsPanning(true);
        setIsDragging(true);
        setPanStart({ x: e.clientX, y: e.clientY, viewBoxX: viewBox.x, viewBoxY: viewBox.y });
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [viewBox.x, viewBox.y]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      // ── Node drag ──
      if (dragNodeId && dragStartSvg) {
        const current = clientToSvg(e.clientX, e.clientY);
        const dx = current.x - dragStartSvg.x;
        const dy = current.y - dragStartSvg.y;
        setDragOffsets((prev) => {
          const next = new Map(prev);
          next.set(dragNodeId, { x: dx, y: dy });
          return next;
        });
        return;
      }

      // ── Canvas pan ──
      if (!isPanning || !isDragging) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      const scaleX = viewBox.width / rect.width;
      const scaleY = viewBox.height / rect.height;
      const newX = panStart.viewBoxX - dx * scaleX;
      const newY = panStart.viewBoxY - dy * scaleY;

      if (!panRafRef.current) {
        panRafRef.current = requestAnimationFrame(() => {
          setViewBox((prev) => ({ ...prev, x: newX, y: newY }));
          panRafRef.current = 0;
        });
      }
    },
    [isPanning, isDragging, panStart, viewBox, dragNodeId, dragStartSvg, clientToSvg]
  );

  const handleMouseUp = useCallback(() => {
    // ── Finish node drag ──
    if (dragNodeId) {
      const offset = dragOffsets.get(dragNodeId);
      if (offset && (offset.x !== 0 || offset.y !== 0)) {
        const basePos = nodePositions.get(dragNodeId);
        if (basePos) {
          const newX = basePos.x + offset.x;
          const newY = basePos.y + offset.y;
          setNodePositions((prev) => {
            const next = new Map(prev);
            next.set(dragNodeId, { x: newX, y: newY });
            return next;
          });
          onNodePositionChange?.(dragNodeId, newX, newY);
        }
      }
      setDragOffsets((prev) => {
        const next = new Map(prev);
        next.delete(dragNodeId);
        return next;
      });
      setDragNodeId(null);
      setDragStartSvg(null);
      return;
    }

    setIsPanning(false);
    setIsDragging(false);
  }, [dragNodeId, dragOffsets, nodePositions, onNodePositionChange]);

  // Global mouse listeners for pan / drag
  useEffect(() => {
    const needListeners = (isPanning && isDragging) || dragNodeId !== null;
    if (needListeners) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isPanning, isDragging, dragNodeId, handleMouseMove, handleMouseUp]);

  // ── Zoom handler ──────────────────────────────────────────────────────────

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.cancelable) e.preventDefault();
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const svgX = viewBox.x + (mouseX / rect.width) * viewBox.width;
      const svgY = viewBox.y + (mouseY / rect.height) * viewBox.height;

      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
      const newZoom = Math.max(0.666, Math.min(5, zoom * zoomFactor));

      if (newZoom !== zoom) {
        const scaleFactor = newZoom / zoom;
        setZoom(newZoom);
        setViewBox((prev) => ({
          x: svgX - (svgX - prev.x) * scaleFactor,
          y: svgY - (svgY - prev.y) * scaleFactor,
          width: prev.width * scaleFactor,
          height: prev.height * scaleFactor,
        }));
      }
    },
    [viewBox, zoom]
  );

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (e.key === "d" && e.ctrlKey && !isTyping) {
        e.preventDefault();
        setShowDebug((prev) => !prev);
      } else if (e.key === "Escape") {
        setSelectedNode(null);
      } else if (e.key === " " && !isTyping) {
        e.preventDefault();
        if (selectedNode) {
          const node = nodes.find((n) => n.id === selectedNode);
          if (node) {
            setViewBox({ x: node.x - 693, y: node.y - 462, width: 1386, height: 924 });
            setZoom(1);
          }
        } else {
          setViewBox({ x: -693, y: -462, width: 1386, height: 924 });
          setZoom(1);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNode, nodes]);

  // ── Render connection ─────────────────────────────────────────────────────

  const renderConnection = (connection: CanvasConnection) => {
    const fromNode = nodes.find((n) => n.id === connection.from);
    const toNode = nodes.find((n) => n.id === connection.to);
    if (!fromNode || !toNode) return null;

    const fromPos = getNodePosition(fromNode.id, fromNode.x, fromNode.y);
    const toPos = getNodePosition(toNode.id, toNode.x, toNode.y);
    const color = getConnectionColor(connection.type);
    const connectionId = `${connection.from}-${connection.to}`;

    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) return null;
    const ux = dx / length;
    const uy = dy / length;

    const offset = fromNode.type === "character" || toNode.type === "character" ? 60 : 30;
    const startX = fromPos.x + ux * offset;
    const startY = fromPos.y + uy * offset;
    const endX = toPos.x - ux * offset;
    const endY = toPos.y - uy * offset;

    const baseWidth = 1.5;
    const width = baseWidth + connection.strength * 1.5;
    const isHovered = hoveredConnection === connectionId;

    return (
      <g key={connectionId}>
        <line
          x1={startX} y1={startY} x2={endX} y2={endY}
          stroke={color}
          strokeWidth={width}
          opacity={isHovered ? 1.0 : 0.7}
          strokeDasharray={connection.type === "conflict" ? "8,4" : "none"}
          filter={isHovered ? "url(#glow)" : "none"}
          className="cursor-pointer"
          onMouseEnter={() => setHoveredConnection(connectionId)}
          onMouseLeave={() => setHoveredConnection(null)}
        />
        {/* Arrowhead */}
        <polygon
          points={`${endX},${endY} ${endX - 8 * ux + 4 * uy},${endY - 8 * uy - 4 * ux} ${endX - 8 * ux - 4 * uy},${endY - 8 * uy + 4 * ux}`}
          fill={color}
          opacity={isHovered ? 1.0 : 0.7}
          className="pointer-events-none"
        />
        {/* Connection type label on hover */}
        {isHovered && (
          <text
            x={(startX + endX) / 2}
            y={(startY + endY) / 2 - 8}
            fontSize="10"
            fill={color}
            textAnchor="middle"
            className="pointer-events-none font-[family-name:var(--font-terminal)]"
          >
            {connection.type.toUpperCase()}
          </text>
        )}
      </g>
    );
  };

  // ── Render character card (foreignObject with full CharacterCard) ────────

  const renderCharacterCard = (node: CanvasNode, visualX: number, visualY: number) => {
    const isNodeExpanded = expandedNodes.has(node.id);
    const isInventoryOpen = inventoryOpenNodes.has(node.id) && isNodeExpanded;
    const nodePanels = panelOpenNodes.get(node.id) || EMPTY_PANEL_SET;
    const cardWidth = isNodeExpanded ? 1920 : 520;
    const cardHeight = isNodeExpanded ? 500 : 240;

    // When dragging, card scales 105% from center — apply same to tether anchors
    const isDraggingNode = dragOffsets.has(node.id);
    const scaleAnchor = (ax: number, ay: number) => {
      if (!isDraggingNode) return { x: ax, y: ay };
      return {
        x: visualX + (ax - visualX) * 1.05,
        y: visualY + (ay - visualY) * 1.05,
      };
    };

    const charNode: CharacterNodeData = {
      id: node.id,
      type: 'character',
      name: node.name,
      x: visualX,
      y: visualY,
      status: node.status,
      portrait: node.portrait,
      characterData: node.characterData as CharacterNodeData['characterData'],
    };

    const inventoryItems: InventoryItem[] = (node.characterData as Record<string, unknown>)?.inventory as InventoryItem[] || [];

    return (
      <g key={`card-group-${node.id}`}>
        <foreignObject
          key={`card-${node.id}`}
          x={visualX - cardWidth / 2}
          y={visualY - cardHeight / 2}
          width={cardWidth}
          height={cardHeight}
          style={{ overflow: "visible" }}
        >
          <CharacterCard
            node={charNode}
            isExpanded={isNodeExpanded}
            showInventory={isInventoryOpen}
            openPanels={nodePanels}
            onToggleExpand={toggleExpand}
            onDelete={onDeleteCharacter}
            onInventoryToggle={toggleInventory}
            onPanelToggle={togglePanel}
            onPositionChange={(nodeId, x, y) => {
              setNodePositions((prev) => {
                const next = new Map(prev);
                next.set(nodeId, { x, y });
                return next;
              });
              onNodePositionChange?.(nodeId, x, y);
              bringNodeToFront(nodeId);
            }}
            onDragOffsetChange={(nodeId, offsetX, offsetY) => {
              setDragOffsets((prev) => {
                const next = new Map(prev);
                if (offsetX === 0 && offsetY === 0) {
                  next.delete(nodeId);
                } else {
                  next.set(nodeId, { x: offsetX, y: offsetY });
                }
                return next;
              });
            }}
            onCharacterUpdate={onCharacterUpdate}
          />
        </foreignObject>

        {/* Inventory sub-panel — draggable with tether line */}
        {/* ── All tether lines/dots (rendered BEFORE panels so they appear behind) ── */}
        {isInventoryOpen && (() => {
          const cardLeft = visualX - cardWidth / 2;
          const cardTop = visualY - cardHeight / 2;
          const cached = circleOffsetsRef.current.get('inventory');
          const rawAnchorX = cached ? (cardLeft + cached.dx) : (cardLeft + 436 + 88);
          const rawAnchorY = cached ? (cardTop + cached.dy) : (cardTop + 515 + 13);
          const { x: anchorX, y: anchorY } = scaleAnchor(rawAnchorX, rawAnchorY);
          const offset = inventoryOffsets.get(node.id) || { x: 0, y: 20 };
          const tetherEndX = anchorX + offset.x;
          const tetherEndY = anchorY + offset.y + 20;
          return (
            <>
              <line x1={anchorX} y1={anchorY} x2={tetherEndX} y2={tetherEndY} stroke="#ffcc78" strokeWidth={2} strokeDasharray="6 4" opacity={0.6} />
              <circle cx={anchorX} cy={anchorY} r={3.5} fill="#ffcc78" opacity={0.8} />
              <circle cx={tetherEndX} cy={tetherEndY} r={4} fill="#ffcc78" opacity={0.8} />
            </>
          );
        })()}
        {isNodeExpanded && [...nodePanels].map((panelKey) => {
          const offsetKey = `${node.id}__${panelKey}`;
          const cardLeft = visualX - cardWidth / 2;
          const cardTop = visualY - cardHeight / 2;
          const cached = circleOffsetsRef.current.get(panelKey);
          const rawAnchorX = cached ? (cardLeft + cached.dx) : (cardLeft + 436 + 200);
          const rawAnchorY = cached ? (cardTop + cached.dy) : (cardTop + 515 + 13);
          const { x: anchorX, y: anchorY } = scaleAnchor(rawAnchorX, rawAnchorY);
          const offset = panelOffsets.get(offsetKey) || { x: 0, y: 20 };
          const tetherEndX = anchorX + offset.x;
          const tetherEndY = anchorY + offset.y + 20;
          return (
            <React.Fragment key={`tether-${node.id}-${panelKey}`}>
              <line x1={anchorX} y1={anchorY} x2={tetherEndX} y2={tetherEndY} stroke="#ffcc78" strokeWidth={2} strokeDasharray="6 4" opacity={0.6} />
              <circle cx={anchorX} cy={anchorY} r={3.5} fill="#ffcc78" opacity={0.8} />
              <circle cx={tetherEndX} cy={tetherEndY} r={4} fill="#ffcc78" opacity={0.8} />
            </React.Fragment>
          );
        })}

        {/* ── All panels: sorted so last-dragged renders on top ── */}
        {isNodeExpanded && [
          ...(isInventoryOpen ? ['_inv'] : []),
          ...nodePanels,
        ].sort((a, b) => {
          return (panelZOrder.get(a) || 0) - (panelZOrder.get(b) || 0);
        }).map((panelKey) => {
          // Inventory panel
          if (panelKey === '_inv') {
            const cardLeft = visualX - cardWidth / 2;
            const cardTop = visualY - cardHeight / 2;
            const cached = circleOffsetsRef.current.get('inventory');
            const rawAnchorX = cached ? (cardLeft + cached.dx) : (cardLeft + 436 + 88);
            const rawAnchorY = cached ? (cardTop + cached.dy) : (cardTop + 515 + 13);
            const { x: anchorX, y: anchorY } = scaleAnchor(rawAnchorX, rawAnchorY);
            const invOffset = inventoryOffsets.get(node.id) || { x: 0, y: 20 };
            const panelCenterX = anchorX + invOffset.x;
            const panelTopY = anchorY + invOffset.y;
            const panelW = 413;

            return (
              <foreignObject
                key={`inv-${node.id}`}
                x={panelCenterX - panelW / 2}
                y={panelTopY}
                width={panelW + 20}
                height={700}
                style={{ overflow: "visible", pointerEvents: "none" }}
              >
                <div
                  style={{ cursor: 'grab', userSelect: 'none', pointerEvents: 'auto', display: 'inline-block' }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setPanelZOrder(prev => { const next = new Map(prev); next.set('_inv', panelZCounterRef.current++); return next; });

                    const svg = svgRef.current;
                    if (!svg) return;

                    const svgPoint = svg.createSVGPoint();
                    const screenToSVG = (cx: number, cy: number) => {
                      svgPoint.x = cx;
                      svgPoint.y = cy;
                      return svgPoint.matrixTransform(svg.getScreenCTM()!.inverse());
                    };

                    const startSVG = screenToSVG(e.clientX, e.clientY);
                    const startOffset = { ...invOffset };

                    const onMove = (me: MouseEvent) => {
                      const cur = screenToSVG(me.clientX, me.clientY);
                      let dx = startOffset.x + (cur.x - startSVG.x);
                      let dy = startOffset.y + (cur.y - startSVG.y);

                      const dist = Math.sqrt(dx * dx + dy * dy);
                      if (dist > MAX_TETHER_DISTANCE) {
                        const scale = MAX_TETHER_DISTANCE / dist;
                        dx *= scale;
                        dy *= scale;
                      }

                      setInventoryOffsets((prev) => {
                        const next = new Map(prev);
                        next.set(node.id, { x: dx, y: dy });
                        return next;
                      });
                    };

                    const onUp = () => {
                      document.removeEventListener('mousemove', onMove);
                      document.removeEventListener('mouseup', onUp);
                    };

                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                  }}
                >
                  <InventoryCard
                    characterName={node.name}
                    items={inventoryItems}
                    onClose={() => toggleInventory(node.id)}
                  />
                </div>
              </foreignObject>
            );
          }

          // Sub-panels
          const offsetKey = `${node.id}__${panelKey}`;

          // Cached offset from foreignObject top-left + current card position
          const cardLeft = visualX - cardWidth / 2;
          const cardTop = visualY - cardHeight / 2;
          const cached = circleOffsetsRef.current.get(panelKey);
          const rawAnchorX = cached ? (cardLeft + cached.dx) : (cardLeft + 436 + 200);
          const rawAnchorY = cached ? (cardTop + cached.dy) : (cardTop + 515 + 13);
          const { x: anchorX, y: anchorY } = scaleAnchor(rawAnchorX, rawAnchorY);
          const offset = panelOffsets.get(offsetKey) || { x: 0, y: 20 };
          const panelCenterX = anchorX + offset.x;
          const panelTopY = anchorY + offset.y;
          const panelW = 440;
          const tetherEndX = panelCenterX;
          const tetherEndY = panelTopY + 20;

          const charData = node.characterData as Record<string, unknown> || {};

          const panelContent = (() => {
            switch (panelKey) {
              case 'vitals':
                return <VitalsCard vitals={(charData.vitals as Record<string, unknown>) || {}} onClose={() => togglePanel(node.id, panelKey)} />;
              case 'traits':
                return <TraitsCard traits={(charData.traits as Array<{ name: string; type: 'nectar' | 'blossom' | 'thorn'; category?: string; description?: string; source?: string; mechanicalEffect?: string }>) || []} fateDie={(charData.creation as Record<string, unknown>)?.seed ? ((charData.creation as Record<string, unknown>).seed as Record<string, unknown>)?.baseFateDie as string : undefined} onClose={() => togglePanel(node.id, panelKey)} />;
              case 'skills':
                return <SkillsCard
                  skills={(charData.skills as SkillItem[]) || []}
                  campaignId={campaignId}
                  onClose={() => togglePanel(node.id, panelKey)}
                  onAddSkill={onCharacterUpdate ? (skill) => {
                    const result = addSkill(charData as unknown as GrowthCharacter, skill);
                    if (result.changes.length > 0) onCharacterUpdate(node.id, result.character, result.changes);
                  } : undefined}
                  onRemoveSkill={onCharacterUpdate ? (skillName) => {
                    const result = removeSkill(charData as unknown as GrowthCharacter, skillName);
                    if (result.changes.length > 0) onCharacterUpdate(node.id, result.character, result.changes);
                  } : undefined}
                  onUpdateSkillLevel={onCharacterUpdate ? (skillName, newLevel) => {
                    const result = updateSkillLevel(charData as unknown as GrowthCharacter, skillName, newLevel);
                    if (result.changes.length > 0) onCharacterUpdate(node.id, result.character, result.changes);
                  } : undefined}
                  onRollSkill={(skillName) => {
                    window.dispatchEvent(new CustomEvent('growth:roll-skill', { detail: { skillName, characterName: node.name, nodeId: node.id } }));
                  }}
                  onRequestSkill={(request) => {
                    fetch(`/api/campaigns/${campaignId}/requests`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ type: 'skill', name: request.name, data: { governors: request.governors, description: request.description } }),
                    }).then(() => {
                      // Also post a chat event to terminal so GM sees it
                      fetch(`/api/campaigns/${campaignId}/events`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          type: 'game_event',
                          characterId: node.id,
                          characterName: node.name,
                          payload: { kind: 'game_event', eventType: 'skill_request', description: `Requested skill: "${request.name}" (gov: ${request.governors.join(', ')})${request.description ? ` — ${request.description}` : ''}` },
                        }),
                      });
                    });
                  }}
                />;
              case 'magic':
                return <MagicCard magic={(charData.magic as Record<string, unknown>) || {}} onClose={() => togglePanel(node.id, panelKey)} />;
              case 'backstory':
                return <BackstoryCard backstory={(charData.backstory as Record<string, unknown>) || {}} onClose={() => togglePanel(node.id, panelKey)} />;
              case 'harvests':
                return <HarvestCard harvests={(charData.harvests as Array<{ season: string; turn: number; description?: string; rewards?: string[]; consequences?: string[]; krmaChange?: number }>) || []} onClose={() => togglePanel(node.id, panelKey)} />;
              default:
                return null;
            }
          })();

          if (!panelContent) return null;

          return (
            <React.Fragment key={`panel-${node.id}-${panelKey}`}>
              <foreignObject
                x={panelCenterX - panelW / 2}
                y={panelTopY}
                width={panelW + 20}
                height={700}
                style={{ overflow: "visible", pointerEvents: "none" }}
              >
                <div
                  style={{ cursor: 'grab', userSelect: 'none', pointerEvents: 'auto', display: 'inline-block' }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setPanelZOrder(prev => { const next = new Map(prev); next.set(panelKey, panelZCounterRef.current++); return next; });

                    const svg = svgRef.current;
                    if (!svg) return;

                    const svgPoint = svg.createSVGPoint();
                    const screenToSVG = (cx: number, cy: number) => {
                      svgPoint.x = cx;
                      svgPoint.y = cy;
                      return svgPoint.matrixTransform(svg.getScreenCTM()!.inverse());
                    };

                    const startSVG = screenToSVG(e.clientX, e.clientY);
                    const startOffset = { ...offset };

                    const onMove = (me: MouseEvent) => {
                      const cur = screenToSVG(me.clientX, me.clientY);
                      let dx = startOffset.x + (cur.x - startSVG.x);
                      let dy = startOffset.y + (cur.y - startSVG.y);

                      const dist = Math.sqrt(dx * dx + dy * dy);
                      if (dist > MAX_TETHER_DISTANCE) {
                        const scale = MAX_TETHER_DISTANCE / dist;
                        dx *= scale;
                        dy *= scale;
                      }

                      setPanelOffsets((prev) => {
                        const next = new Map(prev);
                        next.set(offsetKey, { x: dx, y: dy });
                        return next;
                      });
                    };

                    const onUp = () => {
                      document.removeEventListener('mousemove', onMove);
                      document.removeEventListener('mouseup', onUp);
                    };

                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                  }}
                >
                  {panelContent}
                </div>
              </foreignObject>
            </React.Fragment>
          );
        })}
      </g>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────

  const selectedNodeData = selectedNode ? nodes.find((n) => n.id === selectedNode) : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full rounded-lg overflow-hidden select-none"
      style={{ background: "var(--surface-void)", cursor: isPanning ? "grabbing" : "grab" }}
    >
      {/* Main SVG */}
      <svg
        ref={svgRef}
        className="w-full h-full"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        style={{ cursor: isPanning ? "grabbing" : "grab" }}
      >
        {/* ── Definitions ── */}
        <defs>
          {/* Grid pattern */}
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#1a1a1a" strokeWidth="1" opacity="0.5" />
          </pattern>

          {/* Circuit-trace pattern */}
          <pattern id="circuits" width="100" height="100" patternUnits="userSpaceOnUse">
            <path d="M0,50 Q25,25 50,50 Q75,75 100,50" fill="none" stroke="#0a4d4a" strokeWidth="0.5" opacity="0.3" />
            <path d="M50,0 Q75,25 50,50 Q25,75 50,100" fill="none" stroke="#0a4d4a" strokeWidth="0.5" opacity="0.3" />
            <circle cx="50" cy="50" r="2" fill="var(--accent-teal)" opacity="0.15" />
          </pattern>

          {/* Glow filter (connections) */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Node glow */}
          <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* KRMA Line glow (intense) */}
          <filter id="krmaLineGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="8" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Lightsaber glow (multi-layer) */}
          <filter id="lightsaberGlow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="20" result="glow1" />
            <feGaussianBlur stdDeviation="12" result="glow2" />
            <feGaussianBlur stdDeviation="6" result="glow3" />
            <feGaussianBlur stdDeviation="3" result="glow4" />
            <feMerge>
              <feMergeNode in="glow1" />
              <feMergeNode in="glow2" />
              <feMergeNode in="glow3" />
              <feMergeNode in="glow4" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Core glow */}
          <filter id="coreGlow" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="8" result="coreBlur" />
            <feMerge>
              <feMergeNode in="coreBlur" />
              <feMergeNode in="coreBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Gold gradient for KRMA Line center */}
          <linearGradient id="goldGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style={{ stopColor: "var(--krma-gold, #FFD700)", stopOpacity: 1 }} />
            <stop offset="50%" style={{ stopColor: "#FFA500", stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: "var(--krma-gold, #FFD700)", stopOpacity: 1 }} />
          </linearGradient>
        </defs>

        {/* ── Background (extends beyond viewBox to cover pan) ── */}
        <rect x={viewBox.x - viewBox.width} y={viewBox.y - viewBox.height} width={viewBox.width * 3} height={viewBox.height * 3} fill="url(#grid)" data-bg="grid" />
        <rect x={viewBox.x - viewBox.width} y={viewBox.y - viewBox.height} width={viewBox.width * 3} height={viewBox.height * 3} fill="url(#circuits)" opacity="0.3" data-bg="circuits" />

        {/* ── THE KRMA LINE ── */}
        <g>
          {(() => {
            const segments: string[] = [];
            const numSegments = 50;
            const extraWidth = viewBox.width * 0.5;
            const segmentWidth = (viewBox.width + extraWidth * 2) / numSegments;

            for (let i = 0; i <= numSegments; i++) {
              const x = viewBox.x - extraWidth + i * segmentWidth;
              const waveOffset =
                Math.sin(animationTime * 0.8 + x * 0.001) * 3 +
                Math.sin(animationTime * 1.2 + x * 0.0015) * 2;
              segments.push(`${x},${waveOffset}`);
            }

            const pathData = `M ${segments.join(" L ")}`;

            return (
              <>
                {/* Outer field glow */}
                <path d={pathData} fill="none" stroke="var(--pillar-soul, #7050A8)" strokeWidth="100" filter="url(#lightsaberGlow)" opacity="0.4" />
                {/* Bright core glow */}
                <path
                  d={pathData} fill="none" stroke="var(--pillar-soul, #9400D3)" strokeWidth="60"
                  filter="url(#coreGlow)"
                  opacity={0.6 + Math.abs(Math.sin(animationTime * 0.7)) * 0.3}
                />
                {/* Pulsing purple layer */}
                <path
                  d={pathData} fill="none" stroke="var(--pillar-soul, #8B00FF)"
                  strokeWidth={35 + Math.sin(animationTime * 1.2) * 5}
                  filter="url(#krmaLineGlow)"
                  opacity={0.7 + Math.abs(Math.sin(animationTime * 0.9)) * 0.2}
                />
                {/* Intense core */}
                <path
                  d={pathData} fill="none" stroke="#A020F0"
                  strokeWidth={20 + Math.sin(animationTime * 1.5) * 3}
                  opacity={0.8 + Math.abs(Math.sin(animationTime * 1.1)) * 0.2}
                />
                {/* Gold energy core */}
                <path
                  d={pathData} fill="none" stroke="url(#goldGradient)"
                  strokeWidth={8 + Math.sin(animationTime * 2.5) * 2}
                  filter="url(#krmaLineGlow)" opacity="1.0"
                />
                {/* White-hot center */}
                <path
                  d={pathData} fill="none" stroke="#FFFFFF"
                  strokeWidth={2 + Math.sin(animationTime * 3) * 1}
                  filter="url(#coreGlow)"
                  opacity={0.9 + Math.abs(Math.sin(animationTime * 2)) * 0.1}
                />
              </>
            );
          })()}

          {/* Flowing energy particles */}
          <g>
            {Array.from({ length: 20 }, (_, i) => {
              const flowSpeed = 100;
              const spacing = viewBox.width / 15;
              const xPos = viewBox.x + ((animationTime * flowSpeed + i * spacing) % (viewBox.width * 2)) - viewBox.width * 0.5;
              const yOffset = Math.sin(animationTime * 2 + i * 0.5) * 6;
              const isSymbol = i % 4 === 0;

              if (isSymbol) {
                return (
                  <text
                    key={`krma-${i}`} x={xPos} y={yOffset + 2}
                    fontSize="12" fontWeight="bold" fill="var(--krma-gold, #FFD700)"
                    opacity="0.9" filter="url(#nodeGlow)" textAnchor="middle"
                    className="pointer-events-none"
                  >
                    {"\u049C"}
                  </text>
                );
              }
              return (
                <circle
                  key={i} cx={xPos} cy={yOffset} r="2"
                  fill="var(--krma-gold, #FFD700)" opacity="0.8" filter="url(#nodeGlow)"
                />
              );
            })}
          </g>

          {/* Slow-moving KRMA symbols */}
          <g>
            {Array.from({ length: 8 }, (_, i) => {
              const flowSpeed = 60;
              const spacing = viewBox.width / 6;
              const xPos = viewBox.x + ((animationTime * flowSpeed + i * spacing) % (viewBox.width * 2)) - viewBox.width * 0.5;
              const yOffset = Math.sin(animationTime * 1.5 + i * 0.8) * 8;
              const scale = 0.8 + Math.sin(animationTime * 3 + i) * 0.3;

              return (
                <text
                  key={`krma-slow-${i}`} x={xPos} y={yOffset + 3}
                  fontSize={14 * scale} fontWeight="bold" fill="var(--pillar-soul, #8B00FF)"
                  opacity="0.7" filter="url(#nodeGlow)" textAnchor="middle"
                  className="pointer-events-none"
                >
                  {"\u049C"}
                </text>
              );
            })}
          </g>

          {/* Energy sparks */}
          <g>
            {Array.from({ length: 12 }, (_, i) => {
              const sparkX = viewBox.x + (i * viewBox.width) / 12 + Math.sin(animationTime + i) * 50;
              const sparkY = Math.sin(animationTime * 3 + i * 0.8) * 6;
              const opacity = 0.3 + Math.abs(Math.sin(animationTime * 4 + i * 1.2)) * 0.7;
              return <circle key={`spark-${i}`} cx={sparkX} cy={sparkY} r="1.5" fill="#FFFFFF" opacity={opacity} filter="url(#nodeGlow)" />;
            })}
          </g>

          {/* Larger energy ring nodes */}
          <g>
            {Array.from({ length: 7 }, (_, i) => {
              const nodeX = viewBox.x + (viewBox.width * (i + 1)) / 8;
              const nodeY = Math.sin(animationTime * 1.5 + i * 2) * 3;
              const radius = 4 + Math.sin(animationTime * 2 + i) * 2;
              const opacity = 0.5 + Math.abs(Math.sin(animationTime + i * 0.7)) * 0.4;
              return (
                <circle
                  key={`ring-${i}`} cx={nodeX} cy={nodeY} r={radius}
                  fill="none" stroke="var(--krma-gold, #FFD700)" strokeWidth="2"
                  opacity={opacity} filter="url(#krmaLineGlow)"
                />
              );
            })}
          </g>
        </g>

        {/* ── Creation Toolbox (anchored to KRMA Line center) ── */}
        <foreignObject x={-130} y={-100} width={260} height={200} style={{ overflow: "visible" }}>
          <div
            style={{
              width: 260,
              height: 200,
              background: "linear-gradient(135deg, #22ab94 0%, #1e9b82 50%, #22ab94 100%)",
              border: "2px dashed #1e9b82",
              borderRadius: 12,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              fontFamily: "var(--font-terminal), Consolas, monospace",
              boxShadow: "0 8px 32px rgba(34, 171, 148, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
              userSelect: "none",
            }}
          >
            {/* Shield icon */}
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 70%)",
                border: "1px solid rgba(255,255,255,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M12 2L3 7v6c0 5.55 3.84 9.74 9 9.74s9-4.19 9-9.74V7l-7-5z" />
              </svg>
            </div>

            {/* KRMA display */}
            <div style={{ color: "white", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textShadow: "0 2px 4px rgba(0,0,0,0.4)" }}>
              {"\u049C"} KRMA TOOLS
            </div>

            {/* Create button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                const name = window.prompt("Character name:");
                if (name?.trim()) {
                  onCreateCharacter?.(name.trim());
                }
              }}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "linear-gradient(145deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.1) 100%)",
                border: "1px solid rgba(255,255,255,0.4)",
                borderRadius: 10,
                color: "white",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.08em",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                textShadow: "0 2px 4px rgba(0,0,0,0.4)",
                boxShadow: "0 4px 15px rgba(255, 255, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.3)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              CREATE
            </button>

            {/* Future action icons (dimmed) */}
            <div style={{ display: "flex", gap: 10, opacity: 0.4 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
          </div>
        </foreignObject>

        {/* ── Connections (behind nodes) ── */}
        {connections.map((c) => renderConnection(c))}

        {/* ── Character nodes (foreignObject cards) — sorted by z-index ── */}
        {nodes
          .filter((n) => n.type === "character")
          .sort((a, b) => (nodeZIndices.get(a.id) || 0) - (nodeZIndices.get(b.id) || 0))
          .map((node) => {
            const position = getNodePosition(node.id, node.x, node.y);
            const isSelected = selectedNode === node.id;
            const isNodeExpanded = expandedNodes.has(node.id);
            const cardWidth = isNodeExpanded ? 1920 : 520;
            const cardHeight = isNodeExpanded ? 500 : 240;

            // Viewport culling
            const margin = Math.max(cardWidth, cardHeight);
            const isInViewport =
              position.x + cardWidth / 2 + margin > viewBox.x &&
              position.x - cardWidth / 2 - margin < viewBox.x + viewBox.width &&
              position.y + cardHeight / 2 + margin > viewBox.y &&
              position.y - cardHeight / 2 - margin < viewBox.y + viewBox.height;

            if (!isSelected && !isInViewport) return null;

            const offset = dragOffsets.get(node.id) || { x: 0, y: 0 };
            const visualX = position.x + offset.x;
            const visualY = position.y + offset.y;

            return renderCharacterCard(node, visualX, visualY);
          })}

        {/* ── Non-character nodes (circle icons) — sorted by z-index ── */}
        {nodes
          .filter((n) => n.type !== "character")
          .sort((a, b) => (nodeZIndices.get(a.id) || 0) - (nodeZIndices.get(b.id) || 0))
          .map((node) => {
            const isSelected = selectedNode === node.id;
            const isHovered = hoveredNode === node.id;
            const position = getNodePosition(node.id, node.x, node.y);
            const fillColor = getNodeFill(node.type, node.color);

            // Viewport culling
            const nodeRadius = 30;
            const margin = 100;
            const isInViewport =
              position.x + nodeRadius + margin > viewBox.x &&
              position.x - nodeRadius - margin < viewBox.x + viewBox.width &&
              position.y + nodeRadius + margin > viewBox.y &&
              position.y - nodeRadius - margin < viewBox.y + viewBox.height;

            if (!isSelected && !isHovered && !isInViewport) return null;

            const offset = dragOffsets.get(node.id) || { x: 0, y: 0 };
            const visualX = position.x + offset.x;
            const visualY = position.y + offset.y;

            return (
              <g key={node.id}>
                {/* Background circle */}
                <circle
                  cx={visualX} cy={visualY} r="30"
                  fill={fillColor} fillOpacity="0.7"
                  stroke={isSelected ? "#FFFFFF" : fillColor}
                  strokeWidth={isSelected ? "4" : isHovered ? "3" : "2"}
                  filter={isSelected || isHovered ? "url(#nodeGlow)" : "none"}
                  className="cursor-pointer"
                  onClick={() => { setSelectedNode(node.id); onNodeClick?.(node); bringNodeToFront(node.id); }}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const svgCoords = clientToSvg(e.clientX, e.clientY);
                    setDragNodeId(node.id);
                    setDragStartSvg(svgCoords);
                    bringNodeToFront(node.id);
                  }}
                />

                {/* Selected inner ring */}
                {isSelected && (
                  <circle cx={visualX} cy={visualY} r="20" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.8" className="pointer-events-none" />
                )}

                {/* Type icon */}
                <text
                  x={visualX} y={visualY - 5} textAnchor="middle" fontSize="14" fontWeight="bold"
                  fill="white" className="pointer-events-none"
                  style={{ filter: "drop-shadow(0px 0px 3px rgba(0,0,0,0.8))" }}
                >
                  {getNodeTypeIcon(node.type)}
                </text>

                {/* Node name */}
                <text
                  x={visualX} y={visualY + 50} textAnchor="middle" fontSize="11" fill="white"
                  className="pointer-events-none font-[family-name:var(--font-terminal)]"
                  style={{ filter: "drop-shadow(0px 0px 3px rgba(0,0,0,0.9))" }}
                >
                  {node.name.length > 12 ? `${node.name.substring(0, 12)}...` : node.name}
                </text>
              </g>
            );
          })}
      </svg>

      {/* ── Debug overlay (Ctrl+D) ── */}
      {showDebug && (
        <div
          className="absolute top-2 right-2 rounded-lg p-3 text-xs font-[family-name:var(--font-terminal)]"
          style={{
            background: "rgba(0, 0, 0, 0.85)",
            border: "1px solid var(--accent-teal)",
            color: "var(--accent-teal)",
            minWidth: 200,
            zIndex: 50,
          }}
        >
          <div className="font-bold mb-2 text-[10px] tracking-[0.2em] uppercase border-b border-[var(--accent-teal)]/30 pb-1">
            DEBUG OVERLAY
          </div>
          <div className="space-y-1">
            <div className="flex justify-between"><span>FPS:</span><span className={fps < 30 ? 'text-red-400' : fps < 50 ? 'text-yellow-400' : 'text-green-400'}>{fps}</span></div>
            <div className="flex justify-between"><span>Zoom:</span><span>{zoom.toFixed(2)}x</span></div>
            <div className="flex justify-between"><span>ViewBox:</span><span>{Math.round(viewBox.x)},{Math.round(viewBox.y)}</span></div>
            <div className="flex justify-between"><span>VB Size:</span><span>{Math.round(viewBox.width)}x{Math.round(viewBox.height)}</span></div>
            <div className="flex justify-between"><span>Nodes:</span><span>{nodes.length}</span></div>
            <div className="flex justify-between"><span>Expanded:</span><span>{expandedNodes.size}</span></div>
            <div className="flex justify-between"><span>Max Z:</span><span>{maxZIndex}</span></div>
            <div className="flex justify-between"><span>Panning:</span><span>{isPanning ? 'YES' : 'no'}</span></div>
            <div className="flex justify-between"><span>Dragging:</span><span>{dragNodeId || 'none'}</span></div>
          </div>
          <div className="mt-2 pt-1 border-t border-[var(--accent-teal)]/30 text-[8px] text-[var(--accent-teal)]/50">
            Ctrl+D to toggle
          </div>
        </div>
      )}

      {/* ── Node details panel (bottom-left) ── */}
      {selectedNodeData && (
        <div
          className="absolute bottom-4 left-4 rounded-lg p-4 max-w-sm font-[family-name:var(--font-terminal)]"
          style={{
            background: "var(--surface-dark)",
            border: "1px solid rgba(128,128,128,0.4)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-full border-2"
                style={{
                  backgroundColor: getNodeFill(selectedNodeData.type, selectedNodeData.color),
                  borderColor: "#fff",
                }}
              />
              <h3 className="font-semibold" style={{ color: "var(--krma-gold)" }}>
                {selectedNodeData.name}
              </h3>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              &times;
            </button>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Type:</span>
              <span className="text-white font-medium capitalize">{selectedNodeData.type}</span>
            </div>
            {selectedNodeData.status && (
              <div className="flex justify-between">
                <span className="text-gray-400">Status:</span>
                <span style={{ color: "var(--accent-teal)" }}>{selectedNodeData.status}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-700 pt-2 mt-3">
              <span className="text-gray-400">Connections:</span>
              <span className="text-white font-bold">
                {connections.filter((c) => c.from === selectedNodeData.id || c.to === selectedNodeData.id).length}
              </span>
            </div>
          </div>

          {/* Connected nodes preview */}
          {(() => {
            const connectedIds = new Set<string>();
            connections.forEach((c) => {
              if (c.from === selectedNodeData.id) connectedIds.add(c.to);
              if (c.to === selectedNodeData.id) connectedIds.add(c.from);
            });
            const connectedNodes = nodes.filter((n) => connectedIds.has(n.id));
            if (connectedNodes.length === 0) return null;

            return (
              <div className="mt-3 pt-3 border-t border-gray-700">
                <div className="text-xs text-gray-400 mb-2">Connected to:</div>
                <div className="flex flex-wrap gap-1">
                  {connectedNodes.slice(0, 4).map((cn) => (
                    <div
                      key={cn.id}
                      className="px-2 py-1 rounded text-xs text-white"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: `1px solid ${getNodeFill(cn.type, cn.color)}`,
                      }}
                    >
                      {cn.name.length > 8 ? `${cn.name.substring(0, 8)}...` : cn.name}
                    </div>
                  ))}
                  {connectedNodes.length > 4 && (
                    <div className="px-2 py-1 rounded text-xs text-gray-400" style={{ background: "rgba(255,255,255,0.04)" }}>
                      +{connectedNodes.length - 4} more
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
