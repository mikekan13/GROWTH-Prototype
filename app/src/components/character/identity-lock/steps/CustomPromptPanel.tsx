'use client';

import React from 'react';
import { WizardState } from '../types';
import { Action } from '../state';
import { useTuning } from '../useTuning';
import { useGeneration } from '../useGeneration';

// Extracted verbatim from IdentityLockWizard.tsx (Stage B mechanical refactor).
// No behavior changes. JSX body is byte-identical to the pre-move code.
export function CustomPromptPanel({ state, dispatch, tuning, gen, allRefs, referencePhotos }: {
  state: WizardState;
  dispatch: React.Dispatch<Action>;
  tuning: ReturnType<typeof useTuning>;
  gen: ReturnType<typeof useGeneration>;
  allRefs: string[];
  referencePhotos: string[];
}) {
  void dispatch; void gen; // accepted for call-site uniformity; unused in this panel
  const {
    faceCustomPrompt, setFaceCustomPrompt,
    customPrompt, setCustomPrompt,
    faceCustomPass2Prompt, setFaceCustomPass2Prompt,
    pass1RefSpec, pass2RefSpec,
    bodyPoseRef, runPass2,
    additionalRefs, additionalRefUploading, additionalRefInputRef,
    handleAdditionalRefPick, removeAdditionalRef,
  } = tuning;
        const isFaceStep = state.step === 'front_discovery' || state.step === 'angle_generation' || state.step === 'angle_grading';
        const activePrompt = isFaceStep ? faceCustomPrompt : customPrompt;
        const setActivePrompt = isFaceStep ? setFaceCustomPrompt : setCustomPrompt;
        const panelColor = isFaceStep ? '#582a72' : '#D0A030';

        // Reference chain = exactly what local.ts sends to ComfyUI:
        // deduped referencePhotos → then pose ref (wireframe for face, bodyPoseRef for body).
        const seenRefs = new Set<string>();
        const idRefs = allRefs.filter(r => {
          if (!r || seenRefs.has(r)) return false;
          seenRefs.add(r);
          return true;
        });
        // Resolve the per-pass ref spec ("all" or "1,3,4") against idRefs. Mirrors
        // resolveRefSpec in the generate callback (1-based indexing).
        const specToRefs = (spec: string): { path: string; origIndex: number }[] => {
          const trimmed = (spec || '').trim().toLowerCase();
          if (!trimmed || trimmed === 'all') return idRefs.map((path, i) => ({ path, origIndex: i + 1 }));
          const idxs = trimmed.split(',')
            .map(s => parseInt(s.trim(), 10))
            .filter(n => Number.isInteger(n) && n >= 1 && n <= idRefs.length);
          return idxs.map(n => ({ path: idRefs[n - 1], origIndex: n })).filter(e => !!e.path);
        };
        const pass1Resolved = specToRefs(pass1RefSpec);
        const pass2Resolved = specToRefs(pass2RefSpec);

        const angleKey = state.currentAngleGenerating || 'front';
        // OpenPose keypoint refs — identity-free, trained format.
        const angleRefMap: Record<string, string> = {
          front: '/portraits/pose-refs/openpose/front-face.png',
          profile_left: '/portraits/pose-refs/openpose/profile_left.png',
          profile_right: '/portraits/pose-refs/openpose/profile_right.png',
          three_quarter_left: '/portraits/pose-refs/openpose/three_quarter_left.png',
          three_quarter_right: '/portraits/pose-refs/openpose/three_quarter_right.png',
        };
        const poseRef = !isFaceStep && bodyPoseRef ? { path: bodyPoseRef, label: 'body pose' } : null;
        void angleKey; void angleRefMap; // kept for future pose-template use on body step

        // Pass 1 chain (what generateFaceFlux2 populates into LOAD_REF slots).
        // Order mirrors the provider: identity refs first (Image 1..n), then pose (n+1), then style (n+2).
        const pass1Chain: { slot: number; path: string; label: string }[] = pass1Resolved.map((r, i) => ({
          slot: i + 1,
          path: r.path,
          label: i === 0 ? `primary id (orig #${r.origIndex})` : `id ref ${i + 1} (orig #${r.origIndex})`,
        }));
        if (!isFaceStep && poseRef) {
          pass1Chain.push({ slot: pass1Chain.length + 1, path: poseRef.path, label: poseRef.label });
        }

        // Pass 2 chain: Pass 1 output is always slot 1; pass2Resolved fills slots 2..N.
        const pass2Chain: { slot: number; path: string | null; label: string }[] = [
          { slot: 1, path: null /* Pass 1 output — generated at runtime */, label: 'Pass 1 output' },
          ...pass2Resolved.map((r, i) => ({
            slot: i + 2,
            path: r.path,
            label: `id/style ref ${i + 1} (orig #${r.origIndex})`,
          })),
        ];

        // Kept for external references to `chain` symbol below (render block).
        const chain = pass1Chain;

        return (
      <div className="flex-shrink-0 p-2" style={{ width: '320px', backgroundColor: '#0a0a18', border: `1px solid ${panelColor}44`, borderRadius: 4 }}>
        <div className="text-xs uppercase tracking-wider mb-1" style={{ color: panelColor, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
          {isFaceStep ? 'Face — Pass 1 Prompt (identity gen)' : 'Body Prompt'}
        </div>
        <textarea
          value={activePrompt}
          onChange={e => setActivePrompt(e.target.value)}
          placeholder="Pass 1 custom prompt. Use {id} and {pose} for slot numbers. Blank = default."
          rows={6}
          className="w-full p-1 text-xs"
          style={{ backgroundColor: '#111', color: '#ccc', border: '1px solid #333', borderRadius: 3, fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px', resize: 'vertical' }}
        />
        {isFaceStep && (
          <>
            <div className="text-xs uppercase tracking-wider mt-3 mb-1" style={{ color: panelColor, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              Face — Pass 2 Prompt (cleanup + style)
            </div>
            <textarea
              value={faceCustomPass2Prompt}
              onChange={e => setFaceCustomPass2Prompt(e.target.value)}
              placeholder="Pass 2 edit prompt (nude + style transform). Blank = default."
              rows={6}
              className="w-full p-1 text-xs"
              style={{ backgroundColor: '#111', color: '#ccc', border: '1px solid #333', borderRadius: 3, fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px', resize: 'vertical' }}
            />
          </>
        )}
        {pass1Chain.length > 0 && (
          <div className="mt-3">
            <div className="text-xs uppercase tracking-wider mb-2" style={{ color: panelColor, fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '9px' }}>
              Pass 1 Slots
            </div>
            <div className="flex flex-wrap gap-1">
              {pass1Chain.map(({ slot, path, label }) => (
                <div key={`p1-${slot}-${path}`} className="flex flex-col items-center" style={{ width: 56 }} title={label}>
                  <div style={{ position: 'relative', width: 56, height: 56, border: `1px solid ${panelColor}66`, borderRadius: 3, overflow: 'hidden', backgroundColor: '#000' }}>
                    <img src={path} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', top: 0, left: 0, backgroundColor: panelColor, color: '#000', fontSize: '9px', fontWeight: 'bold', padding: '0 3px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                      {slot}
                    </div>
                  </div>
                  <div style={{ color: '#888', fontSize: '8px', fontFamily: 'var(--font-terminal), Consolas, monospace', marginTop: 2, textAlign: 'center', lineHeight: 1.1 }}>
                    image {slot}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {isFaceStep && runPass2 && pass2Chain.length > 0 && (
          <div className="mt-3">
            <div className="text-xs uppercase tracking-wider mb-2" style={{ color: '#4ec9b0', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '9px' }}>
              Pass 2 Slots
            </div>
            <div className="flex flex-wrap gap-1">
              {pass2Chain.map(({ slot, path, label }) => (
                <div key={`p2-${slot}-${path ?? 'pass1'}`} className="flex flex-col items-center" style={{ width: 56 }} title={label}>
                  <div style={{ position: 'relative', width: 56, height: 56, border: '1px solid #4ec9b066', borderRadius: 3, overflow: 'hidden', backgroundColor: '#000' }}>
                    {path ? (
                      <img src={path} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ec9b0', fontSize: '8px', textAlign: 'center', padding: 2, fontFamily: 'var(--font-terminal), Consolas, monospace', lineHeight: 1.15 }}>
                        Pass 1<br/>output
                      </div>
                    )}
                    <div style={{ position: 'absolute', top: 0, left: 0, backgroundColor: '#4ec9b0', color: '#000', fontSize: '9px', fontWeight: 'bold', padding: '0 3px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                      {slot}
                    </div>
                  </div>
                  <div style={{ color: '#888', fontSize: '8px', fontFamily: 'var(--font-terminal), Consolas, monospace', marginTop: 2, textAlign: 'center', lineHeight: 1.1 }}>
                    image {slot}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {isFaceStep && (
          <div className="mt-3" style={{ borderTop: '1px dashed #333', paddingTop: 8 }}>
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs uppercase tracking-wider" style={{ color: '#888', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '9px' }}>
                Additional Refs ({additionalRefs.length})
              </div>
              <label style={{ display: 'inline-block', padding: '2px 6px', border: `1px solid ${panelColor}`, borderRadius: 2, fontSize: '9px', cursor: additionalRefUploading ? 'wait' : 'pointer', color: panelColor, fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                {additionalRefUploading ? '...' : '+ Upload'}
                <input
                  ref={additionalRefInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleAdditionalRefPick}
                  disabled={additionalRefUploading}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
            {additionalRefs.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {additionalRefs.map((path, i) => {
                  const globalIdx = referencePhotos.length + i + 1; // 1-based index into allRefs
                  return (
                    <div key={`add-${i}`} style={{ position: 'relative', width: 44, height: 44 }}>
                      <img src={path} alt={`extra ref ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', border: `1px solid ${panelColor}66`, borderRadius: 2 }} />
                      <div style={{ position: 'absolute', top: 0, left: 0, backgroundColor: '#888', color: '#000', fontSize: '8px', fontWeight: 'bold', padding: '0 2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                        #{globalIdx}
                      </div>
                      <button
                        onClick={() => removeAdditionalRef(i)}
                        title="Remove this ref"
                        style={{ position: 'absolute', top: 0, right: 0, background: '#E8585A', color: '#fff', border: 'none', width: 14, height: 14, fontSize: '10px', lineHeight: '12px', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                      >×</button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: '#555', fontSize: '9px', fontFamily: 'var(--font-terminal), Consolas, monospace', fontStyle: 'italic' }}>
                Upload extras to reference by index in P1/P2 specs.
              </div>
            )}
          </div>
        )}
      </div>
        );
}
