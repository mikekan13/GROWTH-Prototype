'use client';

import { useState } from 'react';
import type { GrowthSkill, SkillCategory } from '@/types/growth';
import { getSkillDie, getSkillRank } from '@/types/growth';
import { ComplexTooltip } from '@/components/ui/ComplexTooltip';

const CATEGORY_META: Record<SkillCategory, { label: string; color: string }> = {
  athletics: { label: 'Athletics', color: '#E8585A' },
  social: { label: 'Social', color: '#D0A030' },
  martial: { label: 'Martial', color: '#f7525f' },
  sciences: { label: 'Sciences', color: '#002f6c' },
  arts: { label: 'Arts', color: '#7050A8' },
  perception: { label: 'Perception', color: '#3EB89A' },
  magic: { label: 'Magic', color: '#582a72' },
  crafting: { label: 'Crafting', color: '#D07818' },
  other: { label: 'Other', color: '#6fa8dc' },
};

function SkillDieBadge({ level }: { level: number }) {
  const die = getSkillDie(level);
  const isFlat = level <= 3;

  return (
    <span
      className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold"
      style={{
        backgroundColor: isFlat ? 'rgba(30, 45, 64, 0.1)' : 'var(--surface-dark)',
        color: isFlat ? 'var(--surface-dark)' : 'var(--accent-teal)',
        fontFamily: 'var(--font-terminal)',
        minWidth: '32px',
      }}
    >
      {die}
    </span>
  );
}

function SkillRow({ skill }: { skill: GrowthSkill }) {
  const rank = getSkillRank(skill.level);
  const die = getSkillDie(skill.level);
  const catMeta = skill.category ? CATEGORY_META[skill.category] : null;

  return (
    <ComplexTooltip
      title={skill.name}
      baseValue={skill.level}
      modifiers={[
        { name: `Rank: ${rank}`, value: 0 },
        { name: `Skill Die: ${die}`, value: 0 },
        ...(skill.isCombat ? [{ name: 'Combat Skill', value: 0 }] : []),
        ...(skill.description ? [{ name: skill.description, value: 0 }] : []),
      ]}
      totalValue={skill.level}
    >
      <div className="flex items-center justify-between py-1 px-2 text-sm cursor-help transition-colors hover:bg-[var(--surface-dark)]/5">
        <div className="flex items-center gap-2">
          <span>{skill.name}</span>
          {catMeta && (
            <span className="px-1 text-[9px] uppercase" style={{
              backgroundColor: catMeta.color,
              color: 'white',
              fontFamily: 'var(--font-header)',
              letterSpacing: '0.03em',
            }}>
              {catMeta.label}
            </span>
          )}
          {skill.isCombat && !skill.category && (
            <span className="px-1 text-[9px] uppercase" style={{
              backgroundColor: '#E8585A',
              color: 'white',
              fontFamily: 'var(--font-header)',
            }}>
              Combat
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Level bar */}
          <div className="flex gap-px">
            {Array.from({ length: 20 }, (_, i) => (
              <div
                key={i}
                className="transition-colors"
                style={{
                  width: '3px',
                  height: '12px',
                  backgroundColor: i < skill.level
                    ? (i < 3 ? 'var(--surface-dark)' : i < 5 ? '#D0A030' : i < 7 ? '#3EB89A' : i < 11 ? '#7050A8' : i < 19 ? '#E8585A' : '#FFCC78')
                    : 'rgba(30, 45, 64, 0.08)',
                }}
              />
            ))}
          </div>
          <span className="text-[10px] w-5 text-right" style={{ color: 'var(--surface-dark)', opacity: 0.4 }}>
            {skill.level}
          </span>
          <SkillDieBadge level={skill.level} />
        </div>
      </div>
    </ComplexTooltip>
  );
}

export default function SkillsSection({ skills }: { skills: GrowthSkill[] }) {
  const [view, setView] = useState<'all' | 'combat' | 'general' | 'byCategory'>('all');

  if (skills.length === 0) return null;

  const combat = skills.filter(s => s.isCombat);
  const general = skills.filter(s => !s.isCombat);

  // Group by category
  const byCategory = skills.reduce<Record<string, GrowthSkill[]>>((acc, s) => {
    const cat = s.category || (s.isCombat ? 'martial' : 'other');
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  // Sort skills by level descending within each group
  const sortedSkills = [...skills].sort((a, b) => b.level - a.level);
  const sortedCombat = [...combat].sort((a, b) => b.level - a.level);
  const sortedGeneral = [...general].sort((a, b) => b.level - a.level);

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="section-badge inline-block text-sm">Skills</div>
        <span className="text-[10px]" style={{ color: 'var(--surface-dark)', opacity: 0.4 }}>
          {skills.length} skills | {combat.length} combat | {general.length} general
        </span>
      </div>

      {/* View toggles */}
      <div className="flex gap-1 mb-3">
        {[
          { key: 'all' as const, label: 'All' },
          { key: 'combat' as const, label: 'Combat' },
          { key: 'general' as const, label: 'General' },
          { key: 'byCategory' as const, label: 'By Category' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className="px-2 py-0.5 text-[10px] uppercase transition-colors"
            style={{
              fontFamily: 'var(--font-header)',
              letterSpacing: '0.05em',
              backgroundColor: view === key ? 'var(--surface-dark)' : 'rgba(30, 45, 64, 0.08)',
              color: view === key ? 'var(--accent-gold)' : 'rgba(30, 45, 64, 0.4)',
              border: `1px solid ${view === key ? 'var(--accent-gold)' : 'rgba(30, 45, 64, 0.1)'}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Skill die legend */}
      <div className="flex gap-2 mb-3 text-[9px] flex-wrap" style={{ color: 'var(--surface-dark)', opacity: 0.4 }}>
        {[
          { range: '1-3', die: 'Flat Bonus' },
          { range: '4-5', die: 'd4' },
          { range: '6-7', die: 'd6' },
          { range: '8-11', die: 'd8' },
          { range: '12-19', die: 'd12' },
          { range: '20', die: 'd20' },
        ].map(({ range, die }) => (
          <span key={range}>Lv{range}={die}</span>
        ))}
      </div>

      {/* Skills list */}
      {view === 'all' && (
        <div className="space-y-0.5">
          {sortedSkills.map((s, i) => <SkillRow key={i} skill={s} />)}
        </div>
      )}

      {view === 'combat' && (
        <div className="space-y-0.5">
          {sortedCombat.length > 0 ? (
            sortedCombat.map((s, i) => <SkillRow key={i} skill={s} />)
          ) : (
            <div className="text-xs py-2" style={{ color: 'var(--surface-dark)', opacity: 0.3 }}>No combat skills</div>
          )}
        </div>
      )}

      {view === 'general' && (
        <div className="space-y-0.5">
          {sortedGeneral.length > 0 ? (
            sortedGeneral.map((s, i) => <SkillRow key={i} skill={s} />)
          ) : (
            <div className="text-xs py-2" style={{ color: 'var(--surface-dark)', opacity: 0.3 }}>No general skills</div>
          )}
        </div>
      )}

      {view === 'byCategory' && (
        <div className="space-y-3">
          {Object.entries(byCategory)
            .sort(([, a], [, b]) => b.length - a.length)
            .map(([cat, catSkills]) => {
              const meta = CATEGORY_META[cat as SkillCategory] || { label: cat, color: '#6fa8dc' };
              return (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2" style={{ backgroundColor: meta.color }} />
                    <span className="text-xs uppercase" style={{
                      fontFamily: 'var(--font-header)',
                      letterSpacing: '0.05em',
                      color: meta.color,
                    }}>
                      {meta.label} ({catSkills.length})
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {[...catSkills].sort((a, b) => b.level - a.level).map((s, i) => (
                      <SkillRow key={i} skill={s} />
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
