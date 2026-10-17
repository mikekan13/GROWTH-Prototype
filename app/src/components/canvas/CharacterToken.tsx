"use client";

/**
 * Character TOKEN — a person on the map (Mike 2026-10-17: "the canvas becomes
 * the map and our complex dynamic tooltips are our hover and clicking things
 * opens a card that can be moved around"). Portrait disc + name; HOVER = the
 * who-is-here tooltip; DRAG = moves her on the map (drop-into-room runs on
 * release, as before); TAP = opens her sheet as an overlay card. The same
 * SVG-transform drag as ItemToken.
 */
import React, { useState, useRef } from 'react';
import { ComplexTooltip } from '@/components/ui/ComplexTooltip';
import { characterChipTooltip } from './folder-tooltips';
import { CHARACTER_TOKEN_DIAMETER, CHARACTER_TOKEN_LABEL } from '@/lib/canvas-geometry';
import type { GrowthCharacter } from '@/types/growth';

const GOLD = '#ffcc78';

export interface CharacterTokenProps {
  id: string;
  name: string;
  portrait?: string | null;
  status?: string;
  data: GrowthCharacter | null;
  x: number;
  y: number;
  isOpen?: boolean;
  isDraggingNode?: boolean;
  isDropTarget?: boolean;
  onOpen: (nodeId: string) => void;
  onPositionChange?: (nodeId: string, x: number, y: number) => void;
  onDragOffsetChange?: (nodeId: string, offsetX: number, offsetY: number) => void;
}

export default function CharacterToken({ id, name, portrait, status, data, x, y, isOpen, isDraggingNode, isDropTarget, onOpen, onPositionChange, onDragOffsetChange }: CharacterTokenProps) {
  const [isDragging, setIsDragging] = useState(false);
  const movedRef = useRef(false);
  const tip = characterChipTooltip({ id, name, data: (data ?? {}) as GrowthCharacter });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    movedRef.current = false;
    const svg = (e.target as Element).closest('foreignObject')?.closest('svg') as SVGSVGElement | null;
    if (!svg || !onPositionChange || !onDragOffsetChange) {
      // No map to move on — a press is just a tap.
      const up = () => { document.removeEventListener('mouseup', up); onOpen(id); };
      document.addEventListener('mouseup', up);
      return;
    }
    setIsDragging(true);
    onDragOffsetChange(id, 0.001, 0.001);
    const pt = svg.createSVGPoint();
    const toSvg = (cx: number, cy: number) => { pt.x = cx; pt.y = cy; return pt.matrixTransform(svg.getScreenCTM()!.inverse()); };
    const start = toSvg(e.clientX, e.clientY);
    const startClient = { x: e.clientX, y: e.clientY };
    const from = { x, y };
    const onMove = (me: MouseEvent) => {
      if (Math.abs(me.clientX - startClient.x) > 4 || Math.abs(me.clientY - startClient.y) > 4) movedRef.current = true;
      const cur = toSvg(me.clientX, me.clientY);
      onDragOffsetChange(id, cur.x - start.x, cur.y - start.y);
    };
    const onUp = (ue: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const end = toSvg(ue.clientX, ue.clientY);
      onDragOffsetChange(id, 0, 0);
      if (movedRef.current) onPositionChange(id, from.x + end.x - start.x, from.y + end.y - start.y);
      else onOpen(id);
      setIsDragging(false);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const d = CHARACTER_TOKEN_DIAMETER;
  const dragging = isDragging || !!isDraggingNode;
  const ring = isDropTarget ? GOLD : status === 'ACTIVE' ? GOLD : 'rgba(203,217,232,0.7)';
  return (
    <div
      data-character-token={id}
      data-character-id={id}
      data-drop-zone="character"
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(id); }}
      style={{ width: d, height: d + CHARACTER_TOKEN_LABEL, position: 'relative', cursor: dragging ? 'grabbing' : 'pointer', userSelect: 'none' }}
    >
      <ComplexTooltip
        title={tip.title}
        modifiers={tip.modifiers}
        totalValue={0}
        totalLabel={tip.totalLabel}
        totalText={tip.totalText}
        hideTotal={tip.hideTotal ?? true}
        disabled={dragging}
        inline
        triggerStyle={{ display: 'block', width: d, height: d }}
      >
        <div
          style={{
            width: d, height: d, borderRadius: '50%', overflow: 'hidden',
            background: '#0d0d1a',
            border: `5px solid ${ring}`,
            boxShadow: isOpen || isDropTarget
              ? `0 0 0 4px rgba(255,204,120,0.55), 0 0 18px rgba(255,204,120,0.6)`
              : dragging ? '0 12px 22px rgba(0,0,0,0.7)' : '0 4px 10px rgba(0,0,0,0.6)',
            transform: dragging ? 'scale(1.06)' : 'scale(1)',
            transition: dragging ? 'none' : 'transform 0.15s ease-out',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {portrait ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={portrait} alt={name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 18%' }} />
          ) : (
            <span style={{ color: GOLD, fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: d * 0.42, lineHeight: 1 }}>
              {name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
      </ComplexTooltip>
      <div style={{
        position: 'absolute', left: '50%', top: d + 4, transform: 'translateX(-50%)', whiteSpace: 'nowrap',
        background: '#000', color: GOLD, padding: '1px 8px', fontSize: 18, letterSpacing: '0.06em',
        fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', pointerEvents: 'none',
      }}>
        {name}
      </div>
    </div>
  );
}
