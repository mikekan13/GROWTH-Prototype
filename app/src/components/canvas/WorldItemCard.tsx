"use client";

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { GrowthWorldItem, WorldItemType } from '@/types/item';
import { ITEM_TYPE_ICONS, RARITY_COLORS, formatDamage, getConditionLabel, getConditionColor } from '@/types/item';
import { getWeightLabel } from '@/types/material';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface WorldItemNodeData {
  id: string;
  name: string;
  type: WorldItemType;
  status: string;
  data: GrowthWorldItem;
  holderName?: string;
  locationName?: string;
}

interface WorldItemCardProps {
  node: WorldItemNodeData & { x: number; y: number };
  isExpanded: boolean;
  onToggleExpand: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onUpdate?: (nodeId: string, data: GrowthWorldItem) => void;
  onPositionChange?: (nodeId: string, x: number, y: number) => void;
  onDragOffsetChange?: (nodeId: string, offsetX: number, offsetY: number) => void;
}

export default function WorldItemCard({ node, isExpanded, onToggleExpand, onDelete, onUpdate: _onUpdate, onPositionChange, onDragOffsetChange }: WorldItemCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const data = node.data;
  const typeIcon = ITEM_TYPE_ICONS[node.type] || '\u{1F4E6}';
  const rarityColor = data.rarity ? RARITY_COLORS[data.rarity] : '#c0c0c0';
  const conditionColor = data.condition ? getConditionColor(data.condition) : '#808080';
  const conditionLabel = data.condition ? getConditionLabel(data.condition) : 'Unknown';

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
    if (!onDelete) return;
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
      style={{ left: `${contextMenuPos.x}px`, top: `${contextMenuPos.y}px`, minWidth: '160px' }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); setShowContextMenu(false); onDelete?.(node.id); }}
        className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        Delete Item
      </button>
    </div>,
    document.body
  );

  // ── Compact View (280x~) ──────────────────────────────────────────────────

  if (!isExpanded) {
    return (
      <div className="relative" ref={cardRef}>
        <div
          className={`bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-gray-700/50 rounded-lg text-white hover:border-gray-600 transition-all select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{
            width: '280px',
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
            borderBottom: `2px solid ${rarityColor}`,
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14 }}>{typeIcon}</span>
              <span style={{
                fontFamily: 'var(--font-comfortaa), Comfortaa, sans-serif',
                fontSize: 13,
                fontWeight: 'bold',
                color: '#ffcc78',
              }}>
                {node.name}
              </span>
            </div>
            <span style={{
              fontSize: 9,
              color: rarityColor,
              textTransform: 'uppercase',
              fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
              letterSpacing: '0.1em',
            }}>
              {data.rarity ? data.rarity.replace('_', ' ') : node.type.replace('_', ' ')}
            </span>
          </div>

          {/* Body */}
          <div style={{ padding: '6px 10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9 }}>
              <span style={{ color: 'rgba(255,255,255,0.4)', textTransform: 'capitalize', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>{node.type.replace('_', ' ')}</span>
              <span style={{ color: conditionColor, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>{conditionLabel}</span>
            </div>
            {data.material && (
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)', marginTop: 2, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                {data.material}{data.resistance != null ? ` · R${data.resistance}` : ''}{data.damage && Object.values(data.damage).some(v => v > 0) ? ` · ${formatDamage(data.damage)}` : ''}
              </div>
            )}
            {data.description && (
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginTop: 3, lineHeight: 1.3, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                {data.description.length > 70 ? `${data.description.substring(0, 70)}...` : data.description}
              </div>
            )}
            <div style={{ marginTop: 4, fontSize: 8, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              {node.holderName ? `Held by: ${node.holderName}` : node.locationName ? `At: ${node.locationName}` : 'Unassigned'}
            </div>
          </div>

          {node.status !== 'ACTIVE' && (
            <div style={{
              padding: '2px 10px',
              background: 'rgba(232,88,90,0.15)',
              fontSize: 8,
              color: '#E8585A',
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
            background: '#7050A8',
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
          title="Expand item card"
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
          width: '420px',
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
          borderBottom: `2px solid ${rarityColor}`,
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                <span style={{ textTransform: 'capitalize' }}>{node.type.replace('_', ' ')}</span>
                {data.rarity && (
                  <span style={{ color: rarityColor, marginLeft: 8, textTransform: 'uppercase', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.1em' }}>
                    {data.rarity.replace('_', ' ')}
                  </span>
                )}
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
        <div style={{ padding: '10px 12px' }}>
          {/* Description */}
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, marginBottom: 10, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            {data.description || <span style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.3)' }}>No description</span>}
          </div>

          {/* Stats row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 1fr',
            gap: 6,
            marginBottom: 10,
            padding: '8px 0',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}>
            <MiniStat label="Condition" value={conditionLabel} color={conditionColor} />
            <MiniStat label="Weight" value={data.weightLevel != null ? `${data.weightLevel} (${getWeightLabel(data.weightLevel)})` : '-'} color="#c0c0c0" />
            <MiniStat label="Tech" value={data.techLevel ?? '-'} color="#22ab94" />
            <MiniStat label="Value" value={data.value != null ? `${data.value} KV` : '-'} color="#ffcc78" />
          </div>

          {/* Weapon damage */}
          {data.damage && (node.type === 'weapon' || Object.values(data.damage).some(v => v > 0)) && (
            <div style={{
              marginBottom: 10,
              padding: '6px 8px',
              background: 'rgba(232,88,90,0.08)',
              border: '1px solid rgba(232,88,90,0.15)',
              borderRadius: 2,
            }}>
              <SectionLabel color="#E8585A">Damage (P:S:H/D\C:B:E)</SectionLabel>
              <div style={{ fontSize: 13, color: '#fff', fontFamily: 'var(--font-terminal), Consolas, monospace', fontWeight: 'bold' }}>
                {formatDamage(data.damage)}
              </div>
              {data.range && (
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>Range: {data.range}</div>
              )}
              {data.targetAttribute && (
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>Target: {data.targetAttribute}</div>
              )}
            </div>
          )}

          {/* Armor resistance */}
          {data.resistance != null && (node.type === 'armor' || data.armorLayer) && (
            <div style={{
              marginBottom: 10,
              padding: '6px 8px',
              background: 'rgba(62,120,192,0.08)',
              border: '1px solid rgba(62,120,192,0.15)',
              borderRadius: 2,
            }}>
              <SectionLabel color="#3E78C0">Armor</SectionLabel>
              <div style={{ display: 'flex', gap: 16 }}>
                <div>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>Resistance: </span>
                  <span style={{ fontSize: 13, color: '#fff', fontWeight: 'bold', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>{data.resistance}</span>
                </div>
                {data.armorLayer && (
                  <div>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>Layer: </span>
                    <span style={{ fontSize: 11, color: '#fff', textTransform: 'capitalize', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>{data.armorLayer.replace(/([A-Z])/g, ' $1').trim()}</span>
                  </div>
                )}
              </div>
              {data.coveredParts && data.coveredParts.length > 0 && (
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 4, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                  Covers: {data.coveredParts.join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Prima Materia */}
          {data.primaMateria && (
            <div style={{
              marginBottom: 10,
              padding: '6px 8px',
              background: 'rgba(112,80,168,0.08)',
              border: '1px solid rgba(112,80,168,0.15)',
              borderRadius: 2,
            }}>
              <SectionLabel color="#7050A8">Prima Materia — {data.primaMateria.school}</SectionLabel>
              <div style={{ display: 'flex', gap: 16, fontSize: 10, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                <span style={{ color: '#fff' }}>Level: {data.primaMateria.level}</span>
                <span style={{ color: data.primaMateria.stable ? '#4ade80' : '#f59e0b' }}>
                  {data.primaMateria.stable ? 'Stable' : 'Unstable'}
                </span>
                {data.primaMateria.charges != null && (
                  <span style={{ color: '#22ab94' }}>Charges: {data.primaMateria.charges}</span>
                )}
              </div>
            </div>
          )}

          {/* Material & Modifiers */}
          {(data.material || (data.materialModifiers && data.materialModifiers.length > 0)) && (
            <div style={{ marginBottom: 10 }}>
              {data.material && (
                <div style={{ fontSize: 10, marginBottom: 4, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>Material: </span>
                  <span style={{ color: '#fff' }}>{data.material}</span>
                </div>
              )}
              {data.materialModifiers && data.materialModifiers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {data.materialModifiers.map((mod, i) => (
                    <span key={i} style={{
                      padding: '2px 6px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 2,
                      fontSize: 8,
                      color: 'rgba(255,255,255,0.5)',
                      textTransform: 'uppercase',
                      fontFamily: 'var(--font-terminal), Consolas, monospace',
                    }}>
                      {mod}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Weapon Properties */}
          {data.weaponProperties && data.weaponProperties.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {data.weaponProperties.map((prop, i) => (
                <span key={i} style={{
                  padding: '2px 6px',
                  background: 'rgba(232,88,90,0.08)',
                  border: '1px solid rgba(232,88,90,0.15)',
                  borderRadius: 2,
                  fontSize: 8,
                  color: '#E8585A',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                }}>
                  {prop}
                </span>
              ))}
            </div>
          )}

          {/* Holder / Location */}
          <div style={{
            padding: '4px 8px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 2,
            fontSize: 9,
            color: 'rgba(255,255,255,0.4)',
            fontFamily: 'var(--font-terminal), Consolas, monospace',
          }}>
            {node.holderName ? (
              <span>Held by: <span style={{ color: '#ffcc78' }}>{node.holderName}</span></span>
            ) : node.locationName ? (
              <span>Located at: <span style={{ color: '#7050A8' }}>{node.locationName}</span></span>
            ) : (
              <span>Unassigned — world item</span>
            )}
          </div>

          {/* GM Notes */}
          {data.notes && (
            <div style={{
              marginTop: 8,
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

        {node.status !== 'ACTIVE' && (
          <div style={{
            padding: '4px 12px',
            background: 'rgba(232,88,90,0.15)',
            fontSize: 9,
            color: '#E8585A',
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

function MiniStat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>{label}</div>
      <div style={{ fontSize: 12, color, fontWeight: 'bold', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>
        {value}
      </div>
    </div>
  );
}
