"use client";

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface TooltipModifier {
  name: string;
  value: number;
  description?: string;
  source?: {
    name: string;
    type: string;
    description?: string;
    stats?: Record<string, string | number>;
  };
}

interface ComplexTooltipProps {
  children: React.ReactNode;
  title: string;
  baseValue?: number;
  currentValue?: number;    // Current pool (e.g. 8 of 14)
  modifiers: TooltipModifier[];
  totalValue: number;
  disabled?: boolean;
  /** Footer label. Default 'Total:' ('Max Pool:' when currentValue set).
   *  Trait popups pass 'KV:' (Mike 2026-08-21). */
  totalLabel?: string;
  /** Override the footer VALUE text (e.g. 'ungraded' when there is no number). */
  totalText?: string;
  /** Hide the footer entirely (info-only tooltips with nothing to total). */
  hideTotal?: boolean;
  /** Render the trigger inline (inline-block, auto width) instead of a
   *  full-width block — for chips, counts and other flex-row members. */
  inline?: boolean;
  /** Extra class/style on the trigger wrapper. */
  triggerClassName?: string;
  triggerStyle?: React.CSSProperties;
  /** Forwarded to the trigger so a host can keep its own gesture (e.g. the
   *  folder-header drag) alive while the tooltip listens for hover/tap. */
  onTriggerPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** A free-form body in place of the pool/base/augment/total sections —
   *  info cards (a TABLE feed line, a thing in the world). Hides the footer. */
  content?: React.ReactNode;
  /** 'terminal' = the rulebook's Terminal output: black panel, gold rule on
   *  top, Bebas gold title, grab bar on the phone sheet (TABLE feed, 2026-10-07). */
  skin?: 'default' | 'terminal';
  /** 'span' when the trigger sits inside running text (a div there is invalid). */
  triggerAs?: 'div' | 'span';
  /** Extra attributes on the trigger (role, tabIndex, aria-*, data-*). */
  triggerProps?: React.HTMLAttributes<HTMLElement> & { [data: `data-${string}`]: string | undefined };
  /** Told when the tooltip opens and closes (the host can mark its trigger as open). */
  onOpenChange?: (open: boolean) => void;
}

/** True when the primary pointer is a finger. Read at event time, not render time. */
const isCoarsePointer = () =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

const TIP_W = 400;   // max-w of the main tooltip
const NEST_W = 350;  // max-w of the nested tooltip

export const ComplexTooltip: React.FC<ComplexTooltipProps> = ({
  children,
  title,
  baseValue,
  currentValue,
  modifiers,
  totalValue,
  disabled = false,
  totalLabel,
  totalText,
  hideTotal = false,
  inline = false,
  triggerClassName,
  triggerStyle,
  onTriggerPointerDown,
  content,
  skin = 'default',
  triggerAs = 'div',
  triggerProps,
  onOpenChange,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPositionLocked, setIsPositionLocked] = useState(false);
  const [lockProgress, setLockProgress] = useState(0);
  const [nestedTooltip, setNestedTooltip] = useState<TooltipModifier['source'] | null>(null);
  /** Which row owns the open nested layer. Keyed by text, not object identity:
   *  hosts rebuild their modifier arrays every render, so `===` on the source
   *  object breaks the moment the parent re-renders. */
  const [nestedKey, setNestedKey] = useState<string | null>(null);
  const rowKey = (mod: TooltipModifier) => `${mod.name}|${mod.source?.name ?? ''}`;
  const [nestedPosition, setNestedPosition] = useState({ x: 0, y: 0 });
  /** Opened by a TAP (touch). Hover rules are off; tap-outside / ✕ closes.
   *  Touch tooltips open from a plain tap on the trigger — never a hold,
   *  because long-press on canvas chrome is CARRY (mobile session, 2026-10-06). */
  const [touchOpen, setTouchOpen] = useState(false);
  /** Touch placement: 'below' the trigger, or 'above' when near the bottom edge. */
  const [touchSide, setTouchSide] = useState<'below' | 'above'>('below');
  /** Narrow screens (phones): the touch tooltip is a bottom sheet instead of a floating panel. */
  const [touchSheet, setTouchSheet] = useState(false);
  const triggerRef = useRef<HTMLElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const nestedRef = useRef<HTMLDivElement>(null);
  const lockStartTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  const LOCK_DELAY = 500;

  const closeAll = () => {
    setIsVisible(false);
    setIsPositionLocked(false);
    setLockProgress(0);
    setNestedTooltip(null);
    setNestedKey(null);
    setTouchOpen(false);
    lockStartTimeRef.current = 0;
    if (nestedCloseTimer.current) { clearTimeout(nestedCloseTimer.current); nestedCloseTimer.current = null; } // eslint-disable-line react-hooks/immutability -- event-handler only
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
  };

  const updateLockProgress = () => {
    if (!lockStartTimeRef.current || isPositionLocked) return;

    const elapsed = Date.now() - lockStartTimeRef.current; // eslint-disable-line react-hooks/purity
    const progress = Math.min(elapsed / LOCK_DELAY, 1);
    setLockProgress(progress);

    if (progress >= 1) {
      setIsPositionLocked(true);
      setLockProgress(1);
    } else {
      animationFrameRef.current = requestAnimationFrame(updateLockProgress);
    }
  };

  // Tell the host when we open / close (it may mark its trigger as open).
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => { onOpenChangeRef.current = onOpenChange; }, [onOpenChange]);
  const reportedOpenRef = useRef(false);
  useEffect(() => {
    if (reportedOpenRef.current === isVisible) return;
    reportedOpenRef.current = isVisible;
    onOpenChangeRef.current?.(isVisible);
  }, [isVisible]);

  // Close tooltip when disabled changes to true (e.g. drag started)
  useEffect(() => {
    if (disabled && isVisible) {
      closeAll();
    }
  }, [disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Touch: a tap anywhere outside the trigger / tooltip / nested closes it.
  useEffect(() => {
    if (!touchOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (triggerRef.current?.contains(t) || tooltipRef.current?.contains(t) || nestedRef.current?.contains(t)) return;
      closeAll();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [touchOpen]);

  // A tap fires synthetic mouseenter/mousemove and never a mouseleave, so on a
  // coarse pointer the hover path is off entirely; the tap path owns it.
  const handleMouseEnter = (e: React.MouseEvent) => {
    if (disabled || touchOpen || isCoarsePointer()) return;
    setIsVisible(true);
    setIsPositionLocked(false);
    setLockProgress(0);
    updatePosition(e);

    lockStartTimeRef.current = Date.now(); // eslint-disable-line react-hooks/purity
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(updateLockProgress);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isVisible || disabled || touchOpen || isCoarsePointer()) return;

    if (!isPositionLocked) {
      updatePosition(e);
      lockStartTimeRef.current = Date.now(); // eslint-disable-line react-hooks/purity
      setLockProgress(0);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = requestAnimationFrame(updateLockProgress);
    }
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
    if (touchOpen || isCoarsePointer()) return;
    if (tooltipRef.current && e.relatedTarget instanceof Node) {
      if (tooltipRef.current.contains(e.relatedTarget)) return;
    }
    closeAll();
  };

  const handleTooltipMouseEnter = () => {
    if (!isPositionLocked) {
      setIsPositionLocked(true);
      setLockProgress(1);
    }
  };

  const handleTooltipMouseLeave = (e: React.MouseEvent) => {
    if (touchOpen) return;
    if (e.relatedTarget instanceof Node) {
      if (triggerRef.current?.contains(e.relatedTarget)) return;
      // Into the nested (inception) panel — it floats beside us, not inside us.
      if (nestedRef.current?.contains(e.relatedTarget)) return;
    }
    closeAll();
  };

  /** Leaving the nested panel: back into the main tooltip keeps it open, anywhere else closes the lot. */
  const handleNestedMouseLeave = (e: React.MouseEvent) => {
    if (touchOpen) return;
    if (e.relatedTarget instanceof Node && (tooltipRef.current?.contains(e.relatedTarget) || triggerRef.current?.contains(e.relatedTarget))) {
      clearNested();
      return;
    }
    closeAll();
  };

  const updatePosition = (e: React.MouseEvent) => {
    setPosition({ x: e.clientX + 1, y: e.clientY + 1 });
  };

  /** Touch: a plain tap toggles the tooltip, anchored to the trigger and locked. */
  const handleClick = (e: React.MouseEvent) => {
    if (disabled || !isCoarsePointer()) return;
    e.stopPropagation();
    openAnchored();
  };

  /** Keyboard (a trigger with role=button): Enter / Space opens it the touch way, Escape closes. */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Escape' && isVisible) { closeAll(); return; }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    openAnchored();
  };

  const openAnchored = () => {
    if (isVisible) { closeAll(); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const sheet = vw < 600;
    setTouchSheet(sheet);
    if (!sheet) {
      const x = Math.max(8, Math.min(rect.left, vw - TIP_W - 8));
      const below = rect.bottom < vh * 0.6;
      setTouchSide(below ? 'below' : 'above');
      setPosition({ x, y: below ? rect.bottom + 6 : rect.top - 6 });
    }
    setIsVisible(true);
    setIsPositionLocked(true);
    setLockProgress(1);
    setTouchOpen(true);
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      // Ensure tooltip state is cleaned up on unmount
      setIsVisible(false);
      setNestedTooltip(null);
    };
  }, []);

  const placeNested = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const vw = typeof window !== 'undefined' ? window.innerWidth : 10000;
    if (touchOpen) {
      // Finger: stack it under the row, kept on screen.
      setNestedPosition({ x: Math.max(8, Math.min(rect.left, vw - NEST_W - 8)), y: rect.bottom + 4 });
    } else {
      // Mouse: to the right, or flip to the left when there is no room.
      const x = rect.right + 5 + NEST_W > vw ? Math.max(8, rect.left - NEST_W - 5) : rect.right + 5;
      setNestedPosition({ x, y: rect.top });
    }
  };

  /** Pending "close the nested layer" timer. One shared timer, cancelled by
   *  any new hover: leaving a plain row on the way INTO a sourced row used to
   *  schedule a clear that killed the just-opened panel 100 ms later. */
  const nestedCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelNestedClose = () => {
    if (!nestedCloseTimer.current) return;
    clearTimeout(nestedCloseTimer.current);
    nestedCloseTimer.current = null; // eslint-disable-line react-hooks/immutability -- event-handler only, never during render
  };
  const openNested = (mod: TooltipModifier, el: HTMLElement) => {
    cancelNestedClose();
    setNestedTooltip(mod.source ?? null);
    setNestedKey(mod.source ? rowKey(mod) : null);
    placeNested(el);
  };
  const clearNested = () => { setNestedTooltip(null); setNestedKey(null); };

  const handleModifierHover = (e: React.MouseEvent, mod: TooltipModifier) => {
    if (touchOpen) return;
    cancelNestedClose();
    if (mod.source) openNested(mod, e.currentTarget as HTMLElement);
  };

  const handleModifierLeave = (e: React.MouseEvent, mod: TooltipModifier) => {
    if (touchOpen || !mod.source) return;
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget && typeof relatedTarget.closest === 'function' && relatedTarget.closest('[data-nested-tooltip]')) return;
    cancelNestedClose();
    nestedCloseTimer.current = setTimeout(clearNested, 100); // eslint-disable-line react-hooks/immutability -- event-handler only
  };

  /** Touch: tap a sourced row to toggle its nested tooltip. */
  const handleModifierClick = (e: React.MouseEvent, mod: TooltipModifier) => {
    if (!touchOpen || !mod.source) return;
    e.stopPropagation();
    if (nestedKey === rowKey(mod)) { clearNested(); return; }
    openNested(mod, e.currentTarget as HTMLElement);
  };

  // Split modifiers into positive and negative for sectioned display
  const positiveModifiers = modifiers.filter(m => m.value > 0);
  const negativeModifiers = modifiers.filter(m => m.value < 0);
  const neutralModifiers = modifiers.filter(m => m.value === 0);
  const hasAugments = positiveModifiers.length > 0 || negativeModifiers.length > 0;

  /** The inception layer's body — shared by the floating nested panel (mouse)
   *  and the inline accordion (touch). */
  const renderSourceBody = (src: NonNullable<TooltipModifier['source']>) => (
    <>
      <div className="text-purple-400 font-bold text-sm mb-1"
        style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.04em' }}
      >
        {src.name}
      </div>
      <div className="text-gray-400 text-xs mb-2 italic"
        style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}
      >
        {src.type}
      </div>
      {src.description && (
        <div className="text-gray-300 text-xs mb-2 border-b border-purple-500/30 pb-2" style={{ whiteSpace: 'pre-wrap' }}>
          {src.description}
        </div>
      )}
      {src.stats && (
        <div className="space-y-1">
          {Object.entries(src.stats).map(([key, value]) => (
            <div key={key} className="flex justify-between gap-3 text-xs">
              <span className="text-gray-400">{key}:</span>
              <span className="text-white font-bold text-right">{value}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const renderModifier = (mod: TooltipModifier, index: number) => (
    <React.Fragment key={index}>
      <div
        className={`flex justify-between gap-3 text-xs px-1 py-0.5 rounded transition-colors ${mod.source ? 'cursor-pointer hover:bg-yellow-600/15' : ''} ${mod.source && nestedKey === rowKey(mod) ? 'bg-yellow-600/15' : ''}`}
        style={touchOpen ? { fontSize: 13, padding: '6px 4px' } : undefined}
        onMouseEnter={(e) => handleModifierHover(e, mod)}
        onMouseLeave={(e) => handleModifierLeave(e, mod)}
        onClick={(e) => handleModifierClick(e, mod)}
      >
        <span className="text-gray-300 flex items-start gap-1" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {mod.source && (
            <span className="text-yellow-500 flex-shrink-0" style={{ fontSize: touchOpen ? 12 : 8, marginTop: touchOpen ? 2 : 4, display: 'inline-block', transition: 'transform 120ms', transform: touchOpen && nestedKey === rowKey(mod) ? 'rotate(90deg)' : undefined }}>&#x25B6;</span>
          )}
          {mod.name}
        </span>
        {/* value 0 = an INFO row (description, rule text...) — a "0" on the
            right is noise (Mike 2026-08-21). Numbers only when they mean one. */}
        {mod.value !== 0 && (
          <span className={`font-bold flex-shrink-0 ${mod.value > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {mod.value > 0 ? '+' : ''}{mod.value}
          </span>
        )}
      </div>
      {/* Touch: the inception layer opens INLINE under its row (an accordion),
          so nothing floats off a phone screen. Mouse keeps the side panel. */}
      {touchOpen && mod.source && nestedKey === rowKey(mod) && (
        <div className="bg-gray-800 border-2 border-purple-500/80 rounded-lg p-3 my-1 ml-3" data-nested-tooltip="true">
          {renderSourceBody(mod.source)}
        </div>
      )}
    </React.Fragment>
  );

  const isSheet = touchOpen && touchSheet;
  const terminal = skin === 'terminal';

  return (
    <>
      {React.createElement(
        triggerAs,
        {
          ...triggerProps,
          ref: triggerRef,
          className: triggerClassName,
          onMouseEnter: handleMouseEnter,
          onMouseMove: handleMouseMove,
          onMouseLeave: handleMouseLeave,
          onClick: handleClick,
          onKeyDown: triggerProps?.role === 'button' ? handleKeyDown : undefined,
          onPointerDown: onTriggerPointerDown,
          style: inline
            ? { display: 'inline-block', ...triggerStyle }
            : { display: 'block', width: '100%', ...triggerStyle },
        },
        children,
      )}

      {isVisible && typeof window !== 'undefined' && createPortal(
        <div
          ref={tooltipRef}
          className={`fixed z-[9999] select-none ${isPositionLocked ? 'pointer-events-auto' : 'pointer-events-none'}`}
          style={isSheet
            ? { left: 0, right: 0, bottom: 0 }
            : {
              left: `${position.x}px`,
              top: `${position.y}px`,
              transform: touchOpen && touchSide === 'above' ? 'translateY(-100%)' : undefined,
            }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
          role={content !== undefined ? 'dialog' : undefined}
          aria-label={content !== undefined ? title : undefined}
        >
          {terminal ? (
            <div
              className="shadow-2xl"
              data-tooltip-skin="terminal"
              style={{
                background: '#000',
                color: '#f5f4ef',
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                borderTop: `3px solid rgba(255, 204, 120, ${isSheet ? 1 : Math.max(lockProgress, 0.35)})`,
                boxShadow: '0 -8px 24px rgba(0,0,0,.4)',
                ...(isSheet
                  ? { width: '100%', maxHeight: '60vh', overflowY: 'auto', padding: '6px 16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }
                  : { minWidth: 280, maxWidth: 400, padding: '8px 14px 12px' }),
              }}
            >
              {isSheet && <div aria-hidden style={{ width: 44, height: 4, background: '#5b6170', margin: '2px auto 8px' }} />}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: isSheet ? 26 : 22, lineHeight: 1.1, color: '#ffcc78', letterSpacing: '0.03em', overflowWrap: 'anywhere' }}>
                  {title}
                </span>
                {touchOpen && (
                  <button
                    onClick={(e) => { e.stopPropagation(); closeAll(); }}
                    aria-label="Close"
                    style={{ width: 40, height: 40, flex: 'none', border: 0, background: 'none', color: '#f5f4ef', fontSize: 18, cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                )}
              </div>
              {content}
            </div>
          ) : (
          <div
            className={`bg-gray-900 shadow-2xl p-3 transition-all ${touchOpen && touchSheet ? 'rounded-t-xl w-full' : 'rounded-lg min-w-[280px] max-w-[400px]'}`}
            style={{
              borderWidth: '2px',
              borderStyle: 'solid',
              borderColor: `rgba(255, 204, 120, ${lockProgress})`,
              ...(touchOpen && touchSheet ? { borderBottomWidth: 0, maxHeight: '60vh', overflowY: 'auto', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' } : {}),
            }}
          >
            {/* Title */}
            <div className="text-yellow-400 font-bold text-sm mb-2 border-b border-yellow-600/40 pb-2 flex items-center justify-between gap-3"
              style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em', fontSize: '16px' }}
            >
              <span>{title}</span>
              {touchOpen && (
                <button
                  onClick={(e) => { e.stopPropagation(); closeAll(); }}
                  aria-label="Close"
                  className="text-gray-400 leading-none"
                  style={{ background: 'none', border: 'none', padding: '2px 6px', fontSize: 18, cursor: 'pointer' }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Pool Display (current / max) */}
            {currentValue !== undefined && (
              <div className="flex justify-between text-xs mb-2 px-1">
                <span className="text-gray-400">Pool:</span>
                <span>
                  <span className={`font-bold ${currentValue <= 0 ? 'text-red-400' : 'text-white'}`}>{currentValue}</span>
                  <span className="text-gray-500"> / </span>
                  <span className="text-yellow-400 font-bold">{totalValue}</span>
                </span>
              </div>
            )}

            {/* Base Value */}
            {baseValue !== undefined && (
              <div className="flex justify-between text-xs mb-1 px-1">
                <span className="text-gray-400">Base Level:</span>
                <span className="text-white font-bold">{baseValue}</span>
              </div>
            )}

            {/* Augments Section */}
            {hasAugments && (
              <div className="mt-1 mb-1">
                {/* Positive augments */}
                {positiveModifiers.length > 0 && (
                  <div className="mb-1">
                    <div className="text-[10px] text-green-500/70 uppercase tracking-wider px-1 mb-0.5"
                      style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                    >
                      Augments +
                    </div>
                    <div className="space-y-0.5 border-l-2 border-green-500/30 ml-1 pl-1">
                      {positiveModifiers.map((mod, i) => renderModifier(mod, i))}
                    </div>
                  </div>
                )}

                {/* Negative augments */}
                {negativeModifiers.length > 0 && (
                  <div className="mb-1">
                    <div className="text-[10px] text-red-500/70 uppercase tracking-wider px-1 mb-0.5"
                      style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                    >
                      Augments -
                    </div>
                    <div className="space-y-0.5 border-l-2 border-red-500/30 ml-1 pl-1">
                      {negativeModifiers.map((mod, i) => renderModifier(mod, i))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Neutral modifiers (if any) */}
            {neutralModifiers.length > 0 && (
              <div className={`space-y-0.5 ${hideTotal ? '' : 'mb-2'}`}>
                {neutralModifiers.map((mod, i) => renderModifier(mod, i))}
              </div>
            )}

            {/* (Legacy flat block removed 2026-08-21 — it double-rendered
                every row of info-only tooltips alongside the neutral block.) */}

            {content}

            {/* Total / Max */}
            {!hideTotal && content === undefined && (
              <div className="flex justify-between text-sm font-bold border-t border-yellow-600/40 pt-2">
                <span className="text-yellow-400" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.03em' }}>
                  {totalLabel ?? (currentValue !== undefined ? 'Max Pool:' : 'Total:')}
                </span>
                <span className="text-white">{totalText ?? totalValue}</span>
              </div>
            )}
          </div>
          )}
        </div>,
        document.body
      )}

      {/* Nested Tooltip for Item/Source Details — mouse only; touch renders it inline above. */}
      {nestedTooltip && !touchOpen && typeof window !== 'undefined' && createPortal(
        <div
          ref={nestedRef}
          className={`fixed z-[10000] select-none ${isPositionLocked ? 'pointer-events-auto' : 'pointer-events-none'}`}
          style={{ left: `${nestedPosition.x}px`, top: `${nestedPosition.y}px` }}
          data-nested-tooltip="true"
          onMouseEnter={cancelNestedClose}
          onMouseLeave={handleNestedMouseLeave}
        >
          <div className="bg-gray-800 border-2 border-purple-500/80 rounded-lg shadow-2xl p-3 min-w-[250px] max-w-[350px]">
            {renderSourceBody(nestedTooltip)}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
