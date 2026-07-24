'use client';

import React from 'react';
import { ANGLE_KEYS, ANGLE_LABELS, WizardState } from '../types';
import { Action } from '../state';
import { useTuning } from '../useTuning';
import { useGeneration } from '../useGeneration';
import { MiniFrame, MiniFramePlaceholder, WizardButton } from '../ui-bits';

// Extracted verbatim from IdentityLockWizard.tsx (Stage B mechanical refactor).
// No behavior changes. JSX body is byte-identical to the pre-move code.
export function PersonaLockStep({ state, dispatch, tuning, gen }: {
  state: WizardState;
  dispatch: React.Dispatch<Action>;
  tuning: ReturnType<typeof useTuning>;
  gen: ReturnType<typeof useGeneration>;
}) {
  void tuning; // accepted for call-site uniformity; unused in this step
  const { generateFinalAndLock } = gen;
  return (
        <div>
          <div className="text-xs mb-1" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            {state.step === 'persona_lock' ? 'Final Step — Lock Identity' : 'Generating Official Portraits...'}
          </div>
          <div className="text-xs mb-3" style={{ color: '#666', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            {state.step === 'persona_lock'
              ? 'This locks your character\'s face permanently. All future portraits will use this identity.'
              : 'Creating your canonical bust and full body portraits.'}
          </div>

          {/* Reference summary */}
          <div className="flex gap-2 flex-wrap justify-center mb-4">
            {state.lockedFace && (
              <MiniFrame label="Front" imagePath={state.lockedFace} borderColor="#D0A030" />
            )}
            {ANGLE_KEYS.map(k => state.angles[k].imagePath && (
              <MiniFrame key={k} label={ANGLE_LABELS[k]} imagePath={state.angles[k].imagePath!}
                borderColor={state.angles[k].grade === 'almost_perfect' ? '#D0A030' : 'var(--terminal-prime)'} />
            ))}
            {state.bodyImage && (
              <MiniFrame label="Body" imagePath={state.bodyImage} borderColor="#8e7cc3" />
            )}

            {/* Final portraits (show as they generate) */}
            {state.step === 'generating_final' && (
              <>
                {state.finalBust ? (
                  <MiniFrame label="Official Bust" imagePath={state.finalBust} borderColor="var(--terminal-prime)" />
                ) : (
                  <MiniFramePlaceholder label="Official Bust" startTime={state.generationStartTime} />
                )}
                {state.finalFullBody ? (
                  <MiniFrame label="Official Body" imagePath={state.finalFullBody} borderColor="var(--terminal-prime)" />
                ) : (
                  <MiniFramePlaceholder label="Official Body" startTime={state.finalBust ? state.generationStartTime : null} />
                )}
              </>
            )}
          </div>

          {state.step === 'persona_lock' && (
            <div className="flex gap-2 justify-center">
              <WizardButton onClick={generateFinalAndLock} color="#D0A030" textColor="#000" label="Lock Identity & Generate Portraits" />
              <WizardButton onClick={() => dispatch({ type: 'BACK_TO_FRONT' })} color="#333" label="Back" />
            </div>
          )}
        </div>
  );
}
