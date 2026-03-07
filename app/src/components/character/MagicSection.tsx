'use client';

import type { GrowthMagic } from '@/types/growth';

interface MagicSectionProps {
  magic: GrowthMagic;
}

const PILLAR_STYLES = {
  mercy: { label: 'Mercy (Flow)', color: 'var(--pillar-spirit)', desc: 'Receiving, acceptance, healing' },
  severity: { label: 'Severity (Focus)', color: 'var(--pillar-spirit)', desc: 'Giving, manifestation, destruction' },
  balance: { label: 'Balance (Flow + Focus)', color: 'var(--pillar-soul)', desc: 'Harmony of opposing forces' },
} as const;

export default function MagicSection({ magic }: MagicSectionProps) {
  const hasAnyMagic = magic.mercy.knownSpells.length > 0
    || magic.severity.knownSpells.length > 0
    || magic.balance.knownSpells.length > 0;

  if (!hasAnyMagic) return null;

  return (
    <div>
      <div className="section-badge inline-block text-sm mb-3">Magic</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(Object.keys(PILLAR_STYLES) as Array<keyof typeof PILLAR_STYLES>).map(key => {
          const pillar = magic[key];
          const style = PILLAR_STYLES[key];
          if (pillar.knownSpells.length === 0) return null;

          return (
            <div key={key} className="space-y-2">
              <div className="text-xs uppercase tracking-widest" style={{ color: style.color }}>
                {style.label}
              </div>
              {pillar.schools.length > 0 && (
                <div className="text-[10px] text-[var(--surface-dark)]/40">
                  {pillar.schools.join(', ')}
                </div>
              )}
              {pillar.knownSpells.map((spell, i) => (
                <div key={i} className="bg-white/30 border border-[var(--surface-dark)]/10 p-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-bold">{spell.name}</span>
                    {spell.cost !== undefined && (
                      <span className="text-[10px] text-[var(--surface-dark)]/40">Cost: {spell.cost}</span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--surface-dark)]/60 mt-0.5">{spell.description}</div>
                  <div className="text-[10px] text-[var(--surface-dark)]/30 mt-1">{spell.school}</div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
