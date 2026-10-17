"use client";

/**
 * Item TOKEN — a thing on the top-down map (Mike 2026-10-16: "things should
 * just be tokens for now… all that info could be done using our complex
 * dynamic tooltips"). A circle chit with a 1–2 letter mark and a pillar/teal
 * ring; the card's content lives in the ComplexTooltip; a container shows a
 * count badge and opens its contents on tap. Drag = the WorldItemCard gesture
 * (same SVG-transform pattern), so settle / drop-into-room keep working.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { GrowthWorldItem } from '@/types/item';
import { ComplexTooltip } from '@/components/ui/ComplexTooltip';
import { itemTokenTooltip } from './folder-tooltips';
import { TOKEN_DIAMETER, PIN_DIAMETER, DEFAULT_SCALE_FT_PER_UNIT, drawsAsShape, footprintBounds, parseMapShape, polygonPointsAttr, tokenMark, tokenRingColor } from '@/lib/canvas-geometry';

/**
 * How big a thing is on the map (Mike 2026-10-17: "items can take up space
 * too… if smaller than that then maybe small little pins"): its SHAPE in
 * world units when its long side reaches 5 ft, else a pin. Pure.
 */
export function itemTokenBox(data: unknown): { w: number; h: number; points: Array<{ x: number; y: number }> | null } {
  const shape = parseMapShape((data as { mapShape?: unknown } | null)?.mapShape);
  if (!drawsAsShape(shape)) return { w: shape ? PIN_DIAMETER : TOKEN_DIAMETER * 0.75, h: shape ? PIN_DIAMETER : TOKEN_DIAMETER * 0.75, points: null };
  const b = footprintBounds(shape!.points);
  const k = 1 / DEFAULT_SCALE_FT_PER_UNIT;
  return { w: b.width * k, h: b.height * k, points: shape!.points.map(p => ({ x: (p.x - b.x) * k, y: (p.y - b.y) * k })) };
}

export interface ItemTokenNode {
  id: string;
  name: string;
  type: string;
  status: string;
  data: GrowthWorldItem | null;
  holderName?: string;
  locationName?: string;
  containsCount?: number;
  x: number;
  y: number;
}

interface ItemTokenProps {
  node: ItemTokenNode;
  isDraggingNode?: boolean;
  onDelete?: (nodeId: string) => void;
  onPositionChange?: (nodeId: string, x: number, y: number) => void;
  onDragOffsetChange?: (nodeId: string, offsetX: number, offsetY: number) => void;
  /** A tap opens the thing's card as an overlay (2026-10-17). Its contents stay on the right-click menu. */
  onOpen?: (nodeId: string) => void;
}

interface ContentsRow {
  id: string;
  childId: string;
  childType: string;
  childName: string;
  childSubtype: string | null;
  childContentsCount: number;
}

const GOLD = '#ffcc78';

/** Contents panel: the LocationCard pattern (`/api/entities/[id]/contents`) with drill-in. */
function TokenContents({ rootId, rootName, anchor, onClose }: { rootId: string; rootName: string; anchor: { x: number; y: number }; onClose: () => void }) {
  const [stack, setStack] = useState<Array<{ id: string; name: string }>>([{ id: rootId, name: rootName }]);
  // Keyed by the entity it was loaded for, so a drill-in shows "loading…" without a reset in the effect.
  const [loaded, setLoaded] = useState<{ forId: string; rows: ContentsRow[] | null; err: string | null }>({ forId: '', rows: null, err: null });
  const panelRef = useRef<HTMLDivElement | null>(null);
  const current = stack[stack.length - 1];
  const rows = loaded.forId === current.id ? loaded.rows : null;
  const err = loaded.forId === current.id ? loaded.err : null;

  useEffect(() => {
    let cancelled = false;
    const forId = current.id;
    (async () => {
      try {
        const res = await fetch(`/api/entities/${forId}/contents`);
        if (!res.ok) {
          const e = await res.json().catch(() => ({ error: 'Failed to load contents' }));
          if (!cancelled) setLoaded({ forId, rows: null, err: e.error || 'Failed to load contents' });
          return;
        }
        const j = await res.json();
        if (!cancelled) setLoaded({ forId, rows: j.contents ?? [], err: null });
      } catch (e) {
        if (!cancelled) setLoaded({ forId, rows: null, err: e instanceof Error ? e.message : 'Network error' });
      }
    })();
    return () => { cancelled = true; };
  }, [current.id]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const left = Math.min(anchor.x + 12, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 276);
  const top = Math.min(anchor.y + 12, (typeof window !== 'undefined' ? window.innerHeight : 800) - 320);
  return createPortal(
    <div
      ref={panelRef}
      data-token-contents
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', left, top, width: 264, maxHeight: 300, overflowY: 'auto', zIndex: 95,
        background: '#000', borderTop: `2px solid ${GOLD}`, border: '1px solid rgba(255,204,120,0.5)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.6)', padding: '8px 10px', fontFamily: 'var(--font-terminal), Consolas, monospace',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {stack.length > 1 && (
          <button type="button" onClick={() => setStack(s => s.slice(0, -1))}
            style={{ background: 'none', border: `1px solid ${GOLD}`, color: GOLD, fontSize: 11, padding: '1px 6px', cursor: 'pointer', fontFamily: 'inherit' }}>
            ◂ BACK
          </button>
        )}
        <div style={{ flex: 1, color: GOLD, fontFamily: 'var(--font-header), "Bebas Neue", sans-serif', fontSize: 16, letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current.name}
        </div>
        <button type="button" onClick={onClose} aria-label="Close"
          style={{ background: 'none', border: 'none', color: '#fff', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>⊗</button>
      </div>
      {err && <div style={{ color: '#f7525f', fontSize: 11 }}>✗ {err}</div>}
      {!err && rows === null && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>loading…</div>}
      {!err && rows && rows.length === 0 && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontStyle: 'italic' }}>Empty</div>}
      {!err && rows && rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {rows.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => { if (r.childContentsCount > 0) setStack(s => [...s, { id: r.childId, name: r.childName }]); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', width: '100%', textAlign: 'left',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2,
                cursor: r.childContentsCount > 0 ? 'pointer' : 'default', color: '#fff', fontFamily: 'inherit',
              }}
              title={r.childContentsCount > 0 ? 'Open' : undefined}
            >
              <span style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${tokenRingColor(r.childSubtype ?? undefined)}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: GOLD, flexShrink: 0 }}>
                {tokenMark(r.childName)}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.childName}</span>
              {r.childContentsCount > 0 && (
                <span style={{ fontSize: 10, color: '#0a0a0a', background: GOLD, borderRadius: 8, padding: '0 6px' }}>{r.childContentsCount}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

export default function ItemToken({ node, isDraggingNode = false, onDelete, onPositionChange, onDragOffsetChange, onOpen }: ItemTokenProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [contentsAnchor, setContentsAnchor] = useState<{ x: number; y: number } | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const ring = tokenRingColor(node.type);
  const mark = tokenMark(node.name);
  const count = node.containsCount ?? 0;
  const tip = itemTokenTooltip({ id: node.id, name: node.name, type: node.type, data: node.data, holderName: node.holderName, locationName: node.locationName, containsCount: count });

  useEffect(() => {
    if (!showContextMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) setShowContextMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showContextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.pageX, y: e.pageY });
    setShowContextMenu(true);
  };

  // Drag — the WorldItemCard gesture verbatim: offsets while moving, one
  // position commit on release (settle-once + drop-into-room run there).
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (!onPositionChange || !onDragOffsetChange) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    movedRef.current = false;
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
    const startClient = { x: e.clientX, y: e.clientY };
    dragStartPosRef.current = { x: node.x, y: node.y };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragStartPosRef.current) return;
      if (Math.abs(moveEvent.clientX - startClient.x) > 4 || Math.abs(moveEvent.clientY - startClient.y) > 4) movedRef.current = true;
      const current = screenToSVG(moveEvent.clientX, moveEvent.clientY);
      onDragOffsetChange(node.id, current.x - startSVGCoords.x, current.y - startSVGCoords.y);
    };
    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (!dragStartPosRef.current) return;
      const final = screenToSVG(upEvent.clientX, upEvent.clientY);
      onDragOffsetChange(node.id, 0, 0);
      if (movedRef.current) {
        onPositionChange(node.id, dragStartPosRef.current.x + final.x - startSVGCoords.x, dragStartPosRef.current.y + final.y - startSVGCoords.y);
      } else if (onOpen) {
        // A tap (no drag) opens the thing's card (overlay, 2026-10-17).
        onOpen(node.id);
      } else if (count > 0) {
        // No card to open: a tap on a container opens what is inside.
        setContentsAnchor({ x: upEvent.clientX, y: upEvent.clientY });
      }
      setIsDragging(false);
      dragStartPosRef.current = null;
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const closeContents = useCallback(() => setContentsAnchor(null), []);

  const contextMenu = showContextMenu && typeof window !== 'undefined' && createPortal(
    <div
      ref={contextMenuRef}
      className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-2xl py-1 z-50"
      style={{ left: `${contextMenuPos.x}px`, top: `${contextMenuPos.y}px`, minWidth: '160px' }}
    >
      {count > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); setShowContextMenu(false); setContentsAnchor({ x: contextMenuPos.x, y: contextMenuPos.y }); }}
          className="w-full px-4 py-2 text-left text-white hover:bg-white/10 transition-colors flex items-center gap-2"
        >
          <span>{'▣'}</span>
          Open ({count})
        </button>
      )}
      {/* Take out — one level up; dragging never detaches (Mike 2026-08-03). */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowContextMenu(false);
          window.dispatchEvent(new CustomEvent('growth:take-out', { detail: { nodeId: node.id } }));
        }}
        className="w-full px-4 py-2 text-left text-white hover:bg-white/10 transition-colors flex items-center gap-2"
      >
        <span>{'⬆'}</span>
        Take Out
      </button>
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); setShowContextMenu(false); onDelete(node.id); }}
          className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-2"
        >
          <span>{'✕'}</span>
          Delete Item
        </button>
      )}
    </div>,
    document.body,
  );

  const box = itemTokenBox(node.data);
  const d = Math.min(box.w, box.h);
  const dragging = isDragging || isDraggingNode;
  return (
    <div
      data-item-token={node.id}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      style={{ width: box.w, height: box.h, position: 'relative', cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none' }}
    >
      <ComplexTooltip
        title={tip.title}
        modifiers={tip.modifiers}
        totalValue={0}
        totalLabel={tip.totalLabel}
        totalText={tip.totalText}
        hideTotal={tip.hideTotal}
        disabled={dragging || !!contentsAnchor}
        inline
        triggerStyle={{ display: 'block', width: box.w, height: box.h }}
      >
        {box.points ? (
          // The thing's real floor shape, to scale.
          <svg width={box.w} height={box.h} style={{ display: 'block', overflow: 'visible', filter: dragging ? 'drop-shadow(0 8px 12px rgba(0,0,0,0.7))' : undefined }}>
            <polygon points={polygonPointsAttr(box.points)} fill="rgba(13,13,26,0.82)" stroke={ring} strokeWidth={3} strokeLinejoin="round" />
            <text x={box.w / 2} y={box.h / 2} dy="0.35em" textAnchor="middle" fill={GOLD}
              style={{ fontFamily: 'var(--font-header), "Bebas Neue", sans-serif', fontSize: Math.max(12, Math.min(26, Math.min(box.w, box.h) * 0.45)), letterSpacing: '0.04em', pointerEvents: 'none' }}>
              {Math.min(box.w, box.h) >= 50 && box.w >= 90 ? node.name.replace(/^the\s+/i, '').slice(0, Math.floor(box.w / 11)) : mark}
            </text>
          </svg>
        ) : (
        <div
          style={{
            width: d,
            height: d,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 30%, #1b1b2e 0%, #0d0d1a 70%)',
            border: `${Math.max(2, Math.round(d / 18))}px solid ${ring}`,
            boxShadow: dragging
              ? `0 0 0 3px rgba(255,204,120,0.5), 0 10px 18px rgba(0,0,0,0.7)`
              : `0 0 10px ${ring}66, 0 3px 8px rgba(0,0,0,0.6)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: GOLD,
            fontFamily: 'var(--font-header), "Bebas Neue", sans-serif',
            fontSize: Math.round(d * 0.42),
            letterSpacing: '0.04em',
            lineHeight: 1,
            transform: dragging ? 'scale(1.08)' : 'scale(1)',
            transition: dragging ? 'none' : 'transform 0.15s ease-out',
          }}
        >
          {mark}
        </div>
        )}
      </ComplexTooltip>
      {count > 0 && (
        <div
          data-token-count
          style={{
            position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, padding: '0 3px', borderRadius: 8,
            background: GOLD, color: '#0a0a0a', border: '1px solid #0a0a0a',
            fontFamily: 'var(--font-header), "Bebas Neue", sans-serif', fontSize: 11, lineHeight: '14px', textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          {count}
        </div>
      )}
      {contentsAnchor && typeof window !== 'undefined' && (
        <TokenContents rootId={node.id} rootName={node.name} anchor={contentsAnchor} onClose={closeContents} />
      )}
      {contextMenu}
    </div>
  );
}
