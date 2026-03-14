"use client";

import React, { useState } from 'react';
import type { GROvine } from '@/types/growth';

interface GROvinePanelProps {
  characterName: string;
  grovines: GROvine[];
  maxCapacity?: number; // Default 3, humans get 4 with Ambitious nectar
  onAdd?: (vine: Omit<GROvine, 'id'>) => void;
  onUpdate?: (vine: GROvine) => void;
  onRemove?: (vineId: string) => void;
  onClose?: () => void;
}

const STATUS_COLORS = {
  active: '#22ab94',
  completed: '#4ade80',
  failed: '#E8585A',
};

export default function GROvinePanel({
  characterName,
  grovines,
  maxCapacity = 3,
  onAdd,
  onUpdate,
  onRemove,
  onClose,
}: GROvinePanelProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newGoal, setNewGoal] = useState('');
  const [expandedVine, setExpandedVine] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const activeVines = grovines.filter(v => v.status === 'active');
  const completedVines = grovines.filter(v => v.status === 'completed');
  const failedVines = grovines.filter(v => v.status === 'failed');

  const handleAdd = () => {
    if (!newGoal.trim()) return;
    onAdd?.({
      goal: newGoal.trim(),
      resistance: '',
      opportunity: '',
      status: 'active',
    });
    setNewGoal('');
    setIsAdding(false);
  };

  return (
    <div style={{
      width: 380,
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      border: '2px solid #22ab94',
      borderRadius: 3,
      color: '#fff',
      fontFamily: 'var(--font-terminal), Consolas, monospace',
      userSelect: 'none',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(90deg, rgba(34,171,148,0.2), rgba(34,171,148,0.05))',
        borderBottom: '1px solid rgba(34,171,148,0.3)',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-header), Bebas Neue, sans-serif',
            fontSize: 14,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#22ab94',
          }}>
            GRO.vines
          </div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)' }}>
            {characterName} &mdash; {activeVines.length}/{maxCapacity} active
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{
              background: '#22ab9422',
              border: '1px solid #22ab9455',
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
            {isCollapsed ? '\u2295' : '\u2297'}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.2)',
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
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div style={{ padding: '8px 12px' }}>
          {/* Active GRO.vines */}
          {activeVines.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {activeVines.map((vine) => (
                <VineRow
                  key={vine.id}
                  vine={vine}
                  isExpanded={expandedVine === vine.id}
                  onToggle={() => setExpandedVine(expandedVine === vine.id ? null : vine.id)}
                  onUpdate={onUpdate}
                  onRemove={onRemove}
                />
              ))}
            </div>
          )}

          {/* Add new vine */}
          {activeVines.length < maxCapacity && (
            isAdding ? (
              <div style={{
                padding: '6px 8px',
                background: 'rgba(34,171,148,0.08)',
                border: '1px solid rgba(34,171,148,0.2)',
                borderRadius: 2,
                marginBottom: 8,
              }}>
                <div style={{ fontSize: 9, color: '#22ab94', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  New Goal
                </div>
                <input
                  type="text"
                  value={newGoal}
                  onChange={(e) => setNewGoal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setIsAdding(false); }}
                  placeholder="What does this character want?"
                  style={{
                    width: '100%',
                    padding: '4px 6px',
                    background: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(34,171,148,0.3)',
                    borderRadius: 2,
                    color: '#fff',
                    fontSize: 10,
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button onClick={handleAdd} style={smallBtnStyle('#22ab94')}>Add</button>
                  <button onClick={() => setIsAdding(false)} style={smallBtnStyle('#808080')}>Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsAdding(true)}
                style={{
                  width: '100%',
                  padding: '6px',
                  background: 'rgba(34,171,148,0.08)',
                  border: '1px dashed rgba(34,171,148,0.3)',
                  borderRadius: 2,
                  color: '#22ab94',
                  fontSize: 9,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  fontFamily: 'inherit',
                  marginBottom: 8,
                }}
              >
                + New GRO.vine ({maxCapacity - activeVines.length} slots remaining)
              </button>
            )
          )}

          {/* Completed vines */}
          {completedVines.length > 0 && (
            <div>
              <div style={{ fontSize: 8, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>
                Completed ({completedVines.length})
              </div>
              {completedVines.map((vine) => (
                <VineRow
                  key={vine.id}
                  vine={vine}
                  isExpanded={expandedVine === vine.id}
                  onToggle={() => setExpandedVine(expandedVine === vine.id ? null : vine.id)}
                />
              ))}
            </div>
          )}

          {/* Failed vines */}
          {failedVines.length > 0 && (
            <div>
              <div style={{ fontSize: 8, color: '#E8585A', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4, marginTop: 6 }}>
                Failed ({failedVines.length})
              </div>
              {failedVines.map((vine) => (
                <VineRow
                  key={vine.id}
                  vine={vine}
                  isExpanded={expandedVine === vine.id}
                  onToggle={() => setExpandedVine(expandedVine === vine.id ? null : vine.id)}
                />
              ))}
            </div>
          )}

          {grovines.length === 0 && (
            <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
              No GRO.vines yet. Add a goal to begin.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VineRow({
  vine,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
}: {
  vine: GROvine;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate?: (vine: GROvine) => void;
  onRemove?: (vineId: string) => void;
}) {
  const statusColor = STATUS_COLORS[vine.status];

  return (
    <div style={{
      marginBottom: 4,
      border: `1px solid ${isExpanded ? statusColor : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 2,
      overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}>
      {/* Vine header */}
      <div
        onClick={onToggle}
        style={{
          padding: '5px 8px',
          background: isExpanded ? `rgba(${vine.status === 'active' ? '34,171,148' : vine.status === 'completed' ? '74,222,128' : '232,88,90'},0.08)` : 'rgba(255,255,255,0.02)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: statusColor,
          }} />
          <span style={{ fontSize: 10, color: '#fff', fontWeight: vine.status === 'active' ? 'bold' : 'normal' }}>
            {vine.goal.length > 40 ? `${vine.goal.substring(0, 40)}...` : vine.goal}
          </span>
        </div>
        <span style={{ fontSize: 8, color: statusColor, textTransform: 'uppercase' }}>
          {vine.status}
        </span>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div style={{ padding: '6px 8px', background: 'rgba(0,0,0,0.15)' }}>
          {/* G - Goal */}
          <GROSection letter="G" label="Goal" color="#4ade80">
            {vine.goal}
          </GROSection>

          {/* R - Resistance */}
          <GROSection letter="R" label="Resistance" color="#E8585A">
            {vine.resistance || <em style={{ opacity: 0.4 }}>Not yet revealed by GM</em>}
          </GROSection>

          {/* O - Opportunity */}
          <GROSection letter="O" label="Opportunity" color="#ffcc78">
            {vine.opportunity || <em style={{ opacity: 0.4 }}>Awaiting Godhead intervention</em>}
          </GROSection>

          {/* Reward */}
          {vine.reward && (
            <div style={{
              marginTop: 6,
              padding: '4px 6px',
              background: 'rgba(255,204,120,0.1)',
              border: '1px solid rgba(255,204,120,0.2)',
              borderRadius: 2,
              fontSize: 9,
            }}>
              <span style={{ color: '#ffcc78' }}>Reward: </span>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                {vine.reward.type === 'nectar' ? 'Nectar' : 'KRMA'}
                {vine.reward.description ? ` — ${vine.reward.description}` : ''}
              </span>
            </div>
          )}

          {/* Actions */}
          {vine.status === 'active' && (onUpdate || onRemove) && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {onUpdate && (
                <>
                  <button onClick={() => onUpdate({ ...vine, status: 'completed' })} style={smallBtnStyle('#4ade80')}>
                    Complete
                  </button>
                  <button onClick={() => onUpdate({ ...vine, status: 'failed' })} style={smallBtnStyle('#E8585A')}>
                    Failed
                  </button>
                </>
              )}
              {onRemove && (
                <button onClick={() => onRemove(vine.id)} style={smallBtnStyle('#808080')}>
                  Abandon
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GROSection({ letter, label, color, children }: { letter: string; label: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
        <span style={{
          fontFamily: 'var(--font-header), Bebas Neue, sans-serif',
          fontSize: 14,
          color,
          fontWeight: 'bold',
          lineHeight: 1,
        }}>
          {letter}
        </span>
        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', paddingLeft: 18, lineHeight: 1.4 }}>
        {children}
      </div>
    </div>
  );
}

function smallBtnStyle(color: string): React.CSSProperties {
  return {
    padding: '3px 8px',
    background: `${color}22`,
    border: `1px solid ${color}44`,
    borderRadius: 2,
    color,
    fontSize: 8,
    cursor: 'pointer',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    fontFamily: 'inherit',
  };
}
