"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { ChangeLogEntry, ChangeActor, ChangeCategory } from '@/types/changelog';

interface ChangeLogPanelProps {
  campaignId: string;
  visible?: boolean;
  onRevert?: () => void;
}

const ACTOR_COLORS: Record<ChangeActor, string> = {
  player: '#22ab94',
  gm: '#ffcc78',
  ai_copilot: '#7050A8',
  system: '#666',
};

const ACTOR_LABELS: Record<ChangeActor, string> = {
  player: 'PLAYER',
  gm: 'GM',
  ai_copilot: 'AI',
  system: 'SYS',
};

const CATEGORY_ICONS: Record<string, string> = {
  attribute: '\u25C8',
  condition: '\u26A0',
  inventory: '\uD83C\uDF92',
  equipment: '\u2694',
  skill: '\u2605',
  magic: '\u2728',
  trait: '\u2736',
  grovine: '\u2618',
  vitals: '\u2695',
  identity: '\u263A',
  levels: '\u2191',
  fear: '\u2620',
  harvest: '\u2618',
  backstory: '\u270E',
  campaign: '\u2302',
  status: '\u25CF',
};

export default function ChangeLogPanel({ campaignId, visible = true, onRevert }: ChangeLogPanelProps) {
  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [reverting, setReverting] = useState<string | null>(null);

  // Filters
  const [filterActor, setFilterActor] = useState<ChangeActor | ''>('');
  const [filterCategory, setFilterCategory] = useState<ChangeCategory | ''>('');
  const [filterCharacter, setFilterCharacter] = useState('');

  const fetchEntries = useCallback(async (cursor?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ campaignId });
      if (filterActor) params.set('actor', filterActor);
      if (filterCategory) params.set('category', filterCategory);
      if (filterCharacter) params.set('characterId', filterCharacter);
      if (cursor) params.set('cursor', cursor);
      params.set('limit', '30');

      const res = await fetch(`/api/changelog?${params}`);
      if (!res.ok) return;

      const data = await res.json();
      if (cursor) {
        setEntries(prev => [...prev, ...data.entries]);
      } else {
        setEntries(data.entries);
      }
      setNextCursor(data.nextCursor);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [campaignId, filterActor, filterCategory, filterCharacter]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Auto-poll every 5s when panel is visible
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => fetchEntries(), 5000);
    return () => clearInterval(interval);
  }, [visible, fetchEntries]);

  const handleRevert = async (entryId: string) => {
    if (!confirm('Revert this change? The previous value will be restored.')) return;
    setReverting(entryId);
    try {
      const res = await fetch(`/api/changelog/${entryId}/revert`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Revert failed');
        return;
      }
      // Refresh the list and notify parent to update canvas
      fetchEntries();
      onRevert?.();
    } catch {
      alert('Connection failed');
    } finally {
      setReverting(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Get unique character names from loaded entries
  const characterNames = [...new Set(entries.map(e => e.characterName).filter(Boolean))];

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: '#0a0a1a' }}>
      {/* Header */}
      <div className="flex-shrink-0 p-3 border-b" style={{ borderColor: 'rgba(34, 171, 148, 0.3)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span style={{ color: '#ffcc78', fontSize: '14px' }}>{'\u25C8'}</span>
            <h2 className="text-sm uppercase tracking-widest" style={{
              fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
              color: '#ffcc78',
              fontSize: '18px',
            }}>CHANGE LOG</h2>
          </div>
          <button
            onClick={() => fetchEntries()}
            className="px-2 py-1 text-[10px] uppercase tracking-wider transition-colors"
            style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              color: '#22ab94',
              border: '1px solid rgba(34, 171, 148, 0.4)',
              backgroundColor: 'transparent',
            }}
            onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(34, 171, 148, 0.15)')}
            onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            REFRESH
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <select
            value={filterActor}
            onChange={e => setFilterActor(e.target.value as ChangeActor | '')}
            className="text-[10px] px-2 py-1"
            style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              backgroundColor: '#1a1a2e',
              color: '#ccc',
              border: '1px solid rgba(255, 204, 120, 0.3)',
              outline: 'none',
            }}
          >
            <option value="">All actors</option>
            <option value="player">Player</option>
            <option value="gm">GM</option>
            <option value="ai_copilot">AI</option>
            <option value="system">System</option>
          </select>

          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value as ChangeCategory | '')}
            className="text-[10px] px-2 py-1"
            style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              backgroundColor: '#1a1a2e',
              color: '#ccc',
              border: '1px solid rgba(255, 204, 120, 0.3)',
              outline: 'none',
            }}
          >
            <option value="">All types</option>
            <option value="attribute">Attribute</option>
            <option value="condition">Condition</option>
            <option value="inventory">Inventory</option>
            <option value="skill">Skill</option>
            <option value="magic">Magic</option>
            <option value="trait">Trait</option>
            <option value="vitals">Vitals</option>
          </select>

          {characterNames.length > 1 && (
            <select
              value={filterCharacter}
              onChange={e => setFilterCharacter(e.target.value)}
              className="text-[10px] px-2 py-1"
              style={{
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                backgroundColor: '#1a1a2e',
                color: '#ccc',
                border: '1px solid rgba(255, 204, 120, 0.3)',
                outline: 'none',
              }}
            >
              <option value="">All characters</option>
              {characterNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && entries.length === 0 && (
          <div className="text-center py-8 text-[11px]" style={{
            fontFamily: 'var(--font-terminal), Consolas, monospace',
            color: 'rgba(34, 171, 148, 0.5)',
          }}>Loading...</div>
        )}

        {!loading && entries.length === 0 && (
          <div className="text-center py-8">
            <div className="text-[11px] mb-1" style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              color: 'rgba(255, 204, 120, 0.4)',
            }}>No changes recorded yet</div>
            <div className="text-[9px]" style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              color: 'rgba(255, 255, 255, 0.2)',
            }}>Changes will appear here as characters are modified</div>
          </div>
        )}

        {entries.map(entry => {
          const isExpanded = expandedIds.has(entry.id);
          const actorColor = ACTOR_COLORS[entry.actor] || '#666';
          const icon = CATEGORY_ICONS[entry.category] || '\u25CF';
          const isReverted = !!entry.revertedAt;

          return (
            <div
              key={entry.id}
              className="transition-colors"
              style={{
                backgroundColor: isReverted ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 204, 120, 0.1)',
                borderRadius: '2px',
                opacity: isReverted ? 0.5 : 1,
              }}
            >
              {/* Entry header row */}
              <div
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer"
                onClick={() => toggleExpand(entry.id)}
              >
                {/* Actor badge */}
                <span className="text-[8px] font-bold px-1.5 py-0.5 flex-shrink-0" style={{
                  backgroundColor: actorColor,
                  color: entry.actor === 'gm' ? '#1a1a2e' : '#fff',
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                  borderRadius: '1px',
                  minWidth: '28px',
                  textAlign: 'center',
                }}>{ACTOR_LABELS[entry.actor]}</span>

                {/* Category icon */}
                <span className="text-xs flex-shrink-0" style={{ color: '#ffcc78' }}>{icon}</span>

                {/* Character name */}
                <span className="text-[9px] flex-shrink-0" style={{
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                  color: '#8e7cc3',
                }}>{entry.characterName}</span>

                {/* Description */}
                <span className="text-[10px] flex-1 truncate" style={{
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                  color: isReverted ? '#666' : '#ccc',
                  textDecoration: isReverted ? 'line-through' : 'none',
                }}>{entry.description}</span>

                {/* Timestamp */}
                <span className="text-[8px] flex-shrink-0" style={{
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                  color: 'rgba(255, 255, 255, 0.3)',
                }}>{formatTime(entry.createdAt)}</span>

                {/* Expand indicator */}
                <span className="text-[8px] flex-shrink-0" style={{ color: 'rgba(255, 255, 255, 0.3)' }}>
                  {isExpanded ? '\u25BC' : '\u25B6'}
                </span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-3 pb-2 pt-1 border-t" style={{ borderColor: 'rgba(255, 204, 120, 0.08)' }}>
                  {/* Field changes */}
                  <div className="space-y-1 mb-2">
                    {entry.changes.map((change, i) => (
                      <div key={i} className="flex items-center gap-2 text-[9px]" style={{
                        fontFamily: 'var(--font-terminal), Consolas, monospace',
                      }}>
                        <span style={{ color: '#666', minWidth: '140px' }}>{change.path}</span>
                        <span style={{ color: '#ff6b6b' }}>{JSON.stringify(change.previousValue)}</span>
                        <span style={{ color: '#666' }}>{'\u2192'}</span>
                        <span style={{ color: '#22ab94' }}>{JSON.stringify(change.newValue)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Source + Revert */}
                  <div className="flex items-center justify-between">
                    <span className="text-[8px]" style={{
                      fontFamily: 'var(--font-terminal), Consolas, monospace',
                      color: 'rgba(255, 255, 255, 0.2)',
                    }}>
                      {entry.source && `source: ${entry.source}`}
                      {isReverted && ` \u2022 reverted`}
                    </span>

                    {entry.revertible && !isReverted && (
                      <button
                        onClick={e => { e.stopPropagation(); handleRevert(entry.id); }}
                        disabled={reverting === entry.id}
                        className="text-[9px] px-2 py-0.5 transition-colors"
                        style={{
                          fontFamily: 'var(--font-terminal), Consolas, monospace',
                          color: '#ff6b6b',
                          border: '1px solid rgba(255, 107, 107, 0.3)',
                          backgroundColor: 'transparent',
                          borderRadius: '2px',
                          cursor: reverting === entry.id ? 'wait' : 'pointer',
                          opacity: reverting === entry.id ? 0.5 : 1,
                        }}
                        onMouseOver={e => (e.currentTarget.style.backgroundColor = 'rgba(255, 107, 107, 0.1)')}
                        onMouseOut={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        {reverting === entry.id ? 'REVERTING...' : 'REVERT'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Load more */}
        {nextCursor && (
          <button
            onClick={() => fetchEntries(nextCursor)}
            disabled={loading}
            className="w-full py-2 text-[10px] uppercase tracking-wider transition-colors"
            style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              color: '#22ab94',
              backgroundColor: 'transparent',
              border: '1px solid rgba(34, 171, 148, 0.2)',
            }}
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}
