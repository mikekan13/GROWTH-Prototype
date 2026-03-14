"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import CharacterCard from "./CharacterCard";
import type { CharacterNodeData } from "./CharacterCard";
import InventoryCard from "./InventoryCard";
import type { GrowthCharacter } from "@/types/growth";
import type { HeldItemData } from "@/types/item";
import { addSkill, removeSkill, updateSkillLevel } from "@/lib/character-actions";
import VitalsCard from "./VitalsCard";
import TraitsCard from "./TraitsCard";
import SkillsCard from "./SkillsCard";
import type { SkillItem } from "./SkillsCard";
import MagicCard from "./MagicCard";
import BackstoryCard from "./BackstoryCard";
import HarvestCard from "./HarvestCard";
import LocationCard from "./LocationCard";
import type { LocationNodeData } from "./LocationCard";
import WorldItemCard from "./WorldItemCard";
import type { WorldItemNodeData } from "./WorldItemCard";
import type { GrowthLocation } from "@/types/location";
import type { GrowthWorldItem } from "@/types/item";
import type { CanvasFolder } from "@/types/canvas";
import { FolderGroupRect } from "./FolderGroup";
import FolderGroup from "./FolderGroup";

// ── Interfaces ──────────────────────────────────────────────────────────────

interface CanvasNode {
  id: string;
  type: "character" | "npc" | "location" | "quest" | "item";
  name: string;
  x: number;
  y: number;
  status?: string;
  color?: string;
  portrait?: string | null;
  characterData?: Record<string, unknown> | null;
  // Location/item-specific data
  locationType?: string;
  locationData?: GrowthLocation | null;
  itemType?: string;
  itemData?: GrowthWorldItem | null;
  holderId?: string | null;
  holderName?: string;
  locationName?: string;
}

interface CanvasConnection {
  from: string;
  to: string;
  type: "alliance" | "conflict" | "goal" | "resistance" | "opportunity";
  strength: number;
}

export interface LineCrossingEvent {
  nodeId: string;
  nodeType: string;
  nodeName: string;
  direction: 'crystallize' | 'dissolve';
  previousY: number;
}

export interface ForgeItemSummary {
  id: string;
  name: string;
  type: string;
  data: Record<string, unknown>;
}

interface RelationsCanvasProps {
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  campaignId: string;
  crystallizedEntityIds?: Set<string>;
  forgeItems?: ForgeItemSummary[];
  onNodeClick?: (node: CanvasNode) => void;
  onNodePositionChange?: (nodeId: string, x: number, y: number) => void;
  onCreateCharacter?: (name: string) => void;
  onDeleteCharacter?: (nodeId: string) => void;
  onCharacterUpdate?: (nodeId: string, character: GrowthCharacter, changes: string[]) => void;
  onCreateLocation?: (name: string, type: string) => void;
  onDeleteLocation?: (nodeId: string) => void;
  onLocationUpdate?: (nodeId: string, data: GrowthLocation) => void;
  onCreateItem?: (name: string, type: string) => void;
  onDeleteItem?: (nodeId: string) => void;
  onItemUpdate?: (nodeId: string, data: GrowthWorldItem) => void;
  onItemTransfer?: (itemId: string, holderId: string | null) => void;
  onCreateItemFromForge?: (name: string, type: string, data: Record<string, unknown>) => void;
  onEntityCrossLine?: (event: LineCrossingEvent, moveNode: (nodeId: string, y: number) => void) => void;
  folders?: CanvasFolder[];
  onFoldersChange?: (folders: CanvasFolder[]) => void;
  onRestComplete?: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function RelationsCanvas({
  nodes = [],
  connections = [],
  campaignId,
  crystallizedEntityIds,
  forgeItems,
  onNodeClick,
  onNodePositionChange,
  onCreateCharacter,
  onDeleteCharacter,
  onCharacterUpdate,
  onCreateLocation,
  onDeleteLocation,
  onLocationUpdate: _onLocationUpdate,
  onCreateItem,
  onDeleteItem,
  onItemUpdate,
  onItemTransfer,
  onCreateItemFromForge,
  onEntityCrossLine,
  folders = [],
  onFoldersChange,
  onRestComplete,
}: RelationsCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Zoom constants ──
  // zoom < 1 = zoomed IN (smaller viewBox), zoom > 1 = zoomed OUT (larger viewBox)
  const BASE_HEIGHT = 924;
  const MIN_ZOOM = 1.0;   // max zoom IN — 1x base magnification
  const MAX_ZOOM = 6.0;   // max zoom OUT
  const ZOOM_IN_FACTOR = 0.9;
  const ZOOM_OUT_FACTOR = 1.1;

  // Track container size so viewBox matches actual aspect ratio (prevents SVG letterboxing)
  const [containerSize, setContainerSize] = useState({ width: 1386, height: 924 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setContainerSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // BASE_WIDTH adapts to container aspect ratio so SVG fills it completely
  const BASE_WIDTH = Math.round(BASE_HEIGHT * (containerSize.width / containerSize.height));

  // Round zoom to 4 decimal places to prevent floating-point drift
  const clampZoom = (z: number) => Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)) * 1e4) / 1e4;

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
  // Camera stores only position + zoom; viewBox width/height are ALWAYS derived from zoom.
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredConnection, setHoveredConnection] = useState<string | null>(null);
  const [zoom, setZoom] = useState(() => {
    const stored = loadJSON('zoom', 1);
    return clampZoom(stored);
  });
  const [camera, setCamera] = useState(() => {
    // Migrate from old viewBox storage or load camera position
    const oldVB = loadJSON<{ x: number; y: number; width?: number; height?: number } | null>('viewBox', null);
    const cam = loadJSON<{ x: number; y: number } | null>('camera', null);
    if (cam) return cam;
    if (oldVB) {
      // Clean up old key after migration
      try { localStorage.removeItem(storageKey('viewBox')); } catch { /* ignore */ }
      return { x: oldVB.x, y: oldVB.y };
    }
    return { x: -BASE_WIDTH / 2, y: -BASE_HEIGHT / 2 };
  });
  // viewBox is derived — never set width/height independently
  const viewBox = {
    x: camera.x,
    y: camera.y,
    width: BASE_WIDTH * zoom,
    height: BASE_HEIGHT * zoom,
  };
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

  // Measured panel heights: tracks actual rendered height of each sub-panel via ResizeObserver
  const panelHeightsRef = useRef<Map<string, number>>(new Map());
  const panelObserversRef = useRef<Map<string, ResizeObserver>>(new Map());
  useEffect(() => {
    const observers = panelObserversRef.current;
    return () => { observers.forEach(o => o.disconnect()); observers.clear(); };
  }, []);

  // ── Item drag-and-drop state ──
  // Tracks which item node is actively being dragged (for character card drop-target highlighting)
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);

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
      saveJSON('camera', camera);
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
  }, [camera, zoom, nodePositions, nodeZIndices, expandedNodes, inventoryOpenNodes, inventoryOffsets, panelOpenNodes, panelOffsets]);

  useEffect(() => {
    persistState();
  }, [persistState]);

  // Measure circle positions from DOM once after expand/panel changes settle.
  // Stored as offsets from the card wrapper's top-left in SVG units (cardWidth × cardHeight),
  // so they don't change with zoom/pan/drag — just add cardLeft/cardTop at render time.
  useEffect(() => {
    const timer = setTimeout(() => {
      const svg = svgRef.current;
      if (!svg) return;
      const circles = svg.querySelectorAll('[data-panel-circle]') as NodeListOf<HTMLElement>;
      if (circles.length === 0) return;
      circles.forEach((el) => {
        const panelName = el.getAttribute('data-panel-circle');
        if (!panelName) return;
        // Find the card wrapper div (fixed dimensions, zoom-independent)
        const wrapper = el.closest('[data-card-wrapper]') as HTMLElement | null;
        if (!wrapper) return;
        const fo = wrapper.closest('foreignObject');
        if (!fo) return;
        const foW = parseFloat(fo.getAttribute('width') || '1');
        const foRect = fo.getBoundingClientRect();
        // SVG-units-per-screen-pixel ratio (same for both axes since foreignObject scales uniformly)
        const svgPerPx = foW / foRect.width;
        const wrapperRect = wrapper.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        // Circle center relative to card wrapper top-left, in screen pixels
        const relScreenX = (elRect.left + elRect.width / 2) - wrapperRect.left;
        const relScreenY = (elRect.top + elRect.height / 2) - wrapperRect.top;
        // Convert to SVG units
        const dx = relScreenX * svgPerPx;
        const dy = relScreenY * svgPerPx;
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
  const [debugMouse, setDebugMouse] = useState({ sx: 0, sy: 0, cx: 0, cy: 0 });

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

  // Mouse position tracking for debug overlay
  useEffect(() => {
    if (!showDebug) return;
    const onMove = (e: MouseEvent) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const fx = (e.clientX - rect.left) / rect.width;
      const fy = (e.clientY - rect.top) / rect.height;
      setDebugMouse({
        sx: e.clientX, sy: e.clientY,
        cx: Math.round(viewBox.x + fx * viewBox.width),
        cy: Math.round(viewBox.y + fy * viewBox.height),
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- viewBox is derived from camera+zoom; using those deps directly avoids infinite loops
  }, [showDebug, camera.x, camera.y, zoom]);

  // ── Node dragging state ──
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [dragStartSvg, setDragStartSvg] = useState<{ x: number; y: number } | null>(null);

  // ── Folder dragging state ──
  const [dragFolderId, setDragFolderId] = useState<string | null>(null);
  const [folderDragStartSvg, setFolderDragStartSvg] = useState<{ x: number; y: number } | null>(null);

  // Keep refs to avoid stale closures in mouse handlers
  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  const nodePositionsRef = useRef(nodePositions);
  nodePositionsRef.current = nodePositions;
  const expandedNodesRef = useRef(expandedNodes);
  expandedNodesRef.current = expandedNodes;

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

  // ── Guitar string pluck effect on KRMA line ──
  // The card physically pushes through the line like a finger on a guitar string.
  // When the card passes through or releases, the string bounces back naturally.
  const pluckRef = useRef<{ x: number; amplitude: number; radius: number; startTime: number } | null>(null);
  // Track each dragged node's last deflection so we can hand off smoothly to pluck
  const lastDeflectionRef = useRef<Map<string, { x: number; peakDeflection: number; radius: number }>>(new Map());

  // Get the card width for a given node (half-width used as contact radius)
  const getCardHalfWidth = useCallback((nodeId: string): number => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return 260;
    const isExp = expandedNodes.has(nodeId);
    switch (node.type) {
      case 'character': return isExp ? 960 : 260;
      case 'location':  return isExp ? 260 : 170;
      case 'item':      return isExp ? 220 : 150;
      default:          return 200;
    }
  }, [nodes, expandedNodes]);

  // Clamp drag offset Y for nodes inside party folders — bottom edge can't cross KRMA line (y=0)
  const clampPartyDragY = useCallback((nodeId: string, offsetY: number): number => {
    const partyFolder = foldersRef.current.find(f => f.type === 'party' && f.nodeIds.includes(nodeId));
    if (!partyFolder) return offsetY;
    const pos = nodePositionsRef.current.get(nodeId);
    if (!pos || pos.y >= 0) return offsetY; // only clamp nodes above line
    // bottomH: how far below center the card extends (120 compact, 480 expanded)
    const bottomH = expandedNodes.has(nodeId) ? 480 : 120;
    const PARTY_LINE_BUFFER = 50;
    // Card bottom edge after drag: pos.y + offsetY + bottomH  must stay ≤ -PARTY_LINE_BUFFER
    const maxOffsetY = -PARTY_LINE_BUFFER - bottomH - pos.y;
    return Math.min(offsetY, maxOffsetY);
  }, [expandedNodes]);

  // Clamp a panel Y so it stays on the same side of the KRMA line as its parent card.
  // For crystallized panels (above line), the BOTTOM edge (panelY + panelHeight) must not cross below the line.
  // For fluid panels (below line), the TOP edge (panelY) must not cross above the line.
  const LINE_BUFFER = 10;
  const clampPanelY = (panelY: number, cardCenterY: number, panelHeight = 0): number => {
    if (cardCenterY < 0) {
      // Crystallized: bottom edge must stay above line (Y=0)
      const maxTopY = -LINE_BUFFER - panelHeight;
      if (panelY > maxTopY) return maxTopY;
    }
    if (cardCenterY > 0 && panelY < LINE_BUFFER) return LINE_BUFFER;
    return panelY;
  };

  // Clamp an offset so the resulting panel position respects the KRMA line
  const clampOffsetY = (offsetY: number, anchorY: number, cardCenterY: number, panelHeight = 0): number => {
    const panelY = anchorY + offsetY;
    if (cardCenterY < 0) {
      const maxTopY = -LINE_BUFFER - panelHeight;
      if (panelY > maxTopY) return maxTopY - anchorY;
    }
    if (cardCenterY > 0 && panelY < LINE_BUFFER) return LINE_BUFFER - anchorY;
    return offsetY;
  };

  // Measure panel height via ResizeObserver — returns a ref callback for the panel wrapper div
  const measurePanelRef = useCallback((panelKey: string) => {
    return (el: HTMLDivElement | null) => {
      const observers = panelObserversRef.current;
      // Clean up old observer for this key
      const existing = observers.get(panelKey);
      if (existing) { existing.disconnect(); observers.delete(panelKey); }
      if (!el) { panelHeightsRef.current.delete(panelKey); return; }
      // Measure immediately
      panelHeightsRef.current.set(panelKey, el.offsetHeight);
      // Watch for resize
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          panelHeightsRef.current.set(panelKey, (entry.target as HTMLElement).offsetHeight);
        }
      });
      ro.observe(el);
      observers.set(panelKey, ro);
    };
  }, []);

  // Compute line deflection — card pushes through like a finger on a string
  const getLineDeflection = useCallback((segmentX: number, time: number): number => {
    // Helper: compute the shape factor for a given X distance from card center
    const shapeAt = (dx: number, radius: number) => {
      if (Math.abs(dx) < radius) {
        const t = Math.abs(dx) / radius;
        return 0.5 * (1 + Math.cos(Math.PI * t));
      } else {
        const overshoot = Math.abs(dx) - radius;
        return Math.exp(-overshoot / 200) * 0.3;
      }
    };

    // Collect nodeIds that should NOT deflect the KRMA line:
    // - nodes in collapsed folders (hidden)
    // - nodes in party folders (permanently above line)
    const excludedNodeIds = new Set<string>();
    for (const f of folders) {
      if (f.collapsed || f.type === 'party') {
        for (const nid of f.nodeIds) excludedNodeIds.add(nid);
      }
    }

    // 1) Active drag: line wraps around the card
    let dragDeflection = 0;
    for (const [nodeId, offset] of dragOffsets) {
      if (excludedNodeIds.has(nodeId)) continue; // skip hidden nodes
      const basePos = nodePositions.get(nodeId);
      if (!basePos) continue;
      const cardX = basePos.x + offset.x;
      const cardY = basePos.y + offset.y;
      const distFromLine = Math.abs(cardY);
      if (distFromLine > 400) continue;

      const radius = getCardHalfWidth(nodeId);
      const dx = segmentX - cardX;
      dragDeflection += cardY * shapeAt(dx, radius);

      // Track peak deflection for smooth handoff to pluck
      const prev = lastDeflectionRef.current.get(nodeId);
      const absDef = Math.abs(cardY);
      if (!prev || absDef > Math.abs(prev.peakDeflection)) {
        lastDeflectionRef.current.set(nodeId, { x: cardX, peakDeflection: cardY, radius });
      } else {
        lastDeflectionRef.current.set(nodeId, { ...prev, x: cardX, radius });
      }
    }

    // 2) Pluck vibration (smooth bounce-back after release or pass-through)
    let pluckDeflection = 0;
    if (pluckRef.current) {
      const elapsed = time - pluckRef.current.startTime;
      const decay = Math.exp(-elapsed * 1.8);
      if (decay < 0.005) {
        pluckRef.current = null;
      } else {
        const dx = segmentX - pluckRef.current.x;
        const shape = shapeAt(dx, pluckRef.current.radius);
        pluckDeflection = pluckRef.current.amplitude * decay
          * Math.cos(elapsed * 18) * shape;
      }
    }

    return dragDeflection + pluckDeflection;
  }, [dragOffsets, nodePositions, getCardHalfWidth, folders]);

  // Detect when a card leaves the line's zone (passes through or releases) → trigger pluck
  const prevNearLineRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Which nodes are currently deflecting the line?
    const excludedNodeIds = new Set<string>();
    for (const f of folders) {
      if (f.collapsed) {
        for (const nid of f.nodeIds) excludedNodeIds.add(nid);
      }
    }
    const currentNear = new Set<string>();
    for (const [nodeId, offset] of dragOffsets) {
      if (excludedNodeIds.has(nodeId)) continue;
      const basePos = nodePositions.get(nodeId);
      if (!basePos) continue;
      const cardY = basePos.y + offset.y;
      if (Math.abs(cardY) <= 400) {
        currentNear.add(nodeId);
      }
    }

    // Check for nodes that just left the deflection zone (passed through or released)
    for (const nodeId of prevNearLineRef.current) {
      if (!currentNear.has(nodeId)) {
        // Node left the zone — hand off its deflection to pluck vibration
        const info = lastDeflectionRef.current.get(nodeId);
        if (info && Math.abs(info.peakDeflection) > 5) {
          pluckRef.current = {
            x: info.x,
            amplitude: info.peakDeflection,
            radius: info.radius,
            startTime: animationTime,
          };
        }
        lastDeflectionRef.current.delete(nodeId);
      }
    }

    prevNearLineRef.current = currentNear;
  }, [dragOffsets, nodePositions, animationTime]);

  // ── Line crossing + shimmer state ──
  const [shimmeringNodes, setShimmeringNodes] = useState<Set<string>>(new Set());

  /** Imperatively move a node to a new Y position */
  const moveNodeY = useCallback((nodeId: string, y: number) => {
    setNodePositions(prev => {
      const next = new Map(prev);
      const pos = next.get(nodeId);
      next.set(nodeId, { x: pos?.x ?? 0, y });
      return next;
    });
  }, []);

  // ── Drag-end line-crossing detection (runs AFTER React paints) ──
  // Track which nodes are currently being dragged and their Y when drag started
  const prevDraggingRef = useRef<Set<string>>(new Set());
  const dragStartYRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const currentDragging = new Set(dragOffsets.keys());

    // Detect drag starts — record starting Y position
    for (const nodeId of currentDragging) {
      if (!prevDraggingRef.current.has(nodeId) && !dragStartYRef.current.has(nodeId)) {
        const pos = nodePositions.get(nodeId);
        if (pos) {
          dragStartYRef.current.set(nodeId, pos.y);
        }
      }
    }

    // Detect drag ends — check for line crossing
    for (const nodeId of prevDraggingRef.current) {
      if (!currentDragging.has(nodeId)) {
        const startY = dragStartYRef.current.get(nodeId);
        const pos = nodePositions.get(nodeId);
        dragStartYRef.current.delete(nodeId);

        if (startY === undefined || !pos || !onEntityCrossLine) continue;

        // Nodes in party folders can never cross the KRMA line
        const inPartyFolder = folders.some(f => f.type === 'party' && f.nodeIds.includes(nodeId));
        if (inPartyFolder) continue;

        // Use the card's EDGE for line crossing, not the center.
        // The leading edge depends on drag direction:
        //   dragging UP (crystallize) → bottom edge = pos.y + halfH
        //   dragging DOWN (dissolve)  → top edge    = pos.y - halfH
        const node_ = nodes.find(n => n.id === nodeId);
        const isExp = expandedNodes.has(nodeId);
        const halfH = node_?.type === 'character' ? (isExp ? 250 : 120)
                    : node_?.type === 'location'  ? (isExp ? 350 : 90)
                    : node_?.type === 'item'      ? (isExp ? 300 : 80)
                    : 100;
        const bottomEdge = pos.y + halfH;
        const topEdge = pos.y - halfH;

        const crossed =
          (startY > 0 && topEdge <= 0) ? 'crystallize' as const :
          (startY <= 0 && bottomEdge > 0) ? 'dissolve' as const : null;

        if (!crossed) continue;

        // Only trigger valid state transitions:
        // - "crystallize" only if entity is NOT already crystallized
        // - "dissolve" only if entity IS currently crystallized
        const isCrystallized = crystallizedEntityIds?.has(nodeId) ?? false;
        if (crossed === 'crystallize' && isCrystallized) continue;
        if (crossed === 'dissolve' && !isCrystallized) continue;

        const node = nodes.find(n => n.id === nodeId);
        if (!node) continue;

        // Fire shimmer
        setShimmeringNodes(prev => { const n = new Set(prev); n.add(nodeId); return n; });
        setTimeout(() => {
          setShimmeringNodes(prev => { const n = new Set(prev); n.delete(nodeId); return n; });
        }, 1200);

        onEntityCrossLine(
          { nodeId, nodeType: node.type, nodeName: node.name, direction: crossed, previousY: startY },
          moveNodeY,
        );
      }
    }

    prevDraggingRef.current = currentDragging;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: viewBox deps would cause infinite loops
  }, [dragOffsets, nodePositions, nodes, onEntityCrossLine, moveNodeY, crystallizedEntityIds]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- viewBox derived from camera+zoom
    [camera, zoom]
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
      case "item":      return "\u{2694}";
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
      case "item":      return "var(--krma-gold)";
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
        setPanStart({ x: e.clientX, y: e.clientY, viewBoxX: camera.x, viewBoxY: camera.y });
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [camera.x, camera.y]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      // ── Folder drag (moves all member nodes together) ──
      if (dragFolderId && folderDragStartSvg) {
        const current = clientToSvg(e.clientX, e.clientY);
        const dx = current.x - folderDragStartSvg.x;
        let dy = current.y - folderDragStartSvg.y;
        const folder = folders.find(f => f.id === dragFolderId);
        if (folder) {
          // Find the folder's current bottom edge (lowest node bottom + padding)
          // and clamp dy so the folder bottom never crosses y=0
          const curPositions = nodePositionsRef.current;
          const FOLDER_PADDING = 30;
          const LINE_GAP = 20; // gap between folder bottom and KRMA line

          if (folder.type === 'party') {
            const curExpanded = expandedNodesRef.current;
            const HEADER_HEIGHT = 64;
            let minY = Infinity, maxBottom = -Infinity;
            for (const nodeId of folder.nodeIds) {
              const pos = curPositions.get(nodeId);
              if (!pos) continue;
              const isExp = curExpanded.has(nodeId);
              const topH = isExp ? 250 : 120;
              const bottomH = isExp ? 480 : 120;
              minY = Math.min(minY, pos.y - topH);
              maxBottom = Math.max(maxBottom, pos.y + bottomH);
            }
            if (maxBottom > -Infinity) {
              const contentTop = minY - FOLDER_PADDING - HEADER_HEIGHT;
              let folderVisualBottom: number;
              if (folder.collapsed) {
                // Collapsed: just the header bar
                folderVisualBottom = contentTop + HEADER_HEIGHT;
              } else {
                const contentMinH = (maxBottom - minY) + FOLDER_PADDING * 2 + HEADER_HEIGHT;
                const displayH = Math.max(contentMinH, folder.userHeight || 0);
                folderVisualBottom = contentTop + displayH;
              }
              const maxDy = -LINE_GAP - folderVisualBottom;
              if (dy > maxDy) dy = maxDy;
            }
          } else {
            // Non-party folders: prevent crossing in either direction
            for (const nodeId of folder.nodeIds) {
              const pos = curPositions.get(nodeId);
              if (!pos) continue;
              const isExp = expandedNodes.has(nodeId);
              const bottomH = isExp ? 480 : 120;
              const topH = isExp ? 250 : 120;
              if (pos.y < 0) {
                const maxDy = -(pos.y + bottomH + FOLDER_PADDING + LINE_GAP);
                if (dy > maxDy) dy = maxDy;
              }
              if (pos.y > 0) {
                const minDy = -(pos.y - topH - FOLDER_PADDING - LINE_GAP);
                if (dy < minDy) dy = minDy;
              }
            }
          }
          setDragOffsets((prev) => {
            const next = new Map(prev);
            for (const nodeId of folder.nodeIds) {
              next.set(nodeId, { x: dx, y: dy });
            }
            return next;
          });
        }
        return;
      }

      // ── Node drag ──
      if (dragNodeId && dragStartSvg) {
        const current = clientToSvg(e.clientX, e.clientY);
        const dx = current.x - dragStartSvg.x;
        let dy = current.y - dragStartSvg.y;

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
          setCamera({ x: newX, y: newY });
          panRafRef.current = 0;
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- viewBox derived from camera+zoom
    [isPanning, isDragging, panStart, camera, zoom, dragNodeId, dragStartSvg, dragFolderId, folderDragStartSvg, folders, clientToSvg]
  );

  const handleMouseUp = useCallback(() => {
    // ── Finish folder drag (moves all member nodes) ──
    if (dragFolderId) {
      const folder = folders.find(f => f.id === dragFolderId);
      if (folder) {
        setNodePositions((prev) => {
          const next = new Map(prev);
          for (const nodeId of folder.nodeIds) {
            const offset = dragOffsets.get(nodeId);
            const basePos = prev.get(nodeId);
            if (offset && basePos) {
              let newY = basePos.y + offset.y;
              // Party folders: enforce above KRMA line (y < 0 in SVG)
              if (folder.type === 'party' && newY > -130) {
                newY = -130;
              }
              next.set(nodeId, { x: basePos.x + offset.x, y: newY });
              onNodePositionChange?.(nodeId, basePos.x + offset.x, newY);
            }
          }
          return next;
        });
        setDragOffsets((prev) => {
          const next = new Map(prev);
          for (const nodeId of folder.nodeIds) {
            next.delete(nodeId);
          }
          return next;
        });
      }
      setDragFolderId(null);
      setFolderDragStartSvg(null);
      return;
    }

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
  }, [dragFolderId, folders, dragNodeId, dragOffsets, nodePositions, onNodePositionChange]);

  // Global mouse listeners for pan / drag
  useEffect(() => {
    const needListeners = (isPanning && isDragging) || dragNodeId !== null || dragFolderId !== null;
    if (needListeners) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isPanning, isDragging, dragNodeId, dragFolderId, handleMouseMove, handleMouseUp]);

  // ── Zoom handler ──────────────────────────────────────────────────────────

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.cancelable) e.preventDefault();
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      // Mouse position in SVG coordinates
      const svgX = viewBox.x + (mouseX / rect.width) * viewBox.width;
      const svgY = viewBox.y + (mouseY / rect.height) * viewBox.height;

      const zoomFactor = e.deltaY > 0 ? ZOOM_OUT_FACTOR : ZOOM_IN_FACTOR;
      const newZoom = clampZoom(zoom * zoomFactor);

      if (newZoom !== zoom) {
        // Derive width/height from base dimensions — no chained multiplication
        const newWidth = BASE_WIDTH * newZoom;
        const newHeight = BASE_HEIGHT * newZoom;
        setZoom(newZoom);
        // Keep mouse position fixed: svgX must stay at same screen fraction
        setCamera({
          x: svgX - (mouseX / rect.width) * newWidth,
          y: svgY - (mouseY / rect.height) * newHeight,
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- viewBox derived from camera+zoom
    [camera, zoom]
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
            setCamera({ x: node.x - BASE_WIDTH / 2, y: node.y - BASE_HEIGHT / 2 });
            setZoom(1);
          }
        } else {
          setCamera({ x: -BASE_WIDTH / 2, y: -BASE_HEIGHT / 2 });
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

    // Build held items for this character from item nodes with holderId matching this character
    const heldItems: HeldItemData[] = nodes
      .filter(n => n.type === 'item' && n.holderId === node.id && n.itemData)
      .map(n => ({
        id: n.id,
        name: n.name,
        type: (n.itemType || 'misc') as HeldItemData['type'],
        status: n.status || 'ACTIVE',
        data: n.itemData!,
      }));
    // Get carry level from character data (vitals.carryLevel = Clout attribute)
    const charData = node.characterData as Record<string, unknown> | null;
    const vitals = charData?.vitals as Record<string, unknown> | null;
    const carryLevel = (vitals?.carryLevel as number) ?? 1;
    // Check if an item is being dragged near this character (for drop-target highlighting)
    const isDropTarget = draggingItemId != null && (() => {
      const dragOffset = dragOffsets.get(draggingItemId);
      if (!dragOffset) return false;
      const itemNode = nodes.find(n => n.id === draggingItemId);
      if (!itemNode) return false;
      const itemPos = getNodePosition(itemNode.id, itemNode.x, itemNode.y);
      const itemVisX = itemPos.x + dragOffset.x;
      const itemVisY = itemPos.y + dragOffset.y;
      // Check if item is within character card bounds (generous hitbox)
      const dx = Math.abs(itemVisX - visualX);
      const dy = Math.abs(itemVisY - visualY);
      return dx < cardWidth / 2 + 100 && dy < cardHeight / 2 + 100;
    })();
    const isShimmering = shimmeringNodes.has(node.id);
    // Direction-aware backlight: Red = going up (crystallizing), Blue = going down (dissolving)
    const preDragY = isDraggingNode ? nodePositions.get(node.id)?.y : undefined;
    const hasCrossed = preDragY !== undefined && ((preDragY > 0 && visualY <= 0) || (preDragY <= 0 && visualY > 0));
    const glowColor = hasCrossed ? (visualY <= 0 ? '#E84040' : '#4080E8') : '#7050A8';
    const showGlow = hasCrossed || isShimmering;
    const glowPulse = 0.4 + Math.sin(animationTime * 3) * 0.25;

    return (
      <g key={`card-group-${node.id}`}>
        {/* Soft pulsing backlight glow when card has crossed the KRMA line */}
        {showGlow && (
          <rect
            x={visualX - cardWidth / 2 - 30}
            y={visualY - cardHeight / 2 - 30}
            width={cardWidth + 60}
            height={cardHeight + 60}
            rx={20}
            fill={glowColor}
            stroke="none"
            filter="url(#cardBacklight)"
            opacity={glowPulse}
          />
        )}

        {/* ── Tether lines + panel-end dots (BEFORE card = behind it) ── */}
        {isInventoryOpen && (() => {
          const cardLeft = visualX - cardWidth / 2;
          const cardTop = visualY - cardHeight / 2;
          const cached = circleOffsetsRef.current.get('inventory');
          const rawAnchorX = cached ? (cardLeft + cached.dx) : (cardLeft + 436 + 88);
          const rawAnchorY = cached ? (cardTop + cached.dy) : (cardTop + 515 + 13);
          const { x: anchorX, y: anchorY } = scaleAnchor(rawAnchorX, rawAnchorY);
          const offset = inventoryOffsets.get(node.id) || { x: 0, y: 20 };
          const invPanelH = panelHeightsRef.current.get(`_inv_${node.id}`) || 0;
          const tetherEndX = anchorX + offset.x;
          const tetherEndY = clampPanelY(anchorY + offset.y + 20, visualY, invPanelH);
          return (
            <>
              <line x1={anchorX} y1={anchorY} x2={tetherEndX} y2={tetherEndY} stroke="#ffcc78" strokeWidth={4} strokeDasharray="8 5" opacity={0.6} />
              <circle cx={tetherEndX} cy={tetherEndY} r={5} fill="#ffcc78" opacity={0.8} />
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
          const subPanelH = panelHeightsRef.current.get(offsetKey) || 0;
          const tetherEndX = anchorX + offset.x;
          const tetherEndY = clampPanelY(anchorY + offset.y + 20, visualY, subPanelH);
          return (
            <React.Fragment key={`tether-${node.id}-${panelKey}`}>
              <line x1={anchorX} y1={anchorY} x2={tetherEndX} y2={tetherEndY} stroke="#ffcc78" strokeWidth={4} strokeDasharray="8 5" opacity={0.6} />
              <circle cx={tetherEndX} cy={tetherEndY} r={5} fill="#ffcc78" opacity={0.8} />
            </React.Fragment>
          );
        })}

        <foreignObject
          key={`card-${node.id}`}
          x={visualX - cardWidth / 2 - viewBox.width}
          y={visualY - cardHeight / 2 - viewBox.height}
          width={cardWidth + viewBox.width * 2}
          height={cardHeight + viewBox.height * 2}
          style={{ overflow: "visible", pointerEvents: "none" }}
        >
          <div style={{ padding: `${viewBox.height}px ${viewBox.width}px`, pointerEvents: "none" }}>
          <div data-card-wrapper style={{ pointerEvents: "auto" }}>
          <CharacterCard
            node={charNode}
            isExpanded={isNodeExpanded}
            showInventory={isInventoryOpen}
            isDropTarget={isDropTarget}
            openPanels={nodePanels}
            onToggleExpand={toggleExpand}
            onDelete={onDeleteCharacter}
            onInventoryToggle={toggleInventory}
            onPanelToggle={togglePanel}
            onPositionChange={(nodeId, x, y) => {
              // Clamp party folder nodes above KRMA line
              let clampedY = y;
              const inParty = foldersRef.current.find(f => f.type === 'party' && f.nodeIds.includes(nodeId));
              if (inParty && y >= 0) {
                const bottomH = expandedNodes.has(nodeId) ? 480 : 120;
                clampedY = -(bottomH + 50);
              }
              setNodePositions((prev) => {
                const next = new Map(prev);
                next.set(nodeId, { x, y: clampedY });
                return next;
              });
              onNodePositionChange?.(nodeId, x, clampedY);
              bringNodeToFront(nodeId);
            }}
            onDragOffsetChange={(nodeId, offsetX, offsetY) => {
              const clampedY = clampPartyDragY(nodeId, offsetY);
              setDragOffsets((prev) => {
                const next = new Map(prev);
                if (offsetX === 0 && clampedY === 0) {
                  next.delete(nodeId);
                } else {
                  next.set(nodeId, { x: offsetX, y: clampedY });
                }
                return next;
              });
            }}
            onCharacterUpdate={onCharacterUpdate}
          />
          </div>
          </div>
        </foreignObject>

        {/* ── Tether anchor dots (AFTER card = on top, fills in the button like a selection indicator) ── */}
        {isInventoryOpen && (() => {
          const cardLeft = visualX - cardWidth / 2;
          const cardTop = visualY - cardHeight / 2;
          const cached = circleOffsetsRef.current.get('inventory');
          const rawAnchorX = cached ? (cardLeft + cached.dx) : (cardLeft + 436 + 88);
          const rawAnchorY = cached ? (cardTop + cached.dy) : (cardTop + 515 + 13);
          const { x: anchorX, y: anchorY } = scaleAnchor(rawAnchorX, rawAnchorY);
          return (
            <g key="anchor-radio-inv" style={{ pointerEvents: 'none' }}>
              <circle cx={anchorX} cy={anchorY} r={7} fill="none" stroke="#ffcc78" strokeWidth={1.5} opacity={0.8} />
              <circle cx={anchorX} cy={anchorY} r={3.5} fill="#ffcc78" opacity={0.9} />
            </g>
          );
        })()}
        {isNodeExpanded && [...nodePanels].map((panelKey) => {
          const cardLeft = visualX - cardWidth / 2;
          const cardTop = visualY - cardHeight / 2;
          const cached = circleOffsetsRef.current.get(panelKey);
          const rawAnchorX = cached ? (cardLeft + cached.dx) : (cardLeft + 436 + 200);
          const rawAnchorY = cached ? (cardTop + cached.dy) : (cardTop + 515 + 13);
          const { x: anchorX, y: anchorY } = scaleAnchor(rawAnchorX, rawAnchorY);
          return (
            <g key={`anchor-radio-${node.id}-${panelKey}`} style={{ pointerEvents: 'none' }}>
              <circle cx={anchorX} cy={anchorY} r={7} fill="none" stroke="#ffcc78" strokeWidth={1.5} opacity={0.8} />
              <circle cx={anchorX} cy={anchorY} r={3.5} fill="#ffcc78" opacity={0.9} />
            </g>
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
            const invHeightKey = `_inv_${node.id}`;
            const invPanelH = panelHeightsRef.current.get(invHeightKey) || 0;
            const panelCenterX = anchorX + invOffset.x;
            const panelTopY = clampPanelY(anchorY + invOffset.y, visualY, invPanelH);
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
                  ref={measurePanelRef(invHeightKey)}
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
                    const h = panelHeightsRef.current.get(invHeightKey) || 0;
                    // Use clamped offset as start so drag begins from visual position
                    const startOffset = { x: invOffset.x, y: clampOffsetY(invOffset.y, anchorY, visualY, h) };

                    const onMove = (me: MouseEvent) => {
                      const cur = screenToSVG(me.clientX, me.clientY);

                      let dx = startOffset.x + (cur.x - startSVG.x);
                      let dy = startOffset.y + (cur.y - startSVG.y);

                      // Clamp offset so panel position stays on the right side of the line
                      dy = clampOffsetY(dy, anchorY, visualY, h);

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
                    characterId={node.id}
                    characterName={node.name}
                    carryLevel={carryLevel}
                    items={heldItems}
                    isDropTarget={isDropTarget}
                    isGM={true}
                    onRemoveItem={(itemId) => onItemTransfer?.(itemId, null)}
                    onToggleEquip={(itemId, equipped) => {
                      const itemNode = nodes.find(n => n.id === itemId);
                      if (itemNode?.itemData) {
                        onItemUpdate?.(itemId, { ...itemNode.itemData, equipped });
                      }
                    }}
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
          const subPanelH = panelHeightsRef.current.get(offsetKey) || 0;
          const panelCenterX = anchorX + offset.x;
          const panelTopY = clampPanelY(anchorY + offset.y, visualY, subPanelH);
          const panelW = 440;

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
                    const skillData = ((charData.skills as SkillItem[]) || []).find(s => s.name === skillName);
                    window.dispatchEvent(new CustomEvent('growth:roll-skill', {
                      detail: {
                        skillName,
                        characterName: node.name,
                        nodeId: node.id,
                        governors: skillData?.governors || [],
                      },
                    }));
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
                  ref={measurePanelRef(offsetKey)}
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
                    const h = panelHeightsRef.current.get(offsetKey) || 0;
                    // Use clamped offset as start so drag begins from visual position
                    const startOffset = { x: offset.x, y: clampOffsetY(offset.y, anchorY, visualY, h) };

                    const onMove = (me: MouseEvent) => {
                      const cur = screenToSVG(me.clientX, me.clientY);

                      let dx = startOffset.x + (cur.x - startSVG.x);
                      let dy = startOffset.y + (cur.y - startSVG.y);

                      // Clamp offset so panel position stays on the right side of the line
                      dy = clampOffsetY(dy, anchorY, visualY, h);

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
      className="relative w-full h-full overflow-hidden select-none"
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

          {/* Crystallization shimmer */}
          <filter id="crystallizeShimmer" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="0.5 0 0.5 0 0.2  0 0.2 0.5 0 0  0.5 0 1 0 0.3  0 0 0 0.8 0" result="purple" />
            <feGaussianBlur in="purple" stdDeviation="12" result="outerGlow" />
            <feMerge>
              <feMergeNode in="outerGlow" />
              <feMergeNode in="purple" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Soft backlight glow for drag direction */}
          <filter id="cardBacklight" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="18" />
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
              const deflection = getLineDeflection(x, animationTime);
              segments.push(`${x},${waveOffset + deflection}`);
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

        {/* Creation Toolbox moved to HTML overlay (always visible in viewport) */}

        {/* ── Connections (behind nodes) ── */}
        {connections.map((c) => renderConnection(c))}

        {/* ── Folder backgrounds (behind cards) ── */}
        {folders.map(folder => {
          const nodeTypes = new Map(nodes.map(n => [n.id, n.type]));
          const folderChars = nodes
            .filter(n => folder.nodeIds.includes(n.id) && n.type === 'character' && n.characterData)
            .map(n => ({
              id: n.id,
              name: n.name,
              data: n.characterData as unknown as GrowthCharacter,
            }));
          return (
            <FolderGroupRect
              key={`folder-bg-${folder.id}`}
              folder={folder}
              nodePositions={nodePositions}
              dragOffsets={dragOffsets}
              nodeTypes={nodeTypes}
              expandedNodes={expandedNodes}
              characters={folderChars}
              svgRef={svgRef}
              viewBox={viewBox}
              showActionsMenu={false}
              onFolderResize={(folderId, width, height) => {
                const updated = folders.map(f =>
                  f.id === folderId ? { ...f, userWidth: width, userHeight: height } : f
                );
                onFoldersChange?.(updated);
              }}
              onFolderDragStart={(folderId, startSvg) => {
                setDragFolderId(folderId);
                setFolderDragStartSvg(startSvg);
              }}
              onActionsToggle={(folderId) => {
                window.dispatchEvent(new CustomEvent('folder-actions-toggle', { detail: { folderId } }));
              }}
              onToggleCollapsed={(folderId) => {
                const f = folders.find(ff => ff.id === folderId);
                // When expanding a party folder, push nodes up if expanded size would cross KRMA line
                if (f && f.type === 'party' && f.collapsed) {
                  const FOLDER_PADDING = 30;
                  const HEADER_HEIGHT = 64;
                  const LINE_GAP = 20;
                  let minY = Infinity, maxBottom = -Infinity;
                  for (const nodeId of f.nodeIds) {
                    const pos = nodePositions.get(nodeId);
                    if (!pos) continue;
                    const isExp = expandedNodes.has(nodeId);
                    minY = Math.min(minY, pos.y - (isExp ? 250 : 120));
                    maxBottom = Math.max(maxBottom, pos.y + (isExp ? 480 : 120));
                  }
                  if (maxBottom > -Infinity) {
                    const contentTop = minY - FOLDER_PADDING - HEADER_HEIGHT;
                    const contentMinH = (maxBottom - minY) + FOLDER_PADDING * 2 + HEADER_HEIGHT;
                    const displayH = Math.max(contentMinH, f.userHeight || 0);
                    const folderBottom = contentTop + displayH;
                    if (folderBottom > -LINE_GAP) {
                      const pushUp = folderBottom + LINE_GAP;
                      setNodePositions(prev => {
                        const next = new Map(prev);
                        for (const nodeId of f.nodeIds) {
                          const pos = prev.get(nodeId);
                          if (pos) next.set(nodeId, { x: pos.x, y: pos.y - pushUp });
                        }
                        return next;
                      });
                    }
                  }
                }
                const updated = folders.map(ff =>
                  ff.id === folderId ? { ...ff, collapsed: !ff.collapsed } : ff
                );
                onFoldersChange?.(updated);
              }}
            />
          );
        })}

        {/* ── Character nodes (foreignObject cards) — sorted by z-index ── */}
        {/* Hide nodes inside collapsed folders */}
        {nodes
          .filter((n) => n.type === "character")
          .filter((n) => !folders.some(f => f.collapsed && f.nodeIds.includes(n.id)))
          .sort((a, b) => (nodeZIndices.get(a.id) || 0) - (nodeZIndices.get(b.id) || 0))
          .map((node) => {
            const position = getNodePosition(node.id, node.x, node.y);
            const isSelected = selectedNode === node.id;
            const isNodeExpanded = expandedNodes.has(node.id);
            const cardWidth = isNodeExpanded ? 1920 : 520;
            const cardHeight = isNodeExpanded ? 500 : 240;

            // Viewport culling
            // Margin scales with viewport so culling works at all zoom levels
            const cullMarginX = viewBox.width * 0.5 + cardWidth;
            const cullMarginY = viewBox.height * 0.5 + cardHeight;
            const isInViewport =
              position.x + cullMarginX > viewBox.x &&
              position.x - cullMarginX < viewBox.x + viewBox.width &&
              position.y + cullMarginY > viewBox.y &&
              position.y - cullMarginY < viewBox.y + viewBox.height;

            if (!isSelected && !isInViewport) return null;

            const offset = dragOffsets.get(node.id) || { x: 0, y: 0 };
            const visualX = position.x + offset.x;
            const visualY = position.y + offset.y;

            return renderCharacterCard(node, visualX, visualY);
          })}

        {/* ── Location nodes (foreignObject cards) — sorted by z-index ── */}
        {nodes
          .filter((n) => n.type === "location" && n.locationData)
          .filter((n) => !folders.some(f => f.collapsed && f.nodeIds.includes(n.id)))
          .sort((a, b) => (nodeZIndices.get(a.id) || 0) - (nodeZIndices.get(b.id) || 0))
          .map((node) => {
            const position = getNodePosition(node.id, node.x, node.y);
            const isNodeExpanded = expandedNodes.has(node.id);
            const isDraggingNode = dragOffsets.has(node.id);
            const cardWidth = isNodeExpanded ? 500 : 340;
            const cardHeight = isNodeExpanded ? 700 : 180;

            // Margin scales with viewport so culling works at all zoom levels
            const cullMarginX = viewBox.width * 0.5 + cardWidth;
            const cullMarginY = viewBox.height * 0.5 + cardHeight;
            const isInViewport =
              position.x + cullMarginX > viewBox.x &&
              position.x - cullMarginX < viewBox.x + viewBox.width &&
              position.y + cullMarginY > viewBox.y &&
              position.y - cullMarginY < viewBox.y + viewBox.height;

            if (!isInViewport) return null;

            const offset = dragOffsets.get(node.id) || { x: 0, y: 0 };
            const visualX = position.x + offset.x;
            const visualY = position.y + offset.y;
            const isShimmering = shimmeringNodes.has(node.id);
            const locPreDragY = isDraggingNode ? nodePositions.get(node.id)?.y : undefined;
            const locHasCrossed = locPreDragY !== undefined && ((locPreDragY > 0 && visualY <= 0) || (locPreDragY <= 0 && visualY > 0));
            const locGlowColor = locHasCrossed ? (visualY <= 0 ? '#E84040' : '#4080E8') : '#7050A8';
            const locShowGlow = locHasCrossed || isShimmering;
            const locGlowPulse = 0.4 + Math.sin(animationTime * 3) * 0.25;

            return (
              <g key={`loc-group-${node.id}`}>
              {locShowGlow && (
                <rect
                  x={visualX - cardWidth / 2 - 25}
                  y={visualY - cardHeight / 2 - 25}
                  width={cardWidth + 50}
                  height={cardHeight + 50}
                  rx={16}
                  fill={locGlowColor}
                  stroke="none"
                  filter="url(#cardBacklight)"
                  opacity={locGlowPulse}
                />
              )}
              <foreignObject
                key={`loc-${node.id}`}
                x={visualX - cardWidth / 2 - viewBox.width}
                y={visualY - cardHeight / 2 - viewBox.height}
                width={cardWidth + viewBox.width * 2}
                height={cardHeight + viewBox.height * 2}
                style={{ overflow: "visible", pointerEvents: "none" }}
              >
                <div style={{ padding: `${viewBox.height}px ${viewBox.width}px`, pointerEvents: "none" }}>
                <div style={{ pointerEvents: "auto", transform: isDraggingNode ? 'scale(1.05)' : 'scale(1)', transformOrigin: 'center center', transition: isDraggingNode ? 'none' : 'transform 0.15s ease-out' }}>
                  <LocationCard
                    node={{
                      id: node.id,
                      name: node.name,
                      type: (node.locationType || 'point_of_interest') as LocationNodeData['type'],
                      status: node.status || 'ACTIVE',
                      data: node.locationData!,
                      x: visualX,
                      y: visualY,
                    }}
                    isExpanded={isNodeExpanded}
                    onToggleExpand={toggleExpand}
                    onDelete={onDeleteLocation}
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
                      const clampedY = clampPartyDragY(nodeId, offsetY);
                      setDragOffsets((prev) => {
                        const next = new Map(prev);
                        if (offsetX === 0 && clampedY === 0) {
                          next.delete(nodeId);
                        } else {
                          next.set(nodeId, { x: offsetX, y: clampedY });
                        }
                        return next;
                      });
                    }}
                  />
                </div>
                </div>
              </foreignObject>
              </g>
            );
          })}

        {/* ── Item nodes (foreignObject cards) — only unassigned items, sorted by z-index ── */}
        {nodes
          .filter((n) => n.type === "item" && n.itemData && !n.holderId)
          .filter((n) => !folders.some(f => f.collapsed && f.nodeIds.includes(n.id)))
          .sort((a, b) => (nodeZIndices.get(a.id) || 0) - (nodeZIndices.get(b.id) || 0))
          .map((node) => {
            const position = getNodePosition(node.id, node.x, node.y);
            const isNodeExpanded = expandedNodes.has(node.id);
            const isDraggingNode = dragOffsets.has(node.id);
            const cardWidth = isNodeExpanded ? 440 : 300;
            const cardHeight = isNodeExpanded ? 600 : 160;

            // Margin scales with viewport so culling works at all zoom levels
            const cullMarginX = viewBox.width * 0.5 + cardWidth;
            const cullMarginY = viewBox.height * 0.5 + cardHeight;
            const isInViewport =
              position.x + cullMarginX > viewBox.x &&
              position.x - cullMarginX < viewBox.x + viewBox.width &&
              position.y + cullMarginY > viewBox.y &&
              position.y - cullMarginY < viewBox.y + viewBox.height;

            if (!isInViewport) return null;

            const offset = dragOffsets.get(node.id) || { x: 0, y: 0 };
            const visualX = position.x + offset.x;
            const visualY = position.y + offset.y;
            const isShimmering = shimmeringNodes.has(node.id);
            const itemPreDragY = isDraggingNode ? nodePositions.get(node.id)?.y : undefined;
            const itemHasCrossed = itemPreDragY !== undefined && ((itemPreDragY > 0 && visualY <= 0) || (itemPreDragY <= 0 && visualY > 0));
            const itemGlowColor = itemHasCrossed ? (visualY <= 0 ? '#E84040' : '#4080E8') : '#7050A8';
            const itemShowGlow = itemHasCrossed || isShimmering;
            const itemGlowPulse = 0.4 + Math.sin(animationTime * 3) * 0.25;

            return (
              <g key={`item-group-${node.id}`}>
              {itemShowGlow && (
                <rect
                  x={visualX - cardWidth / 2 - 25}
                  y={visualY - cardHeight / 2 - 25}
                  width={cardWidth + 50}
                  height={cardHeight + 50}
                  rx={16}
                  fill={itemGlowColor}
                  stroke="none"
                  filter="url(#cardBacklight)"
                  opacity={itemGlowPulse}
                />
              )}
              <foreignObject
                key={`item-${node.id}`}
                x={visualX - cardWidth / 2 - viewBox.width}
                y={visualY - cardHeight / 2 - viewBox.height}
                width={cardWidth + viewBox.width * 2}
                height={cardHeight + viewBox.height * 2}
                style={{ overflow: "visible", pointerEvents: "none" }}
              >
                <div style={{ padding: `${viewBox.height}px ${viewBox.width}px`, pointerEvents: "none" }}>
                <div style={{ pointerEvents: "auto", transform: isDraggingNode ? 'scale(1.05)' : 'scale(1)', transformOrigin: 'center center', transition: isDraggingNode ? 'none' : 'transform 0.15s ease-out' }}>
                  <WorldItemCard
                    node={{
                      id: node.id,
                      name: node.name,
                      type: (node.itemType || 'misc') as WorldItemNodeData['type'],
                      status: node.status || 'ACTIVE',
                      data: node.itemData!,
                      holderName: node.holderName,
                      locationName: node.locationName,
                      x: visualX,
                      y: visualY,
                    }}
                    isExpanded={isNodeExpanded}
                    onToggleExpand={toggleExpand}
                    onDelete={onDeleteItem}
                    onPositionChange={(nodeId, x, y) => {
                      // Check if item was dropped on a character card
                      const dropTarget = nodes.find(n => {
                        if (n.type !== 'character') return false;
                        const charPos = getNodePosition(n.id, n.x, n.y);
                        const charExpanded = expandedNodes.has(n.id);
                        const cw = charExpanded ? 1920 : 520;
                        const ch = charExpanded ? 500 : 240;
                        return Math.abs(x - charPos.x) < cw / 2 + 80 && Math.abs(y - charPos.y) < ch / 2 + 80;
                      });

                      if (dropTarget && onItemTransfer) {
                        // Item dropped on character — transfer to their inventory
                        onItemTransfer(nodeId, dropTarget.id);
                      } else {
                        // Normal position update
                        setNodePositions((prev) => {
                          const next = new Map(prev);
                          next.set(nodeId, { x, y });
                          return next;
                        });
                        onNodePositionChange?.(nodeId, x, y);
                        bringNodeToFront(nodeId);
                      }
                      setDraggingItemId(null);
                    }}
                    onDragOffsetChange={(nodeId, offsetX, offsetY) => {
                      const clampedY = clampPartyDragY(nodeId, offsetY);
                      setDragOffsets((prev) => {
                        const next = new Map(prev);
                        if (offsetX === 0 && clampedY === 0) {
                          next.delete(nodeId);
                        } else {
                          next.set(nodeId, { x: offsetX, y: clampedY });
                        }
                        return next;
                      });
                      // Track which item is being dragged for drop-target highlighting
                      if (offsetX !== 0 || clampedY !== 0) {
                        setDraggingItemId(nodeId);
                      }
                    }}
                  />
                </div>
                </div>
              </foreignObject>
              </g>
            );
          })}

        {/* ── Non-card nodes (circle icons for npc/quest) — sorted by z-index ── */}
        {nodes
          .filter((n) => n.type !== "character" && !(n.type === "location" && n.locationData) && !(n.type === "item" && n.itemData))
          .sort((a, b) => (nodeZIndices.get(a.id) || 0) - (nodeZIndices.get(b.id) || 0))
          .map((node) => {
            const isSelected = selectedNode === node.id;
            const isHovered = hoveredNode === node.id;
            const position = getNodePosition(node.id, node.x, node.y);
            const fillColor = getNodeFill(node.type, node.color);

            const cullMargin = Math.max(viewBox.width, viewBox.height) * 0.5;
            const isInViewport =
              position.x + cullMargin > viewBox.x &&
              position.x - cullMargin < viewBox.x + viewBox.width &&
              position.y + cullMargin > viewBox.y &&
              position.y - cullMargin < viewBox.y + viewBox.height;

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

      {/* ── Canvas Toolbox (follows camera on the KRMA line) ── */}
      <CanvasToolbox
        viewBox={viewBox}
        zoom={zoom}
        forgeItems={forgeItems}
        folders={folders}
        nodes={nodes}
        onCreateCharacter={onCreateCharacter}
        onCreateLocation={onCreateLocation}
        onCreateItem={onCreateItem}
        onCreateItemFromForge={onCreateItemFromForge}
        onCreateParty={(nodeIds) => {
          const newFolder: CanvasFolder = {
            id: `folder-${Date.now()}`,
            name: 'Party',
            type: 'party',
            nodeIds,
            color: '#22ab94',
          };
          onFoldersChange?.([...folders, newFolder]);
        }}
      />

      {/* ── Folder header overlays ── */}
      {folders.map(folder => {
        const folderChars = nodes
          .filter(n => folder.nodeIds.includes(n.id) && n.type === 'character' && n.characterData)
          .map(n => ({
            id: n.id,
            name: n.name,
            data: n.characterData as unknown as GrowthCharacter,
          }));
        const nodeTypes = new Map(nodes.map(n => [n.id, n.type]));

        return (
          <FolderGroup
            key={`folder-header-${folder.id}`}
            folder={folder}
            nodePositions={nodePositions}
            dragOffsets={dragOffsets}
            nodeTypes={nodeTypes}
            expandedNodes={expandedNodes}
            characters={folderChars}
            campaignId={campaignId}
            viewBox={viewBox}
            zoom={zoom}
            onFolderDragStart={(folderId, startSvg) => {
              setDragFolderId(folderId);
              setFolderDragStartSvg(startSvg);
            }}
            onRemoveFromFolder={(folderId, nodeId) => {
              const updated = folders.map(f =>
                f.id === folderId ? { ...f, nodeIds: f.nodeIds.filter(id => id !== nodeId) } : f
              );
              onFoldersChange?.(updated);
            }}
            onRestComplete={() => onRestComplete?.()}
          />
        );
      })}

      {/* ── Debug overlay (Ctrl+D) ── */}
      {showDebug && (() => {
        const expectedW = BASE_WIDTH * zoom;
        const expectedH = BASE_HEIGHT * zoom;
        const driftW = Math.abs(viewBox.width - expectedW);
        const driftH = Math.abs(viewBox.height - expectedH);
        const hasDrift = driftW > 0.01 || driftH > 0.01;
        const zoomPct = Math.round((1 / zoom) * 100);
        const Row = ({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) => (
          <div className="flex justify-between gap-4">
            <span className="opacity-60">{label}</span>
            <span className={warn ? 'text-red-400' : ''}>{value}</span>
          </div>
        );
        return (
          <div
            className="absolute top-2 right-2 rounded-lg p-3 text-xs font-[family-name:var(--font-terminal)]"
            style={{
              background: "rgba(0, 0, 0, 0.92)",
              border: "1px solid var(--accent-teal)",
              color: "var(--accent-teal)",
              minWidth: 240,
              zIndex: 50,
              pointerEvents: 'auto',
              userSelect: 'text',
            }}
          >
            <div className="font-bold mb-2 text-[10px] tracking-[0.2em] uppercase border-b border-[var(--accent-teal)]/30 pb-1">
              CANVAS DEBUG
            </div>

            {/* Performance */}
            <div className="space-y-0.5 mb-2">
              <div className="text-[8px] tracking-[0.15em] uppercase opacity-40 mb-0.5">PERFORMANCE</div>
              <Row label="FPS" value={<span className={fps < 30 ? 'text-red-400' : fps < 50 ? 'text-yellow-400' : 'text-green-400'}>{fps}</span>} />
              <Row label="Nodes" value={`${nodes.length} total`} />
              <Row label="Expanded" value={expandedNodes.size} />
              <Row label="Panels" value={[...panelOpenNodes.values()].reduce((a, s) => a + s.size, 0)} />
            </div>

            {/* Camera */}
            <div className="space-y-0.5 mb-2 pt-1 border-t border-[var(--accent-teal)]/20">
              <div className="text-[8px] tracking-[0.15em] uppercase opacity-40 mb-0.5">CAMERA</div>
              <Row label="Zoom" value={`${zoom.toFixed(4)}x (${zoomPct}%)`} />
              <Row label="Range" value={`${MIN_ZOOM}–${MAX_ZOOM}`} />
              <Row label="Cam X,Y" value={`${camera.x.toFixed(1)}, ${camera.y.toFixed(1)}`} />
              <Row label="VB Size" value={`${Math.round(viewBox.width)}x${Math.round(viewBox.height)}`} />
              <Row label="Base" value={`${BASE_WIDTH}x${BASE_HEIGHT}`} />
              {hasDrift && <Row label="DRIFT!" value={`w:${driftW.toFixed(4)} h:${driftH.toFixed(4)}`} warn />}
            </div>

            {/* Mouse */}
            <div className="space-y-0.5 mb-2 pt-1 border-t border-[var(--accent-teal)]/20">
              <div className="text-[8px] tracking-[0.15em] uppercase opacity-40 mb-0.5">MOUSE (SVG)</div>
              <Row label="World" value={`${debugMouse.cx}, ${debugMouse.cy}`} />
              <Row label="Screen" value={`${debugMouse.sx}, ${debugMouse.sy}`} />
            </div>

            {/* State */}
            <div className="space-y-0.5 pt-1 border-t border-[var(--accent-teal)]/20">
              <div className="text-[8px] tracking-[0.15em] uppercase opacity-40 mb-0.5">STATE</div>
              <Row label="Panning" value={isPanning ? 'YES' : 'no'} />
              <Row label="Dragging" value={dragNodeId || 'none'} />
              <Row label="Selected" value={selectedNode ? selectedNode.slice(0, 8) + '...' : 'none'} />
              <Row label="Max Z" value={maxZIndex} />
            </div>

            <div className="mt-2 pt-1 border-t border-[var(--accent-teal)]/30 text-[8px] opacity-30">
              Ctrl+D to toggle | Space to reset
            </div>
          </div>
        );
      })()}

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

// ── Canvas Toolbox (viewport-fixed overlay) ──────────────────────────────────

import { ITEM_TYPE_ICONS } from '@/types/item';

function CanvasToolbox({
  viewBox,
  zoom,
  forgeItems,
  folders,
  nodes,
  onCreateCharacter,
  onCreateLocation,
  onCreateItem,
  onCreateItemFromForge,
  onCreateParty,
}: {
  viewBox: { x: number; y: number; width: number; height: number };
  zoom: number;
  forgeItems?: ForgeItemSummary[];
  folders?: CanvasFolder[];
  nodes?: CanvasNode[];
  onCreateCharacter?: (name: string) => void;
  onCreateLocation?: (name: string, type: string) => void;
  onCreateItem?: (name: string, type: string) => void;
  onCreateItemFromForge?: (name: string, type: string, data: Record<string, unknown>) => void;
  onCreateParty?: (nodeIds: string[]) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showForgeItems, setShowForgeItems] = useState(false);

  const publishedItems = (forgeItems || []).filter(f => f.type === 'item');

  // Position derived directly from viewBox state — no CTM, no frame-lag wobble.
  // X: always centered horizontally in the visible area.
  // Y: locked to KRMA line (SVG Y=0) mapped to container fraction.
  const screenX = '50%';
  const yFraction = (0 - viewBox.y) / viewBox.height;
  const screenY = `${(yFraction * 100).toFixed(2)}%`;

  // Scale with zoom like SVG foreignObject cards do.
  // zoom=1 is the default; zoom<1 = zoomed out (smaller), zoom>1 = zoomed in (larger).
  const toolScale = 1.2 / zoom;

  return (
    <div
      style={{
        position: 'absolute',
        left: screenX,
        top: screenY,
        transform: `translate(-50%, -50%) scale(${toolScale})`,
        zIndex: 50,
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
    >
      {/* Collapsed: compact pill */}
      {!isExpanded ? (
        <button
          onClick={() => setIsExpanded(true)}
          style={{
            background: 'linear-gradient(135deg, #22ab94 0%, #1e9b82 100%)',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 4,
            padding: '6px 16px',
            color: 'white',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            cursor: 'pointer',
            fontFamily: 'var(--font-terminal), Consolas, monospace',
            boxShadow: '0 4px 20px rgba(34, 171, 148, 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
            <path d="M12 2L3 7v6c0 5.55 3.84 9.74 9 9.74s9-4.19 9-9.74V7l-7-5z" />
          </svg>
          {'\u049C'} TOOLS
        </button>
      ) : (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(34,171,148,0.95) 0%, rgba(30,155,130,0.95) 100%)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 4,
            padding: 12,
            minWidth: 220,
            boxShadow: '0 8px 32px rgba(34, 171, 148, 0.4), 0 2px 8px rgba(0,0,0,0.3)',
            fontFamily: 'var(--font-terminal), Consolas, monospace',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                <path d="M12 2L3 7v6c0 5.55 3.84 9.74 9 9.74s9-4.19 9-9.74V7l-7-5z" />
              </svg>
              <span style={{ color: 'white', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>{'\u049C'} TOOLS</span>
            </div>
            <button
              onClick={() => { setIsExpanded(false); setShowForgeItems(false); }}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 4, width: 20, height: 20, cursor: 'pointer', color: 'white', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              &times;
            </button>
          </div>

          {/* Create buttons */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <ToolboxButton
              icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
              label="Character"
              onClick={() => {
                const name = window.prompt('Character name:');
                if (name?.trim()) onCreateCharacter?.(name.trim());
              }}
            />
            <ToolboxButton
              icon={<span style={{ fontSize: 13 }}>{'\uD83D\uDCCD'}</span>}
              label="Location"
              color="#7050A8"
              onClick={() => {
                const name = window.prompt('Location name:');
                if (name?.trim()) onCreateLocation?.(name.trim(), 'point_of_interest');
              }}
            />
            <ToolboxButton
              icon={<span style={{ fontSize: 13 }}>{'\u2694'}</span>}
              label="Item"
              color="#ffcc78"
              onClick={() => {
                const name = window.prompt('Item name:');
                if (name?.trim()) onCreateItem?.(name.trim(), 'misc');
              }}
            />
          </div>

          {/* Create Party folder */}
          {!(folders || []).some(f => f.type === 'party') && (nodes || []).filter(n => n.type === 'character').length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <button
                onClick={() => {
                  const charNodeIds = (nodes || []).filter(n => n.type === 'character').map(n => n.id);
                  onCreateParty?.(charNodeIds);
                }}
                style={{
                  width: '100%',
                  padding: '5px 8px',
                  background: 'rgba(88,42,114,0.2)',
                  border: '1px solid rgba(88,42,114,0.4)',
                  borderRadius: 6,
                  color: '#b4a7d6',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  letterSpacing: '0.05em',
                }}
              >
                <span>{'\u2694'}</span> CREATE PARTY
              </button>
            </div>
          )}

          {/* Place from Forge */}
          {publishedItems.length > 0 && (
            <div>
              <button
                onClick={() => setShowForgeItems(!showForgeItems)}
                style={{
                  width: '100%',
                  padding: '5px 8px',
                  background: showForgeItems ? 'rgba(255,204,120,0.2)' : 'rgba(255,255,255,0.1)',
                  border: `1px solid ${showForgeItems ? 'rgba(255,204,120,0.4)' : 'rgba(255,255,255,0.2)'}`,
                  borderRadius: 6,
                  color: showForgeItems ? '#ffcc78' : 'rgba(255,255,255,0.8)',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  letterSpacing: '0.05em',
                }}
              >
                <span>{'\u2692'} PLACE FROM FORGE ({publishedItems.length})</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ transform: showForgeItems ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showForgeItems && (
                <div style={{ marginTop: 4, maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {publishedItems.map(fi => (
                    <button
                      key={fi.id}
                      onClick={() => {
                        onCreateItemFromForge?.(fi.name, fi.type === 'item' ? ((fi.data.itemType as string) || 'misc') : 'misc', fi.data);
                      }}
                      style={{
                        padding: '4px 8px',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 4,
                        color: 'white',
                        fontSize: 10,
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span>{ITEM_TYPE_ICONS[(fi.data.itemType || 'misc') as keyof typeof ITEM_TYPE_ICONS] || '\uD83D\uDCE6'}</span>
                      <span style={{ flex: 1 }}>{fi.name}</span>
                      <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)' }}>PLACE</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolboxButton({ icon, label, color, onClick }: { icon: React.ReactNode; label: string; color?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '6px 4px',
        background: 'rgba(255,255,255,0.12)',
        border: '1px solid rgba(255,255,255,0.25)',
        borderRadius: 8,
        color: color || 'white',
        fontSize: 9,
        fontWeight: 600,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        letterSpacing: '0.05em',
        fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
      }}
    >
      {icon}
      {label.toUpperCase()}
    </button>
  );
}
