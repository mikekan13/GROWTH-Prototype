"use client";

import React, { useState } from 'react';

export interface HarvestItem {
  season: string;
  turn: number;
  description?: string;
  rewards?: string[];
  consequences?: string[];
  krmaChange?: number;
}

interface HarvestCardProps {
  harvests: HarvestItem[];
  onClose?: () => void;
}

const SEASON_STYLES: Record<string, { color: string; icon: string }> = {
  spring: { color: '#3EB89A', icon: '\u2618' },
  summer: { color: '#D0A030', icon: '\u2600' },
  autumn: { color: '#D07818', icon: '\u2741' },
  winter: { color: '#7050A8', icon: '\u2744' },
};

export default function HarvestCard({ harvests, onClose }: HarvestCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const safeHarvests = Array.isArray(harvests) ? harvests : [];

  return (
    <div className="border transition-all duration-200" style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#1a1a2e', borderColor: '#ffcc78', borderRadius: '3px', width: '400px' }}>
      {/* Header */}
      <div className="p-3 text-white cursor-grab" style={{ background: 'linear-gradient(135deg, #582a72 0%, #3d1952 100%)', borderRadius: '2px 2px 0 0' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-lg">{'\u2618'}</span>
            <div>
              <h3 className="font-semibold text-sm" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em', fontSize: '15px' }}>HARVESTS</h3>
              <p className="text-xs" style={{ color: '#ffcc78', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px' }}>
                {safeHarvests.length} harvest{safeHarvests.length !== 1 ? 's' : ''} recorded
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={e => { e.stopPropagation(); setIsExpanded(!isExpanded); }} onMouseDown={e => e.stopPropagation()} className="p-1 hover:bg-white/20 transition-colors" style={{ borderRadius: '2px' }}>
              <svg className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {onClose && (
              <button onClick={e => { e.stopPropagation(); onClose(); }} onMouseDown={e => e.stopPropagation()} className="p-1 hover:bg-white/20 transition-colors" style={{ borderRadius: '2px' }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="p-3" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {safeHarvests.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-4">No harvests yet</div>
            ) : safeHarvests.map((h, i) => {
              const ss = SEASON_STYLES[h.season.toLowerCase()] || { color: '#888', icon: '\u2022' };
              return (
                <div key={i} className="p-2 border transition-colors" onMouseDown={e => e.stopPropagation()}
                  style={{ borderRadius: '2px', backgroundColor: '#2a2a3e', borderColor: '#3a3a4e', borderLeftColor: ss.color, borderLeftWidth: '3px' }}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span style={{ color: ss.color }}>{ss.icon}</span>
                      <span className="text-xs font-bold uppercase" style={{ color: ss.color, fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>
                        {h.season} — Turn {h.turn}
                      </span>
                    </div>
                    {h.krmaChange !== undefined && h.krmaChange !== 0 && (
                      <span className="text-[10px] px-1" style={{
                        backgroundColor: '#1a1a2e',
                        color: h.krmaChange > 0 ? '#22ab94' : '#E84040',
                        border: `1px solid ${h.krmaChange > 0 ? '#22ab9440' : '#E8404040'}`,
                        borderRadius: '2px',
                      }}>
                        {h.krmaChange > 0 ? '+' : ''}{h.krmaChange} {'\u049C'}
                      </span>
                    )}
                  </div>
                  {h.description && <p className="text-xs mb-1" style={{ color: '#ccc' }}>{h.description}</p>}
                  {h.rewards && h.rewards.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {h.rewards.map((r, j) => (
                        <span key={j} className="text-[8px] px-1" style={{ backgroundColor: 'rgba(34,171,148,0.15)', color: '#22ab94', borderRadius: '2px' }}>{r}</span>
                      ))}
                    </div>
                  )}
                  {h.consequences && h.consequences.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {h.consequences.map((c, j) => (
                        <span key={j} className="text-[8px] px-1" style={{ backgroundColor: 'rgba(232,64,64,0.15)', color: '#E84040', borderRadius: '2px' }}>{c}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
