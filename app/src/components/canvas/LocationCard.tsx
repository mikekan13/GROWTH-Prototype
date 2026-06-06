"use client";

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { GrowthLocation, LocationType } from '@/types/location';
import { LOCATION_TYPE_ICONS, LOCATION_TYPE_COLORS } from '@/types/location';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface LocationNodeData {
  id: string;
  name: string;
  type: LocationType;
  status: string;
  data: GrowthLocation;
}

interface LocationCardProps {
  node: LocationNodeData & { x: number; y: number };
  isExpanded: boolean;
  onToggleExpand: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onUpdate?: (nodeId: string, data: GrowthLocation) => void;
  onPositionChange?: (nodeId: string, x: number, y: number) => void;
  onDragOffsetChange?: (nodeId: string, offsetX: number, offsetY: number) => void;
  /** GM gesture: right-click → "Create NPC here" spawns a new character wired
   *  as a located_at child of this Location. Fired with the parent's id; the
   *  parent surface handles the name prompt + API call + canvas refresh. */
  onCreateChildCharacter?: (parentLocationId: string) => void;
}

const DANGER_COLORS = ['#4ade80', '#4ade80', '#a3e635', '#facc15', '#facc15', '#f59e0b', '#f97316', '#ef4444', '#dc2626', '#991b1b'];

/** Compact-suffixed KRMA magnitude. The location reserve scales freely
 *  so we abbreviate aggressively past 1M. */
function formatReserve(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e15) return `${(n / 1e15).toFixed(2)}P`; // peta — for galaxy-scale
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`; // tera — planets
  if (abs >= 1e9)  return `${(n / 1e9).toFixed(2)}B`;  // billions — continents / armies
  if (abs >= 1e6)  return `${(n / 1e6).toFixed(2)}M`;  // millions — cities / districts
  if (abs >= 1e3)  return `${(n / 1e3).toFixed(1)}K`;  // thousands — buildings / villages
  return n.toLocaleString();
}

/** Loose tier label hint based on reserve magnitude. Advisory only. */
function reserveTier(n: number | undefined): string {
  if (n == null) return '';
  if (n >= 1e15) return 'galactic';
  if (n >= 1e13) return 'star-system';
  if (n >= 1e11) return 'planetary';
  if (n >= 1e9)  return 'continental';
  if (n >= 1e7)  return 'regional';
  if (n >= 1e5)  return 'urban';
  if (n >= 1e3)  return 'local';
  return 'minor';
}

interface ContentsChildRow {
  id: string;
  childId: string;
  childType: string;
  childName: string;
  childSubtype: string | null;
  childStatus: string | null;
  childContentsCount: number;
}

export default function LocationCard({ node, isExpanded, onToggleExpand, onDelete, onUpdate: _onUpdate, onPositionChange, onDragOffsetChange, onCreateChildCharacter }: LocationCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Contents (children located_at this location). Lazy-loaded only when the
  // card is expanded so compact-tiled locations don't fan out N requests.
  const [contents, setContents] = useState<ContentsChildRow[] | null>(null);
  const [contentsErr, setContentsErr] = useState<string | null>(null);

  const typeColor = LOCATION_TYPE_COLORS[node.type] || '#808080';
  const typeIcon = LOCATION_TYPE_ICONS[node.type] || '\u2B50';
  const data = node.data;
  const reserve = data.krmaReserve;
  const tier = reserveTier(reserve);

  useEffect(() => {
    if (!isExpanded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/entities/${node.id}/contents`);
        if (!res.ok) {
          const e = await res.json().catch(() => ({ error: 'Failed to load contents' }));
          if (!cancelled) setContentsErr(e.error || 'Failed to load contents');
          return;
        }
        const j = await res.json();
        if (!cancelled) setContents(j.contents ?? []);
      } catch (e) {
        if (!cancelled) setContentsErr(e instanceof Error ? e.message : 'Network error');
      }
    })();
    return () => { cancelled = true; };
  }, [isExpanded, node.id]);

  const focusEntity = (entityId: string) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('growth:focus-canvas-node', { detail: { entityId } }));
  };

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

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!onDelete && !onCreateChildCharacter) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.pageX, y: e.pageY });
    setShowContextMenu(true);
  };

  // Drag handler — same pattern as CharacterCard
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (!onPositionChange || !onDragOffsetChange) return;

    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    onDragOffsetChange(node.id, 0.001, 0.001);

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
      style={{ left: `${contextMenuPos.x}px`, top: `${contextMenuPos.y}px`, minWidth: '180px' }}
    >
      {onCreateChildCharacter && (
        <button
          onClick={(e) => { e.stopPropagation(); setShowContextMenu(false); onCreateChildCharacter(node.id); }}
          className="w-full px-4 py-2 text-left text-teal-300 hover:bg-teal-500/20 transition-colors flex items-center gap-2"
        >
          <span className="text-base leading-none">✴</span>
          Create NPC here
        </button>
      )}
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); setShowContextMenu(false); onDelete(node.id); }}
          className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete Location
        </button>
      )}
    </div>,
    document.body
  );

  // ── Compact View (320x160) ────────────────────────────────────────────────

  if (!isExpanded) {
    return (
      <div className="relative" ref={cardRef}>
        <div
          className={`bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-gray-700/50 rounded-lg text-white hover:border-gray-600 transition-all select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{
            width: '320px',
            userSelect: 'none',
            filter: isDragging
              ? 'drop-shadow(8px 16px 20px rgba(0, 0, 0, 0.7)) drop-shadow(4px 8px 10px rgba(0, 0, 0, 0.5))'
              : 'drop-shadow(3px 6px 12px rgba(0, 0, 0, 0.5)) drop-shadow(2px 3px 6px rgba(0, 0, 0, 0.3))',
          }}
          onMouseDown={handleMouseDown}
          onContextMenu={handleContextMenu}
        >
          {/* Header bar with type accent */}
          <div style={{
            borderBottom: `2px solid ${typeColor}`,
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>{typeIcon}</span>
              <span style={{
                fontFamily: 'var(--font-comfortaa), Comfortaa, sans-serif',
                fontSize: 14,
                fontWeight: 'bold',
                color: '#ffcc78',
              }}>
                {node.name}
              </span>
            </div>
            <span style={{
              fontSize: 9,
              color: typeColor,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
            }}>
              {node.type.replace('_', ' ')}
            </span>
          </div>

          {/* Body */}
          <div style={{ padding: '8px 12px' }}>
            {data.description ? (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                {data.description.length > 100 ? `${data.description.substring(0, 100)}...` : data.description}
              </div>
            ) : (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
                No description
              </div>
            )}

            {/* Stat pills */}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {reserve != null && (
                <span
                  style={{
                    padding: '2px 6px',
                    background: 'rgba(255,204,120,0.12)',
                    border: '1px solid rgba(255,204,120,0.4)',
                    borderRadius: 3,
                    fontSize: 10,
                    color: '#ffcc78',
                    fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                    letterSpacing: '0.04em',
                  }}
                  title={`KRMA Reserve: ${reserve.toLocaleString()} Ҝ${tier ? ` (${tier})` : ''}`}
                >
                  {formatReserve(reserve)} Ҝ
                </span>
              )}
              {data.dangerLevel != null && (
                <StatPill label="DNG" value={data.dangerLevel} color={DANGER_COLORS[Math.min(data.dangerLevel - 1, 9)]} />
              )}
              {data.population && (
                <span style={{
                  padding: '2px 6px',
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.4)',
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                }}>
                  {data.population}
                </span>
              )}
            </div>
          </div>

          {/* Status bar */}
          {node.status !== 'ACTIVE' && (
            <div style={{
              padding: '3px 12px',
              background: node.status === 'DESTROYED' ? 'rgba(232,88,90,0.2)' : 'rgba(255,204,120,0.15)',
              fontSize: 9,
              color: node.status === 'DESTROYED' ? '#E8585A' : '#ffcc78',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
            }}>
              {node.status}
            </div>
          )}
        </div>
        {/* Expand button — bottom-right corner */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id); }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: '-16px',
            right: '-21px',
            width: 36,
            height: 36,
            background: '#582a72',
            border: 'none',
            borderRadius: '50%',
            color: '#F5F4EF',
            fontSize: 24,
            lineHeight: '1',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}
          title="Expand location card"
        >{'\u2295'}</button>
        {contextMenu}
      </div>
    );
  }

  // ── Expanded View ─────────────────────────────────────────────────────────

  return (
    <div className="relative" ref={cardRef}>
      <div
        className={`bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-gray-700/50 rounded-lg text-white hover:border-gray-600 transition-all select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{
          width: '480px',
          userSelect: 'none',
          filter: isDragging
            ? 'drop-shadow(8px 16px 20px rgba(0, 0, 0, 0.7)) drop-shadow(4px 8px 10px rgba(0, 0, 0, 0.5))'
            : 'drop-shadow(3px 6px 12px rgba(0, 0, 0, 0.5)) drop-shadow(2px 3px 6px rgba(0, 0, 0, 0.3))',
        }}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
      >
        {/* Header */}
        <div style={{
          borderBottom: `2px solid ${typeColor}`,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>{typeIcon}</span>
            <div>
              <div style={{
                fontFamily: 'var(--font-comfortaa), Comfortaa, sans-serif',
                fontSize: 16,
                fontWeight: 'bold',
                color: '#ffcc78',
              }}>
                {node.name}
              </div>
              <div style={{
                fontSize: 10,
                color: typeColor,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
              }}>
                {node.type.replace('_', ' ')}
              </div>
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id); }}
            className="hover:bg-white/10 transition-colors"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#F5F4EF',
              width: 36,
              height: 36,
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: 24,
              lineHeight: '1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {'\u2297'}
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '12px 14px' }}>
          {/* KRMA Reserve — first-class scale indicator. Empty state still
              shown so GMs see the field and remember to fill it. */}
          <div
            style={{
              marginBottom: 12,
              padding: '8px 12px',
              background: reserve != null
                ? 'linear-gradient(135deg, rgba(255,204,120,0.08) 0%, rgba(0,0,0,0.2) 100%)'
                : 'rgba(255,255,255,0.03)',
              border: `1px solid ${reserve != null ? 'rgba(255,204,120,0.35)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <SectionLabel color={reserve != null ? '#ffcc78' : 'rgba(255,255,255,0.4)'}>KRMA Reserve</SectionLabel>
              <div
                style={{
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.4)',
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                  letterSpacing: '0.04em',
                  textTransform: tier ? 'uppercase' : 'none',
                }}
              >
                {tier ? `${tier} scale` : 'ambient mass · GM allocation'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                  fontSize: 24,
                  color: reserve != null ? '#ffcc78' : 'rgba(255,255,255,0.25)',
                  letterSpacing: '0.04em',
                  lineHeight: 1,
                }}
                title={reserve != null ? `${reserve.toLocaleString()} Ҝ` : 'Not set'}
              >
                {formatReserve(reserve)} <span style={{ fontSize: 14, opacity: 0.8 }}>Ҝ</span>
              </div>
              {reserve != null && (
                <div
                  style={{
                    fontSize: 8,
                    color: 'rgba(255,255,255,0.35)',
                    fontFamily: 'var(--font-terminal), Consolas, monospace',
                    marginTop: 2,
                  }}
                >
                  {reserve.toLocaleString()}
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: 12 }}>
            <SectionLabel color={typeColor}>Description</SectionLabel>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              {data.description || <span style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.3)' }}>No description set</span>}
            </div>
          </div>

          {/* Stats Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: 8,
            marginBottom: 12,
            padding: '8px 0',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}>
            <StatBlock label="Danger" value={data.dangerLevel ?? '-'} color={data.dangerLevel ? DANGER_COLORS[Math.min(data.dangerLevel - 1, 9)] : '#808080'} />
          </div>

          {/* Environment */}
          {data.environment && (
            <div style={{ marginBottom: 10 }}>
              <SectionLabel>Environment</SectionLabel>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>{data.environment}</div>
            </div>
          )}

          {/* Population & Control */}
          <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
            {data.population && (
              <div>
                <SectionLabel>Population</SectionLabel>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>{data.population}</div>
              </div>
            )}
            {data.controlledBy && (
              <div>
                <SectionLabel>Controlled By</SectionLabel>
                <div style={{ fontSize: 10, color: '#ffcc78', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>{data.controlledBy}</div>
              </div>
            )}
          </div>

          {/* Features */}
          {data.features && data.features.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <SectionLabel color={typeColor}>Features ({data.features.length})</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {data.features.map((f, i) => (
                  <div key={i} style={{
                    padding: '4px 8px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 2,
                  }}>
                    <div style={{ fontSize: 10, color: '#fff', fontWeight: 'bold', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                      {f.name}
                      <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', marginLeft: 6, textTransform: 'uppercase' }}>
                        {f.type.replace('_', ' ')}
                      </span>
                    </div>
                    {f.description && (
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{f.description}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ley Lines */}
          {data.leyLines?.present && (
            <div style={{
              padding: '6px 8px',
              background: 'rgba(88, 42, 114,0.1)',
              border: '1px solid rgba(88, 42, 114,0.2)',
              borderRadius: 2,
              marginBottom: 10,
            }}>
              <div style={{ fontSize: 9, color: '#8e7cc3', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>
                Ley Lines Present {data.leyLines.strength ? `(Strength: ${data.leyLines.strength})` : ''}
              </div>
              {data.leyLines.schools && data.leyLines.schools.length > 0 && (
                <div style={{ fontSize: 9, color: 'rgba(88, 42, 114,0.7)', marginTop: 2, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                  Schools: {data.leyLines.schools.join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Tags */}
          {data.tags && data.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
              {data.tags.map((tag, i) => (
                <span key={i} style={{
                  padding: '2px 6px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 2,
                  fontSize: 8,
                  color: 'rgba(255,255,255,0.5)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                }}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Contents — entities located_at this location. Click a row to
              focus the canvas on it. */}
          <div style={{ marginTop: 10 }}>
            <SectionLabel color={typeColor}>
              Contents {contents && contents.length > 0 ? `(${contents.length})` : ''}
            </SectionLabel>
            {contentsErr && (
              <div
                style={{
                  fontSize: 10,
                  color: '#E8585A',
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                }}
              >
                ✗ {contentsErr}
              </div>
            )}
            {!contentsErr && contents === null && (
              <div
                style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.3)',
                  fontStyle: 'italic',
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                }}
              >
                Loading…
              </div>
            )}
            {!contentsErr && contents && contents.length === 0 && (
              <div
                style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.3)',
                  fontStyle: 'italic',
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                }}
              >
                Empty
              </div>
            )}
            {!contentsErr && contents && contents.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {contents.map((c) => (
                  <button
                    key={c.id}
                    onClick={(e) => { e.stopPropagation(); focusEntity(c.childId); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 8px',
                      background: 'rgba(0,0,0,0.25)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 2,
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                    title="Jump to on canvas"
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 11,
                          color: '#fff',
                          fontFamily: 'var(--font-comfortaa), Comfortaa, sans-serif',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {c.childName}
                      </div>
                      <div
                        style={{
                          fontSize: 8,
                          color: 'rgba(255,255,255,0.35)',
                          fontFamily: 'var(--font-terminal), Consolas, monospace',
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {c.childSubtype ?? c.childType.toLowerCase()}
                        {c.childStatus && ` · ${c.childStatus.toLowerCase()}`}
                        {c.childContentsCount > 0 && ` · contains ${c.childContentsCount}`}
                      </div>
                    </div>
                    <span
                      style={{
                        fontFamily: 'Consolas, monospace',
                        color: '#22ab94',
                        fontSize: 12,
                      }}
                    >
                      ➤
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* GM Notes */}
          {data.notes && (
            <div style={{
              marginTop: 10,
              padding: '6px 8px',
              background: 'rgba(255,204,120,0.06)',
              border: '1px solid rgba(255,204,120,0.15)',
              borderRadius: 2,
            }}>
              <SectionLabel color="#ffcc78">GM Notes</SectionLabel>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>{data.notes}</div>
            </div>
          )}
        </div>

        {/* Status bar */}
        {node.status !== 'ACTIVE' && (
          <div style={{
            padding: '4px 14px',
            background: node.status === 'DESTROYED' ? 'rgba(232,88,90,0.2)' : 'rgba(255,204,120,0.15)',
            fontSize: 9,
            color: node.status === 'DESTROYED' ? '#E8585A' : '#ffcc78',
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            textAlign: 'center',
            fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
          }}>
            {node.status}
          </div>
        )}
      </div>
      {contextMenu}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{
      fontSize: 9,
      color: color || 'rgba(255,255,255,0.4)',
      textTransform: 'uppercase',
      letterSpacing: '0.15em',
      marginBottom: 4,
      fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
    }}>
      {children}
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 6px',
      background: 'rgba(255,255,255,0.05)',
      borderRadius: 3,
      border: `1px solid ${color}33`,
    }}>
      <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>{label}</span>
      <span style={{ fontSize: 11, color, fontWeight: 'bold', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>{value}</span>
    </div>
  );
}

function StatBlock({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2, fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 'bold', color, fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>
        {value}
      </div>
    </div>
  );
}
