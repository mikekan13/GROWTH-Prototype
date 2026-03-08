"use client";

import React, { useState } from 'react';
import { ComplexTooltip } from '@/components/ui/ComplexTooltip';

export interface SkillItem {
  name: string;
  level: number;
  isCombat?: boolean;
  category?: string;
  description?: string;
}

interface SkillsCardProps {
  skills: SkillItem[];
  onClose?: () => void;
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

export default function SkillsCard({ skills, onClose }: SkillsCardProps) {
  const [view, setView] = useState<string>('all');
  const [isExpanded, setIsExpanded] = useState(true);

  const safeSkills = Array.isArray(skills) ? skills : [];
  const combat = safeSkills.filter(s => s.isCombat);
  const general = safeSkills.filter(s => !s.isCombat);
  const sorted = [...safeSkills].sort((a, b) => b.level - a.level);
  const sortedCombat = [...combat].sort((a, b) => b.level - a.level);
  const sortedGeneral = [...general].sort((a, b) => b.level - a.level);

  const displayed = view === 'combat' ? sortedCombat : view === 'general' ? sortedGeneral : sorted;

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
                {safeSkills.length} skills {'\u2022'} {combat.length} combat {'\u2022'} {general.length} general
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
          {/* View tabs */}
          <div className="flex flex-wrap gap-1 mb-3">
            {['all', 'combat', 'general'].map(v => (
              <button key={v} onClick={e => { e.stopPropagation(); setView(v); }} onMouseDown={e => e.stopPropagation()}
                className="px-2 py-1 text-xs transition-colors uppercase"
                style={{
                  borderRadius: '2px', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em', fontSize: '11px',
                  backgroundColor: view === v ? '#582a72' : '#2a2a3e', color: view === v ? '#ffcc78' : '#888',
                  border: `1px solid ${view === v ? '#ffcc78' : '#3a3a4e'}`,
                }}>
                {v}
              </button>
            ))}
          </div>

          {/* Die legend */}
          <div className="flex gap-2 mb-2 text-[8px] flex-wrap" style={{ color: '#666' }}>
            {[{ r: '1-3', d: 'Flat' }, { r: '4-5', d: 'd4' }, { r: '6-7', d: 'd6' }, { r: '8-11', d: 'd8' }, { r: '12-19', d: 'd12' }, { r: '20', d: 'd20' }].map(x => (
              <span key={x.r}>Lv{x.r}={x.d}</span>
            ))}
          </div>

          {/* Skills list */}
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {displayed.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-4">No skills found</div>
            ) : displayed.map((skill, i) => {
              const die = getSkillDie(skill.level);
              const rank = getSkillRank(skill.level);
              return (
                <ComplexTooltip key={i} title={`\u2605 ${skill.name}`}
                  modifiers={[
                    { name: `Level: ${skill.level}`, value: skill.level },
                    { name: `Rank: ${rank}`, value: 0 },
                    { name: `Skill Die: ${die}`, value: 0 },
                    ...(skill.isCombat ? [{ name: 'Combat Skill', value: 0 }] : []),
                    ...(skill.description ? [{ name: skill.description, value: 0 }] : []),
                  ]} totalValue={skill.level}>
                  <div className="p-1.5 border transition-colors cursor-pointer" onMouseDown={e => e.stopPropagation()}
                    style={{ borderRadius: '2px', backgroundColor: '#2a2a3e', borderColor: '#3a3a4e' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="text-sm text-white truncate">{skill.name}</span>
                        {skill.isCombat && (
                          <span className="text-[8px] px-1" style={{ backgroundColor: '#E8585A', color: 'white', borderRadius: '2px', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', flexShrink: 0 }}>CBT</span>
                        )}
                        {skill.category && (
                          <span className="text-[8px] px-1" style={{ backgroundColor: '#3a3a4e', color: '#888', borderRadius: '2px', flexShrink: 0 }}>{skill.category}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
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
