'use client';

import type { GrowthVitals, BodyPart } from '@/types/growth';

const BODY_PARTS: { key: BodyPart; label: string }[] = [
  { key: 'HEAD', label: 'Head' },
  { key: 'NECK', label: 'Neck' },
  { key: 'TORSO', label: 'Torso' },
  { key: 'RIGHTARM', label: 'R. Arm' },
  { key: 'LEFTARM', label: 'L. Arm' },
  { key: 'RIGHTUPPERLEG', label: 'R. Upper Leg' },
  { key: 'LEFTUPPERLEG', label: 'L. Upper Leg' },
  { key: 'RIGHTLOWERLEG', label: 'R. Lower Leg' },
  { key: 'LEFTLOWERLEG', label: 'L. Lower Leg' },
];

export default function VitalsSection({ vitals }: { vitals: GrowthVitals }) {
  const hasDamage = Object.values(vitals.bodyParts).some(v => v > 0);

  return (
    <div>
      <div className="section-badge inline-block text-sm mb-3">Vitals</div>

      <div className="flex gap-6 text-sm mb-3">
        <div>
          <span className="text-[var(--surface-dark)]/40 text-xs uppercase">Base Resist</span>
          <span className="ml-2">{vitals.baseResist}</span>
        </div>
        <div>
          <span className="text-[var(--surface-dark)]/40 text-xs uppercase">Rest Rate</span>
          <span className="ml-2">{vitals.restRate}</span>
        </div>
        <div>
          <span className="text-[var(--surface-dark)]/40 text-xs uppercase">Carry</span>
          <span className="ml-2">{vitals.carryLevel}</span>
          {vitals.weightStatus === 'Encumbered' && (
            <span className="ml-1 text-[var(--accent-coral)] text-xs">(Encumbered)</span>
          )}
        </div>
      </div>

      {/* Body damage grid */}
      {hasDamage && (
        <div className="grid grid-cols-3 gap-1">
          {BODY_PARTS.map(({ key, label }) => {
            const dmg = vitals.bodyParts[key];
            return (
              <div
                key={key}
                className={`text-xs py-1 px-2 ${
                  dmg > 0 ? 'highlight-bar text-[var(--accent-coral)]' : 'text-[var(--surface-dark)]/30'
                }`}
              >
                {label}: {dmg > 0 ? dmg : '-'}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
