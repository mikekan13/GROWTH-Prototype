"use client";

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface TooltipModifier {
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
  modifiers: TooltipModifier[];
  totalValue: number;
  disabled?: boolean;
}

export const ComplexTooltip: React.FC<ComplexTooltipProps> = ({
  children,
  title,
  baseValue,
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

  const updateLockProgress = () => {
    if (!lockStartTimeRef.current || isPositionLocked) return;

    const elapsed = Date.now() - lockStartTimeRef.current;
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

    lockStartTimeRef.current = Date.now();
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(updateLockProgress);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isVisible || disabled) return;

    if (!isPositionLocked) {
      updatePosition(e);
      lockStartTimeRef.current = Date.now();
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

  const closeAll = () => {
    setIsVisible(false);
    setIsPositionLocked(false);
    setLockProgress(0);
    setNestedTooltip(null);
    lockStartTimeRef.current = 0;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
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
            <div className="text-yellow-400 font-bold text-sm mb-2 border-b border-yellow-600/40 pb-2">
              {title}
            </div>

            {/* Base Value */}
            {baseValue !== undefined && (
              <div className="flex justify-between text-xs mb-1 text-gray-300">
                <span>Base:</span>
                <span className="text-white font-bold">{baseValue}</span>
              </div>
            )}

            {/* Modifiers List */}
            <div className="space-y-1 mb-2">
              {modifiers.map((mod, index) => (
                <div
                  key={index}
                  className="flex justify-between text-xs cursor-help hover:bg-yellow-600/10 px-1 py-0.5 rounded transition-colors"
                  onMouseEnter={(e) => handleModifierHover(e, mod.source)}
                  onMouseLeave={handleModifierLeave}
                >
                  <span className="text-gray-300 flex items-center gap-1">
                    {mod.source && <span className="text-yellow-500">&#x25B6;</span>}
                    {mod.name}
                  </span>
                  <span className={`font-bold ${mod.value >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {mod.value >= 0 ? '+' : ''}{mod.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="flex justify-between text-sm font-bold border-t border-yellow-600/40 pt-2">
              <span className="text-yellow-400">Total:</span>
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
            <div className="text-purple-400 font-bold text-sm mb-1">
              {nestedTooltip.name}
            </div>
            <div className="text-gray-400 text-xs mb-2 italic">
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
