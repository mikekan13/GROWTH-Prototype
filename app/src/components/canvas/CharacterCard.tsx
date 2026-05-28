"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { ComplexTooltip } from '@/components/ui/ComplexTooltip';
import { CtxMenuPanel, CtxMenuStreamLabel } from '@/components/ui/ContextMenu';

/** Inline copy of the campaign roster option — kept inline to avoid a
 *  cross-file import cycle through CampaignCanvas/RelationsCanvas. */
export interface TrailblazerOption {
  userId: string;
  username: string;
}
import type { HeldItemData } from '@/types/item';
import { updateAttribute, type AttributeName } from '@/lib/character-actions';
import { parseDie } from '@/lib/dice-utils';
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
  /** True if the character has a GodHead row attached (persona + memory exists). */
  hasAIPersona?: boolean;
  /** True if AI is currently choosing actions for this character. Toggled from
   *  the canvas card by the GM. Memory keeps capturing regardless. */
  aiActionMode?: boolean;
  /** Character.userId — the human currently assigned to control this character
   *  (when aiActionMode is false). Either the GM or a campaign trailblazer. */
  controllerUserId?: string;
  characterData?: {
    identity?: { name?: string };
    tkv?: number | string;

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
  folderId?: string | null;
  onRemoveFromFolder?: (folderId: string, nodeId: string) => void;
  /** GM-only: initiate a skill check against this character */
  onSkillCheck?: (characterId: string, skillName: string | undefined, attributeName: string | undefined, dr: number, revealDR: boolean) => void;
  /** GM-only: initiate a contested check with this character as attacker */
  onContestedCheck?: (characterId: string, characterName: string, skillName: string, governors: string[], revealDR: boolean) => void;
  /** When set, this card is a potential defender target — show defender skill picker on right-click */
  contestedAttackerId?: string;
  /** Callback when this card is selected as defender */
  onContestedDefenderSelect?: (characterId: string, characterName: string, skillName: string, governors: string[]) => void;
  /** Whether the current viewer is a GM */
  isGM?: boolean;
  /** Campaign roster for the controller dropdown. GM-only feature. */
  trailblazers?: TrailblazerOption[];
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

  // Use state for drag tracking to avoid ref-during-render lint errors
  const [isDragging, setIsDragging] = useState(false);

  const handleLeverMouseDown = useCallback((e: React.MouseEvent) => {
    if (!editable || !barRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    onDragStateChange?.(true);

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
      setIsDragging(false);
      onDragStateChange?.(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [editable, attrName, max, onAttributeChange, onDragStateChange]);

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
  folderId,
  onRemoveFromFolder,
  onSkillCheck,
  onContestedCheck,
  contestedAttackerId,
  onContestedDefenderSelect,
  isGM,
  trailblazers,
}) => {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [isBarDragging, setIsBarDragging] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [controllerSaving, setControllerSaving] = useState(false);
  const [controllerMenuOpen, setControllerMenuOpen] = useState(false);
  const [controllerMenuPos, setControllerMenuPos] = useState({ x: 0, y: 0 });
  const controllerMenuRef = useRef<HTMLDivElement | null>(null);
  const [showSkillCheckMenu, setShowSkillCheckMenu] = useState(false);
  const [showContestedMenu, setShowContestedMenu] = useState(false);
  const [showDefenderMenu, setShowDefenderMenu] = useState(false);
  const [skillCheckDR, setSkillCheckDR] = useState(10);
  const [skillCheckRevealDR, setSkillCheckRevealDR] = useState(false);
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

  // ── Hooks that must run unconditionally (before any early return) ─────────

  const handleAttributeChange = useCallback((attrName: AttributeName, newValue: number) => {
    if (!onCharacterUpdate || !node?.characterData) return;
    const charData = node.characterData as unknown as GrowthCharacter;
    const result = updateAttribute(charData, attrName, newValue);
    if (result.changes.length > 0) {
      onCharacterUpdate(node.id, result.character, result.changes);
    }
  }, [onCharacterUpdate, node]);

  const handleBarDragState = useCallback((dragging: boolean) => {
    setIsBarDragging(dragging);
  }, []);

  // Open the terminal-styled controller menu anchored near the pill click.
  const handleControllerClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (controllerSaving) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setControllerMenuPos({ x: rect.left, y: rect.bottom + 4 });
    setControllerMenuOpen(true);
  }, [controllerSaving]);

  // Apply a controller selection (AI / GM / specific trailblazer). PATCHes
  // the controller endpoint, refreshes the canvas data on success.
  const applyController = useCallback(async (
    payload: { controller: 'AI' } | { controller: 'GM' } | { controller: 'PLAYER'; userId: string },
  ) => {
    setControllerSaving(true);
    try {
      const res = await fetch(`/api/characters/${node.id}/controller`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error('Controller change failed', await res.text());
        return;
      }
      router.refresh();
    } finally {
      setControllerSaving(false);
      setControllerMenuOpen(false);
    }
  }, [node.id, router]);

  // Outside-click closes the controller menu.
  useEffect(() => {
    if (!controllerMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (controllerMenuRef.current && !controllerMenuRef.current.contains(e.target as Node)) {
        setControllerMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [controllerMenuOpen]);

  if (!node?.id || !node?.name) return null;

  const data = node.characterData;

  const attributes = data?.attributes;
  const conditions = data?.conditions;
  const seed = data?.creation?.seed;
  const root = data?.creation?.root;
  const grovines = data?.grovines || [];
  const tkv = data?.tkv || 0;

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!onDelete && !onSkillCheck && !onContestedCheck) return;
    // Don't open context menu in defender selection mode
    if (contestedAttackerId) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.pageX, y: e.pageY });
    setShowContextMenu(true);
    setShowSkillCheckMenu(false);
    setShowContestedMenu(false);
    setShowDefenderMenu(false);
  };

  // In contested mode, left-click selects this card as defender
  const handleContestedClick = (e: React.MouseEvent) => {
    if (!contestedAttackerId || contestedAttackerId === node.id || !onContestedDefenderSelect) return;
    e.preventDefault();
    e.stopPropagation();
    // Fire callback with character info — parent opens the defender picker modal
    onContestedDefenderSelect(node.id, node.name, '', []);
  };

  // Drag handler — updates parent with SVG coordinate offsets
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // In contested mode, left-click selects defender instead of dragging
    if (contestedAttackerId && onContestedDefenderSelect) {
      if (contestedAttackerId !== node.id) {
        handleContestedClick(e);
      }
      // Block dragging for all cards in contested mode
      return;
    }
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

  const skills = (Array.isArray(data?.skills) ? data.skills : []) as Array<{ name: string; level: number; governors?: string[] }>;

  const contextMenu = showContextMenu && typeof window !== 'undefined' && createPortal(
    <div
      ref={contextMenuRef}
      className="fixed z-50"
      style={{ left: `${contextMenuPos.x}px`, top: `${contextMenuPos.y}px` }}
    >
      <CtxMenuStreamLabel />
      <CtxMenuPanel>
        {/* Main menu buttons — hidden when a sub-picker is open */}
        {isGM && !showSkillCheckMenu && !showContestedMenu && !showDefenderMenu && (
          <>
            {onSkillCheck && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowSkillCheckMenu(true); }}
                className="w-full px-3 py-1.5 text-left text-sm text-[#22ab94] hover:bg-white/10 font-[Consolas,monospace] flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                sKILL cHECK
              </button>
            )}
            {onContestedCheck && skills.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowContestedMenu(true); }}
                className="w-full px-3 py-1.5 text-left text-sm text-[#D0A030] hover:bg-white/10 font-[Consolas,monospace] flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                cONTESTED
              </button>
            )}
          </>
        )}
        {/* Contested skill picker — attacker picks skill, no DR */}
        {isGM && onContestedCheck && showContestedMenu && (
          <div className="px-3 py-2 space-y-1" style={{ width: '220px' }} onClick={e => e.stopPropagation()}>
            <div className="text-[10px] tracking-[0.15em] uppercase text-[#D0A030] font-[Consolas,monospace] mb-1">
              CONTEST AS — {node.name}
            </div>
            <label className="flex items-center gap-1 cursor-pointer mb-1" onClick={e => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={skillCheckRevealDR}
                onChange={e => setSkillCheckRevealDR(e.target.checked)}
                className="w-3 h-3 accent-[#D0A030]"
              />
              <span className="text-[9px] text-white/40 font-[Consolas,monospace]">REVEAL TOTALS</span>
            </label>
            {skills.map(s => (
              <button
                key={s.name}
                onClick={() => {
                  setShowContextMenu(false);
                  setShowContestedMenu(false);
                  onContestedCheck(node.id, node.name, s.name, s.governors || [], skillCheckRevealDR);
                }}
                className="w-full px-1.5 py-0.5 text-left text-xs hover:bg-[#D0A030]/20 font-[Consolas,monospace] flex items-center justify-between"
                style={{ color: '#D0A030' }}
              >
                <span>{s.name}</span>
                <span className="text-[9px]" style={{ color: '#D0A03080' }}>
                  {(s.governors || []).join('/')}
                </span>
              </button>
            ))}
            {/* Unskilled contest — raw attribute */}
            <div className="border-t border-white/10 pt-1 mt-1">
              <div className="text-[8px] text-white/30 font-[Consolas,monospace] mb-0.5">UNSKILLED</div>
              <div className="grid grid-cols-3 gap-x-1">
                {[
                  { label: 'BODY', color: '#E8585A', attrs: ['clout', 'celerity', 'constitution'] },
                  { label: 'SPIRIT', color: '#8e7cc3', attrs: ['flow', 'focus'] },
                  { label: 'SOUL', color: '#4080D0', attrs: ['willpower', 'wisdom', 'wit'] },
                ].map(p => (
                  <div key={p.label} className="flex flex-col">
                    {p.attrs.map(attr => (
                      <button
                        key={attr}
                        onClick={() => {
                          setShowContextMenu(false);
                          setShowContestedMenu(false);
                          onContestedCheck(node.id, node.name, `raw:${attr}`, [attr], skillCheckRevealDR);
                        }}
                        className="px-0.5 py-0 text-left text-[10px] hover:bg-white/10 font-[Consolas,monospace]"
                        style={{ color: p.color }}
                      >
                        {attr.slice(0, 3).toUpperCase()}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {/* Skill Check Picker (replaces menu items when open) */}
        {isGM && onSkillCheck && showSkillCheckMenu && (() => {
          const fateDie = data?.creation?.seed?.baseFateDie as string || 'd6';
          const fdMax = parseDie(fateDie);
          return (
          <div className="px-3 py-2 space-y-1" style={{ width: '220px' }} onClick={e => e.stopPropagation()}>
            <div className="text-[10px] tracking-[0.15em] uppercase text-[#22ab94] font-[Consolas,monospace] mb-1">
              {node.name} — {fateDie.toUpperCase()}
            </div>
            {/* DR input + reveal toggle — compact single row */}
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] text-white/50 font-[Consolas,monospace]">DR</span>
              <input
                type="number"
                min={1}
                max={40}
                value={skillCheckDR}
                onChange={e => setSkillCheckDR(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-12 text-xs px-1 py-0.5 text-white font-[Consolas,monospace] border border-[#22ab94]/40 bg-black/60 rounded-none outline-none focus:border-[#22ab94]"
              />
              <label className="flex items-center gap-1 cursor-pointer" onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={skillCheckRevealDR}
                  onChange={e => setSkillCheckRevealDR(e.target.checked)}
                  className="w-3 h-3 accent-[#22ab94]"
                />
                <span className="text-[9px] text-white/40 font-[Consolas,monospace]">SHOW</span>
              </label>
            </div>
            {/* Skill buttons with max possible */}
            {skills.map((s: { name: string; level: number; governors?: string[] }) => {
              const maxPossible = fdMax + s.level;
              const impossible = skillCheckDR > maxPossible;
              return (
                <button
                  key={s.name}
                  onClick={() => {
                    setShowContextMenu(false);
                    setShowSkillCheckMenu(false);
                    onSkillCheck(node.id, s.name, undefined, skillCheckDR, skillCheckRevealDR);
                  }}
                  className="w-full px-1.5 py-0.5 text-left text-xs hover:bg-[#22ab94]/20 font-[Consolas,monospace] flex items-center justify-between"
                  style={{ color: impossible ? '#ff6666' : 'rgba(255,255,255,0.8)' }}
                >
                  <span>{s.name}</span>
                  <span className="text-[9px]" style={{ color: impossible ? '#ff666680' : 'rgba(255,255,255,0.4)' }}>
                    {s.level} /{maxPossible}{impossible ? ' ✗' : ''}
                  </span>
                </button>
              );
            })}
            {/* Unskilled divider + raw attribute options */}
            <div className="border-t border-white/10 pt-1 mt-1">
              <div className="text-[8px] text-white/30 font-[Consolas,monospace] mb-0.5">UNSKILLED (MAX:{fdMax})</div>
              {(() => {
                const impossible = skillCheckDR > fdMax;
                const pillars = [
                  { label: 'BODY', color: '#E8585A', attrs: [{ key: 'clout', label: 'CLO' }, { key: 'celerity', label: 'CEL' }, { key: 'constitution', label: 'CON' }] },
                  { label: 'SPIRIT', color: '#8e7cc3', attrs: [{ key: 'flow', label: 'FLO' }, { key: 'focus', label: 'FOC' }] },
                  { label: 'SOUL', color: '#4080D0', attrs: [{ key: 'willpower', label: 'WIL' }, { key: 'wisdom', label: 'WIS' }, { key: 'wit', label: 'WIT' }] },
                ];
                return (
                  <div className="grid grid-cols-3 gap-x-1">
                    {pillars.map(p => (
                      <div key={p.label} className="flex flex-col">
                        {p.attrs.map(a => (
                          <button
                            key={a.key}
                            onClick={() => {
                              setShowContextMenu(false);
                              setShowSkillCheckMenu(false);
                              onSkillCheck(node.id, undefined, a.key, skillCheckDR, skillCheckRevealDR);
                            }}
                            className="px-0.5 py-0 text-left text-[10px] hover:bg-white/10 font-[Consolas,monospace]"
                            style={{ color: p.color, opacity: impossible ? 0.5 : 1, textDecoration: impossible ? 'line-through' : 'none' }}
                          >
                            {a.label}{impossible ? '✗' : ''}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
          );
        })()}
        {/* Existing menu items (hidden when sub-pickers are open) */}
        {!showSkillCheckMenu && !showContestedMenu && !showDefenderMenu && folderId && onRemoveFromFolder && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowContextMenu(false); onRemoveFromFolder(folderId, node.id); }}
            className="w-full px-3 py-1.5 text-left text-sm text-amber-400 hover:bg-white/10 font-[Consolas,monospace] flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6 0" />
            </svg>
            rEMOVE FROM fOLDER
          </button>
        )}
        {!showSkillCheckMenu && !showContestedMenu && !showDefenderMenu && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowContextMenu(false); onDelete?.(node.id); }}
            className="w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-white/10 font-[Consolas,monospace] flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
            dELETE cHARACTER
          </button>
        )}
      </CtxMenuPanel>
    </div>,
    document.body
  );

  // ── Controller pill + dropdown ────────────────────────────────────────────
  // Terminal-styled tiny indicator on the canvas card showing WHO is currently
  // choosing this character's actions. GM-only: click opens a dropdown that
  // lists AI, GM, and every active campaign trailblazer. Selecting one
  // reassigns control (and ownership, for human picks) via the controller
  // endpoint. Memory continues capturing regardless of selection — this only
  // controls the action layer.
  const aiActionOn = node.aiActionMode === true;
  const assignedTrailblazer = trailblazers?.find(t => t.userId === node.controllerUserId) ?? null;
  // Long usernames are truncated to keep the pill from sprawling across the
  // header. Hover tooltip shows the full name.
  const truncateName = (s: string, max: number) =>
    s.length > max ? `${s.slice(0, max - 1)}…` : s;
  const controllerLabelRaw = aiActionOn
    ? 'AI'
    : assignedTrailblazer
      ? truncateName(assignedTrailblazer.username.toUpperCase(), 10)
      : 'GM';
  const controllerLabel = `[${controllerLabelRaw}]`;

  const aiTogglePill = isGM ? (
    <button
      onClick={handleControllerClick}
      onMouseDown={(e) => e.stopPropagation()}
      disabled={controllerSaving}
      title={
        aiActionOn
          ? 'AI is choosing actions. Click to reassign.'
          : assignedTrailblazer
            ? `${assignedTrailblazer.username} controls this character. Click to reassign.`
            : 'GM is scripting actions. Click to reassign.'
      }
      style={{
        fontFamily: 'Consolas, monospace',
        fontSize: '30px',
        fontWeight: 'bold',
        lineHeight: 1,
        letterSpacing: '0.08em',
        padding: '8px 18px',
        borderRadius: '3px',
        border: '2px solid #22ab9499',
        background: aiActionOn ? '#22ab9433' : '#000',
        color: '#22ab94',
        cursor: controllerSaving ? 'wait' : 'pointer',
        whiteSpace: 'nowrap',
        textShadow: '0 0 10px rgba(34,171,148,0.7)',
        boxShadow: '0 0 16px rgba(34,171,148,0.25), inset 0 0 8px rgba(34,171,148,0.15)',
        opacity: controllerSaving ? 0.5 : 1,
      }}
    >
      {controllerLabel}
    </button>
  ) : null;

  const controllerMenu = controllerMenuOpen && typeof window !== 'undefined' && createPortal(
    <div
      ref={controllerMenuRef}
      style={{
        position: 'fixed',
        left: controllerMenuPos.x,
        top: controllerMenuPos.y,
        zIndex: 1000,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <CtxMenuPanel title="Controller">
        <CtxMenuStreamLabel />
        <ControllerMenuItem
          label="AI"
          hint="Let the AI persona choose actions"
          selected={aiActionOn}
          disabled={controllerSaving}
          onClick={() => applyController({ controller: 'AI' })}
        />
        <ControllerMenuItem
          label="GM"
          hint="You (the GM) script the actions"
          selected={!aiActionOn && !assignedTrailblazer}
          disabled={controllerSaving}
          onClick={() => applyController({ controller: 'GM' })}
        />
        {trailblazers && trailblazers.length > 0 && (
          <div style={{
            fontFamily: 'Consolas, monospace',
            fontSize: '8px',
            color: 'rgba(255,255,255,0.35)',
            letterSpacing: '0.1em',
            padding: '6px 8px 2px',
            textTransform: 'uppercase',
          }}>
            Trailblazers
          </div>
        )}
        {trailblazers?.map(tb => (
          <ControllerMenuItem
            key={tb.userId}
            label={tb.username}
            hint={`Assign to ${tb.username}`}
            selected={!aiActionOn && assignedTrailblazer?.userId === tb.userId}
            disabled={controllerSaving}
            onClick={() => applyController({ controller: 'PLAYER', userId: tb.userId })}
          />
        ))}
      </CtxMenuPanel>
    </div>,
    document.body,
  );

  // ── Compact View (500x220) ────────────────────────────────────────────────

  if (!isExpanded) {
    return (
      <div className="relative" data-character-id={node.id} data-drop-zone="character">
        <div
          className={`flex bg-gradient-to-br from-gray-800 to-gray-900 border-2 rounded-lg p-3 text-white hover:border-gray-600 transition-all select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{
            width: '500px', height: '220px', userSelect: 'none',
            // ACTIVE = crystallized: subtle gold border. Drop target still wins.
            borderColor: isDropTarget
              ? '#ffcc78'
              : node.status === 'ACTIVE'
                ? 'rgba(255, 204, 120, 0.65)'
                : 'rgba(55, 65, 81, 0.5)',
            willChange: isDropTarget ? 'filter' : 'transform',
            filter: isDropTarget
              ? 'drop-shadow(0 0 6px #ffcc78) drop-shadow(0 0 14px rgba(255, 204, 120, 0.8))'
              : isDragging
                ? 'drop-shadow(8px 16px 20px rgba(0, 0, 0, 0.7)) drop-shadow(4px 8px 10px rgba(0, 0, 0, 0.5))'
                : node.status === 'ACTIVE'
                  ? 'drop-shadow(0 0 4px rgba(255, 204, 120, 0.35)) drop-shadow(3px 6px 12px rgba(0, 0, 0, 0.5))'
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
            {/* Name */}
            <div className="flex items-center gap-2 mb-1" style={{ height: '24px' }}>
              <div className="font-bold truncate" style={{ fontFamily: 'var(--font-comfortaa), Comfortaa, sans-serif', fontSize: '14px', color: '#ffcc78' }}>
                {node.name}
              </div>
              {aiTogglePill}
            </div>
            {/* TKV — top-right corner */}
            <div className="absolute flex flex-col overflow-hidden" style={{
              top: '0px', right: '0px',
              minWidth: '64px',
              border: '2px solid #ffcc78',
              borderBottomLeftRadius: '6px', borderTopRightRadius: '8px', zIndex: 5,
              fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
            }}>
              <div className="flex items-center justify-center" style={{ backgroundColor: '#f7525f', color: '#ffcc78', fontSize: '12px', lineHeight: '1', letterSpacing: '0.08em', padding: '3px 8px' }}>T<span style={{ fontFamily: "'Inknut Antiqua', var(--font-inknut-antiqua), serif", fontWeight: 900 }}>&#x049C;</span>V</div>
              <div className="flex items-center justify-center" style={{ backgroundColor: '#b4a7d6', color: '#8e7cc3', fontSize: '17px', lineHeight: '1.1', padding: '2px 8px' }}>{tkv}</div>
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
        {controllerMenu}
      </div>
    );
  }

  // ── Expanded View (1885x670) — faithful port of prototype ─────────────────

  // Possessions
  const possessionsText = data?.possessions || '';
  const possessionsList = possessionsText.split(/\n|,/).map(s => s.trim()).filter(s => s.length > 0);

  // Vine data
  const vines = grovines.length > 0 ? grovines : [{ goal: '...', opportunity: '...', kv: undefined }];

  // Action totals — canonical formula (Mike 2026-05-20):
  //   actions = floor(sum of LEVELS of pillar attributes / 25), min 1
  //
  // Inputs are attribute LEVELS — NOT current pool, NOT augments. Pool depletion
  // does not change action count. Augments are intentionally excluded.
  //
  // Spirit explicitly EXCLUDES Frequency (Mike 2026-05-20): Frequency is the
  // life/death pool, not an action source. Spirit actions are Flow + Focus only.
  const sumDiv25 = (parts: Array<number | undefined>) =>
    Math.max(1, Math.floor(parts.reduce<number>((s, v) => s + (v ?? 0), 0) / 25));
  const bodyAction = sumDiv25([attributes?.clout?.level, attributes?.celerity?.level, attributes?.constitution?.level]);
  const spiritAction = sumDiv25([attributes?.flow?.level, attributes?.focus?.level]);
  const soulAction = sumDiv25([attributes?.willpower?.level, attributes?.wisdom?.level, attributes?.wit?.level]);

  // Helper to check conditions for a given attribute
  const getConditionState = (attrName: AttributeName) => {
    const conditionKey = CONDITION_KEYS[attrName];
    return {
      isConditioned: conditionKey ? !!(conditions as Record<string, boolean>)?.[conditionKey] : false,
      conditionLabel: CONDITION_LABELS[attrName],
    };
  };

  return (
    <div className="relative" ref={cardRef} data-character-id={node.id} data-drop-zone="character">
      <div
        className={`relative character-card text-white select-none ${isDragging ? 'cursor-grabbing scale-105' : 'cursor-grab'}`}
        style={{
          width: '1885px', willChange: isDropTarget ? 'filter' : 'transform', userSelect: 'none', transformOrigin: '960px 250px',
          // Swap depth shadows for a gold glow when hovered (same filter count, no perf regression vs baseline).
          // ACTIVE = crystallized: subtle ambient gold glow.
          filter: isDropTarget
            ? 'drop-shadow(0 0 6px #ffcc78) drop-shadow(0 0 14px rgba(255, 204, 120, 0.8))'
            : isDragging
              ? 'drop-shadow(8px 16px 20px rgba(0, 0, 0, 0.7)) drop-shadow(4px 8px 10px rgba(0, 0, 0, 0.5))'
              : node.status === 'ACTIVE'
                ? 'drop-shadow(0 0 5px rgba(255, 204, 120, 0.4)) drop-shadow(3px 6px 12px rgba(0, 0, 0, 0.5))'
                : 'drop-shadow(3px 6px 12px rgba(0, 0, 0, 0.5)) drop-shadow(2px 3px 6px rgba(0, 0, 0, 0.3))',
        }}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
      >
        {/* ── Top Header Bar ── */}
        <div className="relative pr-1 flex items-stretch gap-0.5" style={{ height: '29px' }}>
          {/* Purple baseline — now runs the full width of the header so the
              area right of the Fate Die can serve as a menu-options bar. */}
          <div className="absolute bottom-0 left-0 border-b border-purple-500/40" style={{ width: '100%' }} />
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

          {/* Controller pill — first item in the menu-options bar that
              extends across the area right of the Fate Die. Lifted above the
              purple baseline so the line passes underneath. */}
          {aiTogglePill && (
            <div className="flex items-center" style={{ marginTop: '-16px' }}>
              {aiTogglePill}
            </div>
          )}

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
                        <div className="text-[10px] leading-relaxed" style={{ color: '#6fa8dc', fontWeight: '500' }}>{item}</div>
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
                        <span className="px-2 py-2 pl-8 text-[10px]" style={{ color: '#8e7cc3' }}>{vine.goal || '...'}</span>
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
              { name: 'Clout (level)', value: attributes?.clout?.level || 0 },
              { name: 'Celerity (level)', value: attributes?.celerity?.level || 0 },
              { name: 'Constitution (level)', value: attributes?.constitution?.level || 0 },
              { name: '÷ 25, min 1', value: 0 },
            ]} totalValue={bodyAction}>
              <div className="border border-red-500/40 p-1 flex flex-col items-center justify-center cursor-help" style={{ backgroundColor: '#ea9999', height: '96px', marginBottom: '81px' }}>
                <div className="text-lg mb-1 font-bold text-white">[&#8756;]</div>
                <div className="px-2 py-1 rounded border-2 flex items-center justify-center" style={{ borderColor: '#ffcc78', backgroundColor: 'rgba(0, 0, 0, 0.2)' }}>
                  <div style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: '14px', color: 'white', fontWeight: 'bold' }}>{bodyAction}</div>
                </div>
              </div>
            </ComplexTooltip>

            {/* Pillar order must match the attribute-pillar columns above:
                Body (red) → Spirit (purple) → Soul (blue). Mike 2026-05-20. */}

            {/* Spirit = Purple (post-Jan-2026 canon). Frequency intentionally
                EXCLUDED — it's the life/death pool, not an action source. */}
            <ComplexTooltip title="Spirit Actions" baseValue={spiritAction} modifiers={[
              { name: 'Flow (level)', value: attributes?.flow?.level || 0 },
              { name: 'Focus (level)', value: attributes?.focus?.level || 0 },
              { name: '÷ 25, min 1', value: 0 },
            ]} totalValue={spiritAction}>
              <div className="border border-purple-500/40 p-1 flex flex-col items-center justify-center cursor-help" style={{ backgroundColor: '#8e7cc3', height: '96px', marginBottom: '81px' }}>
                <div className="text-lg mb-1 font-bold text-white">[&#8756;]</div>
                <div className="px-2 py-1 rounded border-2 flex items-center justify-center" style={{ borderColor: '#ffcc78', backgroundColor: 'rgba(0, 0, 0, 0.2)' }}>
                  <div style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: '14px', color: 'white', fontWeight: 'bold' }}>{spiritAction}</div>
                </div>
              </div>
            </ComplexTooltip>

            {/* Soul = Blue (post-Jan-2026 canon) */}
            <ComplexTooltip title="Soul Actions" baseValue={soulAction} modifiers={[
              { name: 'Willpower (level)', value: attributes?.willpower?.level || 0 },
              { name: 'Wisdom (level)', value: attributes?.wisdom?.level || 0 },
              { name: 'Wit (level)', value: attributes?.wit?.level || 0 },
              { name: '÷ 25, min 1', value: 0 },
            ]} totalValue={soulAction}>
              <div className="border border-blue-500/40 p-1 flex flex-col items-center justify-center cursor-help" style={{ backgroundColor: '#6fa8dc', height: '96px' }}>
                <div className="text-lg mb-1 font-bold text-white">[&#8756;]</div>
                <div className="px-2 py-1 rounded border-2 flex items-center justify-center" style={{ borderColor: '#ffcc78', backgroundColor: 'rgba(0, 0, 0, 0.2)' }}>
                  <div style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: '14px', color: 'white', fontWeight: 'bold' }}>{soulAction}</div>
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
            <div className="w-full flex items-center justify-center" style={{ backgroundColor: '#f7525f', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: '24px', color: '#ffcc78', height: '28px' }}>T<span style={{ fontFamily: "'Inknut Antiqua', var(--font-inknut-antiqua), serif", fontWeight: 900 }}>&#x049C;</span>V</div>
            <div className="w-full flex items-center justify-center" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: '19px', color: '#8e7cc3', height: '34px' }}>{tkv}</div>
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
      {controllerMenu}
    </div>
  );
};

CharacterCard.displayName = 'CharacterCard';

/** Single row in the controller dropdown menu. Terminal-styled — Consolas
 *  mono, teal accents, selected state inverted to filled teal. */
function ControllerMenuItem({
  label,
  hint,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      disabled={disabled}
      title={hint}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        fontFamily: 'Consolas, monospace',
        fontSize: '20px',
        lineHeight: 1.4,
        padding: '10px 20px',
        border: 'none',
        background: selected ? '#22ab9444' : 'transparent',
        color: selected ? '#22ab94' : 'rgba(255,255,255,0.85)',
        letterSpacing: '0.05em',
        cursor: disabled ? 'wait' : 'pointer',
        position: 'relative',
        textShadow: selected ? '0 0 4px rgba(34,171,148,0.6)' : 'none',
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(34,171,148,0.15)';
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      <span style={{ color: '#22ab94' }}>&gt;&nbsp;</span>{label}
    </button>
  );
}

export default React.memo(CharacterCard, (prev, next) => (
  prev.node.id === next.node.id &&
  prev.node.x === next.node.x &&
  prev.node.y === next.node.y &&
  prev.node.characterData === next.node.characterData &&
  prev.node.aiActionMode === next.node.aiActionMode &&
  prev.node.hasAIPersona === next.node.hasAIPersona &&
  prev.node.controllerUserId === next.node.controllerUserId &&
  prev.trailblazers === next.trailblazers &&
  prev.isExpanded === next.isExpanded &&
  prev.showInventory === next.showInventory &&
  prev.isDropTarget === next.isDropTarget &&
  prev.openPanels === next.openPanels
));
