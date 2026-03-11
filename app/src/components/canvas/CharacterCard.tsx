"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ComplexTooltip } from '@/components/ui/ComplexTooltip';
import type { HeldItemData } from '@/types/item';
import { updateAttribute, type AttributeName } from '@/lib/character-actions';
import type { GrowthCharacter, AugmentSource } from '@/types/growth';
import type { TooltipModifier } from '@/components/ui/ComplexTooltip';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface CharacterNodeData {
  id: string;
  type: 'character';
  name: string;
  x: number;
  y: number;
  status?: string;
  portrait?: string | null;
  characterData?: {
    identity?: { name?: string };
    tkv?: number | string;
    levels?: { wealthLevel?: number; techLevel?: number; healthLevel?: number };
    attributes?: {
      clout?: { level: number; current: number; augmentPositive?: number; augmentNegative?: number };
      celerity?: { level: number; current: number; augmentPositive?: number; augmentNegative?: number };
      constitution?: { level: number; current: number; augmentPositive?: number; augmentNegative?: number };
      flow?: { level: number; current: number; augmentPositive?: number; augmentNegative?: number };
      frequency?: { level: number; current: number };
      focus?: { level: number; current: number; augmentPositive?: number; augmentNegative?: number };
      willpower?: { level: number; current: number; augmentPositive?: number; augmentNegative?: number };
      wisdom?: { level: number; current: number; augmentPositive?: number; augmentNegative?: number };
      wit?: { level: number; current: number; augmentPositive?: number; augmentNegative?: number };
    };
    conditions?: Record<string, boolean>;
    creation?: { seed?: { name?: string; baseFateDie?: string }; root?: { name?: string } };
    possessions?: string;
    grovines?: Array<{ goal?: string; opportunity?: string; kv?: number }>;
    age?: string;
    birthday?: string;
    inventory?: HeldItemData[];
    [key: string]: unknown;
  } | null;
}

interface CharacterCardProps {
  node: CharacterNodeData;
  isExpanded?: boolean;
  showInventory?: boolean;
  isDropTarget?: boolean;
  openPanels?: Set<string>;
  onNodeClick?: (node: CharacterNodeData) => void;
  onToggleExpand?: (nodeId: string) => void;
  onPositionChange?: (nodeId: string, x: number, y: number) => void;
  onDragOffsetChange?: (nodeId: string, offsetX: number, offsetY: number) => void;
  onDelete?: (nodeId: string) => void;
  onInventoryToggle?: (nodeId: string) => void;
  onPanelToggle?: (nodeId: string, panel: string) => void;
  onCharacterUpdate?: (nodeId: string, character: GrowthCharacter, changes: string[]) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getAttrMax(attr: { level: number; current: number; augmentPositive?: number; augmentNegative?: number } | undefined): number {
  if (!attr) return 20;
  return attr.level + (attr.augmentPositive || 0) - (attr.augmentNegative || 0);
}

function getBarPercent(attr: { level: number; current: number; augmentPositive?: number; augmentNegative?: number } | undefined): number {
  if (!attr) return 0;
  const max = getAttrMax(attr);
  if (max <= 0) return 0;
  return Math.min(100, (attr.current / max) * 100);
}

// Source type display labels and colors for nested tooltips
const SOURCE_TYPE_LABELS: Record<string, string> = {
  nectar: 'Nectar (Permanent Buff)',
  blossom: 'Blossom (Temporary Buff)',
  thorn: 'Thorn (Permanent Penalty)',
  item: 'Equipment',
  condition: 'Condition Effect',
  effect: 'Active Effect',
  other: 'Other',
};

// Build tooltip modifiers from an attribute's augment sources
function buildAttrModifiers(attr: { level: number; current: number; augmentPositive?: number; augmentNegative?: number; augmentSources?: AugmentSource[] } | undefined): TooltipModifier[] {
  if (!attr) return [];
  const sources = attr.augmentSources;
  if (!sources || sources.length === 0) {
    // No itemized sources — show aggregate augments if any exist
    const mods: TooltipModifier[] = [];
    if (attr.augmentPositive && attr.augmentPositive > 0) {
      mods.push({ name: 'Positive Augments', value: attr.augmentPositive });
    }
    if (attr.augmentNegative && attr.augmentNegative > 0) {
      mods.push({ name: 'Negative Augments', value: -(attr.augmentNegative) });
    }
    return mods;
  }
  // Itemized sources with nested tooltip data
  return sources.map(s => ({
    name: s.name,
    value: s.value,
    description: s.description,
    source: {
      name: s.name,
      type: SOURCE_TYPE_LABELS[s.sourceType] || s.sourceType,
      description: s.description,
      stats: s.stats,
    },
  }));
}

// Condition mappings
const CONDITION_LABELS: Record<string, string> = {
  clout: 'WEAK', celerity: 'CLUMSY', constitution: 'EXHAUSTED',
  flow: 'DEAFENED', frequency: "DEATH'S DOOR", focus: 'MUTED',
  willpower: 'OVERWHELMED', wisdom: 'CONFUSED', wit: 'INCOHERENT',
};
const CONDITION_KEYS: Record<string, string> = {
  clout: 'weak', celerity: 'clumsy', constitution: 'exhausted',
  flow: 'deafened', frequency: 'deathsDoor', focus: 'muted',
  willpower: 'overwhelmed', wisdom: 'confused', wit: 'incoherent',
};

// ── HBar — Stable component (must live outside CharacterCard to avoid remounts) ──

interface HBarProps {
  label: string;
  attrName?: AttributeName;
  current: number;
  max: number;
  isFrequency?: boolean;
  isLast?: boolean;
  isConditioned?: boolean;
  conditionLabel?: string;
  onAttributeChange?: (attrName: AttributeName, value: number) => void;
  onDragStateChange?: (dragging: boolean) => void;
}

const HBar: React.FC<HBarProps> = ({ label, attrName, current, max, isFrequency, isLast, isConditioned, conditionLabel, onAttributeChange, onDragStateChange }) => {
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  const isLow = pct < 25;
  const barRef = useRef<HTMLDivElement>(null);
  const editable = !!attrName && !!onAttributeChange;

  // Use refs for drag state to avoid re-render mid-drag
  const draggingRef = useRef(false);
  const [, forceRender] = useState(0);

  const handleLeverMouseDown = useCallback((e: React.MouseEvent) => {
    if (!editable || !barRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    onDragStateChange?.(true);
    forceRender(n => n + 1);

    // Capture barRef at drag start so it stays stable through re-renders
    const bar = barRef.current;
    const attr = attrName!;

    const valueFromX = (clientX: number): number => {
      const rect = bar.getBoundingClientRect();
      const x = clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, x / rect.width));
      return Math.round(ratio * max);
    };

    const onMove = (me: MouseEvent) => {
      onAttributeChange!(attr, valueFromX(me.clientX));
    };
    const onUp = () => {
      draggingRef.current = false;
      onDragStateChange?.(false);
      forceRender(n => n + 1);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [editable, attrName, max, onAttributeChange, onDragStateChange]);

  const isDragging = draggingRef.current;

  const inner = (
    <div className={`flex items-center gap-2 ${isFrequency ? 'rounded' : ''}`}
      style={isFrequency ? { backgroundColor: 'rgba(255, 204, 120, 0.15)', border: '2px solid #ffcc78', padding: '2px', marginLeft: '-4px', marginRight: '-4px' } : undefined}
    >
      <span className="text-xl font-bold text-white" style={{ fontFamily: 'Consolas, monospace', minWidth: '40px', paddingLeft: '8px' }}>{current}</span>
      <div
        ref={barRef}
        className={`flex-1 relative h-6 ${isFrequency ? 'bg-black/60' : 'bg-black/40'} rounded cursor-help`}
        style={{ overflow: 'visible' }}
      >
        {/* Current fill */}
        <div className="absolute top-0 left-0 h-full rounded" style={{
          width: `${pct}%`,
          background: 'linear-gradient(90deg, #ffcc78 0%, #ffaa44 100%)',
          boxShadow: isLow ? '0 0 8px rgba(255, 0, 0, 0.6)' : isFrequency ? '0 0 12px rgba(255, 204, 120, 0.5)' : 'none',
          transition: isDragging ? 'none' : 'width 0.3s',
          zIndex: 2,
          borderRadius: '4px',
          overflow: 'hidden',
        }} />
        {/* Condition text inside the bar */}
        {isConditioned && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 4 }}>
            <span className="font-bold uppercase" style={{
              fontSize: '16px',
              letterSpacing: '0.15em',
              fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
              color: isFrequency ? '#ff4444' : '#ff6b6b',
              textShadow: '0 0 8px rgba(255, 68, 68, 0.7), 0 1px 3px rgba(0, 0, 0, 0.9)',
              animation: 'characterCardConditionPulse 2s ease-in-out infinite',
            }}>{conditionLabel}</span>
          </div>
        )}
        {/* Draggable lever handle — the only grab target */}
        {editable && (
          <div
            className="absolute top-0 h-full flex items-center cursor-ew-resize"
            style={{
              left: `${pct}%`,
              transform: 'translateX(-50%)',
              zIndex: 3,
              padding: '0 8px',
            }}
            onMouseDown={handleLeverMouseDown}
          >
            <div style={{
              width: '4px',
              height: '20px',
              backgroundColor: '#fff',
              borderRadius: '2px',
              boxShadow: isDragging
                ? '0 0 8px rgba(255, 204, 120, 0.8), 0 0 4px rgba(255, 255, 255, 0.5)'
                : '0 0 4px rgba(0, 0, 0, 0.5)',
              opacity: isDragging ? 1 : 0.7,
              transition: 'opacity 0.15s, box-shadow 0.15s',
            }} />
          </div>
        )}
      </div>
      <span className="text-xl font-bold text-white/60" style={{ fontFamily: 'Consolas, monospace', minWidth: '40px', textAlign: 'right' }}>{max}</span>
      <span className="text-sm font-bold text-white" style={{ fontFamily: 'Consolas, monospace', minWidth: '40px' }}>{label}</span>
    </div>
  );
  return <div className={isLast ? '' : 'mb-2'}>{inner}</div>;
};

/** Dynamically size the character name to fit the 260px header width. */
function getNameFontSize(name: string): number {
  // Approximate: Comfortaa is ~0.55em per character at a given size
  // Target: fit within ~260px, font sticks out above the box
  const targetWidth = 240;
  const charWidthRatio = 0.55;
  const ideal = targetWidth / (name.length * charWidthRatio);
  return Math.min(50, Math.max(26, Math.round(ideal)));
}

// ── Component ───────────────────────────────────────────────────────────────

const CharacterCard: React.FC<CharacterCardProps> = ({
  node,
  isExpanded = false,
  showInventory = false,
  isDropTarget = false,
  openPanels,
  onToggleExpand,
  onPositionChange,
  onDragOffsetChange,
  onDelete,
  onInventoryToggle,
  onPanelToggle,
  onCharacterUpdate,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isBarDragging, setIsBarDragging] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [isInViewport, setIsInViewport] = useState(true);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Viewport culling via IntersectionObserver
  useEffect(() => {
    if (!cardRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => setIsInViewport(entry.isIntersecting)),
      { rootMargin: '200px', threshold: 0 }
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  // Close context menu on outside click
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

  if (!node?.id || !node?.name) return null;

  const data = node.characterData;
  const levels = data?.levels;
  const attributes = data?.attributes;
  const conditions = data?.conditions;
  const seed = data?.creation?.seed;
  const root = data?.creation?.root;
  const grovines = data?.grovines || [];
  const tkv = data?.tkv || 0;

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!onDelete) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.pageX, y: e.pageY });
    setShowContextMenu(true);
  };

  // Drag handler — updates parent with SVG coordinate offsets
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (!onPositionChange || !onDragOffsetChange) return;

    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    // Signal drag start so tether anchors can scale with the card
    onDragOffsetChange?.(node.id, 0.001, 0.001);

    const foreignObject = (e.target as Element).closest('foreignObject');
    const svg = foreignObject?.closest('svg') as SVGSVGElement | null;
    if (!svg) return;

    const svgPoint = svg.createSVGPoint();
    const screenToSVG = (clientX: number, clientY: number) => {
      svgPoint.x = clientX;
      svgPoint.y = clientY;
      return svgPoint.matrixTransform(svg.getScreenCTM()!.inverse());
    };

    const startSVGCoords = screenToSVG(e.clientX, e.clientY);
    dragStartPosRef.current = { x: node.x, y: node.y };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartPosRef.current) return;
      const current = screenToSVG(moveEvent.clientX, moveEvent.clientY);
      onDragOffsetChange(node.id, current.x - startSVGCoords.x, current.y - startSVGCoords.y);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (!dragStartPosRef.current) return;
      const final = screenToSVG(upEvent.clientX, upEvent.clientY);
      onDragOffsetChange(node.id, 0, 0);
      onPositionChange(node.id, dragStartPosRef.current.x + final.x - startSVGCoords.x, dragStartPosRef.current.y + final.y - startSVGCoords.y);
      setIsDragging(false);
      dragStartPosRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // ── Context Menu Portal ───────────────────────────────────────────────────

  const contextMenu = showContextMenu && typeof window !== 'undefined' && createPortal(
    <div
      ref={contextMenuRef}
      className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-2xl py-1 z-50"
      style={{ left: `${contextMenuPos.x}px`, top: `${contextMenuPos.y}px`, minWidth: '160px' }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); setShowContextMenu(false); onDelete?.(node.id); }}
        className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        Delete Character
      </button>
    </div>,
    document.body
  );

  // ── Compact View (500x220) ────────────────────────────────────────────────

  if (!isExpanded) {
    return (
      <div className="relative">
        <div
          className={`flex bg-gradient-to-br from-gray-800 to-gray-900 border-2 rounded-lg p-3 text-white hover:border-gray-600 transition-all select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{
            width: '500px', height: '220px', userSelect: 'none',
            borderColor: isDropTarget ? '#4ade80' : 'rgba(55, 65, 81, 0.5)',
            boxShadow: isDropTarget ? '0 0 30px rgba(74, 222, 128, 0.4), inset 0 0 15px rgba(74, 222, 128, 0.1)' : 'none',
            filter: isDragging
              ? 'drop-shadow(8px 16px 20px rgba(0, 0, 0, 0.7)) drop-shadow(4px 8px 10px rgba(0, 0, 0, 0.5))'
              : 'drop-shadow(3px 6px 12px rgba(0, 0, 0, 0.5)) drop-shadow(2px 3px 6px rgba(0, 0, 0, 0.3))',
          }}
          onMouseDown={handleMouseDown}
          onContextMenu={handleContextMenu}
        >
          {/* Portrait - 160px */}
          <div className="flex-shrink-0 mr-3" style={{ width: '160px', height: '220px' }}>
            <div className="w-full h-full relative bg-gray-900 overflow-hidden">
              {node.portrait ? (
                <img src={node.portrait} alt={node.name} className="w-full h-full object-contain" />
              ) : (
                <img src="/EmptyPortrait.png" alt="Empty Portrait" className="w-full h-full object-contain" />
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col" style={{ height: '220px' }}>
            {/* Name + TKV */}
            <div className="flex items-center justify-between mb-1" style={{ height: '24px' }}>
              <div className="font-bold truncate" style={{ fontFamily: 'var(--font-comfortaa), Comfortaa, sans-serif', fontSize: '14px', color: '#ffcc78' }}>
                {node.name}
              </div>
              <div className="flex items-center justify-center rounded" style={{
                backgroundColor: '#002f6c', minWidth: '50px', height: '20px',
                fontSize: '10px', color: '#ffcc78', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', paddingLeft: '4px', paddingRight: '4px'
              }}>
                T&#x049C;V {tkv}
              </div>
            </div>

            {/* WTH Levels */}
            <div className="flex gap-1 mb-2">
              {[
                { label: 'W', value: levels?.wealthLevel || 4, bg: '#22ab94' },
                { label: 'T', value: levels?.techLevel || 4, bg: '#002f6c' },
                { label: 'H', value: levels?.healthLevel || 4, bg: '#f7525f' },
              ].map(l => (
                <div key={l.label} className="flex items-center justify-center rounded" style={{
                  backgroundColor: l.bg, width: '28px', height: '18px',
                  fontSize: '10px', color: 'white', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif'
                }}>{l.label}{l.value}</div>
              ))}
            </div>

            {/* 3 Pillar Attribute Bars (vertical, compact view) */}
            <div className="flex gap-1 flex-1">
              {/* BODY */}
              <div className="flex flex-col flex-1 border border-red-500/40 rounded p-1" style={{ backgroundColor: '#f7525f' }}>
                <div className="text-[8px] font-bold text-white mb-1 text-center" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>&#x1F714; BODY</div>
                <div className="flex gap-0.5 flex-1">
                  {[
                    { label: 'CLT', attr: attributes?.clout },
                    { label: 'CEL', attr: attributes?.celerity },
                    { label: 'CON', attr: attributes?.constitution },
                  ].map(({ label, attr }) => (
                    <div key={label} className="flex flex-col flex-1 items-center">
                      <div className="flex-1 relative w-full bg-black/40 rounded overflow-hidden" style={{ minHeight: '60px' }}>
                        <div className="absolute bottom-0 left-0 w-full rounded transition-all duration-300" style={{
                          height: `${getBarPercent(attr)}%`,
                          background: 'linear-gradient(0deg, #ffcc78 0%, #ffaa44 100%)'
                        }} />
                      </div>
                      <span className="text-[8px] font-bold text-white mt-0.5" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* SPIRIT (Flow/Frequency/Focus) */}
              <div className="flex flex-col flex-1 border border-purple-500/40 rounded p-1" style={{ backgroundColor: '#582a72' }}>
                <div className="text-[8px] font-bold text-white mb-1 text-center" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>&#x1F70E; SPIRIT</div>
                <div className="flex gap-0.5 flex-1">
                  {[
                    { label: 'FLO', attr: attributes?.flow },
                    { label: 'FRE', attr: attributes?.frequency ? { ...attributes.frequency, augmentPositive: 0, augmentNegative: 0 } : undefined },
                    { label: 'FOC', attr: attributes?.focus },
                  ].map(({ label, attr }) => (
                    <div key={label} className="flex flex-col flex-1 items-center">
                      <div className="flex-1 relative w-full bg-black/40 rounded overflow-hidden" style={{ minHeight: '60px' }}>
                        <div className="absolute bottom-0 left-0 w-full rounded transition-all duration-300" style={{
                          height: `${getBarPercent(attr)}%`,
                          background: 'linear-gradient(0deg, #ffcc78 0%, #ffaa44 100%)'
                        }} />
                      </div>
                      <span className="text-[8px] font-bold text-white mt-0.5" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* SOUL (Willpower/Wisdom/Wit) */}
              <div className="flex flex-col flex-1 border border-blue-500/40 rounded p-1" style={{ backgroundColor: '#002f6c' }}>
                <div className="text-[8px] font-bold text-white mb-1 text-center" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>&#x1F70D; SOUL</div>
                <div className="flex gap-0.5 flex-1">
                  {[
                    { label: 'WIL', attr: attributes?.willpower },
                    { label: 'WIS', attr: attributes?.wisdom },
                    { label: 'WIT', attr: attributes?.wit },
                  ].map(({ label, attr }) => (
                    <div key={label} className="flex flex-col flex-1 items-center">
                      <div className="flex-1 relative w-full bg-black/40 rounded overflow-hidden" style={{ minHeight: '60px' }}>
                        <div className="absolute bottom-0 left-0 w-full rounded transition-all duration-300" style={{
                          height: `${getBarPercent(attr)}%`,
                          background: 'linear-gradient(0deg, #ffcc78 0%, #ffaa44 100%)'
                        }} />
                      </div>
                      <span className="text-[8px] font-bold text-white mt-0.5" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Expand Button */}
          {onToggleExpand && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id); }}
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute bg-purple-600 hover:bg-purple-500 rounded-full flex items-center justify-center text-white cursor-pointer transition-all shadow-lg hover:shadow-xl"
              style={{ width: '36px', height: '36px', bottom: '-16px', right: '-18px', fontSize: '24px', lineHeight: '1', zIndex: 10 }}
              title="Expand character sheet"
            >&#8853;</button>
          )}
        </div>
        {contextMenu}
      </div>
    );
  }

  // ── Expanded View (1885x670) — faithful port of prototype ─────────────────

  // Possessions
  const possessionsText = data?.possessions || '';
  const possessionsList = possessionsText.split(/\n|,/).map(s => s.trim()).filter(s => s.length > 0);

  // Vine data
  const vines = grovines.length > 0 ? grovines : [{ goal: '...', opportunity: '...', kv: undefined }];

  // Action totals
  const bodyAction = (attributes?.clout?.current || 0) + (attributes?.celerity?.current || 0) + (attributes?.constitution?.current || 0);
  const spiritAction = (attributes?.flow?.current || 0) + (attributes?.frequency?.current || 0) + (attributes?.focus?.current || 0);
  const soulAction = (attributes?.willpower?.current || 0) + (attributes?.wisdom?.current || 0) + (attributes?.wit?.current || 0);

  // Handler for attribute bar changes
  const handleAttributeChange = useCallback((attrName: AttributeName, newValue: number) => {
    if (!onCharacterUpdate || !data) return;
    // Reconstruct a GrowthCharacter from the node's characterData
    const charData = data as unknown as GrowthCharacter;
    const result = updateAttribute(charData, attrName, newValue);
    if (result.changes.length > 0) {
      onCharacterUpdate(node.id, result.character, result.changes);
    }
  }, [onCharacterUpdate, data, node.id]);

  // Helper to check conditions for a given attribute
  const getConditionState = (attrName: AttributeName) => {
    const conditionKey = CONDITION_KEYS[attrName];
    return {
      isConditioned: conditionKey ? !!(conditions as Record<string, boolean>)?.[conditionKey] : false,
      conditionLabel: CONDITION_LABELS[attrName],
    };
  };

  const handleBarDragState = useCallback((dragging: boolean) => {
    setIsBarDragging(dragging);
  }, []);

  return (
    <div className="relative" ref={cardRef}>
      <div
        className={`relative character-card text-white select-none ${isDragging ? 'cursor-grabbing scale-105' : 'cursor-grab'}`}
        style={{
          width: '1885px', willChange: 'transform', userSelect: 'none', transformOrigin: '960px 250px', transition: 'filter 0.2s',
          outline: isDropTarget ? '3px solid #4ade80' : 'none',
          borderRadius: isDropTarget ? '8px' : undefined,
          boxShadow: isDropTarget ? '0 0 40px rgba(74, 222, 128, 0.3)' : 'none',
          filter: isDragging
            ? 'drop-shadow(8px 16px 20px rgba(0, 0, 0, 0.7)) drop-shadow(4px 8px 10px rgba(0, 0, 0, 0.5))'
            : 'drop-shadow(3px 6px 12px rgba(0, 0, 0, 0.5)) drop-shadow(2px 3px 6px rgba(0, 0, 0, 0.3))',
        }}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
      >
        {/* ── Top Header Bar ── */}
        <div className="relative pr-1 flex items-stretch gap-0.5" style={{ height: '29px' }}>
          <div className="absolute bottom-0 left-0 border-b border-purple-500/40" style={{ width: 'calc(100% - 444px)' }} />
          <div style={{ width: '128px' }} />

          {/* Character Name */}
          <div className="px-3 flex justify-center overflow-visible relative" style={{
            backgroundColor: '#002f6c', width: '284px', height: '42px',
            borderLeft: '13px solid #22ab94', marginTop: '-13px'
          }}>
            {(() => {
              const fs = getNameFontSize(node.name);
              return (
                <div className="font-bold absolute whitespace-nowrap" style={{
                  color: '#ffcc78', fontFamily: 'var(--font-comfortaa), Comfortaa, sans-serif',
                  fontSize: `${fs}px`, lineHeight: `${fs}px`, bottom: '3px',
                }}>{node.name}</div>
              );
            })()}
          </div>

          {/* Buffer stripe */}
          <div className="flex flex-col" style={{ width: '10px', flexShrink: 0 }}>
            <div style={{ height: '14px', backgroundColor: '#22ab94' }} />
            <div style={{ height: '15px', backgroundColor: '#582a72' }} />
          </div>

          {/* Fate Die */}
          <div style={{ width: '154px', marginTop: '-10px' }}>
            <div className="px-2 py-1 flex items-center justify-center" style={{ backgroundColor: '#ffcc78', borderRadius: '4px' }}>
              <span style={{ color: 'white', fontSize: '18px', fontWeight: 'bold', fontFamily: 'Consolas, monospace' }}>
                &#x2B22;{seed?.baseFateDie?.replace('d', '') || '6'}
              </span>
            </div>
          </div>

          {/* Buffer */}
          <div className="flex flex-col" style={{ width: '13px' }}>
            <div style={{ height: '14px', backgroundColor: '#22ab94' }} />
            <div style={{ height: '15px', backgroundColor: '#582a72' }} />
          </div>

          {/* Wealth Level */}
          <div className="flex flex-col" style={{ width: '276px' }}>
            <div className="flex">
              <div className="px-2 py-1 text-white flex items-center justify-center flex-1" style={{ backgroundColor: '#f7525f', fontFamily: 'var(--font-comfortaa), Comfortaa, sans-serif', fontSize: '12px' }}>
                {levels?.wealthLevel || 4} - Baseline
              </div>
              <div className="flex items-center gap-2 py-1" style={{ backgroundColor: '#582a72', paddingLeft: '8px', paddingRight: '4px' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-center justify-center" style={{ width: '20px', height: '20px', border: '2px solid #ffcc78' }} onMouseDown={e => e.stopPropagation()}>
                    <div style={{ width: '10px', height: '10px', border: '1px solid #ffcc78' }} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ backgroundColor: '#22ab94', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: '12px', padding: '2px 0', color: 'white', textAlign: 'center', marginTop: '-2px', zIndex: 10, position: 'relative' }}>WEALTH LEVEL</div>
          </div>

          {/* Buffer */}
          <div className="flex flex-col" style={{ width: '13px' }}>
            <div style={{ height: '14px', backgroundColor: '#22ab94' }} />
            <div style={{ height: '15px', backgroundColor: '#582a72' }} />
          </div>

          {/* Tech Level */}
          <div className="flex flex-col" style={{ width: '276px' }}>
            <div className="flex">
              <div className="px-2 py-1 text-white flex items-center justify-center flex-1" style={{ backgroundColor: '#582a72', fontFamily: 'var(--font-comfortaa), Comfortaa, sans-serif', fontSize: '12px' }}>
                {levels?.techLevel || 4} - Baseline
              </div>
            </div>
            <div style={{ backgroundColor: '#22ab94', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: '12px', padding: '2px 0', color: 'white', textAlign: 'center' }}>TECH LEVEL</div>
          </div>

          {/* Buffer */}
          <div className="flex flex-col" style={{ width: '13px' }}>
            <div style={{ height: '14px', backgroundColor: '#22ab94' }} />
            <div style={{ height: '15px', backgroundColor: '#582a72' }} />
          </div>

          {/* Health Level */}
          <div className="flex flex-col" style={{ width: '276px' }}>
            <div className="flex">
              <div className="px-2 py-1 text-white flex items-center justify-center flex-1" style={{ backgroundColor: '#002f6c', fontFamily: 'var(--font-comfortaa), Comfortaa, sans-serif', fontSize: '12px' }}>
                {levels?.healthLevel || 4} - Baseline
              </div>
            </div>
            <div style={{ backgroundColor: '#22ab94', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: '12px', padding: '2px 0', color: 'white', textAlign: 'center' }}>HEALTH LEVEL</div>
          </div>

          {/* Buffer */}
          <div className="flex flex-col" style={{ width: '13px' }}>
            <div style={{ height: '14px', backgroundColor: '#22ab94' }} />
            <div style={{ height: '15px', backgroundColor: '#582a72' }} />
          </div>

          <div style={{ width: '59px' }} />
          <div style={{ width: '13px' }} />
        </div>

        {/* ── Fate Die label row ── */}
        <div className="flex items-stretch gap-0.5 pr-1" style={{ height: '55px' }}>
          <div style={{ width: '426px' }} />
          <div style={{ width: '10px' }} />
          <div className="flex items-center justify-center" style={{ width: '154px', height: '22px', backgroundColor: '#f7525f', marginLeft: '-3px' }}>
            <div style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: '14px', color: 'white', fontWeight: 'bold' }}>FATE DIE</div>
          </div>
          <div style={{ width: 'calc(100% - 426px - 10px - 154px - 444px)' }} />
          <div style={{ width: '444px' }} />
        </div>

        {/* ── Main Layout Grid ── */}
        <div className="relative pr-0.5 grid grid-cols-[416px_10px_1fr_59px_13px_444px] gap-0" style={{ zIndex: -10, maxHeight: '388px', overflow: 'visible' }}>
          {/* Semi-transparent background */}
          <div className="absolute pointer-events-none" style={{
            backgroundColor: 'rgba(0, 20, 40, 0.6)',
            left: '128px', width: 'calc(100% - 444px - 128px)',
            top: '-84px', bottom: 0, zIndex: -1
          }} />

          {/* Portrait Column */}
          <div className="relative" style={{
            marginTop: '-55px', marginLeft: '3px',
            paddingTop: '3px', paddingRight: '13px', paddingBottom: '3px', paddingLeft: '0',
            backgroundColor: '#ffcc78'
          }}>
            <div className="relative w-full h-full bg-gray-900 overflow-hidden" style={{ width: '400px' }}>
              {node.portrait ? (
                <img src={node.portrait} alt={node.name} className="w-full h-full object-cover" />
              ) : (
                <img src="/EmptyPortrait.png" alt="Empty Portrait" className="w-full h-full object-cover" />
              )}
            </div>
          </div>

          {/* Buffer stripe */}
          <div className="flex flex-col" style={{ width: '10px', flexShrink: 0, marginTop: '-55px' }}>
            <div style={{ height: '473px', backgroundColor: '#582a72' }} />
            <div style={{ height: '15px', backgroundColor: '#22ab94' }} />
            <div style={{ height: '3px', backgroundColor: '#ffcc78' }} />
          </div>

          {/* Horizontal connecting stripe */}
          <div className="absolute flex flex-col" style={{
            left: '426px', top: '388px', right: 'calc(59px + 13px + 444px + 2px)', height: '48px', zIndex: -1
          }}>
            <div style={{ height: '30px', backgroundColor: '#582a72' }} />
            <div style={{ height: '15px', backgroundColor: '#22ab94' }} />
            <div style={{ height: '3px', backgroundColor: '#ffcc78' }} />
          </div>

          {/* ── Middle Column ── */}
          <div className="flex flex-col">
            {/* Top section: SEED, ROOT, POSSESSIONS, Downtime, Age, Birthday */}
            <div className="flex gap-0.5 mb-2">
              <div className="space-y-0.5" style={{ width: '154px', marginLeft: '3px' }}>
                <div className="rounded border border-purple-500/40 p-2 flex flex-col items-center justify-center" style={{ backgroundColor: '#8e7cc3', height: 'calc(50% - 1px)' }}>
                  <div className="text-[11px] font-bold text-white text-center mb-0.5">{seed?.name || 'Human'}</div>
                  <div className="text-[8px] font-bold text-white">SEED</div>
                </div>
                <div className="rounded border border-red-500/40 p-2 flex flex-col items-center justify-center" style={{ backgroundColor: '#f7525f', height: 'calc(50% - 1px)' }}>
                  <div className="text-[11px] font-bold text-white text-center mb-0.5">{root?.name || 'Unknown'}</div>
                  <div className="text-[8px] font-bold text-white">ROOT</div>
                </div>
              </div>

              <div className="flex gap-0.5 flex-1">
                {/* Possessions */}
                <div className="rounded border border-blue-500/40 p-2 flex flex-col" style={{ backgroundColor: '#002f6c', width: '276px', marginLeft: '8px' }}>
                  <div className="text-xs font-bold text-white mb-1">POSSESSIONS</div>
                  <div className="overflow-y-auto flex-1">
                    {possessionsList.length > 0 ? possessionsList.map((item, i) => (
                      <div key={i} className="border border-white/20 px-2 py-1" style={{
                        backgroundColor: i % 2 === 0 ? '#8e7cc3' : '#b4a7d6', minHeight: '24px'
                      }}>
                        <div className="text-[10px] leading-relaxed" style={{ color: '#002f6c', fontWeight: '500' }}>{item}</div>
                      </div>
                    )) : (
                      <div className="text-[10px] text-white/50 italic">No possessions yet</div>
                    )}
                  </div>
                </div>

                {/* Downtime + Age/Birthday */}
                <div className="grid grid-cols-2 gap-0.5 flex-1">
                  <div className="space-y-0.5 h-full">
                    {[1, 2].map(n => (
                      <div key={n} className="rounded border border-teal-500/40 p-2 flex flex-col" style={{ backgroundColor: '#22ab94', height: 'calc(50% - 1px)' }}>
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-sm">&#x2699;&#xFE0F;</span>
                          <span className="text-[10px] font-bold text-white">{n}</span>
                        </div>
                        <div className="text-[8px] font-bold text-white mb-0.5">DOWNTIME TASK</div>
                        <div className="bg-white/10 border border-white/20 rounded px-1 py-1 flex-1">
                          <div className="text-[8px] text-white/60">Empty</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-0.5 h-full">
                    <div className="rounded border border-teal-500/40 p-1 flex flex-col justify-center items-center" style={{ backgroundColor: '#22ab94', height: 'calc(50% - 1px)' }}>
                      <div className="text-[8px] font-bold text-white">AGE</div>
                      <div className="text-sm font-bold text-white">{data?.age || '0'}</div>
                    </div>
                    <div className="rounded border border-purple-500/40 p-1 flex flex-col justify-center items-center" style={{ backgroundColor: '#8e7cc3', height: 'calc(50% - 1px)' }}>
                      <div className="text-[8px] font-bold text-white">BIRTHDAY</div>
                      <div className="text-[9px] font-bold text-white">{data?.birthday || '00/00/0000'}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── GRO.VINES section ── */}
            <div className="rounded border border-teal-500/40 p-3 flex flex-col" style={{ backgroundColor: '#22ab94' }}>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="rounded flex items-center justify-center" style={{ width: '141px', height: '31px', backgroundColor: '#002f6c', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: '24px', color: '#ffcc78' }}>GRO.VINES</div>
                <div className="flex justify-end">
                  <div className="rounded flex items-center justify-center" style={{ width: '141px', height: '31px', backgroundColor: '#f7525f', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: '24px', color: '#ffcc78' }}>OPPORTUNITIES</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 relative">
                {/* Purple separator */}
                <div className="absolute" style={{ width: '8px', backgroundColor: '#582a72', top: '-10px', bottom: '-3px', left: 'calc(50% - 11px)', zIndex: 10 }} />

                {/* Goals */}
                <div className="relative">
                  <div className="absolute rounded" style={{ borderTop: '18px solid #002f6c', borderBottom: '33px solid #002f6c', borderLeft: '3px solid #002f6c', borderRight: '7px solid #002f6c', top: '-10px', bottom: '-3px', left: '-3px', right: '7px', pointerEvents: 'none' }} />
                  <div className="relative" style={{ marginRight: '14px' }}>
                    {vines.map((vine, i) => (
                      <div key={i} className="border border-white/20 flex relative items-center" style={{
                        backgroundColor: i % 2 === 0 ? '#ea9999' : '#f4cccc', minHeight: '40px'
                      }}>
                        <div className="absolute flex items-center justify-center" style={{
                          width: '20px', height: '20px', top: '-1px', left: '-2px',
                          backgroundColor: '#002f6c', color: '#ffffff', fontSize: '10px', fontWeight: 'bold'
                        }}>{i + 1}</div>
                        <span className="px-2 py-2 pl-8 text-[10px]" style={{ color: '#582a72' }}>{vine.goal || '...'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Opportunities */}
                <div className="relative">
                  <div className="absolute rounded" style={{ borderTop: '18px solid #f7525f', borderBottom: '33px solid #f7525f', borderLeft: '7px solid #f7525f', borderRight: '3px solid #f7525f', top: '-10px', bottom: '-3px', left: '-7px', right: '-3px', pointerEvents: 'none' }} />
                  <div className="relative">
                    {vines.map((vine, i) => (
                      <div key={i} className="border border-white/20 flex relative items-center" style={{
                        backgroundColor: i % 2 === 0 ? '#6fa8dc' : '#9fc5e8', minHeight: '40px'
                      }}>
                        <span className="px-2 py-2 text-xs text-white flex-1">{vine.opportunity || '...'}</span>
                        {vine.kv && (
                          <span className="px-2 py-1 mr-1" style={{
                            fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: '10px',
                            color: '#ffcc78', backgroundColor: '#582a72', borderRadius: '2px'
                          }}>+{vine.kv} KV</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Actions Column with ComplexTooltip ── */}
          <div className="relative flex flex-col gap-1" style={{ marginTop: '13px', width: '59px' }}>
            <ComplexTooltip title="Body Actions" baseValue={bodyAction} modifiers={[
              { name: 'Clout', value: attributes?.clout?.current || 0 },
              { name: 'Celerity', value: attributes?.celerity?.current || 0 },
              { name: 'Constitution', value: attributes?.constitution?.current || 0 },
            ]} totalValue={bodyAction}>
              <div className="border border-red-500/40 p-1 flex flex-col items-center justify-center cursor-help" style={{ backgroundColor: '#ea9999', height: '96px', marginBottom: '81px' }}>
                <div className="text-lg mb-1 font-bold text-white">[&#8756;]</div>
                <div className="px-2 py-1 rounded border-2 flex items-center justify-center" style={{ borderColor: '#ffcc78', backgroundColor: 'rgba(0, 0, 0, 0.2)' }}>
                  <div style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: '14px', color: 'white', fontWeight: 'bold' }}>{bodyAction}</div>
                </div>
              </div>
            </ComplexTooltip>

            <ComplexTooltip title="Soul Actions" baseValue={soulAction} modifiers={[
              { name: 'Willpower', value: attributes?.willpower?.current || 0 },
              { name: 'Wisdom', value: attributes?.wisdom?.current || 0 },
              { name: 'Wit', value: attributes?.wit?.current || 0 },
            ]} totalValue={soulAction}>
              <div className="border border-purple-500/40 p-1 flex flex-col items-center justify-center cursor-help" style={{ backgroundColor: '#8e7cc3', height: '96px', marginBottom: '81px' }}>
                <div className="text-lg mb-1 font-bold text-white">[&#8756;]</div>
                <div className="px-2 py-1 rounded border-2 flex items-center justify-center" style={{ borderColor: '#ffcc78', backgroundColor: 'rgba(0, 0, 0, 0.2)' }}>
                  <div style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: '14px', color: 'white', fontWeight: 'bold' }}>{soulAction}</div>
                </div>
              </div>
            </ComplexTooltip>

            <ComplexTooltip title="Spirit Actions" baseValue={spiritAction} modifiers={[
              { name: 'Flow', value: attributes?.flow?.current || 0 },
              { name: 'Frequency', value: attributes?.frequency?.current || 0 },
              { name: 'Focus', value: attributes?.focus?.current || 0 },
            ]} totalValue={spiritAction}>
              <div className="border border-blue-500/40 p-1 flex flex-col items-center justify-center cursor-help" style={{ backgroundColor: '#6fa8dc', height: '96px' }}>
                <div className="text-lg mb-1 font-bold text-white">[&#8756;]</div>
                <div className="px-2 py-1 rounded border-2 flex items-center justify-center" style={{ borderColor: '#ffcc78', backgroundColor: 'rgba(0, 0, 0, 0.2)' }}>
                  <div style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: '14px', color: 'white', fontWeight: 'bold' }}>{spiritAction}</div>
                </div>
              </div>
            </ComplexTooltip>

            {/* Vertical connector cables between action boxes */}
            {/* Body to Soul */}
            <div className="absolute overflow-hidden" style={{ top: '96px', left: '50%', transform: 'translateX(-50%) translateX(8px)', width: '13px', height: '86px', zIndex: 5 }}>
              <div className="absolute inset-0" style={{ backgroundColor: 'rgba(234, 153, 153, 0.3)', borderLeft: '2px solid rgba(234, 153, 153, 0.6)', borderRight: '2px solid rgba(234, 153, 153, 0.6)' }} />
              {isInViewport && Array.from({ length: 5 }, (_, i) => (
                <div key={i} style={{ position: 'absolute', top: 0, left: '50%', fontSize: `${6 - (i % 2)}px`, color: '#ea9999', opacity: 1 - i * 0.1, animation: `characterCardParticleDown 2.4s ${i * 0.48}s linear infinite`, willChange: 'transform' }}>&#8853;</div>
              ))}
            </div>
            {/* Soul to Body */}
            <div className="absolute overflow-hidden" style={{ top: '96px', left: '50%', transform: 'translateX(-50%) translateX(-8px)', width: '13px', height: '86px', zIndex: 5 }}>
              <div className="absolute inset-0" style={{ backgroundColor: 'rgba(142, 124, 195, 0.3)', borderLeft: '2px solid rgba(142, 124, 195, 0.6)', borderRight: '2px solid rgba(142, 124, 195, 0.6)' }} />
              {isInViewport && Array.from({ length: 5 }, (_, i) => (
                <div key={i} style={{ position: 'absolute', bottom: 0, left: '50%', fontSize: `${6 - (i % 2)}px`, color: '#8e7cc3', opacity: 1 - i * 0.1, animation: `characterCardParticleUp 2.4s ${i * 0.48}s linear infinite`, willChange: 'transform' }}>&#8853;</div>
              ))}
            </div>
            {/* Spirit to Soul */}
            <div className="absolute overflow-hidden" style={{ top: '277px', left: '50%', transform: 'translateX(-50%) translateX(-8px)', width: '13px', height: '85px', zIndex: 5 }}>
              <div className="absolute inset-0" style={{ backgroundColor: 'rgba(111, 168, 220, 0.3)', borderLeft: '2px solid rgba(111, 168, 220, 0.6)', borderRight: '2px solid rgba(111, 168, 220, 0.6)' }} />
              {isInViewport && Array.from({ length: 5 }, (_, i) => (
                <div key={i} style={{ position: 'absolute', bottom: 0, left: '50%', fontSize: `${6 - (i % 2)}px`, color: '#6fa8dc', opacity: 1 - i * 0.1, animation: `characterCardParticleUp 2.6s ${i * 0.52}s linear infinite`, willChange: 'transform' }}>&#8853;</div>
              ))}
            </div>
            {/* Soul to Spirit */}
            <div className="absolute overflow-hidden" style={{ top: '277px', left: '50%', transform: 'translateX(-50%) translateX(8px)', width: '13px', height: '85px', zIndex: 5 }}>
              <div className="absolute inset-0" style={{ backgroundColor: 'rgba(142, 124, 195, 0.3)', borderLeft: '2px solid rgba(142, 124, 195, 0.6)', borderRight: '2px solid rgba(142, 124, 195, 0.6)' }} />
              {isInViewport && Array.from({ length: 5 }, (_, i) => (
                <div key={i} style={{ position: 'absolute', top: 0, left: '50%', fontSize: `${6 - (i % 2)}px`, color: '#8e7cc3', opacity: 1 - i * 0.1, animation: `characterCardParticleDown 2.2s ${i * 0.44}s linear infinite`, willChange: 'transform' }}>&#8853;</div>
              ))}
            </div>
          </div>

          {/* ── Tech cable connectors (13px between Actions and Attributes) ── */}
          <div className="space-y-1 flex flex-col justify-start" style={{ width: '13px', flexShrink: 0, marginTop: '-27px' }}>
            {[
              { color: '#f7525f', h: '176px' },
              { color: '#8e7cc3', h: '176px' },
              { color: '#6fa8dc', h: '176px' },
            ].map((cable, i) => (
              <div key={i} className="flex items-center justify-center overflow-hidden" style={{ height: cable.h }}>
                <div className="relative" style={{ width: '13px', height: '32px' }}>
                  <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse, ${cable.color}80 0%, transparent 70%)`, filter: 'blur(6px)' }} />
                  <div className="absolute inset-0 overflow-hidden" style={{
                    backgroundColor: `${cable.color}66`,
                    borderTop: `2px solid ${cable.color}b3`,
                    borderBottom: `2px solid ${cable.color}b3`,
                    boxShadow: `0 0 20px ${cable.color}b3, inset 0 2px 4px rgba(255, 255, 255, 0.4), inset 0 -2px 4px rgba(0, 0, 0, 0.6)`
                  }}>
                    <div className="absolute top-0 left-0 h-full" style={{
                      width: '200%', background: `linear-gradient(90deg, transparent 0%, ${cable.color}b3 25%, ${cable.color} 50%, ${cable.color}b3 75%, transparent 100%)`,
                      animation: `characterCardFlowRight ${1.8 + i * 0.4}s linear infinite`
                    }} />
                    <div className="absolute top-0 left-0 h-full" style={{
                      width: '150%', background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.5) 50%, transparent 100%)',
                      animation: `characterCardFlowRight ${3 + i * 0.5}s linear infinite`, opacity: 0.7
                    }} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── TKV Box (centered under portrait) ── */}
          <div className="absolute flex flex-col" style={{ backgroundColor: '#b4a7d6', height: '62px', width: '180px', left: '120px', top: '530px', border: '3px solid #ffcc78', zIndex: 10 }}>
            <div className="w-full flex items-center justify-center" style={{ backgroundColor: '#f7525f', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: '24px', color: '#ffcc78', height: '28px' }}>T&#x049C;V</div>
            <div className="w-full flex items-center justify-center" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: '19px', color: '#582a72', height: '34px' }}>{tkv}</div>
          </div>

          {/* ── RIGHT COLUMN: Attributes — HORIZONTAL BAR DESIGN ── */}
          <div style={{ marginTop: '-84px', width: '444px' }}>
            {/* Purple buffer */}
            <div style={{ height: '14px', backgroundColor: '#582a72' }} />

            {/* ATTRIBUTES Label */}
            <div className="flex items-center justify-center" style={{ backgroundColor: '#002f6c', width: '444px', height: '39px' }}>
              <div style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: '24px', color: '#ffcc78', fontWeight: 'bold' }}>ATTRIBUTES</div>
            </div>

            {/* Attribute pillars */}
            <div className="space-y-1" style={{ marginTop: '4px' }}>
              {/* BODY */}
              <div className="border border-red-500/40 p-3 flex flex-col" style={{ backgroundColor: '#f7525f', height: '176px' }}>
                <div className="text-sm font-bold text-white mb-2" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>&#x1F714; BODY</div>
                <ComplexTooltip disabled={isBarDragging} title="Clout" baseValue={attributes?.clout?.level || 0} currentValue={attributes?.clout?.current || 0} modifiers={buildAttrModifiers(attributes?.clout)} totalValue={getAttrMax(attributes?.clout)}>
                  <HBar label="CLT" attrName="clout" current={attributes?.clout?.current || 0} max={getAttrMax(attributes?.clout)} onAttributeChange={handleAttributeChange} onDragStateChange={handleBarDragState} {...getConditionState('clout')} />
                </ComplexTooltip>
                <ComplexTooltip disabled={isBarDragging} title="Celerity" baseValue={attributes?.celerity?.level || 0} currentValue={attributes?.celerity?.current || 0} modifiers={buildAttrModifiers(attributes?.celerity)} totalValue={getAttrMax(attributes?.celerity)}>
                  <HBar label="CEL" attrName="celerity" current={attributes?.celerity?.current || 0} max={getAttrMax(attributes?.celerity)} onAttributeChange={handleAttributeChange} onDragStateChange={handleBarDragState} {...getConditionState('celerity')} />
                </ComplexTooltip>
                <ComplexTooltip disabled={isBarDragging} title="Constitution" baseValue={attributes?.constitution?.level || 0} currentValue={attributes?.constitution?.current || 0} modifiers={buildAttrModifiers(attributes?.constitution)} totalValue={getAttrMax(attributes?.constitution)}>
                  <HBar label="CON" attrName="constitution" current={attributes?.constitution?.current || 0} max={getAttrMax(attributes?.constitution)} isLast onAttributeChange={handleAttributeChange} onDragStateChange={handleBarDragState} {...getConditionState('constitution')} />
                </ComplexTooltip>
              </div>

              {/* SPIRIT (Flow/Frequency/Focus) */}
              <div className="border border-purple-500/40 p-3 flex flex-col" style={{ backgroundColor: '#582a72', height: '176px' }}>
                <div className="text-sm font-bold text-white mb-2" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>&#x1F70E; SPIRIT</div>
                <ComplexTooltip disabled={isBarDragging} title="Flow" baseValue={attributes?.flow?.level || 0} currentValue={attributes?.flow?.current || 0} modifiers={buildAttrModifiers(attributes?.flow)} totalValue={getAttrMax(attributes?.flow)}>
                  <HBar label="FLO" attrName="flow" current={attributes?.flow?.current || 0} max={getAttrMax(attributes?.flow)} onAttributeChange={handleAttributeChange} onDragStateChange={handleBarDragState} {...getConditionState('flow')} />
                </ComplexTooltip>
                <ComplexTooltip disabled={isBarDragging} title="Frequency" baseValue={attributes?.frequency?.level || 0} currentValue={attributes?.frequency?.current || 0} modifiers={[]} totalValue={attributes?.frequency?.level || 20}>
                  <HBar label="FREQ" attrName="frequency" current={attributes?.frequency?.current || 0} max={attributes?.frequency?.level || 20} isFrequency onAttributeChange={handleAttributeChange} onDragStateChange={handleBarDragState} {...getConditionState('frequency')} />
                </ComplexTooltip>
                <ComplexTooltip disabled={isBarDragging} title="Focus" baseValue={attributes?.focus?.level || 0} currentValue={attributes?.focus?.current || 0} modifiers={buildAttrModifiers(attributes?.focus)} totalValue={getAttrMax(attributes?.focus)}>
                  <HBar label="FOC" attrName="focus" current={attributes?.focus?.current || 0} max={getAttrMax(attributes?.focus)} isLast onAttributeChange={handleAttributeChange} onDragStateChange={handleBarDragState} {...getConditionState('focus')} />
                </ComplexTooltip>
              </div>

              {/* SOUL (Willpower/Wisdom/Wit) */}
              <div className="border border-blue-500/40 p-3 flex flex-col" style={{ backgroundColor: '#002f6c', height: '176px' }}>
                <div className="text-sm font-bold text-white mb-2" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>&#x1F70D; SOUL</div>
                <ComplexTooltip disabled={isBarDragging} title="Willpower" baseValue={attributes?.willpower?.level || 0} currentValue={attributes?.willpower?.current || 0} modifiers={buildAttrModifiers(attributes?.willpower)} totalValue={getAttrMax(attributes?.willpower)}>
                  <HBar label="WIL" attrName="willpower" current={attributes?.willpower?.current || 0} max={getAttrMax(attributes?.willpower)} onAttributeChange={handleAttributeChange} onDragStateChange={handleBarDragState} {...getConditionState('willpower')} />
                </ComplexTooltip>
                <ComplexTooltip disabled={isBarDragging} title="Wisdom" baseValue={attributes?.wisdom?.level || 0} currentValue={attributes?.wisdom?.current || 0} modifiers={buildAttrModifiers(attributes?.wisdom)} totalValue={getAttrMax(attributes?.wisdom)}>
                  <HBar label="WIS" attrName="wisdom" current={attributes?.wisdom?.current || 0} max={getAttrMax(attributes?.wisdom)} onAttributeChange={handleAttributeChange} onDragStateChange={handleBarDragState} {...getConditionState('wisdom')} />
                </ComplexTooltip>
                <ComplexTooltip disabled={isBarDragging} title="Wit" baseValue={attributes?.wit?.level || 0} currentValue={attributes?.wit?.current || 0} modifiers={buildAttrModifiers(attributes?.wit)} totalValue={getAttrMax(attributes?.wit)}>
                  <HBar label="WIT" attrName="wit" current={attributes?.wit?.current || 0} max={getAttrMax(attributes?.wit)} isLast onAttributeChange={handleAttributeChange} onDragStateChange={handleBarDragState} {...getConditionState('wit')} />
                </ComplexTooltip>
              </div>
            </div>
          </div>
        </div>

        {/* ── CSS Animations ── */}
        <style>{`
          @keyframes characterCardFlowRight {
            0% { transform: translateX(-50%); }
            100% { transform: translateX(0%); }
          }
          @keyframes characterCardParticleDown {
            0% { transform: translate3d(-50%, -15px, 0) scale(0.8) rotate(0deg); opacity: 1; }
            25% { transform: translate3d(-50.5%, 18px, 0) scale(1.1) rotate(90deg); opacity: 1; }
            50% { transform: translate3d(-50%, 45px, 0) scale(0.95) rotate(180deg); opacity: 1; }
            75% { transform: translate3d(-49.5%, 70px, 0) scale(1.05) rotate(270deg); opacity: 1; }
            95% { transform: translate3d(-50%, 90px, 0) scale(0.8) rotate(350deg); opacity: 0.5; }
            100% { transform: translate3d(-50%, 96px, 0) scale(0.6) rotate(360deg); opacity: 0; }
          }
          @keyframes characterCardConditionPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          @keyframes characterCardParticleUp {
            0% { transform: translate3d(-50%, 15px, 0) scale(0.8) rotate(0deg); opacity: 1; }
            25% { transform: translate3d(-50%, -18px, 0) scale(1.1) rotate(-90deg); opacity: 1; }
            50% { transform: translate3d(-49.5%, -45px, 0) scale(0.95) rotate(-180deg); opacity: 1; }
            75% { transform: translate3d(-50%, -70px, 0) scale(1.05) rotate(-270deg); opacity: 1; }
            95% { transform: translate3d(-50%, -90px, 0) scale(0.8) rotate(-350deg); opacity: 0.5; }
            100% { transform: translate3d(-50%, -96px, 0) scale(0.6) rotate(-360deg); opacity: 0; }
          }
        `}</style>

        {/* Sub-panel toggle buttons — single row along bottom edge */}
        {isExpanded && (() => {
          const btnStyle = (isOpen: boolean) => ({
            height: '26px', padding: '0 10px',
            backgroundColor: isOpen ? '#22c55e' : '#582a72',
            border: `2px solid ${isOpen ? '#4ade80' : '#ffcc78'}`,
            borderRadius: '0 0 4px 4px',
            color: 'white',
            fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
            fontSize: '11px',
            letterSpacing: '0.08em',
            justifyContent: 'center' as const,
          });
          const Btn = ({ icon, label, isOpen, onClick }: { icon: string; label: string; isOpen: boolean; onClick: () => void }) => (
            <button
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex items-center gap-1 hover:brightness-110 transition-all cursor-pointer shadow-lg"
              style={btnStyle(isOpen)}
            >
              <span>{icon}</span>
              <span>{label}</span>
              <span
                data-panel-circle={label.toLowerCase()}
                style={{
                  width: '10px', height: '10px', borderRadius: '50%', marginLeft: '2px', flexShrink: 0,
                  border: `2px solid ${isOpen ? '#4ade80' : '#ffcc78'}`,
                  backgroundColor: 'transparent',
                }}
              />
            </button>
          );
          const panels = [
            ...(onInventoryToggle ? [{ key: '_inv', icon: '\uD83C\uDF92', label: 'INVENTORY', isOpen: showInventory, onClick: () => onInventoryToggle(node.id) }] : []),
            ...(onPanelToggle ? [
              { key: 'vitals', icon: '\u2695', label: 'VITALS', isOpen: openPanels?.has('vitals') || false, onClick: () => onPanelToggle(node.id, 'vitals') },
              { key: 'traits', icon: '\u2736', label: 'TRAITS', isOpen: openPanels?.has('traits') || false, onClick: () => onPanelToggle(node.id, 'traits') },
              { key: 'skills', icon: '\u2605', label: 'SKILLS', isOpen: openPanels?.has('skills') || false, onClick: () => onPanelToggle(node.id, 'skills') },
              { key: 'magic', icon: '\u2728', label: 'MAGIC', isOpen: openPanels?.has('magic') || false, onClick: () => onPanelToggle(node.id, 'magic') },
              { key: 'backstory', icon: '\u270E', label: 'BACKSTORY', isOpen: openPanels?.has('backstory') || false, onClick: () => onPanelToggle(node.id, 'backstory') },
              { key: 'harvests', icon: '\u2618', label: 'HARVESTS', isOpen: openPanels?.has('harvests') || false, onClick: () => onPanelToggle(node.id, 'harvests') },
            ] : []),
          ];
          return (
            <div className="absolute flex gap-1" style={{ top: '515px', left: '436px', zIndex: 20 }}>
              {panels.map(p => (
                <Btn key={p.key} icon={p.icon} label={p.label} isOpen={p.isOpen} onClick={p.onClick} />
              ))}
            </div>
          );
        })()}

        {/* Collapse Button — bottom-right corner of attributes panel */}
        {onToggleExpand && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id); }}
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute bg-purple-600 hover:bg-purple-500 rounded-full flex items-center justify-center text-white cursor-pointer transition-all shadow-lg hover:shadow-xl"
            style={{ width: '36px', height: '36px', top: '574px', right: '-15px', fontSize: '24px', lineHeight: '1', zIndex: 10 }}
            title="Compact character sheet"
          >&#8855;</button>
        )}
      </div>
      {contextMenu}
    </div>
  );
};

CharacterCard.displayName = 'CharacterCard';

export default React.memo(CharacterCard, (prev, next) => (
  prev.node.id === next.node.id &&
  prev.node.x === next.node.x &&
  prev.node.y === next.node.y &&
  prev.node.characterData === next.node.characterData &&
  prev.isExpanded === next.isExpanded &&
  prev.showInventory === next.showInventory &&
  prev.isDropTarget === next.isDropTarget &&
  prev.openPanels === next.openPanels
));
