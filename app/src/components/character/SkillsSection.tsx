'use client';

import type { GrowthSkill } from '@/types/growth';
import { getSkillDie, getSkillRank } from '@/types/growth';
import { ComplexTooltip } from '@/components/ui/ComplexTooltip';

// Governor abbreviations and pillar colors
const GOV_ABBREV: Record<string, string> = {
  clout: 'CLO', celerity: 'CEL', constitution: 'CON',
  flow: 'FLO', focus: 'FOC',
  willpower: 'WIL', wisdom: 'WIS', wit: 'WIT',
};

const GOV_COLOR: Record<string, string> = {
  clout: '#E8585A', celerity: '#E8585A', constitution: '#E8585A',
  flow: '#3EB89A', focus: '#3EB89A',
  willpower: '#7050A8', wisdom: '#7050A8', wit: '#7050A8',
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
  const govStr = (skill.governors || []).map(g => GOV_ABBREV[g] || g).join(', ');

  return (
    <ComplexTooltip
      title={skill.name}
      baseValue={skill.level}
      modifiers={[
        { name: `Rank: ${rank}`, value: 0 },
        { name: `Skill Die: ${die}`, value: 0 },
        { name: `Governors: ${govStr}`, value: 0 },
        ...(skill.description ? [{ name: skill.description, value: 0 }] : []),
      ]}
      totalValue={skill.level}
    >
      <div className="flex items-center justify-between py-1 px-2 text-sm cursor-help transition-colors hover:bg-[var(--surface-dark)]/5">
        <div className="flex items-center gap-2">
          <span>{skill.name}</span>
          {/* Governor badges */}
          <div className="flex gap-px">
            {(skill.governors || []).map(gov => (
              <span key={gov} className="px-0.5 text-[8px] uppercase" style={{
                backgroundColor: `${GOV_COLOR[gov]}20`,
                color: GOV_COLOR[gov],
                fontFamily: 'var(--font-header)',
                letterSpacing: '0.03em',
              }}>
                {GOV_ABBREV[gov]}
              </span>
            ))}
          </div>
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
  if (skills.length === 0) return null;

  const sortedSkills = [...skills].sort((a, b) => b.level - a.level);

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="section-badge inline-block text-sm">Skills</div>
        <span className="text-[10px]" style={{ color: 'var(--surface-dark)', opacity: 0.4 }}>
          {skills.length} skill{skills.length !== 1 ? 's' : ''}
        </span>
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
      <div className="space-y-0.5">
        {sortedSkills.map((s, i) => <SkillRow key={i} skill={s} />)}
      </div>
    </div>
  );
}
