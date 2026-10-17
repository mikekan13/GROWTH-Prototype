"use client";

/**
 * Doors, windows and archways on a home's walls (Mike 2026-10-17: "We need
 * openings, doors windows ect… we need doors at least for now (ha violet has
 * a door theme)"). Drawn ON the wall lines, above the rooms:
 *   door    — the wall cut, the leaf (closed: in the wall; open: swung 90°
 *             with its arc), a small lock when locked
 *   window  — the wall cut, two thin parallel panes
 *   archway / opening — the wall cut, a tick at each jamb
 * Hover = tooltip; a tap on a DOOR cycles closed → open → locked (PATCH, then
 * the canvas refreshes). Pure SVG + one hit box per opening.
 */
import React, { useState } from 'react';
import { ComplexTooltip } from '@/components/ui/ComplexTooltip';
import { nextDoorState, type DoorState, type Opening } from '@/lib/canvas-geometry';

const GOLD = '#ffcc78';
const PANE = '#9fd3ff';
const CUT = '#0d1424';

interface Props {
  campaignId: string;
  homeId: string;
  openings: Opening[];
  canEdit: boolean;
}

export default function MapOpenings({ campaignId, homeId, openings, canEdit }: Props) {
  // Optimistic door states until the refresh lands.
  const [local, setLocal] = useState<Record<string, DoorState>>({});

  const tap = async (o: Opening) => {
    if (!canEdit || o.kind !== 'door') return;
    const next = nextDoorState(local[o.id] ?? o.state);
    setLocal(prev => ({ ...prev, [o.id]: next }));
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/locations/${homeId}/openings/${o.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      window.dispatchEvent(new CustomEvent('growth:map-changed'));
    } catch {
      setLocal(prev => { const n = { ...prev }; delete n[o.id]; return n; });
    }
  };

  return (
    <g data-map-openings={homeId}>
      {openings.map(o => {
        const state = o.kind === 'door' ? (local[o.id] ?? o.state ?? 'closed') : undefined;
        const dx = o.b.x - o.a.x, dy = o.b.y - o.a.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        const ux = dx / len, uy = dy / len;
        const nx = -uy, ny = ux; // the swing side
        const mid = { x: (o.a.x + o.b.x) / 2, y: (o.a.y + o.b.y) / 2 };
        const leafEnd = { x: o.a.x + nx * len, y: o.a.y + ny * len };
        const label = o.name ?? `${o.kind[0].toUpperCase()}${o.kind.slice(1)}`;
        const hit = Math.max(44, len * 0.8);
        return (
          <g key={o.id} data-opening={o.id}>
            {/* the wall cut */}
            <line x1={o.a.x} y1={o.a.y} x2={o.b.x} y2={o.b.y} stroke={CUT} strokeWidth={16} strokeLinecap="butt" />
            {o.kind === 'door' && (state === 'open' ? (
              <>
                <line x1={o.a.x} y1={o.a.y} x2={leafEnd.x} y2={leafEnd.y} stroke={GOLD} strokeWidth={10} strokeLinecap="round" />
                <path d={`M ${o.b.x} ${o.b.y} A ${len} ${len} 0 0 ${nx * dy - ny * dx > 0 ? 0 : 1} ${leafEnd.x} ${leafEnd.y}`} fill="none" stroke={GOLD} strokeWidth={3} strokeDasharray="10 8" opacity={0.75} />
              </>
            ) : (
              <line x1={o.a.x} y1={o.a.y} x2={o.b.x} y2={o.b.y} stroke={state === 'locked' ? '#e8585a' : GOLD} strokeWidth={12} strokeLinecap="round" />
            ))}
            {o.kind === 'window' && (
              <>
                <line x1={o.a.x + nx * 6} y1={o.a.y + ny * 6} x2={o.b.x + nx * 6} y2={o.b.y + ny * 6} stroke={PANE} strokeWidth={4} />
                <line x1={o.a.x - nx * 6} y1={o.a.y - ny * 6} x2={o.b.x - nx * 6} y2={o.b.y - ny * 6} stroke={PANE} strokeWidth={4} />
              </>
            )}
            {(o.kind === 'archway' || o.kind === 'opening') && (
              <>
                <line x1={o.a.x - nx * 8} y1={o.a.y - ny * 8} x2={o.a.x + nx * 8} y2={o.a.y + ny * 8} stroke="rgba(203,217,232,0.8)" strokeWidth={6} />
                <line x1={o.b.x - nx * 8} y1={o.b.y - ny * 8} x2={o.b.x + nx * 8} y2={o.b.y + ny * 8} stroke="rgba(203,217,232,0.8)" strokeWidth={6} />
              </>
            )}
            {state === 'locked' && (
              <text x={mid.x + nx * 22} y={mid.y + ny * 22 + 8} textAnchor="middle" fontSize={34} fill="#e8585a" style={{ pointerEvents: 'none' }}>🔒</text>
            )}
            <foreignObject x={mid.x - hit / 2} y={mid.y - hit / 2} width={hit} height={hit} style={{ overflow: 'visible' }}>
              <div
                data-opening-hit={o.id}
                onPointerDown={(e) => { if (o.kind === 'door' && canEdit) e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); void tap(o); }}
                style={{ width: hit, height: hit, cursor: o.kind === 'door' && canEdit ? 'pointer' : 'help' }}
              >
                <ComplexTooltip
                  title={label}
                  modifiers={[
                    { name: `Joins: ${o.between.join(' ↔ ') || '—'}`, value: 0 },
                    ...(state ? [{ name: `Now: ${state}`, value: 0 }] : []),
                    ...(o.kind === 'door' && canEdit ? [{ name: 'Tap: closed → open → locked', value: 0 }] : []),
                  ]}
                  totalValue={0}
                  hideTotal
                  inline
                  triggerStyle={{ display: 'block', width: hit, height: hit }}
                >
                  <div style={{ width: hit, height: hit }} />
                </ComplexTooltip>
              </div>
            </foreignObject>
          </g>
        );
      })}
    </g>
  );
}
