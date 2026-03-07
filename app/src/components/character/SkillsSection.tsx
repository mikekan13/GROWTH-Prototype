'use client';

import type { GrowthSkill } from '@/types/growth';

function getSkillDie(level: number): string {
  if (level <= 0) return '-';
  if (level <= 3) return `+${level}`;
  if (level <= 5) return 'd4';
  if (level <= 7) return 'd6';
  if (level <= 11) return 'd8';
  if (level <= 19) return 'd12';
  return 'd20';
}

export default function SkillsSection({ skills }: { skills: GrowthSkill[] }) {
  if (skills.length === 0) return null;

  const combat = skills.filter(s => s.isCombat);
  const nonCombat = skills.filter(s => !s.isCombat);

  return (
    <div>
      <div className="section-badge inline-block text-sm mb-3">Skills</div>
      <div className="grid grid-cols-2 gap-4">
        {/* Combat Skills */}
        {combat.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--pillar-body)] mb-2">Combat</div>
            {combat.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-0.5">
                <span>{s.name}</span>
                <span className="text-[var(--surface-dark)]/60">
                  Lv {s.level} <span className="text-[var(--accent-teal)]">({getSkillDie(s.level)})</span>
                </span>
              </div>
            ))}
          </div>
        )}
        {/* Non-combat Skills */}
        {nonCombat.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--accent-teal)] mb-2">General</div>
            {nonCombat.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-0.5">
                <span>{s.name}</span>
                <span className="text-[var(--surface-dark)]/60">
                  Lv {s.level} <span className="text-[var(--accent-teal)]">({getSkillDie(s.level)})</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
