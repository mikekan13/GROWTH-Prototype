'use client';

import React from 'react';
import { ANGLE_KEYS, ANGLE_LABELS, WizardState } from '../types';
import { Action } from '../state';
import { useTuning } from '../useTuning';
import { useGeneration } from '../useGeneration';
import { WizardButton, ElapsedTimer } from '../ui-bits';

// Extracted verbatim from IdentityLockWizard.tsx (Stage B mechanical refactor).
// No behavior changes. JSX body is byte-identical to the pre-move code.
export function BodyDiscoveryStep({ state, dispatch, tuning, gen, bodyCandidates, bodyDisplayIndex, bodyDisplayImage, characterId }: {
  state: WizardState;
  dispatch: React.Dispatch<Action>;
  tuning: ReturnType<typeof useTuning>;
  gen: ReturnType<typeof useGeneration>;
  bodyCandidates: WizardState['bodyCandidates'];
  bodyDisplayIndex: number;
  bodyDisplayImage: string | null;
  characterId?: string;
}) {
  const {
    keepBodySeed, setKeepBodySeed,
    bodyDraftMode, setBodyDraftMode,
    bodyIdLockP2, setBodyIdLockP2,
    bodyRandomPose, setBodyRandomPose,
    fillModel, setFillModel,
    bodySeedManual, setBodySeedManual,
    bodySeed2Manual, setBodySeed2Manual,
    bodyDenoise, setBodyDenoise,
    bodyPoseRef, setBodyPoseRef, bodyPoseInputRef,
    setBodyViewIndex,
  } = tuning;
  const { generateBody } = gen;
  return (
        <div>
          <div className="text-xs mb-1" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            Step 3 — Body
          </div>
          <div className="text-xs mb-3" style={{ color: '#666', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            Full body with your locked identity. Verify proportions, skin tone, and distinguishing marks.
          </div>

          <div className="flex gap-4 justify-center mb-4">
            {/* Identity refs — locked front + all 4 angles. These are what PuLID uses. */}
            <div className="flex flex-col items-center">
              <div className="text-xs uppercase tracking-wider mb-1" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Face
              </div>
              {(() => {
                const angleCount = ANGLE_KEYS.filter(k => state.angles[k].imagePath).length;
                const totalImages = (state.lockedFace ? 1 : 0) + angleCount;
                const cols = totalImages <= 1 ? 1 : 2;
                const width = cols === 1 ? '120px' : '200px';
                return (
              <div className={`border p-1 grid gap-1`} style={{ borderColor: '#D0A030', borderWidth: '2px', width, backgroundColor: '#111', gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                {state.lockedFace && (
                  <div className="border overflow-hidden group relative" style={{ borderColor: '#D0A030', aspectRatio: '3/4', cursor: 'pointer' }}>
                    <img src={state.lockedFace} alt="Locked front" className="w-full h-full object-cover" />
                    <div className="hidden group-hover:flex fixed inset-0 z-50 pointer-events-none items-center justify-center bg-black/70">
                      <img src={state.lockedFace} alt="Locked front" style={{ maxHeight: '80vh', maxWidth: '100%', width: 'auto', height: 'auto' }} />
                    </div>
                  </div>
                )}
                {ANGLE_KEYS.map(k => {
                  const p = state.angles[k].imagePath;
                  if (!p) return null;
                  return (
                    <div key={k} className="border overflow-hidden group relative" style={{ borderColor: 'var(--pillar-spirit)', aspectRatio: '3/4', cursor: 'pointer' }}>
                      <img src={p} alt={ANGLE_LABELS[k]} className="w-full h-full object-cover" />
                      <div className="hidden group-hover:flex fixed inset-0 z-50 pointer-events-none items-center justify-center bg-black/70">
                        <img src={p} alt={ANGLE_LABELS[k]} style={{ maxHeight: '80vh', maxWidth: '100%', width: 'auto', height: 'auto' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
                );
              })()}
            </div>

            {/* Body with prev/next gallery */}
            <div className="flex flex-col items-center">
              <div className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Full Body {bodyCandidates.length > 1 ? `(${bodyDisplayIndex + 1}/${bodyCandidates.length})` : ''}
              </div>
              <div className="flex items-center gap-1">
                {bodyCandidates.length > 1 && (
                  <button onClick={() => setBodyViewIndex(Math.max(0, bodyDisplayIndex - 1))}
                    style={{ color: bodyDisplayIndex > 0 ? '#D0A030' : '#333', fontSize: '18px', cursor: bodyDisplayIndex > 0 ? 'pointer' : 'default' }}>◀</button>
                )}
                <div className="relative border overflow-hidden" style={{ borderColor: bodyDisplayImage ? 'var(--terminal-prime)' : '#2a2a3e', width: '140px', aspectRatio: '1/2', backgroundColor: '#111' }}>
                  {bodyDisplayImage ? (
                    <div className="group relative w-full h-full">
                      <img src={bodyDisplayImage} alt="Full body" className="w-full h-full object-cover" />
                      <div className="hidden group-hover:flex fixed inset-0 z-50 pointer-events-none items-center justify-center bg-black/70 overflow-auto">
                        <img src={bodyDisplayImage} alt="Full body" style={{ height: '100vh', width: 'auto' }} />
                      </div>
                    </div>
                  ) : state.bodyGenerating ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="animate-pulse text-sm" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>Generating...</div>
                      <ElapsedTimer startTime={state.generationStartTime} />
                    </div>
                  ) : null}
                </div>
                {bodyCandidates.length > 1 && (
                  <button onClick={() => setBodyViewIndex(Math.min(bodyCandidates.length - 1, bodyDisplayIndex + 1))}
                    style={{ color: bodyDisplayIndex < bodyCandidates.length - 1 ? '#D0A030' : '#333', fontSize: '18px', cursor: bodyDisplayIndex < bodyCandidates.length - 1 ? 'pointer' : 'default' }}>▶</button>
                )}
              </div>
            </div>
          </div>

          {state.bodyImage && !state.bodyGenerating && (
            <div>
            {/* Body controls — Row 1: checkboxes + fill mode */}
            <div className="flex items-center justify-center gap-4 mb-2 flex-wrap" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px', color: '#888' }}>
              <label className="flex items-center gap-1.5" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={keepBodySeed} onChange={e => setKeepBodySeed(e.target.checked)} />
                Keep body
              </label>
              <label className="flex items-center gap-1.5" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={bodyDraftMode} onChange={e => setBodyDraftMode(e.target.checked)} />
                Draft (fast)
              </label>
              <label className="flex items-center gap-1.5" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={bodyIdLockP2} onChange={e => setBodyIdLockP2(e.target.checked)} />
                ID Lock P2
              </label>
              <label className="flex items-center gap-1.5" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={bodyRandomPose} onChange={e => setBodyRandomPose(e.target.checked)} />
                Random Pose
              </label>
              <div className="flex items-center gap-1">
                Fill:
                <button onClick={() => setFillModel('nsfw')} className="px-1.5 py-0.5"
                  style={{ backgroundColor: fillModel === 'nsfw' ? '#D0A030' : '#222', color: fillModel === 'nsfw' ? '#000' : '#888', border: '1px solid #444', fontSize: '9px' }}>NSFW</button>
                <button onClick={() => setFillModel('standard')} className="px-1.5 py-0.5"
                  style={{ backgroundColor: fillModel === 'standard' ? '#D0A030' : '#222', color: fillModel === 'standard' ? '#000' : '#888', border: '1px solid #444', fontSize: '9px' }}>Standard</button>
              </div>
            </div>
            {/* Body controls — Row 2: seeds + denoise */}
            <div className="flex items-center justify-center gap-4 mb-3 flex-wrap" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px', color: '#888' }}>
              <div className="flex items-center gap-1">
                P1 Seed:
                <input type="text" value={bodySeedManual} onChange={e => setBodySeedManual(e.target.value)} placeholder="random"
                  className="px-1 py-0.5" style={{ width: '90px', backgroundColor: '#111', color: '#ccc', border: '1px solid #333', fontSize: '9px', fontFamily: 'var(--font-terminal), Consolas, monospace' }} />
              </div>
              <div className="flex items-center gap-1">
                P2 Seed:
                <input type="text" value={bodySeed2Manual} onChange={e => setBodySeed2Manual(e.target.value)} placeholder="random"
                  className="px-1 py-0.5" style={{ width: '90px', backgroundColor: '#111', color: '#ccc', border: '1px solid #333', fontSize: '9px', fontFamily: 'var(--font-terminal), Consolas, monospace' }} />
              </div>
              <div className="flex items-center gap-1">
                P2 Denoise:
                <input type="number" min={0.1} max={0.9} step={0.05} value={bodyDenoise}
                  onChange={e => setBodyDenoise(Math.min(0.9, Math.max(0.1, parseFloat(e.target.value) || 0.5)))}
                  className="px-1 py-0.5" style={{ width: '55px', backgroundColor: '#111', color: '#ccc', border: '1px solid #333', fontSize: '9px', fontFamily: 'var(--font-terminal), Consolas, monospace' }} />
              </div>
            </div>
            {/* Body Pose Reference Upload */}
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="text-xs" style={{ color: '#888', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Pose Ref:
              </span>
              {bodyPoseRef ? (
                <div className="flex items-center gap-2">
                  <img src={bodyPoseRef} alt="Pose ref" style={{ width: 40, height: 40, objectFit: 'cover', border: '1px solid #D0A030' }} />
                  <button onClick={() => setBodyPoseRef(null)} className="text-xs" style={{ color: '#E8585A' }}>✕</button>
                </div>
              ) : (
                <button
                  onClick={() => bodyPoseInputRef.current?.click()}
                  className="text-xs px-2 py-1 border"
                  style={{ color: '#D0A030', borderColor: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                >
                  Upload Pose Photo
                </button>
              )}
              <input
                ref={bodyPoseInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append('file', file);
                  formData.append('type', 'pose');
                  try {
                    const res = await fetch(`/api/references?characterId=${characterId || 'pose'}`, {
                      method: 'POST',
                      body: formData,
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setBodyPoseRef(data.path);
                    }
                  } catch { /* ignore */ }
                  e.target.value = '';
                }}
              />
            </div>
            <div className="flex gap-2 justify-center">
              <WizardButton onClick={() => dispatch({ type: 'ADVANCE_TO_FINETUNE' })} color="#D0A030" label="Finetune" />
              <WizardButton onClick={() => dispatch({ type: 'ADVANCE_TO_LOCK' })} color="var(--terminal-prime)" label="Accept — Lock Identity" />
              <WizardButton onClick={() => generateBody()} color="var(--pillar-spirit)" label="Retry Body" />
              <WizardButton onClick={() => dispatch({ type: 'BACK_TO_FRONT' })} color="#333" label="Back to Face" />
            </div>
            </div>
          )}
          {!state.bodyImage && !state.bodyGenerating && (
            <div className="flex gap-2 justify-center">
              <WizardButton onClick={() => generateBody()} color="var(--terminal-prime)" label="Generate Body" />
              <WizardButton onClick={() => dispatch({ type: 'BACK_TO_FRONT' })} color="#333" label="Back to Face" />
            </div>
          )}
        </div>
  );
}
