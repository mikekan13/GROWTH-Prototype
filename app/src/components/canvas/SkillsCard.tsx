"use client";

import React, { useState } from 'react';
import { ComplexTooltip } from '@/components/ui/ComplexTooltip';
import type { SkillGovernor } from '@/types/growth';
import { SKILL_GOVERNORS } from '@/types/growth';

export interface SkillItem {
  name: string;
  level: number;
  governors: SkillGovernor[];
  description?: string;
  forgeItemId?: string;
}

interface SkillsCardProps {
  skills: SkillItem[];
  isPlayer?: boolean;
  onClose?: () => void;
  onAddSkill?: (skill: { name: string; level: number; governors: SkillGovernor[]; description?: string }) => void;
  onRemoveSkill?: (skillName: string) => void;
  onUpdateSkillLevel?: (skillName: string, newLevel: number) => void;
  onRollSkill?: (skillName: string) => void;
  onRequestSkill?: (request: { name: string; governors: SkillGovernor[]; description?: string }) => void;
}

function getSkillDie(level: number): string {
  if (level <= 0) return '-';
  if (level <= 3) return `+${level}`;
  if (level <= 5) return 'd4';
  if (level <= 7) return 'd6';
  if (level <= 11) return 'd8';
  if (level <= 19) return 'd12';
  return 'd20';
}

function getMaxDieValue(level: number): number {
  if (level <= 0) return 0;
  if (level <= 3) return level;
  if (level <= 5) return 4;
  if (level <= 7) return 6;
  if (level <= 11) return 8;
  if (level <= 19) return 12;
  return 20;
}

function getSkillRank(level: number): string {
  if (level <= 0) return 'Untrained';
  if (level <= 3) return 'Novice';
  if (level <= 5) return 'Decoder';
  if (level <= 7) return 'Competent';
  if (level <= 9) return 'Professional';
  if (level <= 11) return 'Expert';
  if (level <= 19) return 'Master';
  return 'Godlike';
}

function dieColor(level: number): string {
  if (level <= 3) return '#888';
  if (level <= 5) return '#D0A030';
  if (level <= 7) return '#3EB89A';
  if (level <= 11) return '#7050A8';
  if (level <= 19) return '#E8585A';
  return '#ffcc78';
}

// Governor abbreviations for compact display
const GOV_ABBREV: Record<string, string> = {
  clout: 'CLO', celerity: 'CEL', constitution: 'CON',
  flow: 'FLO', focus: 'FOC',
  willpower: 'WIL', wisdom: 'WIS', wit: 'WIT',
};

// Pillar colors for governor badges
const GOV_COLOR: Record<string, string> = {
  clout: '#E8585A', celerity: '#E8585A', constitution: '#E8585A',
  flow: '#3EB89A', focus: '#3EB89A',
  willpower: '#7050A8', wisdom: '#7050A8', wit: '#7050A8',
};

export default function SkillsCard({ skills, isPlayer, onClose, onAddSkill, onRemoveSkill, onUpdateSkillLevel, onRollSkill, onRequestSkill }: SkillsCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillLevel, setNewSkillLevel] = useState(1);
  const [newSkillDesc, setNewSkillDesc] = useState('');
  const [newSkillGovs, setNewSkillGovs] = useState<Set<SkillGovernor>>(new Set());

  const safeSkills = Array.isArray(skills) ? skills : [];
  const sorted = [...safeSkills].sort((a, b) => b.level - a.level);
  const isEditable = !!(onAddSkill || onRemoveSkill || onUpdateSkillLevel);

  const toggleGov = (gov: SkillGovernor) => {
    setNewSkillGovs(prev => {
      const next = new Set(prev);
      if (next.has(gov)) next.delete(gov);
      else next.add(gov);
      return next;
    });
  };

  const handleAddSkill = () => {
    if (!newSkillName.trim() || !onAddSkill || newSkillGovs.size === 0) return;
    onAddSkill({
      name: newSkillName.trim(),
      level: newSkillLevel,
      governors: Array.from(newSkillGovs),
      description: newSkillDesc.trim() || undefined,
    });
    resetForm();
  };

  const handleRequestSkill = () => {
    if (!newSkillName.trim() || !onRequestSkill || newSkillGovs.size === 0) return;
    onRequestSkill({
      name: newSkillName.trim(),
      governors: Array.from(newSkillGovs),
      description: newSkillDesc.trim() || undefined,
    });
    resetForm();
    setShowRequestForm(false);
  };

  const resetForm = () => {
    setNewSkillName('');
    setNewSkillLevel(1);
    setNewSkillDesc('');
    setNewSkillGovs(new Set());
    setShowAddForm(false);
  };

  const canSubmit = newSkillName.trim() && newSkillGovs.size > 0;

  // Governor selector (shared between add and request forms)
  const GovernorSelector = () => (
    <div className="space-y-1">
      <label className="text-[9px] text-gray-400">Governors (at least one):</label>
      <div className="flex flex-wrap gap-1">
        {SKILL_GOVERNORS.map(gov => (
          <button
            key={gov}
            type="button"
            onClick={e => { e.stopPropagation(); toggleGov(gov); }}
            onMouseDown={e => e.stopPropagation()}
            className="text-[8px] px-1.5 py-0.5 transition-colors uppercase"
            style={{
              borderRadius: '2px',
              fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
              letterSpacing: '0.05em',
              backgroundColor: newSkillGovs.has(gov) ? GOV_COLOR[gov] : '#2a2a3e',
              color: newSkillGovs.has(gov) ? 'white' : '#666',
              border: `1px solid ${newSkillGovs.has(gov) ? GOV_COLOR[gov] : '#3a3a4e'}`,
            }}
          >
            {GOV_ABBREV[gov]}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="border transition-all duration-200" style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#1a1a2e', borderColor: '#ffcc78', borderRadius: '3px', width: '400px' }}>
      {/* Header */}
      <div className="p-3 text-white cursor-grab" style={{ background: 'linear-gradient(135deg, #582a72 0%, #3d1952 100%)', borderRadius: '2px 2px 0 0' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-lg">{'\u2605'}</span>
            <div>
              <h3 className="font-semibold text-sm" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em', fontSize: '15px' }}>SKILLS</h3>
              <p className="text-xs" style={{ color: '#ffcc78', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px' }}>
                {safeSkills.length} skill{safeSkills.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isEditable && (
              <button onClick={e => { e.stopPropagation(); setShowAddForm(!showAddForm); setShowRequestForm(false); }} onMouseDown={e => e.stopPropagation()}
                className="p-1 hover:bg-white/20 transition-colors text-xs" style={{ borderRadius: '2px', color: '#ffcc78' }}>
                +
              </button>
            )}
            {isPlayer && onRequestSkill && (
              <button onClick={e => { e.stopPropagation(); setShowRequestForm(!showRequestForm); setShowAddForm(false); }} onMouseDown={e => e.stopPropagation()}
                className="px-1.5 py-0.5 hover:bg-white/20 transition-colors text-[8px] uppercase"
                style={{ borderRadius: '2px', color: '#22ab94', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>
                Request
              </button>
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
          {/* Add Skill Form (GM) */}
          {showAddForm && onAddSkill && (
            <div className="mb-3 p-2 border" style={{ borderColor: '#ffcc78', borderRadius: '2px', backgroundColor: '#2a2a3e' }}>
              <div className="space-y-2">
                <input
                  type="text"
                  value={newSkillName}
                  onChange={e => setNewSkillName(e.target.value)}
                  onMouseDown={e => e.stopPropagation()}
                  placeholder="Skill name..."
                  className="w-full bg-transparent outline-none text-sm text-white px-1 py-0.5 border-b"
                  style={{ borderColor: '#3a3a4e', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                  autoFocus
                />
                <input
                  type="text"
                  value={newSkillDesc}
                  onChange={e => setNewSkillDesc(e.target.value)}
                  onMouseDown={e => e.stopPropagation()}
                  placeholder="Description (optional)..."
                  className="w-full bg-transparent outline-none text-[10px] text-gray-300 px-1 py-0.5 border-b"
                  style={{ borderColor: '#3a3a4e', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                />
                <GovernorSelector />
                <div className="flex gap-2 items-center">
                  <label className="text-[9px] text-gray-400">Level:</label>
                  <input
                    type="number"
                    value={newSkillLevel}
                    onChange={e => setNewSkillLevel(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                    onMouseDown={e => e.stopPropagation()}
                    min={1} max={20}
                    className="w-12 bg-transparent outline-none text-xs text-white px-1 py-0.5 border"
                    style={{ borderColor: '#3a3a4e', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={e => { e.stopPropagation(); handleAddSkill(); }}
                    onMouseDown={e => e.stopPropagation()}
                    disabled={!canSubmit}
                    className="text-[9px] px-2 py-0.5 uppercase"
                    style={{
                      color: canSubmit ? '#22ab94' : '#666',
                      border: '1px solid',
                      borderColor: canSubmit ? 'rgba(34,171,148,0.4)' : '#3a3a4e',
                      borderRadius: '2px',
                    }}
                  >
                    Add
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); resetForm(); }}
                    onMouseDown={e => e.stopPropagation()}
                    className="text-[9px] px-2 py-0.5 uppercase text-gray-500"
                    style={{ border: '1px solid #3a3a4e', borderRadius: '2px' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Request Skill Form (Player) */}
          {showRequestForm && onRequestSkill && (
            <div className="mb-3 p-2 border" style={{ borderColor: '#22ab94', borderRadius: '2px', backgroundColor: '#2a2a3e' }}>
              <div className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#22ab94', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>Request a Skill</div>
              <div className="space-y-2">
                <input
                  type="text"
                  value={newSkillName}
                  onChange={e => setNewSkillName(e.target.value)}
                  onMouseDown={e => e.stopPropagation()}
                  placeholder="Skill name..."
                  className="w-full bg-transparent outline-none text-sm text-white px-1 py-0.5 border-b"
                  style={{ borderColor: '#3a3a4e', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                  autoFocus
                />
                <input
                  type="text"
                  value={newSkillDesc}
                  onChange={e => setNewSkillDesc(e.target.value)}
                  onMouseDown={e => e.stopPropagation()}
                  placeholder="Description (what does this skill cover?)..."
                  className="w-full bg-transparent outline-none text-[10px] text-gray-300 px-1 py-0.5 border-b"
                  style={{ borderColor: '#3a3a4e', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                />
                <GovernorSelector />
                <div className="flex gap-2">
                  <button
                    onClick={e => { e.stopPropagation(); handleRequestSkill(); }}
                    onMouseDown={e => e.stopPropagation()}
                    disabled={!canSubmit}
                    className="text-[9px] px-2 py-0.5 uppercase"
                    style={{
                      color: canSubmit ? '#22ab94' : '#666',
                      border: '1px solid',
                      borderColor: canSubmit ? 'rgba(34,171,148,0.4)' : '#3a3a4e',
                      borderRadius: '2px',
                    }}
                  >
                    Submit Request
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); resetForm(); setShowRequestForm(false); }}
                    onMouseDown={e => e.stopPropagation()}
                    className="text-[9px] px-2 py-0.5 uppercase text-gray-500"
                    style={{ border: '1px solid #3a3a4e', borderRadius: '2px' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Die legend */}
          <div className="flex gap-2 mb-2 text-[8px] flex-wrap" style={{ color: '#666' }}>
            {[{ r: '1-3', d: 'Flat' }, { r: '4-5', d: 'd4' }, { r: '6-7', d: 'd6' }, { r: '8-11', d: 'd8' }, { r: '12-19', d: 'd12' }, { r: '20', d: 'd20' }].map(x => (
              <span key={x.r}>Lv{x.r}={x.d}</span>
            ))}
          </div>

          {/* Skills list */}
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {sorted.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-4">
                {isEditable ? 'No skills yet. Click + to add one.' : isPlayer ? 'No skills yet. Request one!' : 'No skills found'}
              </div>
            ) : sorted.map((skill, i) => {
              const die = getSkillDie(skill.level);
              const rank = getSkillRank(skill.level);
              const maxRoll = getMaxDieValue(skill.level);
              const effortToCap = Math.max(0, skill.level - maxRoll);
              return (
                <ComplexTooltip key={i} title={`\u2605 ${skill.name}`}
                  modifiers={[
                    { name: `Level: ${skill.level}`, value: skill.level },
                    { name: `Rank: ${rank}`, value: 0 },
                    { name: `Skill Die: ${die}`, value: 0 },
                    { name: `Max Roll: ${maxRoll}`, value: maxRoll },
                    ...(effortToCap > 0 ? [{ name: `Effort to Cap: +${effortToCap}`, value: effortToCap }] : []),
                    { name: `Gov: ${(skill.governors || []).map(g => GOV_ABBREV[g] || g).join(', ')}`, value: 0 },
                    ...(skill.description ? [{ name: skill.description, value: 0 }] : []),
                  ]} totalValue={skill.level}>
                  <div className="p-1.5 border transition-colors group" onMouseDown={e => e.stopPropagation()}
                    style={{ borderRadius: '2px', backgroundColor: '#2a2a3e', borderColor: '#3a3a4e' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="text-sm text-white truncate">{skill.name}</span>
                        {/* Governor badges */}
                        <div className="flex gap-px flex-shrink-0">
                          {(skill.governors || []).map(gov => (
                            <span key={gov} className="text-[7px] px-0.5" style={{
                              backgroundColor: `${GOV_COLOR[gov]}30`,
                              color: GOV_COLOR[gov],
                              borderRadius: '1px',
                              fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                              letterSpacing: '0.03em',
                            }}>{GOV_ABBREV[gov]}</span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Level adjust buttons (only when editable) */}
                        {onUpdateSkillLevel && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={e => { e.stopPropagation(); onUpdateSkillLevel(skill.name, skill.level - 1); }}
                              className="text-[9px] w-4 h-4 flex items-center justify-center hover:bg-white/10"
                              style={{ color: '#888', borderRadius: '2px' }}
                            >-</button>
                            <button
                              onClick={e => { e.stopPropagation(); onUpdateSkillLevel(skill.name, skill.level + 1); }}
                              className="text-[9px] w-4 h-4 flex items-center justify-center hover:bg-white/10"
                              style={{ color: '#888', borderRadius: '2px' }}
                            >+</button>
                          </div>
                        )}
                        {/* Roll button */}
                        {onRollSkill && (
                          <button
                            onClick={e => { e.stopPropagation(); onRollSkill(skill.name); }}
                            className="text-[8px] px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity uppercase"
                            style={{
                              fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                              color: '#ffcc78',
                              border: '1px solid rgba(255,204,120,0.3)',
                              borderRadius: '2px',
                              letterSpacing: '0.05em',
                            }}
                          >
                            Roll
                          </button>
                        )}
                        {/* Remove button */}
                        {onRemoveSkill && (
                          <button
                            onClick={e => { e.stopPropagation(); onRemoveSkill(skill.name); }}
                            className="text-[9px] w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-900/30"
                            style={{ color: '#ff6b6b', borderRadius: '2px' }}
                          >{'\u00D7'}</button>
                        )}
                        {/* Mini level bar */}
                        <div className="flex gap-px">
                          {Array.from({ length: 20 }, (_, j) => (
                            <div key={j} style={{ width: '2px', height: '10px', backgroundColor: j < skill.level ? dieColor(skill.level) : '#2a2a3e' }} />
                          ))}
                        </div>
                        <span className="text-[10px] w-4 text-right" style={{ color: '#888' }}>{skill.level}</span>
                        <span className="text-xs font-bold px-1" style={{ backgroundColor: '#1a1a2e', color: dieColor(skill.level), border: `1px solid ${dieColor(skill.level)}40`, borderRadius: '2px', minWidth: '30px', textAlign: 'center' }}>{die}</span>
                      </div>
                    </div>
                  </div>
                </ComplexTooltip>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
