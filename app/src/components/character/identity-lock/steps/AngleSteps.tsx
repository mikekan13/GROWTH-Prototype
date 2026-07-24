'use client';

import React from 'react';
import { AngleKey, ANGLE_KEYS, ANGLE_LABELS, WizardState } from '../types';
import { Action } from '../state';
import { useTuning } from '../useTuning';
import { useGeneration } from '../useGeneration';
import { GradeButton, WizardButton, FaceCropImage, ElapsedTimer } from '../ui-bits';

// Extracted verbatim from IdentityLockWizard.tsx (Stage B mechanical refactor).
// No behavior changes. JSX body is byte-identical to the pre-move code.
// NOTE: the call site in IdentityLockWizard.tsx gates this behind `false &&` —
// the block was ALREADY disabled before extraction and the gate is preserved as-is.
export function AngleSteps({ state, dispatch, tuning, gen, characterData, pickingFor, setPickingFor, availableAngleFiles, allGraded, hasBadAngles, hasAnyGood }: {
  state: WizardState;
  dispatch: React.Dispatch<Action>;
  tuning: ReturnType<typeof useTuning>;
  gen: ReturnType<typeof useGeneration>;
  characterData: Record<string, unknown>;
  pickingFor: AngleKey | null;
  setPickingFor: React.Dispatch<React.SetStateAction<AngleKey | null>>;
  availableAngleFiles: string[];
  allGraded: boolean;
  hasBadAngles: boolean;
  hasAnyGood: boolean;
}) {
  void tuning; // accepted for call-site uniformity; unused in this step
  const { generateBody } = gen;
  return (
        <div>
          <div className="text-xs mb-1" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            Step 2 — Angle Verification
          </div>
          <div className="text-xs mb-3" style={{ color: '#666', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            {state.step === 'angle_generation'
              ? 'Generating your face from multiple angles using identity lock. Each takes ~2 minutes.'
              : 'Rate each angle. Does this look like the SAME person as your locked face?'}
          </div>

          {/* Load existing angles from disk — lets user skip regeneration after a refresh */}
          <div className="flex justify-center mb-3">
            <button
              onClick={async () => {
                const charId = (characterData as Record<string, unknown>).characterId as string || 'creation-preview';
                const res = await fetch(`/api/portraits/existing?characterId=${charId}`);
                if (!res.ok) return;
                const data = await res.json();
                const angleEntries = (data.candidates || []).filter((c: { tier?: string; angleKey?: string }) => c.tier === 'angle' && c.angleKey);
                // Keep only the latest webp per angleKey (API returns newest-first).
                const seen = new Set<string>();
                for (const c of angleEntries as Array<{ imagePath: string; angleKey: string }>) {
                  if (seen.has(c.angleKey)) continue;
                  seen.add(c.angleKey);
                  if (ANGLE_KEYS.includes(c.angleKey as AngleKey)) {
                    dispatch({ type: 'ANGLE_COMPLETE', angle: c.angleKey as AngleKey, imagePath: c.imagePath, seed: 0 });
                  }
                }
                dispatch({ type: 'ALL_ANGLES_DONE' });
              }}
              className="px-3 py-1 text-xs uppercase tracking-wider transition-colors"
              style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', backgroundColor: '#1a1a2e', color: '#D0A030', border: '1px solid #D0A03060', borderRadius: '2px' }}>
              Load Existing Angles
            </button>
          </div>

          {/* Locked face reference + 4 angles */}
          <div className="flex gap-2 flex-wrap justify-center mb-4">
            {/* Locked front face — reference */}
            <div className="flex flex-col items-center">
              <div className="text-xs uppercase tracking-wider mb-1" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Front (Locked)
              </div>
              <div className="border overflow-hidden" style={{ borderColor: '#D0A030', borderWidth: '2px', backgroundColor: '#111', width: '130px', aspectRatio: '3/4' }}>
                {state.lockedFace && <FaceCropImage src={state.lockedFace!} alt="Locked face" faceCrop />}
              </div>
            </div>

            {/* Angle results */}
            {ANGLE_KEYS.map(angle => {
              const a = state.angles[angle];
              return (
                <div key={angle} className="flex flex-col items-center">
                  <div className="text-xs uppercase tracking-wider mb-1" style={{
                    color: a.grade === 'almost_perfect' ? '#D0A030' : a.grade === 'good' ? 'var(--terminal-prime)' : a.grade === 'bad' ? '#E8585A' : '#8e7cc3',
                    fontFamily: 'var(--font-terminal), Consolas, monospace',
                  }}>
                    {ANGLE_LABELS[angle]}
                  </div>
                  <div className="relative border overflow-hidden" style={{
                    borderColor: a.grade === 'almost_perfect' ? '#D0A030' : a.grade === 'good' ? 'var(--terminal-prime)' : a.imagePath ? 'var(--pillar-spirit)' : '#2a2a3e',
                    borderWidth: a.grade === 'almost_perfect' ? '2px' : '1px',
                    backgroundColor: '#111', width: '130px', aspectRatio: '3/4',
                  }}>
                    {a.imagePath ? (
                      <FaceCropImage src={a.imagePath} alt={ANGLE_LABELS[angle]} faceCrop />
                    ) : a.generating ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className="animate-pulse text-sm" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                          Generating...
                        </div>
                        <ElapsedTimer startTime={state.generationStartTime} />
                      </div>
                    ) : a.error ? (
                      <div className="absolute inset-0 flex items-center justify-center p-2">
                        <div className="text-xs text-center" style={{ color: '#E8585A', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>{a.error}</div>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-xs" style={{ color: '#444', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>Waiting...</div>
                      </div>
                    )}
                  </div>

                  {/* Grade buttons */}
                  {state.step === 'angle_grading' && a.imagePath && (
                    <div className="flex gap-1 mt-2">
                      <GradeButton label="&times;" title="Bad — different person" active={a.grade === 'bad'} color="#E8585A"
                        onClick={() => dispatch({ type: 'GRADE_ANGLE', angle, grade: 'bad' })} />
                      <GradeButton label="&#10003;" title="Good — same person" active={a.grade === 'good'} color="#22ab94"
                        onClick={() => dispatch({ type: 'GRADE_ANGLE', angle, grade: 'good' })} />
                      <GradeButton label="&#9733;" title="Perfect match" active={a.grade === 'almost_perfect'} color="#D0A030"
                        onClick={() => dispatch({ type: 'GRADE_ANGLE', angle, grade: 'almost_perfect' })} />
                    </div>
                  )}
                  {/* Pick a specific file for this angle slot */}
                  <button
                    onClick={() => setPickingFor(pickingFor === angle ? null : angle)}
                    className="mt-1 px-2 py-0.5 text-xs uppercase tracking-wider"
                    style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '8px', backgroundColor: pickingFor === angle ? '#D0A030' : '#1a1a2e', color: pickingFor === angle ? '#000' : '#888', border: '1px solid #2a2a3e', borderRadius: '2px' }}>
                    {pickingFor === angle ? 'Cancel' : 'Pick File'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Per-angle file picker — click a thumbnail to assign it to the selected slot */}
          {pickingFor !== null && ((activeAngle: AngleKey) => (
            <div className="mb-4 p-2" style={{ backgroundColor: '#0a0a18', border: '1px solid #D0A030' }}>
              <div className="text-xs uppercase tracking-wider mb-2" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Assign a file to {ANGLE_LABELS[activeAngle]} — {availableAngleFiles.length} files available
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {availableAngleFiles.map(p => (
                  <div
                    key={p}
                    onClick={() => {
                      dispatch({ type: 'ANGLE_COMPLETE', angle: activeAngle, imagePath: p, seed: 0 });
                      setPickingFor(null);
                    }}
                    className="flex-shrink-0 border overflow-hidden cursor-pointer hover:opacity-80"
                    style={{ borderColor: '#2a2a3e', width: '90px', aspectRatio: '3/4', backgroundColor: '#111' }}
                    title={p.split('/').pop()}
                  >
                    <img src={p} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
                {availableAngleFiles.length === 0 && (
                  <div className="text-xs" style={{ color: '#666', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                    No angle files on disk. Generate angles first or check the angles/ folder.
                  </div>
                )}
              </div>
            </div>
          ))(pickingFor!)}

          {/* Grading actions */}
          {state.step === 'angle_grading' && (
            <div className="flex flex-wrap gap-2 justify-center">
              {hasBadAngles && (
                <WizardButton onClick={() => dispatch({ type: 'REGEN_BAD_ANGLES' })} color="var(--pillar-spirit)" label="Regenerate Bad" />
              )}
              <WizardButton onClick={() => dispatch({ type: 'REGEN_ALL_ANGLES' })} color="var(--pillar-spirit)" label="Redo All Angles" />
              {allGraded && hasAnyGood && (
                <>
                  <WizardButton onClick={() => generateBody()} color="var(--terminal-prime)" label="See Full Body" />
                  <WizardButton onClick={() => dispatch({ type: 'SKIP_BODY' })} color="#444" label="Skip to Testing" />
                </>
              )}
              <WizardButton onClick={() => dispatch({ type: 'BACK_TO_FRONT' })} color="#333" label="Back to Face" />
            </div>
          )}
        </div>
  );
}
