'use client';

import type { GrowthAttribute, GrowthFrequency } from '@/types/growth';

interface AttributeBlockProps {
  name: string;
  abbr: string;
  attribute: GrowthAttribute | GrowthFrequency;
  pillarColor: string;
  isFrequency?: boolean;
}

function getPoolMax(attr: GrowthAttribute): number {
  return attr.level + attr.augmentPositive - attr.augmentNegative;
}

export default function AttributeBlock({ name, abbr, attribute, pillarColor, isFrequency }: AttributeBlockProps) {
  const max = isFrequency ? attribute.level : getPoolMax(attribute as GrowthAttribute);
  const pct = max > 0 ? (attribute.current / max) * 100 : 0;
  const isDepleted = attribute.current === 0;

  return (
    <div className={`relative ${isDepleted ? 'opacity-60' : ''}`}>
      {/* Attribute pill label */}
      <div className="flex items-center gap-2 mb-1">
        <span
          className="attr-pill"
          style={{ backgroundColor: pillarColor }}
        >
          {abbr}
        </span>
        <span className="text-xs text-[var(--surface-dark)]/60 uppercase tracking-wider">
          {name}
        </span>
      </div>

      {/* Pool bar */}
      <div className="h-5 bg-[var(--surface-dark)]/10 relative">
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            backgroundColor: isDepleted ? 'var(--accent-coral)' : pillarColor,
          }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
          {attribute.current} / {max}
        </span>
      </div>

      {/* Augments (non-frequency only) */}
      {!isFrequency && (
        <div className="flex justify-between text-[10px] text-[var(--surface-dark)]/40 mt-0.5">
          <span>Lv {attribute.level}</span>
          {((attribute as GrowthAttribute).augmentPositive > 0 || (attribute as GrowthAttribute).augmentNegative > 0) && (
            <span>
              {(attribute as GrowthAttribute).augmentPositive > 0 && `+${(attribute as GrowthAttribute).augmentPositive}`}
              {(attribute as GrowthAttribute).augmentNegative > 0 && ` -${(attribute as GrowthAttribute).augmentNegative}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
