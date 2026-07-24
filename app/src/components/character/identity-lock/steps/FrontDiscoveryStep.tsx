'use client';

import React from 'react';
import { FrontCandidate, WizardState } from '../types';
import { Action } from '../state';
import { useTuning } from '../useTuning';
import { useGeneration } from '../useGeneration';
import { FaceCropImage, ElapsedTimer } from '../ui-bits';

// Extracted verbatim from IdentityLockWizard.tsx (Stage B mechanical refactor).
// No behavior changes. JSX body is byte-identical to the pre-move code.
export function FrontDiscoveryStep({ state, dispatch, tuning, gen, displayIndex, displayCandidate, abortRef, referencePhotos }: {
  state: WizardState;
  dispatch: React.Dispatch<Action>;
  tuning: ReturnType<typeof useTuning>;
  gen: ReturnType<typeof useGeneration>;
  displayIndex: number;
  displayCandidate: FrontCandidate | null;
  abortRef: React.MutableRefObject<boolean>;
  referencePhotos: string[];
}) {
  void dispatch; // accepted for call-site uniformity; unused in this step
  const {
    setViewingIndex,
    batchCount, setBatchCount,
    useDetailedPrompt, setUseDetailedPrompt,
    manualSeed, setManualSeed,
    runPass2, setRunPass2,
    useTurbo, setUseTurbo,
    useTurboPass2, setUseTurboPass2,
    pass1Guidance, setPass1Guidance,
    pass2Guidance, setPass2Guidance,
    pass1RefSpec, setPass1RefSpec,
    pass2RefSpec, setPass2RefSpec,
    additionalRefs,
  } = tuning;
  const { generateFrontFace, handleFrontPerfect } = gen;
        return (
        <div>
          <div className="text-xs mb-1" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            Step 1 — Face
          </div>
          <div className="text-xs mb-3" style={{ color: '#666', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            Generate faces and pick one to lock as your character.
          </div>

          <div className="flex gap-4 justify-center mb-4">
            {/* Previous attempts (small, scrollable) */}
            {state.frontCandidates.length > 1 && (
              <div className="flex flex-col items-center">
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: '#444', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '8px' }}>
                  Attempts ({state.frontCandidates.length})
                </div>
                <div className="overflow-y-auto flex flex-col gap-1 pr-1" style={{ maxHeight: '220px', width: '56px' }}>
                  {state.frontCandidates.map((c, i) => (
                    <div key={i} onClick={() => setViewingIndex(i)} className="flex-shrink-0 border overflow-hidden cursor-pointer transition-all"
                      style={{
                        borderColor: i === displayIndex ? '#D0A030' : '#2a2a3e',
                        borderWidth: i === displayIndex ? '2px' : '1px',
                        width: '48px', height: '48px', backgroundColor: '#111',
                      }}>
                      <img src={c.imagePath} alt={`Attempt ${i + 1}`}
                        className="w-full h-full object-cover"
                        style={{ opacity: i === displayIndex ? 1 : 0.5 }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Current face (large) */}
            <div className="flex flex-col items-center">
              <div className="text-xs uppercase tracking-wider mb-1" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                {state.frontGenerating ? 'Generating...' : `Face ${displayIndex + 1} of ${state.frontCandidates.length}`}
              </div>
              <div className="relative border overflow-hidden" style={{
                borderColor: state.frontGenerating ? '#2a2a3e' : '#D0A030',
                borderWidth: '2px',
                backgroundColor: '#111',
                width: '220px',
                aspectRatio: '1/1',
              }}>
                {!state.frontGenerating && displayCandidate ? (
                  <FaceCropImage
                    src={displayCandidate.imagePath}
                    alt="Current face"
                    faceCrop
                  />
                ) : state.frontGenerating ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="animate-pulse text-sm" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                      Generating...
                    </div>
                    <ElapsedTimer startTime={state.generationStartTime} />
                    {batchCount > 1 && (
                      <button onClick={() => { abortRef.current = true; }}
                        className="mt-2 px-2 py-1 text-xs uppercase"
                        style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: '#E8585A', border: '1px solid #E8585A', borderRadius: '2px', backgroundColor: 'transparent' }}>
                        Stop
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-xs" style={{ color: '#444', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>Waiting...</div>
                  </div>
                )}
              </div>
              {!state.frontGenerating && displayCandidate && (
                <div className="text-xs mt-1" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                  Seed: {displayCandidate.seed}
                </div>
              )}
            </div>
          </div>

          {/* Face controls */}
          <div className="flex items-center justify-center gap-4 mb-2">
            <label className="flex items-center gap-1.5" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px', color: '#888', cursor: 'pointer' }}>
              <input type="checkbox" checked={useDetailedPrompt} onChange={e => setUseDetailedPrompt(e.target.checked)} />
              Description Prompt
            </label>
            <div className="flex items-center gap-1">
              <span className="text-xs" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '9px' }}>Seed:</span>
              <input type="text" value={manualSeed} onChange={e => setManualSeed(e.target.value)} placeholder="random"
                className="px-1 py-0.5 text-xs" style={{ width: '70px', backgroundColor: '#111', color: '#ccc', border: '1px solid #333', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '9px' }} />
            </div>
          </div>

          {/* Face-gen levers (pass control + guidance + ref assignment) */}
          <div className="mb-2 p-2" style={{ border: '1px solid #2a2a3e', backgroundColor: '#0a0a14', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            <div className="text-xs uppercase tracking-wider mb-1.5" style={{ color: '#8e7cc3', fontSize: '9px' }}>Levers</div>

            {/* Row 1: toggles */}
            <div className="flex items-center justify-center gap-4 mb-1.5">
              <label className="flex items-center gap-1.5" style={{ fontSize: '10px', color: '#888', cursor: 'pointer' }}>
                <input type="checkbox" checked={runPass2} onChange={e => setRunPass2(e.target.checked)} />
                Run Pass 2
              </label>
              <label className="flex items-center gap-1.5" style={{ fontSize: '10px', color: '#888', cursor: 'pointer' }}>
                <input type="checkbox" checked={useTurbo} onChange={e => setUseTurbo(e.target.checked)} />
                Turbo P1
              </label>
              <label className="flex items-center gap-1.5" style={{ fontSize: '10px', color: '#888', cursor: 'pointer' }}>
                <input type="checkbox" checked={useTurboPass2} onChange={e => setUseTurboPass2(e.target.checked)} />
                Turbo P2
              </label>
            </div>

            {/* Row 2: guidance */}
            <div className="flex items-center justify-center gap-3 mb-1.5">
              <div className="flex items-center gap-1">
                <span style={{ color: '#555', fontSize: '9px' }}>P1 Guidance:</span>
                <input type="number" step={0.1} min={1.0} max={10.0} value={pass1Guidance}
                  onChange={e => setPass1Guidance(Math.max(1.0, Math.min(10.0, Number(e.target.value) || 4.0)))}
                  className="px-1 py-0.5" style={{ width: '60px', backgroundColor: '#111', color: '#ccc', border: '1px solid #333', fontSize: '9px' }} />
              </div>
              <div className="flex items-center gap-1">
                <span style={{ color: '#555', fontSize: '9px' }}>P2 Guidance:</span>
                <input type="number" step={0.1} min={1.0} max={10.0} value={pass2Guidance}
                  onChange={e => setPass2Guidance(Math.max(1.0, Math.min(10.0, Number(e.target.value) || 4.0)))}
                  className="px-1 py-0.5" style={{ width: '60px', backgroundColor: '#111', color: '#ccc', border: '1px solid #333', fontSize: '9px' }} />
              </div>
            </div>

            {/* Row 3: ref assignment — 1-based indexes into referencePhotos */}
            <div className="flex items-center justify-center gap-3">
              <div className="flex items-center gap-1">
                <span style={{ color: '#555', fontSize: '9px' }}>P1 refs:</span>
                <input type="text" value={pass1RefSpec} onChange={e => setPass1RefSpec(e.target.value)} placeholder="all"
                  className="px-1 py-0.5" style={{ width: '90px', backgroundColor: '#111', color: '#ccc', border: '1px solid #333', fontSize: '9px' }} />
              </div>
              <div className="flex items-center gap-1">
                <span style={{ color: '#555', fontSize: '9px' }}>P2 refs:</span>
                <input type="text" value={pass2RefSpec} onChange={e => setPass2RefSpec(e.target.value)} placeholder="all"
                  className="px-1 py-0.5" style={{ width: '90px', backgroundColor: '#111', color: '#ccc', border: '1px solid #333', fontSize: '9px' }} />
              </div>
              <span style={{ color: '#444', fontSize: '9px' }}>({referencePhotos.length + additionalRefs.length} uploaded)</span>
            </div>
          </div>

          {!state.frontGenerating && (
            <div className="space-y-2">
              {displayCandidate ? (
                <>
                  <div className="text-xs text-center mb-2" style={{ color: '#888', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                    Lock this face and move to body generation?
                  </div>
                  <div className="flex gap-3 justify-center items-center">
                    <button onClick={() => generateFrontFace()}
                      className="px-5 py-2.5 text-xs uppercase tracking-wider transition-colors"
                      style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', backgroundColor: '#1a1a2e', color: '#E8585A', border: '1px solid #E8585A60', borderRadius: '2px' }}>
                      Try Again
                    </button>
                    <span className="text-xs" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>×</span>
                    <input type="number" min={1} max={20} value={batchCount}
                      onChange={e => setBatchCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                      className="w-12 text-center text-xs py-1 px-1"
                      style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', backgroundColor: '#1a1a2e', color: '#fff', border: '1px solid var(--pillar-spirit)', borderRadius: '2px' }}
                    />
                    <button onClick={handleFrontPerfect}
                      className="px-5 py-2.5 text-xs uppercase tracking-wider transition-colors font-bold"
                      style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', backgroundColor: '#D0A030', color: '#000', border: '1px solid #D0A030', borderRadius: '2px' }}>
                      Lock Face → Body
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex justify-center items-center gap-2">
                  <button onClick={() => generateFrontFace()}
                    className="px-4 py-2 text-xs uppercase tracking-wider transition-colors"
                    style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', backgroundColor: 'var(--pillar-spirit)', color: '#fff', border: '1px solid var(--pillar-spirit)', borderRadius: '2px' }}>
                    Generate Face
                  </button>
                  <span className="text-xs" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>×</span>
                  <input type="number" min={1} max={20} value={batchCount}
                    onChange={e => setBatchCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                    className="w-12 text-center text-xs py-1 px-1"
                    style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', backgroundColor: '#1a1a2e', color: '#fff', border: '1px solid var(--pillar-spirit)', borderRadius: '2px' }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        );
}
