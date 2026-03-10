/**
 * Dice Result Bar — Displays the roll breakdown after dice settle.
 *
 * Shows: SD d8[6] | FD d6[4] | +3 effort (Flow) | = 13 vs DR 12 | SUCCESS margin +1
 * Styled with Terminal aesthetic (Consolas, teal/gold accents).
 */

'use client';

import type { RollResult } from '@/types/dice';

interface DiceResultBarProps {
  result: RollResult;
  visible: boolean;
}

export function DiceResultBar({ result, visible }: DiceResultBarProps) {
  if (!visible) return null;

  const { rolls, total, dr, success, margin, request } = result;
  const isCheck = dr !== undefined;
  const source = request.source;

  // Build context label
  let contextLabel = '';
  if (source.type === 'skill_check') {
    contextLabel = `${source.skillName} (Lv.${source.skillLevel})`;
  } else if (source.type === 'unskilled_check') {
    contextLabel = 'Unskilled Check';
  } else if (source.type === 'death_save') {
    contextLabel = 'Death Save';
  } else if (source.type === 'fear_check') {
    contextLabel = `Fear: ${source.fearName}`;
  } else if (source.type === 'quick_roll') {
    contextLabel = source.context;
  } else if (source.type === 'contested') {
    contextLabel = 'Contested Roll';
  } else {
    contextLabel = 'Roll';
  }

  return (
    <div
      className="absolute bottom-0 left-0 right-0 flex items-center justify-center p-3"
      style={{
        background: 'linear-gradient(to top, rgba(10,15,20,0.95), rgba(10,15,20,0.7), transparent)',
        fontFamily: 'Consolas, monospace',
        animation: visible ? 'slideUp 0.3s ease-out' : undefined,
      }}
    >
      <div className="flex items-center gap-3 text-sm flex-wrap justify-center">
        {/* Context label */}
        <span className="text-[#CBD9E8] font-bold uppercase tracking-wider text-xs">
          {contextLabel}
        </span>

        <span className="text-[#1a2a30]">│</span>

        {/* Individual dice */}
        {rolls.map((roll, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-[#6a7a88] text-xs">{roll.label}</span>
            {roll.die === 'flat' ? (
              <span className="text-[#D0A030] font-bold">+{roll.value}</span>
            ) : (
              <span>
                <span className="text-[#6a7a88]">{roll.die}</span>
                <span className="text-[#E8E4DC] font-bold">[{roll.value}]</span>
              </span>
            )}
            {i < rolls.length - 1 && <span className="text-[#1a2a30] ml-1">+</span>}
          </span>
        ))}

        {/* Effort */}
        {request.effort !== undefined && request.effort > 0 && (
          <>
            <span className="text-[#1a2a30]">+</span>
            <span>
              <span className="text-[#D0A030] font-bold">{request.effort}</span>
              <span className="text-[#6a7a88] text-xs ml-1">
                effort{request.effortAttribute ? ` (${request.effortAttribute})` : ''}
              </span>
            </span>
          </>
        )}

        {/* Flat modifiers */}
        {request.flatModifiers !== undefined && request.flatModifiers !== 0 && (
          <>
            <span className="text-[#1a2a30]">{request.flatModifiers > 0 ? '+' : ''}</span>
            <span className="text-[#7050A8] font-bold">{request.flatModifiers}</span>
            <span className="text-[#6a7a88] text-xs">mod</span>
          </>
        )}

        <span className="text-[#1a2a30]">│</span>

        {/* Total */}
        <span className="text-[#E8E4DC] font-bold text-lg">= {total}</span>

        {/* vs DR */}
        {isCheck && (
          <>
            <span className="text-[#6a7a88]">vs DR</span>
            <span className="text-[#CBD9E8] font-bold">{dr}</span>
            <span className="text-[#1a2a30]">│</span>

            {/* Success/Failure */}
            <span
              className="font-bold uppercase tracking-wider px-2 py-0.5 rounded text-sm"
              style={{
                color: success ? '#2DB8A0' : '#E8585A',
                backgroundColor: success ? 'rgba(45,184,160,0.15)' : 'rgba(232,88,90,0.15)',
                border: `1px solid ${success ? 'rgba(45,184,160,0.3)' : 'rgba(232,88,90,0.3)'}`,
              }}
            >
              {source.type === 'death_save'
                ? (success ? 'SURVIVED' : 'FALLEN')
                : (success ? 'SUCCESS' : 'FAILURE')
              }
            </span>

            {margin !== undefined && (
              <span className="text-[#6a7a88] text-xs">
                margin {margin >= 0 ? '+' : ''}{margin}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
