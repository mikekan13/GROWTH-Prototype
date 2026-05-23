'use client';

import { useState } from 'react';
import type { GrowthAttribute, GrowthFrequency } from '@/types/growth';
import FrequencyOpsPanel from './FrequencyOpsPanel';

interface AttributeBlockProps {
  name: string;
  abbr: string;
  attribute: GrowthAttribute | GrowthFrequency;
  pillarColor: string;
  isFrequency?: boolean;
  /** If provided + isFrequency, exposes Spend/Deplete/Burn trigger. */
  characterId?: string;
  /** Fired after a frequency op completes — parent should refresh state. */
  onFrequencyOpApplied?: () => void;
}

function getPoolMax(attr: GrowthAttribute): number {
  return attr.level + attr.augmentPositive - attr.augmentNegative;
}

export default function AttributeBlock({ name, abbr, attribute, pillarColor, isFrequency, characterId, onFrequencyOpApplied }: AttributeBlockProps) {
  const [opsOpen, setOpsOpen] = useState(false);
  const max = isFrequency ? attribute.level : getPoolMax(attribute as GrowthAttribute);
  const pct = max > 0 ? (attribute.current / max) * 100 : 0;
  const isDepleted = attribute.current === 0;
  const showOpsTrigger = isFrequency && !!characterId;

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
        {showOpsTrigger && (
          <button
            onClick={() => setOpsOpen(true)}
            title="Spend / Deplete / Burn"
            className="ml-auto w-5 h-5 flex items-center justify-center text-[11px] border text-white/40 hover:text-white hover:border-white/60 transition-colors"
            style={{ borderColor: 'rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.3)' }}
          >
            ⚡
          </button>
        )}
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

      {opsOpen && characterId && (
        <FrequencyOpsPanel
          characterId={characterId}
          currentLevel={attribute.level}
          currentPool={attribute.current}
          onClose={() => setOpsOpen(false)}
          onApplied={() => {
            setOpsOpen(false);
            onFrequencyOpApplied?.();
          }}
        />
      )}
    </div>
  );
}
