"use client";

import React, { useState, useCallback } from 'react';
import type { GrowthEncounter, EncounterParticipant, EncounterPhase, EncounterType } from '@/types/encounter';
import { ACTION_TYPE_COLORS, ENCOUNTER_TYPE_ICONS } from '@/types/encounter';

interface EncounterTrackerProps {
  encounter: {
    id: string;
    name: string;
    type: EncounterType;
    status: string;
    round: number;
    phase: EncounterPhase;
    data: GrowthEncounter;
  };
  onUpdate?: (update: {
    round?: number;
    phase?: EncounterPhase;
    status?: string;
    data?: GrowthEncounter;
  }) => void;
  onClose?: () => void;
}

const PHASE_LABELS: Record<EncounterPhase, { label: string; color: string; description: string }> = {
  intention: { label: 'Intention', color: '#ffcc78', description: 'All characters declare actions' },
  resolution: { label: 'Resolution', color: '#22ab94', description: 'Resolve in Time Stack order' },
  impact: { label: 'Impact', color: '#E8585A', description: 'All damage/effects applied simultaneously' },
};

const PHASE_ORDER: EncounterPhase[] = ['intention', 'resolution', 'impact'];

export default function EncounterTracker({ encounter, onUpdate, onClose }: EncounterTrackerProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const data = encounter.data;
  const participants = data.participants || [];
  const typeIcon = ENCOUNTER_TYPE_ICONS[encounter.type] || '\u26A1';

  const allies = participants.filter(p => p.side === 'ally');
  const enemies = participants.filter(p => p.side === 'enemy');
  const neutrals = participants.filter(p => p.side === 'neutral');

  const advancePhase = useCallback(() => {
    const currentIdx = PHASE_ORDER.indexOf(encounter.phase);
    if (currentIdx < PHASE_ORDER.length - 1) {
      onUpdate?.({ phase: PHASE_ORDER[currentIdx + 1] });
    } else {
      // Impact → next round, back to intention
      onUpdate?.({ round: encounter.round + 1, phase: 'intention' });
    }
  }, [encounter.phase, encounter.round, onUpdate]);

  const phaseInfo = PHASE_LABELS[encounter.phase];

  return (
    <div style={{
      width: 520,
      background: 'linear-gradient(135deg, #1a1a2e 0%, #0d1117 100%)',
      border: '2px solid rgba(232,88,90,0.6)',
      borderRadius: 3,
      color: '#fff',
      fontFamily: 'var(--font-terminal), Consolas, monospace',
      userSelect: 'none',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(90deg, rgba(232,88,90,0.15), rgba(232,88,90,0.05))',
        borderBottom: '1px solid rgba(232,88,90,0.3)',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{typeIcon}</span>
          <div>
            <div style={{
              fontFamily: 'var(--font-header), Bebas Neue, sans-serif',
              fontSize: 16,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#E8585A',
            }}>
              {encounter.name}
            </div>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
              {encounter.type} encounter
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {encounter.status === 'ACTIVE' && (
            <div style={{
              padding: '2px 8px',
              background: 'rgba(232,88,90,0.2)',
              border: '1px solid rgba(232,88,90,0.4)',
              borderRadius: 2,
              fontSize: 10,
              color: '#E8585A',
              fontWeight: 'bold',
              animation: 'pulse 2s infinite',
            }}>
              LIVE
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: '#fff',
              width: 22,
              height: 22,
              borderRadius: 2,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {isCollapsed ? '+' : '\u2212'}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                color: '#fff',
                width: 22,
                height: 22,
                borderRadius: 2,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div style={{ padding: '10px 12px' }}>
          {/* Round & Phase tracker */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
            padding: '8px 10px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 2,
          }}>
            <div>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                Round
              </div>
              <div style={{
                fontFamily: 'var(--font-header), Bebas Neue, sans-serif',
                fontSize: 28,
                color: '#fff',
                lineHeight: 1,
              }}>
                {encounter.round}
              </div>
            </div>

            {/* Phase indicator */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {PHASE_ORDER.map((phase) => {
                const info = PHASE_LABELS[phase];
                const isActive = encounter.phase === phase;
                return (
                  <div key={phase} style={{
                    padding: '4px 10px',
                    background: isActive ? `${info.color}22` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isActive ? info.color : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 2,
                    textAlign: 'center',
                  }}>
                    <div style={{
                      fontSize: 9,
                      fontWeight: isActive ? 'bold' : 'normal',
                      color: isActive ? info.color : 'rgba(255,255,255,0.3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                    }}>
                      {info.label}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Advance button */}
            {encounter.status === 'ACTIVE' && onUpdate && (
              <button
                onClick={advancePhase}
                style={{
                  padding: '6px 12px',
                  background: `${phaseInfo.color}22`,
                  border: `1px solid ${phaseInfo.color}`,
                  borderRadius: 2,
                  color: phaseInfo.color,
                  fontSize: 9,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  fontFamily: 'inherit',
                  fontWeight: 'bold',
                }}
              >
                {encounter.phase === 'impact' ? 'Next Round' : 'Advance'}
              </button>
            )}
          </div>

          {/* Phase description */}
          <div style={{
            fontSize: 9,
            color: phaseInfo.color,
            marginBottom: 10,
            padding: '4px 8px',
            background: `${phaseInfo.color}0A`,
            borderLeft: `2px solid ${phaseInfo.color}`,
          }}>
            {phaseInfo.description}
          </div>

          {/* Participants */}
          {participants.length > 0 ? (
            <div>
              {/* Allies */}
              {allies.length > 0 && (
                <ParticipantSection title="Allies" color="#4ade80" participants={allies} />
              )}

              {/* Enemies */}
              {enemies.length > 0 && (
                <ParticipantSection title="Enemies" color="#E8585A" participants={enemies} />
              )}

              {/* Neutrals */}
              {neutrals.length > 0 && (
                <ParticipantSection title="Neutral" color="#ffcc78" participants={neutrals} />
              )}
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '16px 0',
              fontSize: 10,
              color: 'rgba(255,255,255,0.3)',
            }}>
              No participants added yet.
              <br />
              <span style={{ fontSize: 8 }}>Add characters from the Relations canvas.</span>
            </div>
          )}

          {/* Objectives */}
          {data.objectives && data.objectives.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 8, color: '#22ab94', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>
                Objectives
              </div>
              {data.objectives.map((obj, i) => (
                <div key={i} style={{
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.5)',
                  padding: '2px 0 2px 12px',
                  borderLeft: '1px solid rgba(34,171,148,0.3)',
                  marginBottom: 2,
                }}>
                  {obj}
                </div>
              ))}
            </div>
          )}

          {/* GM Notes */}
          {data.notes && (
            <div style={{
              marginTop: 10,
              padding: '6px 8px',
              background: 'rgba(255,204,120,0.08)',
              border: '1px solid rgba(255,204,120,0.2)',
              borderRadius: 2,
            }}>
              <div style={{ fontSize: 8, color: '#ffcc78', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>
                GM Notes
              </div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>{data.notes}</div>
            </div>
          )}

          {/* Status controls */}
          {onUpdate && (
            <div style={{
              display: 'flex',
              gap: 6,
              marginTop: 10,
              paddingTop: 8,
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}>
              {encounter.status === 'PLANNED' && (
                <StatusButton label="Start Encounter" color="#E8585A" onClick={() => onUpdate({ status: 'ACTIVE', round: 1, phase: 'intention' })} />
              )}
              {encounter.status === 'ACTIVE' && (
                <>
                  <StatusButton label="Pause" color="#ffcc78" onClick={() => onUpdate({ status: 'PAUSED' })} />
                  <StatusButton label="Resolve" color="#4ade80" onClick={() => onUpdate({ status: 'RESOLVED' })} />
                </>
              )}
              {encounter.status === 'PAUSED' && (
                <StatusButton label="Resume" color="#22ab94" onClick={() => onUpdate({ status: 'ACTIVE' })} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ParticipantSection({ title, color, participants }: { title: string; color: string; participants: EncounterParticipant[] }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 8, color, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>
        {title} ({participants.length})
      </div>
      {participants.map((p) => (
        <div key={p.id} style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 2,
          marginBottom: 2,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: p.resolved ? 'rgba(255,255,255,0.2)' : color,
            }} />
            <span style={{
              fontSize: 10,
              color: p.resolved ? 'rgba(255,255,255,0.4)' : '#fff',
              textDecoration: p.resolved ? 'line-through' : 'none',
            }}>
              {p.name}
            </span>
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>
              {p.type}
            </span>
          </div>

          {/* Action pools */}
          {p.actions && (
            <div style={{ display: 'flex', gap: 8, fontSize: 8 }}>
              <ActionPool label="B" used={p.actions.used.body} total={p.actions.body} color="#E8585A" />
              <ActionPool label="Sp" used={p.actions.used.spirit} total={p.actions.spirit} color="#3E78C0" />
              <ActionPool label="So" used={p.actions.used.soul} total={p.actions.soul} color="#7050A8" />
            </div>
          )}

          {/* Intention */}
          {p.intention && (
            <span style={{ fontSize: 8, color: '#ffcc78', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.intention}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function ActionPool({ label, used, total, color }: { label: string; used: number; total: number; color: string }) {
  const remaining = total - used;
  return (
    <span style={{ color: remaining > 0 ? color : 'rgba(255,255,255,0.2)' }}>
      {label}: {remaining}/{total}
    </span>
  );
}

function StatusButton({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        background: `${color}22`,
        border: `1px solid ${color}66`,
        borderRadius: 2,
        color,
        fontSize: 8,
        cursor: 'pointer',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
}
