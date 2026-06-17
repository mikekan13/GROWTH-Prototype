"use client";

import React, { useState, useEffect, useCallback } from 'react';

interface ResistanceEntity {
  relationshipId: string;
  entityId: string;
  entityType: string;
  name: string;
  custodianName?: string | null;
  note?: string;
}

interface GoalData {
  id: string;
  description: string;
  status: string;
  priority: number;
  custodianName?: string | null;
  pillar?: string | null;
  resistancePrompt?: string | null; // GM notes
  milestones?: string | null;
  nectarsEarned: number;
  createdAt: string;
  completedAt?: string | null;
}

interface GoalCardProps {
  characterId: string;
  campaignId?: string | null;
  isGM?: boolean;
  onClose?: () => void;
}

const STATUS_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  ACTIVE: { color: '#3EB89A', bg: 'rgba(62,184,154,0.1)', label: 'ACTIVE' },
  COMPLETED: { color: '#D4A830', bg: 'rgba(212,168,48,0.1)', label: 'DONE' },
  FAILED: { color: '#E8585A', bg: 'rgba(232,88,90,0.1)', label: 'FAILED' },
  ABANDONED: { color: '#888', bg: 'rgba(136,136,136,0.1)', label: 'LEFT' },
};

const PILLAR_COLORS: Record<string, string> = {
  MERCY: '#3EB89A',
  BALANCE: '#D4A830',
  SEVERITY: '#E8585A',
};

const PRIORITY_LABELS = ['', 'Minor', 'Low', 'Medium', 'High', 'Defining'];

export default function GoalCard({ characterId, campaignId, isGM, onClose }: GoalCardProps) {
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ACTIVE');
  const [isExpanded, setIsExpanded] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newGoalDesc, setNewGoalDesc] = useState('');
  const [newGoalPriority, setNewGoalPriority] = useState(3);
  const [creating, setCreating] = useState(false);
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);
  const [resistanceEntities, setResistanceEntities] = useState<Record<string, ResistanceEntity[]>>({});

  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch(`/api/goals?characterId=${characterId}`);
      if (res.ok) {
        const data = await res.json();
        setGoals(data.goals || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [characterId]);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  // Fetch resistance entities when a goal is expanded
  const fetchResistance = useCallback(async (goalId: string) => {
    try {
      const res = await fetch(`/api/goals/${goalId}/resistance`);
      if (res.ok) {
        const data = await res.json();
        setResistanceEntities(prev => ({ ...prev, [goalId]: data.entities || [] }));
      }
    } catch { /* silent */ }
  }, []);

  const handleExpand = (goalId: string) => {
    const isOpen = expandedGoal === goalId;
    setExpandedGoal(isOpen ? null : goalId);
    if (!isOpen && !resistanceEntities[goalId]) {
      fetchResistance(goalId);
    }
  };

  const handleCreate = async () => {
    if (!newGoalDesc.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          campaignId: campaignId || undefined,
          description: newGoalDesc.trim(),
          priority: newGoalPriority,
        }),
      });
      if (res.ok) {
        const created = await res.json().catch(() => null) as { id?: string } | null;
        const goalId = created?.id;
        const descSnapshot = newGoalDesc.trim();
        setNewGoalDesc('');
        setNewGoalPriority(3);
        setShowCreate(false);
        await fetchGoals();
        // Observation: JEWL witnesses new goal creation. Skip when there's
        // no campaign context (character-only goals predate this surface).
        if (campaignId) {
          void fetch(`/api/campaigns/${campaignId}/observation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mutationKind: 'create-goal',
              targetType: 'character',
              targetId: characterId,
              summary: `GM added goal: "${descSnapshot.slice(0, 200)}"${goalId ? ` (id ${goalId})` : ''}`,
            }),
          }).catch(() => { /* best-effort */ });
        }
      }
    } catch { /* silent */ }
    setCreating(false);
  };

  const handleAbandon = async (goalId: string) => {
    const snapshotDesc = goals.find(g => g.id === goalId)?.description ?? 'goal';
    try {
      const res = await fetch(`/api/goals/${goalId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchGoals();
        if (campaignId) {
          void fetch(`/api/campaigns/${campaignId}/observation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mutationKind: 'abandon-goal',
              targetType: 'character',
              targetId: characterId,
              summary: `GM abandoned goal: "${snapshotDesc.slice(0, 200)}"`,
            }),
          }).catch(() => { /* best-effort */ });
        }
      }
    } catch { /* silent */ }
  };

  const activeGoals = goals.filter(g => g.status === 'ACTIVE');
  const filtered = filter === 'ALL' ? goals : goals.filter(g => g.status === filter);

  return (
    <div className="border transition-all duration-200" style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#1a1a2e', borderColor: '#3EB89A', borderRadius: '3px', width: '420px' }}>
      {/* Header */}
      <div className="p-3 text-white cursor-grab" style={{ background: 'linear-gradient(135deg, #1a3a2e 0%, #0d2a1e 100%)', borderRadius: '2px 2px 0 0' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-lg">{'\u{1F331}'}</span>
            <div>
              <h3 className="font-semibold text-sm" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em', fontSize: '15px' }}>GRO.VINES</h3>
              <p className="text-xs" style={{ color: '#3EB89A', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px' }}>
                {activeGoals.length} active {'\u2022'} {goals.length} total {'\u2022'} max {5}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isGM && activeGoals.length < 5 && (
              <button onClick={e => { e.stopPropagation(); setShowCreate(!showCreate); }} onMouseDown={e => e.stopPropagation()}
                className="p-1 hover:bg-white/20 transition-colors text-xs" style={{ borderRadius: '2px', color: '#3EB89A' }}
                title="New Goal">+</button>
            )}
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
          {/* Create form (GM only) */}
          {isGM && showCreate && (
            <div className="mb-3 p-2 border" style={{ borderColor: '#3a3a4e', borderRadius: '2px', backgroundColor: 'rgba(62,184,154,0.05)' }}>
              <textarea
                value={newGoalDesc}
                onChange={e => setNewGoalDesc(e.target.value)}
                onMouseDown={e => e.stopPropagation()}
                placeholder="Describe the goal..."
                className="w-full bg-transparent text-white text-xs p-1 border resize-none"
                style={{ borderColor: '#3a3a4e', borderRadius: '2px', minHeight: '48px' }}
                maxLength={500}
              />
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-1">
                  <span className="text-[10px]" style={{ color: '#888' }}>Priority:</span>
                  {[1, 2, 3, 4, 5].map(p => (
                    <button key={p}
                      onClick={e => { e.stopPropagation(); setNewGoalPriority(p); }}
                      onMouseDown={e => e.stopPropagation()}
                      className="px-1.5 py-0.5 text-[10px]"
                      style={{
                        borderRadius: '2px',
                        backgroundColor: newGoalPriority === p ? '#3EB89A' : '#2a2a3e',
                        color: newGoalPriority === p ? '#1a1a2e' : '#888',
                        border: `1px solid ${newGoalPriority === p ? '#3EB89A' : '#3a3a4e'}`,
                      }}>
                      {p}
                    </button>
                  ))}
                  <span className="text-[9px] ml-1" style={{ color: '#888' }}>{PRIORITY_LABELS[newGoalPriority]}</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={e => { e.stopPropagation(); setShowCreate(false); }} onMouseDown={e => e.stopPropagation()}
                    className="px-2 py-1 text-[10px]" style={{ color: '#888', borderRadius: '2px' }}>Cancel</button>
                  <button onClick={e => { e.stopPropagation(); handleCreate(); }} onMouseDown={e => e.stopPropagation()}
                    disabled={!newGoalDesc.trim() || creating}
                    className="px-2 py-1 text-[10px]"
                    style={{ borderRadius: '2px', backgroundColor: '#3EB89A', color: '#1a1a2e', opacity: (!newGoalDesc.trim() || creating) ? 0.5 : 1 }}>
                    {creating ? '...' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-1 mb-3">
            {[
              { key: 'ACTIVE', label: `ACTIVE (${activeGoals.length})`, color: '#3EB89A' },
              { key: 'COMPLETED', label: `DONE (${goals.filter(g => g.status === 'COMPLETED').length})`, color: '#D4A830' },
              { key: 'FAILED', label: `FAILED (${goals.filter(g => g.status === 'FAILED').length})`, color: '#E8585A' },
              { key: 'ABANDONED', label: `LEFT (${goals.filter(g => g.status === 'ABANDONED').length})`, color: '#888' },
              { key: 'ALL', label: `ALL (${goals.length})` },
            ].map(f => (
              <button key={f.key} onClick={e => { e.stopPropagation(); setFilter(f.key); }} onMouseDown={e => e.stopPropagation()}
                className="px-2 py-1 text-xs transition-colors uppercase"
                style={{
                  borderRadius: '2px', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em', fontSize: '11px',
                  backgroundColor: filter === f.key ? '#1a3a2e' : '#2a2a3e', color: filter === f.key ? (f.color || '#ccc') : '#888',
                  border: `1px solid ${filter === f.key ? (f.color || '#3EB89A') : '#3a3a4e'}`,
                }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Goals list */}
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {loading ? (
              <div className="text-center text-gray-400 text-sm py-4">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-4">
                {filter === 'ACTIVE' ? 'No active goals — plant a GRO.vine' : 'No goals found'}
              </div>
            ) : filtered.map((goal) => {
              const ss = STATUS_STYLES[goal.status] || STATUS_STYLES.ACTIVE;
              const isOpen = expandedGoal === goal.id;
              let milestones: Array<{ id: string; description: string; completed: boolean }> = [];
              try { if (goal.milestones) milestones = JSON.parse(goal.milestones); } catch { /* skip */ }
              const doneMilestones = milestones.filter(m => m.completed).length;
              const resistance = resistanceEntities[goal.id] || [];
              const hasNoResistance = goal.status === 'ACTIVE' && resistance.length === 0 && isOpen;

              return (
                <div key={goal.id}
                  className="border transition-colors"
                  style={{ borderRadius: '2px', backgroundColor: ss.bg, borderColor: '#3a3a4e', borderLeftColor: ss.color, borderLeftWidth: '3px' }}>
                  {/* Goal header row */}
                  <div className="p-2 cursor-pointer" onClick={e => { e.stopPropagation(); handleExpand(goal.id); }} onMouseDown={e => e.stopPropagation()}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] px-1 font-bold" style={{ backgroundColor: ss.color, color: '#1a1a2e', borderRadius: '2px', fontFamily: 'var(--font-bebas-neue)' }}>P{goal.priority}</span>
                          <span className="text-sm" style={{ color: ss.color }}>{goal.description}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {goal.custodianName && (
                            <span className="text-[9px]" style={{ color: PILLAR_COLORS[goal.pillar || 'BALANCE'] || '#D4A830' }}>
                              {'\u2726'} {goal.custodianName}
                            </span>
                          )}
                          {resistance.length > 0 && (
                            <span className="text-[9px]" style={{ color: '#E8585A' }}>
                              {'\u2694'} {resistance.length} resistance
                            </span>
                          )}
                          {milestones.length > 0 && (
                            <span className="text-[9px]" style={{ color: '#888' }}>
                              {doneMilestones}/{milestones.length} milestones
                            </span>
                          )}
                          {goal.nectarsEarned > 0 && (
                            <span className="text-[9px]" style={{ color: '#ffcc78' }}>
                              {'\u2736'}{goal.nectarsEarned}
                            </span>
                          )}
                          {goal.completedAt && goal.status !== 'ACTIVE' && (
                            <span className="text-[9px]" style={{ color: '#666' }}>
                              {ss.label.toLowerCase()} {new Date(goal.completedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[8px] px-1" style={{ backgroundColor: ss.color, color: '#1a1a2e', borderRadius: '2px', fontFamily: 'var(--font-bebas-neue)' }}>{ss.label}</span>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isOpen && (
                    <div className="px-2 pb-2 border-t" style={{ borderColor: '#3a3a4e' }}>
                      {/* Resistance entities */}
                      {resistance.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[9px] uppercase mb-1" style={{ color: '#E8585A', fontFamily: 'var(--font-bebas-neue)', letterSpacing: '0.05em' }}>Resistance</p>
                          {resistance.map((r) => (
                            <div key={r.relationshipId} className="flex items-center gap-1.5 text-[10px] py-0.5 pl-1 border-l-2" style={{ borderColor: '#E8585A' }}>
                              <span style={{ color: '#E8585A' }}>{'\u2694'}</span>
                              <span style={{ color: '#ccc' }}>{r.name}</span>
                              <span className="text-[8px]" style={{ color: '#888' }}>({r.entityType})</span>
                              {r.custodianName && (
                                <span className="text-[8px]" style={{ color: '#D4A830' }}>{'\u2726'}{r.custodianName}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* No resistance warning (GM only) */}
                      {isGM && hasNoResistance && (
                        <div className="mt-2 p-1.5" style={{ backgroundColor: 'rgba(232,88,90,0.05)', borderRadius: '2px', border: '1px dashed #E8585A33' }}>
                          <p className="text-[9px]" style={{ color: '#E8585A88' }}>
                            No resistance assigned — create entities in the Tapestry and link them to this goal
                          </p>
                        </div>
                      )}

                      {/* Milestones */}
                      {milestones.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[9px] uppercase mb-1" style={{ color: '#888', fontFamily: 'var(--font-bebas-neue)', letterSpacing: '0.05em' }}>Milestones</p>
                          {milestones.map((m, i) => (
                            <div key={i} className="flex items-center gap-1 text-[10px] py-0.5">
                              <span style={{ color: m.completed ? '#3EB89A' : '#555' }}>{m.completed ? '\u2713' : '\u25CB'}</span>
                              <span style={{ color: m.completed ? '#888' : '#ccc', textDecoration: m.completed ? 'line-through' : 'none' }}>{m.description}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* GM notes (stored in resistancePrompt field) */}
                      {isGM && goal.resistancePrompt && (
                        <div className="mt-2">
                          <p className="text-[9px] uppercase mb-1" style={{ color: '#888', fontFamily: 'var(--font-bebas-neue)', letterSpacing: '0.05em' }}>GM Notes</p>
                          <p className="text-[10px]" style={{ color: '#888', lineHeight: 1.4 }}>{goal.resistancePrompt}</p>
                        </div>
                      )}

                      {/* Actions — GM only, only abandon */}
                      {isGM && goal.status === 'ACTIVE' && (
                        <div className="flex gap-1 mt-2">
                          <button onClick={e => { e.stopPropagation(); handleAbandon(goal.id); }} onMouseDown={e => e.stopPropagation()}
                            className="px-2 py-0.5 text-[9px]"
                            style={{ borderRadius: '2px', border: '1px solid #555', color: '#888' }}>
                            Abandon (KRMA cost)
                          </button>
                        </div>
                      )}
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
