'use client';

import React, { useState } from 'react';
import { WizardState, COMPOSITION_OPTIONS, TEST_PRESETS } from './types';
import { Action } from './state';
import { WizardButton, MiniFrame, ElapsedTimer } from './ui-bits';

// ============================================================
// Identity Test Step (separated for state isolation)
// ============================================================

export function IdentityTestStep({ state, dispatch, onGenerateTest }: {
  state: WizardState;
  dispatch: React.Dispatch<Action>;
  onGenerateTest: (steeringWords: string, composition: string) => Promise<void>;
}) {
  const [steeringWords, setSteeringWords] = useState('');
  const [composition, setComposition] = useState('bust');

  return (
    <div>
      <div className="text-xs mb-1" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
        Step 4 — Test Your Identity
      </div>
      <div className="text-xs mb-3" style={{ color: '#666', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
        Try different outfits, poses, and expressions. Every image should look like the SAME person.
        This proves your identity lock works for dynamic portrait updates.
      </div>

      {/* Test controls */}
      <div className="flex gap-2 mb-3 items-end">
        <div className="flex-1">
          <label className="text-xs uppercase block mb-1" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            Description
          </label>
          <input
            type="text"
            value={steeringWords}
            onChange={e => setSteeringWords(e.target.value)}
            placeholder="plate armor, battle stance, angry expression..."
            disabled={state.testGenerating}
            className="w-full text-xs p-2"
            style={{ backgroundColor: '#1a1a2e', color: '#ccc', border: '1px solid var(--pillar-spirit)', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
          />
        </div>
        <div>
          <label className="text-xs uppercase block mb-1" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            Composition
          </label>
          <select
            value={composition}
            onChange={e => setComposition(e.target.value)}
            disabled={state.testGenerating}
            className="text-xs p-2"
            style={{ backgroundColor: '#1a1a2e', color: '#ccc', border: '1px solid var(--pillar-spirit)', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
          >
            {COMPOSITION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <WizardButton
          onClick={() => onGenerateTest(steeringWords, composition)}
          color={state.testGenerating ? '#333' : 'var(--pillar-spirit)'}
          label={state.testGenerating ? 'Generating...' : 'Generate Test'}
        />
      </div>

      {/* Preset quick-fill buttons */}
      <div className="flex gap-1 flex-wrap mb-4">
        {TEST_PRESETS.map(preset => (
          <button key={preset} onClick={() => setSteeringWords(preset)}
            className="px-2 py-1 text-xs transition-colors"
            style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              backgroundColor: '#1a1a2e', color: '#888',
              border: '1px solid #582a7240', borderRadius: '2px',
            }}>
            {preset}
          </button>
        ))}
      </div>

      {/* Test gallery */}
      {state.testImages.length > 0 && (
        <div className="mb-4">
          <div className="text-xs uppercase mb-2" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            Test Results ({state.testImages.length})
          </div>
          <div className="flex gap-2 flex-wrap">
            {/* Locked face for comparison */}
            {state.lockedFace && <MiniFrame label="Identity" imagePath={state.lockedFace} borderColor="#D0A030" />}
            {state.testImages.map((t, i) => (
              <div key={i} className="flex flex-col items-center">
                <div className="border overflow-hidden" style={{ borderColor: 'var(--pillar-spirit)', width: '100px', aspectRatio: '3/4', backgroundColor: '#111' }}>
                  <img src={t.imagePath} alt={`Test ${i + 1}`} className="w-full h-full object-cover" />
                </div>
                <div className="text-center mt-1 max-w-[100px]">
                  <div className="text-xs truncate" title={t.steeringWords} style={{ color: '#666', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                    {t.steeringWords || t.composition}
                  </div>
                </div>
              </div>
            ))}
            {state.testGenerating && (
              <div className="flex flex-col items-center">
                <div className="relative border overflow-hidden" style={{ borderColor: '#2a2a3e', width: '100px', aspectRatio: '3/4', backgroundColor: '#111' }}>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="animate-pulse text-xs" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>...</div>
                    <ElapsedTimer startTime={state.generationStartTime} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-center">
        <WizardButton onClick={() => dispatch({ type: 'ADVANCE_TO_LOCK' })} color="#D0A030" textColor="#000"
          label={state.testImages.length > 0 ? 'Looks Consistent — Lock It' : 'Skip Tests — Lock Identity'} />
        <WizardButton onClick={() => dispatch({ type: 'BACK_TO_FRONT' })} color="#333" label="Back" />
      </div>
    </div>
  );
}
