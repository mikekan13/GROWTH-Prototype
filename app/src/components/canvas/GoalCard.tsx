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
  custodianId?: string | null;
  custodianName?: string | null;
  pillar?: string | null;
  resistancePrompt?: string | null; // GM notes
  milestones?: string | null;
  opportunities?: string | null; // JSON array (T33)
  nectarsEarned: number;
  createdAt: string;
  completedAt?: string | null;
}

interface GoalOpportunity {
  id: string;
  description: string;
  narrative?: string;
  status: 'OPEN' | 'RESOLVED';
  outcome?: 'SEIZED' | 'MISSED';
  method?: 'check' | 'krma' | 'narrative';
  note?: string;
  declaredAt: string;
  resolvedAt?: string;
}

interface GodheadOption { id: string; name: string; pillar: string }
interface EntityOption { id: string; name: string; entityType: string }

interface GoalCardProps {
  characterId: string;
  campaignId?: string | null;
  isGM?: boolean;
  onClose?: () => void;
}

const STATUS_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  ACTIVE: { color: '#3EB89A', bg: 'rgba(62,184,154,0.1)', label: 'ACTIVE' },
  DORMANT: { color: '#8a8ab0', bg: 'rgba(138,138,176,0.1)', label: 'DORMANT' },
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
  // T34: custodian picker
  const [godheads, setGodheads] = useState<GodheadOption[] | null>(null);
  const [editingCustodian, setEditingCustodian] = useState<string | null>(null); // goalId
  // T33: resistance picker
  const [addingResistance, setAddingResistance] = useState<string | null>(null); // goalId
  const [campaignEntities, setCampaignEntities] = useState<EntityOption[] | null>(null);
  const [entityFilter, setEntityFilter] = useState('');
  // T33: opportunities
  const [declaringOpp, setDeclaringOpp] = useState<string | null>(null); // goalId
  const [newOppDesc, setNewOppDesc] = useState('');
  const [resolvingOpp, setResolvingOpp] = useState<string | null>(null); // opportunityId
  const [resolveMethod, setResolveMethod] = useState<'check' | 'krma' | 'narrative'>('check');
  const [resolveNote, setResolveNote] = useState('');

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

  // Observation: JEWL witnesses goal mutations (same pattern as create/abandon).
  const postObservation = (mutationKind: string, summary: string) => {
    if (!campaignId) return;
    void fetch(`/api/campaigns/${campaignId}/observation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mutationKind, targetType: 'character', targetId: characterId, summary }),
    }).catch(() => { /* best-effort */ });
  };

  // T34: lifecycle transitions — COMPLETED/FAILED route through the
  // dispatcher server-side (goal.completed/goal.failed → T32 chain).
  const handleTransition = async (goalId: string, to: 'COMPLETED' | 'FAILED' | 'DORMANT' | 'ACTIVE') => {
    const desc = goals.find(g => g.id === goalId)?.description ?? 'goal';
    try {
      const res = await fetch(`/api/goals/${goalId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      });
      if (res.ok) {
        await fetchGoals();
        postObservation('goal-transition', `GM moved goal "${desc.slice(0, 200)}" → ${to}`);
      }
    } catch { /* silent */ }
  };

  const loadGodheads = async () => {
    if (godheads !== null) return;
    try {
      const res = await fetch('/api/godheads');
      if (res.ok) {
        const data = await res.json();
        setGodheads(data.godheads || []);
      } else setGodheads([]);
    } catch { setGodheads([]); }
  };

  const handleSetCustodian = async (goalId: string, custodianId: string) => {
    try {
      const res = await fetch(`/api/goals/${goalId}/custodian`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custodianId }),
      });
      if (res.ok) {
        setEditingCustodian(null);
        await fetchGoals();
      }
    } catch { /* silent */ }
  };

  const loadEntities = async () => {
    if (campaignEntities !== null || !campaignId) return;
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/entities`);
      if (res.ok) {
        const data = await res.json();
        setCampaignEntities(data.entities || []);
      } else setCampaignEntities([]);
    } catch { setCampaignEntities([]); }
  };

  const handleAddResistance = async (goalId: string, entityId: string) => {
    try {
      const res = await fetch(`/api/goals/${goalId}/resistance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId }),
      });
      if (res.ok) {
        setAddingResistance(null);
        setEntityFilter('');
        await fetchResistance(goalId);
      }
    } catch { /* silent */ }
  };

  const handleRemoveResistance = async (goalId: string, entityId: string) => {
    try {
      const res = await fetch(`/api/goals/${goalId}/resistance?entityId=${encodeURIComponent(entityId)}`, { method: 'DELETE' });
      if (res.ok) await fetchResistance(goalId);
    } catch { /* silent */ }
  };

  const handleDeclareOpp = async (goalId: string) => {
    if (!newOppDesc.trim()) return;
    try {
      const res = await fetch(`/api/goals/${goalId}/opportunity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: newOppDesc.trim() }),
      });
      if (res.ok) {
        setNewOppDesc('');
        setDeclaringOpp(null);
        await fetchGoals();
      }
    } catch { /* silent */ }
  };

  const handleResolveOpp = async (goalId: string, opportunityId: string, outcome: 'SEIZED' | 'MISSED') => {
    try {
      const res = await fetch(`/api/goals/${goalId}/opportunity`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId, outcome, method: resolveMethod, note: resolveNote.trim() || undefined }),
      });
      if (res.ok) {
        setResolvingOpp(null);
        setResolveNote('');
        await fetchGoals();
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
              { key: 'DORMANT', label: `DORMANT (${goals.filter(g => g.status === 'DORMANT').length})`, color: '#8a8ab0' },
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
              let opportunities: GoalOpportunity[] = [];
              try { if (goal.opportunities) opportunities = JSON.parse(goal.opportunities); } catch { /* skip */ }
              const openOpps = opportunities.filter(o => o.status === 'OPEN');
              const resistance = resistanceEntities[goal.id] || [];
              const hasNoResistance = goal.status === 'ACTIVE' && resistance.length === 0 && isOpen;
              const isLive = goal.status === 'ACTIVE' || goal.status === 'DORMANT';

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
                          {openOpps.length > 0 && (
                            <span className="text-[9px]" style={{ color: 'var(--krma-gold)' }}>
                              {'\u26a1'} {openOpps.length} open opportunit{openOpps.length === 1 ? 'y' : 'ies'}
                            </span>
                          )}
                          {milestones.length > 0 && (
                            <span className="text-[9px]" style={{ color: '#888' }}>
                              {doneMilestones}/{milestones.length} milestones
                            </span>
                          )}
                          {goal.nectarsEarned > 0 && (
                            <span className="text-[9px]" style={{ color: 'var(--krma-gold)' }}>
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
                      {/* Custodian (T34: GM-editable) */}
                      {(goal.custodianName || isGM) && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className="text-[9px] uppercase" style={{ color: '#888', fontFamily: 'var(--font-bebas-neue)', letterSpacing: '0.05em' }}>Custodian</span>
                          {editingCustodian === goal.id ? (
                            <select
                              className="text-[10px] bg-transparent border px-1 py-0.5"
                              style={{ borderColor: '#3a3a4e', borderRadius: '2px', color: '#D4A830', backgroundColor: '#1a1a2e' }}
                              defaultValue={goal.custodianId ?? ''}
                              onMouseDown={e => e.stopPropagation()}
                              onClick={e => e.stopPropagation()}
                              onChange={e => { if (e.target.value) handleSetCustodian(goal.id, e.target.value); }}
                            >
                              <option value="" disabled>{godheads === null ? 'Loading...' : 'Pick a godhead...'}</option>
                              {(godheads ?? []).map(gh => (
                                <option key={gh.id} value={gh.id}>{gh.name} ({gh.pillar})</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[10px]" style={{ color: PILLAR_COLORS[goal.pillar || 'BALANCE'] || '#D4A830' }}>
                              {'\u2726'} {goal.custodianName ?? 'unassigned'}
                            </span>
                          )}
                          {isGM && isLive && editingCustodian !== goal.id && (
                            <button
                              onClick={e => { e.stopPropagation(); setEditingCustodian(goal.id); loadGodheads(); }}
                              onMouseDown={e => e.stopPropagation()}
                              className="text-[9px] px-1 hover:bg-white/10"
                              style={{ color: '#888', borderRadius: '2px' }} title="Change custodian">{'\u270e'}</button>
                          )}
                          {editingCustodian === goal.id && (
                            <button onClick={e => { e.stopPropagation(); setEditingCustodian(null); }} onMouseDown={e => e.stopPropagation()}
                              className="text-[9px] px-1" style={{ color: '#888' }}>{'\u00d7'}</button>
                          )}
                        </div>
                      )}

                      {/* Resistance entities (T33: GM add/remove) */}
                      {(resistance.length > 0 || (isGM && isLive)) && (
                        <div className="mt-2">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-[9px] uppercase" style={{ color: '#E8585A', fontFamily: 'var(--font-bebas-neue)', letterSpacing: '0.05em' }}>Resistance</p>
                            {isGM && isLive && addingResistance !== goal.id && (
                              <button
                                onClick={e => { e.stopPropagation(); setAddingResistance(goal.id); setEntityFilter(''); loadEntities(); }}
                                onMouseDown={e => e.stopPropagation()}
                                className="text-[9px] px-1 hover:bg-white/10"
                                style={{ color: '#E8585A', borderRadius: '2px' }} title="Link an entity as resistance">+</button>
                            )}
                          </div>
                          {resistance.map((r) => (
                            <div key={r.relationshipId} className="flex items-center gap-1.5 text-[10px] py-0.5 pl-1 border-l-2 group/res" style={{ borderColor: '#E8585A' }}>
                              <span style={{ color: '#E8585A' }}>{'\u2694'}</span>
                              <span style={{ color: '#ccc' }}>{r.name}</span>
                              <span className="text-[8px]" style={{ color: '#888' }}>({r.entityType})</span>
                              {r.custodianName && (
                                <span className="text-[8px]" style={{ color: '#D4A830' }}>{'\u2726'}{r.custodianName}</span>
                              )}
                              {isGM && isLive && (
                                <button
                                  onClick={e => { e.stopPropagation(); handleRemoveResistance(goal.id, r.entityId); }}
                                  onMouseDown={e => e.stopPropagation()}
                                  className="text-[9px] px-1 ml-auto opacity-0 group-hover/res:opacity-100 hover:bg-red-900/30"
                                  style={{ color: '#ff6b6b', borderRadius: '2px' }} title="Unlink">{'\u00d7'}</button>
                              )}
                            </div>
                          ))}
                          {isGM && addingResistance === goal.id && (
                            <div className="mt-1 p-1.5 border" style={{ borderColor: '#E8585A44', borderRadius: '2px', backgroundColor: '#1a1a2e' }}>
                              <input
                                type="text" value={entityFilter} onChange={e => setEntityFilter(e.target.value)}
                                onMouseDown={e => e.stopPropagation()} placeholder="Filter entities..." autoFocus
                                className="w-full bg-transparent outline-none text-[10px] text-white px-1 py-0.5 border-b"
                                style={{ borderColor: '#3a3a4e' }}
                              />
                              <div className="max-h-28 overflow-y-auto mt-1">
                                {campaignEntities === null ? (
                                  <div className="text-[9px] text-gray-500 py-1">Loading...</div>
                                ) : (campaignEntities
                                    .filter(en => !resistance.some(r => r.entityId === en.id))
                                    .filter(en => !entityFilter.trim() || en.name.toLowerCase().includes(entityFilter.toLowerCase()))
                                    .slice(0, 30)
                                    .map(en => (
                                      <button key={en.id}
                                        onClick={e => { e.stopPropagation(); handleAddResistance(goal.id, en.id); }}
                                        onMouseDown={e => e.stopPropagation()}
                                        className="w-full text-left text-[10px] px-1 py-0.5 hover:bg-white/10"
                                        style={{ color: '#ccc', borderRadius: '2px' }}>
                                        {en.name} <span style={{ color: '#666' }}>({en.entityType})</span>
                                      </button>
                                    )))}
                              </div>
                              <button onClick={e => { e.stopPropagation(); setAddingResistance(null); }} onMouseDown={e => e.stopPropagation()}
                                className="text-[9px] px-1.5 py-0.5 mt-1 uppercase text-gray-500"
                                style={{ border: '1px solid #3a3a4e', borderRadius: '2px' }}>Cancel</button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* No resistance warning (GM only) */}
                      {isGM && hasNoResistance && (
                        <div className="mt-2 p-1.5" style={{ backgroundColor: 'rgba(232,88,90,0.05)', borderRadius: '2px', border: '1px dashed #E8585A33' }}>
                          <p className="text-[9px]" style={{ color: '#E8585A88' }}>
                            No resistance assigned — link entities with the + above (who pushes back?)
                          </p>
                        </div>
                      )}

                      {/* Opportunities (T33): the O of GRO — leverage moments */}
                      {(opportunities.length > 0 || (isGM && isLive)) && (
                        <div className="mt-2">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-[9px] uppercase" style={{ color: 'var(--krma-gold)', fontFamily: 'var(--font-bebas-neue)', letterSpacing: '0.05em' }}>Opportunities</p>
                            {isGM && isLive && declaringOpp !== goal.id && (
                              <button
                                onClick={e => { e.stopPropagation(); setDeclaringOpp(goal.id); setNewOppDesc(''); }}
                                onMouseDown={e => e.stopPropagation()}
                                className="text-[9px] px-1 hover:bg-white/10"
                                style={{ color: 'var(--krma-gold)', borderRadius: '2px' }} title="Declare an opportunity">+</button>
                            )}
                          </div>
                          {opportunities.map(opp => (
                            <div key={opp.id} className="text-[10px] py-0.5 pl-1 border-l-2" style={{ borderColor: opp.status === 'OPEN' ? 'var(--krma-gold)' : '#3a3a4e' }}>
                              <div className="flex items-center gap-1.5">
                                <span style={{ color: opp.status === 'OPEN' ? 'var(--krma-gold)' : '#666' }}>{'⚡'}</span>
                                <span style={{ color: opp.status === 'OPEN' ? '#ccc' : '#777' }}>{opp.description}</span>
                                {opp.status === 'RESOLVED' && (
                                  <span className="text-[8px] px-1" style={{
                                    backgroundColor: opp.outcome === 'SEIZED' ? 'rgba(62,184,154,0.15)' : 'rgba(232,88,90,0.15)',
                                    color: opp.outcome === 'SEIZED' ? '#3EB89A' : '#E8585A',
                                    borderRadius: '2px',
                                  }}>{opp.outcome} via {opp.method}</span>
                                )}
                                {isGM && isLive && opp.status === 'OPEN' && resolvingOpp !== opp.id && (
                                  <button
                                    onClick={e => { e.stopPropagation(); setResolvingOpp(opp.id); setResolveMethod('check'); setResolveNote(''); }}
                                    onMouseDown={e => e.stopPropagation()}
                                    className="text-[8px] px-1 ml-auto uppercase hover:bg-white/10"
                                    style={{ color: 'var(--krma-gold)', border: '1px solid rgba(255,204,120,0.3)', borderRadius: '2px' }}>Resolve</button>
                                )}
                              </div>
                              {opp.note && opp.status === 'RESOLVED' && (
                                <div className="text-[8px] pl-4" style={{ color: '#666' }}>{opp.note}</div>
                              )}
                              {isGM && resolvingOpp === opp.id && (
                                <div className="mt-1 p-1.5 border" style={{ borderColor: '#ffcc7844', borderRadius: '2px', backgroundColor: '#1a1a2e' }}>
                                  <div className="flex items-center gap-1 mb-1">
                                    <span className="text-[8px]" style={{ color: '#888' }}>via</span>
                                    {(['check', 'krma', 'narrative'] as const).map(m => (
                                      <button key={m}
                                        onClick={e => { e.stopPropagation(); setResolveMethod(m); }}
                                        onMouseDown={e => e.stopPropagation()}
                                        className="text-[8px] px-1.5 py-0.5 uppercase"
                                        style={{
                                          borderRadius: '2px',
                                          backgroundColor: resolveMethod === m ? 'var(--krma-gold)' : '#2a2a3e',
                                          color: resolveMethod === m ? '#1a1a2e' : '#888',
                                          border: `1px solid ${resolveMethod === m ? 'var(--krma-gold)' : '#3a3a4e'}`,
                                        }}>{m}</button>
                                    ))}
                                  </div>
                                  {resolveMethod === 'check' && (
                                    <p className="text-[8px] mb-1" style={{ color: '#666' }}>
                                      Run the check from the character&apos;s Skills panel, then record the result here.
                                    </p>
                                  )}
                                  <input
                                    type="text" value={resolveNote} onChange={e => setResolveNote(e.target.value)}
                                    onMouseDown={e => e.stopPropagation()}
                                    placeholder={resolveMethod === 'check' ? 'e.g. Lockpicking vs DR 12 — success' : resolveMethod === 'krma' ? 'e.g. spent 3 Frequency' : 'What happened?'}
                                    className="w-full bg-transparent outline-none text-[9px] text-white px-1 py-0.5 border-b mb-1"
                                    style={{ borderColor: '#3a3a4e' }}
                                  />
                                  <div className="flex gap-1">
                                    <button onClick={e => { e.stopPropagation(); handleResolveOpp(goal.id, opp.id, 'SEIZED'); }} onMouseDown={e => e.stopPropagation()}
                                      className="text-[8px] px-1.5 py-0.5 uppercase"
                                      style={{ color: '#3EB89A', border: '1px solid rgba(62,184,154,0.4)', borderRadius: '2px' }}>Seized</button>
                                    <button onClick={e => { e.stopPropagation(); handleResolveOpp(goal.id, opp.id, 'MISSED'); }} onMouseDown={e => e.stopPropagation()}
                                      className="text-[8px] px-1.5 py-0.5 uppercase"
                                      style={{ color: '#E8585A', border: '1px solid rgba(232,88,90,0.4)', borderRadius: '2px' }}>Missed</button>
                                    <button onClick={e => { e.stopPropagation(); setResolvingOpp(null); }} onMouseDown={e => e.stopPropagation()}
                                      className="text-[8px] px-1.5 py-0.5 uppercase text-gray-500"
                                      style={{ border: '1px solid #3a3a4e', borderRadius: '2px' }}>Cancel</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                          {isGM && declaringOpp === goal.id && (
                            <div className="mt-1 p-1.5 border" style={{ borderColor: '#ffcc7844', borderRadius: '2px', backgroundColor: '#1a1a2e' }}>
                              <input
                                type="text" value={newOppDesc} onChange={e => setNewOppDesc(e.target.value)}
                                onMouseDown={e => e.stopPropagation()} placeholder="Describe the moment of leverage..." autoFocus
                                className="w-full bg-transparent outline-none text-[10px] text-white px-1 py-0.5 border-b mb-1"
                                style={{ borderColor: '#3a3a4e' }}
                              />
                              <div className="flex gap-1">
                                <button onClick={e => { e.stopPropagation(); handleDeclareOpp(goal.id); }} onMouseDown={e => e.stopPropagation()}
                                  disabled={!newOppDesc.trim()}
                                  className="text-[9px] px-2 py-0.5 uppercase"
                                  style={{ color: newOppDesc.trim() ? 'var(--krma-gold)' : '#666', border: '1px solid rgba(255,204,120,0.3)', borderRadius: '2px' }}>Declare</button>
                                <button onClick={e => { e.stopPropagation(); setDeclaringOpp(null); }} onMouseDown={e => e.stopPropagation()}
                                  className="text-[9px] px-2 py-0.5 uppercase text-gray-500"
                                  style={{ border: '1px solid #3a3a4e', borderRadius: '2px' }}>Cancel</button>
                              </div>
                            </div>
                          )}
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

                      {/* Actions — GM lifecycle transitions (T34: complete/fail route
                          through the dispatcher server-side, never silent flips) */}
                      {isGM && isLive && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          <button onClick={e => { e.stopPropagation(); handleTransition(goal.id, 'COMPLETED'); }} onMouseDown={e => e.stopPropagation()}
                            className="px-2 py-0.5 text-[9px] uppercase"
                            style={{ borderRadius: '2px', border: '1px solid rgba(212,168,48,0.5)', color: '#D4A830' }}>
                            Complete
                          </button>
                          <button onClick={e => { e.stopPropagation(); handleTransition(goal.id, 'FAILED'); }} onMouseDown={e => e.stopPropagation()}
                            className="px-2 py-0.5 text-[9px] uppercase"
                            style={{ borderRadius: '2px', border: '1px solid rgba(232,88,90,0.5)', color: '#E8585A' }}>
                            Fail
                          </button>
                          {goal.status === 'ACTIVE' ? (
                            <button onClick={e => { e.stopPropagation(); handleTransition(goal.id, 'DORMANT'); }} onMouseDown={e => e.stopPropagation()}
                              className="px-2 py-0.5 text-[9px] uppercase"
                              style={{ borderRadius: '2px', border: '1px solid rgba(138,138,176,0.5)', color: '#8a8ab0' }}>
                              Sleep
                            </button>
                          ) : (
                            <button onClick={e => { e.stopPropagation(); handleTransition(goal.id, 'ACTIVE'); }} onMouseDown={e => e.stopPropagation()}
                              className="px-2 py-0.5 text-[9px] uppercase"
                              style={{ borderRadius: '2px', border: '1px solid rgba(62,184,154,0.5)', color: '#3EB89A' }}>
                              Reactivate
                            </button>
                          )}
                          <button onClick={e => { e.stopPropagation(); handleAbandon(goal.id); }} onMouseDown={e => e.stopPropagation()}
                            className="px-2 py-0.5 text-[9px] uppercase"
                            style={{ borderRadius: '2px', border: '1px solid #555', color: '#888' }}>
                            Abandon
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
