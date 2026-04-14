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
}

export const ComplexTooltip: React.FC<ComplexTooltipProps> = ({
  children,
  title,
  baseValue,
  currentValue,
  modifiers,
  totalValue,
  disabled = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPositionLocked, setIsPositionLocked] = useState(false);
  const [lockProgress, setLockProgress] = useState(0);
  const [nestedTooltip, setNestedTooltip] = useState<TooltipModifier['source'] | null>(null);
  const [nestedPosition, setNestedPosition] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const lockStartTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  const LOCK_DELAY = 500;

  const closeAll = () => {
    setIsVisible(false);
    setIsPositionLocked(false);
    setLockProgress(0);
    setNestedTooltip(null);
    lockStartTimeRef.current = 0;
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

  // Close tooltip when disabled changes to true (e.g. drag started)
  useEffect(() => {
    if (disabled && isVisible) {
      closeAll();
    }
  }, [disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (disabled) return;
    setIsVisible(true);
    setIsPositionLocked(false);
    setLockProgress(0);
    updatePosition(e);

    lockStartTimeRef.current = Date.now(); // eslint-disable-line react-hooks/purity
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(updateLockProgress);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isVisible || disabled) return;

    if (!isPositionLocked) {
      updatePosition(e);
      lockStartTimeRef.current = Date.now(); // eslint-disable-line react-hooks/purity
      setLockProgress(0);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = requestAnimationFrame(updateLockProgress);
    }
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
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
    if (triggerRef.current && e.relatedTarget instanceof Node) {
      if (triggerRef.current.contains(e.relatedTarget)) return;
    }
    closeAll();
  };

  const updatePosition = (e: React.MouseEvent) => {
    setPosition({ x: e.clientX + 1, y: e.clientY + 1 });
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      // Ensure tooltip state is cleaned up on unmount
      setIsVisible(false);
      setNestedTooltip(null);
    };
  }, []);

  const handleModifierHover = (e: React.MouseEvent, source: TooltipModifier['source']) => {
    if (source) {
      setNestedTooltip(source);
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setNestedPosition({ x: rect.right + 5, y: rect.top });
    }
  };

  const handleModifierLeave = (e: React.MouseEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (relatedTarget && relatedTarget.closest('[data-nested-tooltip]')) return;
    setTimeout(() => setNestedTooltip(null), 100);
  };

  // Split modifiers into positive and negative for sectioned display
  const positiveModifiers = modifiers.filter(m => m.value > 0);
  const negativeModifiers = modifiers.filter(m => m.value < 0);
  const neutralModifiers = modifiers.filter(m => m.value === 0);
  const hasAugments = positiveModifiers.length > 0 || negativeModifiers.length > 0;

  const renderModifier = (mod: TooltipModifier, index: number) => (
    <div
      key={index}
      className={`flex justify-between text-xs px-1 py-0.5 rounded transition-colors ${mod.source ? 'cursor-pointer hover:bg-yellow-600/15' : ''}`}
      onMouseEnter={(e) => handleModifierHover(e, mod.source)}
      onMouseLeave={handleModifierLeave}
    >
      <span className="text-gray-300 flex items-center gap-1">
        {mod.source && <span className="text-yellow-500" style={{ fontSize: '8px' }}>&#x25B6;</span>}
        {mod.name}
      </span>
      <span className={`font-bold ${mod.value > 0 ? 'text-green-400' : mod.value < 0 ? 'text-red-400' : 'text-gray-400'}`}>
        {mod.value > 0 ? '+' : ''}{mod.value}
      </span>
    </div>
  );

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'block', width: '100%' }}
      >
        {children}
      </div>

      {isVisible && typeof window !== 'undefined' && createPortal(
        <div
          ref={tooltipRef}
          className={`fixed z-[9999] select-none ${isPositionLocked ? 'pointer-events-auto' : 'pointer-events-none'}`}
          style={{ left: `${position.x}px`, top: `${position.y}px` }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        >
          <div
            className="bg-gray-900 rounded-lg shadow-2xl p-3 min-w-[280px] max-w-[400px] transition-all"
            style={{
              borderWidth: '2px',
              borderStyle: 'solid',
              borderColor: `rgba(255, 204, 120, ${lockProgress})`,
            }}
          >
            {/* Title */}
            <div className="text-yellow-400 font-bold text-sm mb-2 border-b border-yellow-600/40 pb-2"
              style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em', fontSize: '16px' }}
            >
              {title}
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
              <div className="space-y-0.5 mb-2">
                {neutralModifiers.map((mod, i) => renderModifier(mod, i))}
              </div>
            )}

            {/* No augments - flat display for non-attribute tooltips */}
            {!hasAugments && baseValue === undefined && modifiers.length > 0 && (
              <div className="space-y-0.5 mb-2">
                {modifiers.map((mod, i) => renderModifier(mod, i))}
              </div>
            )}

            {/* Total / Max */}
            <div className="flex justify-between text-sm font-bold border-t border-yellow-600/40 pt-2">
              <span className="text-yellow-400" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.03em' }}>
                {currentValue !== undefined ? 'Max Pool:' : 'Total:'}
              </span>
              <span className="text-white">{totalValue}</span>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Nested Tooltip for Item/Source Details */}
      {nestedTooltip && typeof window !== 'undefined' && createPortal(
        <div
          className={`fixed z-[10000] select-none ${isPositionLocked ? 'pointer-events-auto' : 'pointer-events-none'}`}
          style={{ left: `${nestedPosition.x}px`, top: `${nestedPosition.y}px` }}
          data-nested-tooltip="true"
          onMouseLeave={() => setNestedTooltip(null)}
        >
          <div className="bg-gray-800 border-2 border-purple-500/80 rounded-lg shadow-2xl p-3 min-w-[250px] max-w-[350px]">
            <div className="text-purple-400 font-bold text-sm mb-1"
              style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.04em' }}
            >
              {nestedTooltip.name}
            </div>
            <div className="text-gray-400 text-xs mb-2 italic"
              style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}
            >
              {nestedTooltip.type}
            </div>

            {nestedTooltip.description && (
              <div className="text-gray-300 text-xs mb-2 border-b border-purple-500/30 pb-2">
                {nestedTooltip.description}
              </div>
            )}

            {nestedTooltip.stats && (
              <div className="space-y-1">
                {Object.entries(nestedTooltip.stats).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-xs">
                    <span className="text-gray-400">{key}:</span>
                    <span className="text-white font-bold">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
