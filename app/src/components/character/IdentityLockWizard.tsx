'use client';

import React, { useReducer, useCallback, useEffect, useRef, useState } from 'react';
import { AngleKey, FrontCandidate, AngleResult, TestImage, WizardStep, WizardState, ANGLE_KEYS, ANGLE_LABELS, COMPOSITION_OPTIONS, TEST_PRESETS } from './identity-lock/types';
import { emptyAngle, initialState, reducer, Action } from './identity-lock/state';
import { GradeButton, WizardButton, MiniFrame, MiniFramePlaceholder, FaceCropImage, DebugPanel, ElapsedTimer } from './identity-lock/ui-bits';
import { FinetunePanel } from './identity-lock/FinetunePanel';
import { IdentityTestStep } from './identity-lock/IdentityTestStep';
import { useTuning } from './identity-lock/useTuning';
import { useGeneration } from './identity-lock/useGeneration';
import { CustomPromptPanel } from './identity-lock/steps/CustomPromptPanel';
import { FrontDiscoveryStep } from './identity-lock/steps/FrontDiscoveryStep';
import { AngleSteps } from './identity-lock/steps/AngleSteps';
import { BodyDiscoveryStep } from './identity-lock/steps/BodyDiscoveryStep';
import { PersonaLockStep } from './identity-lock/steps/PersonaLockStep';

// ============================================================
// Props
// ============================================================

interface IdentityLockWizardProps {
  characterData: Record<string, unknown>;
  campaignId: string;
  referencePhotos: string[];         // ALL player-uploaded reference photos
  characterId?: string;
  onComplete: (bust: string, fullBody: string) => void;
  onCancel: () => void;
}

// ============================================================
// Component
// ============================================================

export default function IdentityLockWizard({
  characterData,
  campaignId,
  referencePhotos,
  characterId,
  onComplete,
  onCancel,
}: IdentityLockWizardProps) {
  // Persist wizard state to localStorage so a page refresh restores the user to
  // wherever they were (locked face, angles, body) instead of Step 1.
  const charKey = (characterData as Record<string, unknown>).characterId as string || characterId || 'creation-preview';
  const storageKey = `identity-lock-wizard:${campaignId}:${charKey}`;
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    if (typeof window === 'undefined') return initialState();
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as WizardState;
        // Scrub transient flags AND wipe frontCandidates — candidates always reload
        // fresh from /api/portraits/existing so deleted files don't stay in the list.
        return {
          ...saved,
          frontCandidates: [],
          frontGenerating: false,
          bodyGenerating: false,
          testGenerating: false,
          currentAngleGenerating: null,
          generationStartTime: null,
          error: null,
        };
      }
    } catch { /* fall through */ }
    return initialState();
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* ignore quota/storage errors */ }
  }, [state, storageKey]);

  const tuning = useTuning(campaignId);
  const { viewingIndex, bodyViewIndex, additionalRefs } = tuning;
  const abortRef = useRef(false);

  // Primary reference photo (for PuLID on front face generation)
  const primaryRef = referencePhotos[0] || undefined;

  const displayIndex = viewingIndex ?? (state.frontCandidates.length - 1);
  const displayCandidate = state.frontCandidates[displayIndex] || null;

  // Combined ref pool. P1/P2 ref specs resolve 1-based indexes against this array.
  const allRefs = React.useMemo(() => [...referencePhotos, ...additionalRefs], [referencePhotos, additionalRefs]);

  const bodyCandidates = state.bodyCandidates;
  const bodyDisplayIndex = bodyViewIndex ?? (bodyCandidates.length - 1);
  const bodyDisplayEntry = bodyCandidates[bodyDisplayIndex];
  const bodyDisplayImage = bodyDisplayEntry?.imagePath || state.bodyImage;

  // Per-angle picker state — user clicks "Pick" on an angle slot to manually assign
  // an image from the angles/ folder (auto-load's angle-key detection is imperfect).
  const [pickingFor, setPickingFor] = useState<AngleKey | null>(null);
  const [availableAngleFiles, setAvailableAngleFiles] = useState<string[]>([]);

  // Load existing generated images on mount and validate state refs against disk.
  // "Load what's actually in the folders" — stale references to deleted files get cleared.
  const [existingLoaded, setExistingLoaded] = useState(false);
  useEffect(() => {
    if (existingLoaded) return;
    setExistingLoaded(true);
    const charId = (characterData as Record<string, unknown>).characterId as string || 'creation-preview';
    fetch(`/api/portraits/existing?characterId=${charId}`)
      .then(r => r.json())
      .then(data => {
        const candidates: Array<{ imagePath: string; tier: string; angleKey?: string; seed?: number }> = data.candidates || [];
        const onDisk = new Set(candidates.map(c => c.imagePath));

        // 1) Populate sketch + refined front candidates
        for (const c of candidates) {
          if (c.tier === 'sketch' || c.tier === 'refined') {
            dispatch({ type: 'FRONT_CANDIDATE_DONE', imagePath: c.imagePath, seed: c.seed ?? 0, tier: c.tier });
          }
        }

        // 2) Populate angles from disk (newest first per angleKey)
        const seenAngleKeys = new Set<string>();
        for (const c of candidates) {
          if (c.tier !== 'angle' || !c.angleKey) continue;
          if (seenAngleKeys.has(c.angleKey)) continue;
          seenAngleKeys.add(c.angleKey);
          if (ANGLE_KEYS.includes(c.angleKey as AngleKey)) {
            dispatch({ type: 'ANGLE_COMPLETE', angle: c.angleKey as AngleKey, imagePath: c.imagePath, seed: 0 });
          }
        }

        // 3) Wipe any angle slots whose localStorage-restored path isn't on disk anymore
        for (const k of ANGLE_KEYS) {
          const p = state.angles[k].imagePath;
          if (p && !onDisk.has(p)) {
            dispatch({ type: 'ANGLE_ERROR', angle: k, error: '' });  // clears imagePath
          }
        }

        // 4) Populate body candidates from disk (replaces stale state).
        const bodyEntries = candidates.filter(c => c.tier === 'body');
        dispatch({
          type: 'SET_BODY_CANDIDATES',
          candidates: bodyEntries.map(b => ({ imagePath: b.imagePath, seed: b.seed ?? 0 })),
        });

        // 5) Cache all angle files for the per-angle manual picker.
        const angleFiles = candidates.filter(c => c.tier === 'angle').map(c => c.imagePath);
        setAvailableAngleFiles(angleFiles);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generation = useGeneration({
    state,
    dispatch,
    characterData,
    characterId,
    abortRef,
    primaryRef,
    allRefs,
    displayIndex,
    bodyDisplayEntry,
    bodyDisplayImage,
    tuning,
  });
  const {
    debugInfo,
    runAngleGeneration,
    generateFinetune,
    bakeFinetune,
    generateTest,
  } = generation;

  // Don't auto-generate — existing images load on mount, player can pick or generate new
  useEffect(() => {
    return () => { abortRef.current = true; };
  }, []);

  // Trigger angle generation when entering angle_generation step
  // Trigger angle generation when entering angle_generation step
  const prevStepRef = useRef<string>('');
  useEffect(() => {
    if (state.step === 'angle_generation' && state.lockedFace && prevStepRef.current !== 'angle_generation') {
      abortRef.current = false;  // Reset abort flag
      const hasBad = ANGLE_KEYS.some(k => state.angles[k].grade === 'bad');
      runAngleGeneration(hasBad);
    }
    prevStepRef.current = state.step;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step]);

  // ── Fire onComplete when done ───────────────────────────────
  useEffect(() => {
    if (state.step === 'complete' && state.finalBust && state.finalFullBody) {
      onComplete(state.finalBust, state.finalFullBody);
    }
  }, [state.step, state.finalBust, state.finalFullBody, onComplete]);

  // ── Grading helpers ─────────────────────────────────────────
  const allGraded = ANGLE_KEYS.every(k => state.angles[k].grade !== null || !state.angles[k].imagePath);
  const hasBadAngles = ANGLE_KEYS.some(k => state.angles[k].grade === 'bad');
  const hasAnyGood = ANGLE_KEYS.some(k => state.angles[k].grade === 'good' || state.angles[k].grade === 'almost_perfect');

  // ── Step labels for indicator ───────────────────────────────
  const STEPS: { key: WizardStep; label: string }[] = [
    { key: 'front_discovery', label: 'Face' },
    { key: 'body_discovery', label: 'Body' },
    { key: 'finetune', label: 'Finetune' },
    { key: 'persona_lock', label: 'Lock' },
  ];
  const stepOrder: WizardStep[] = ['front_discovery', 'body_discovery', 'finetune', 'persona_lock', 'generating_final', 'complete'];
  const currentStepIndex = stepOrder.indexOf(state.step);

  return (
    <div className="border p-4" style={{ borderColor: '#D0A030', borderRadius: '3px', backgroundColor: '#0d0d1f' }}>
      <div className="flex gap-4">
      {/* Custom Prompt Panel — LoRA sliders removed (no FLUX.2-compatible LoRAs loaded) */}
      {true && (
        <CustomPromptPanel state={state} dispatch={dispatch} tuning={tuning} gen={generation} allRefs={allRefs} referencePhotos={referencePhotos} />
      )}

      {/* Wizard Content */}
      <div className="flex-1">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-base uppercase" style={{ color: '#D0A030', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.12em' }}>
          Identity Lock
        </div>
        <button
          onClick={onCancel}
          className="text-xs px-2 py-1 transition-colors"
          style={{ color: '#666', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#E8585A')}
          onMouseLeave={e => (e.currentTarget.style.color = '#666')}
        >
          Cancel
        </button>
      </div>

      {/* Step Indicator — every step is always clickable. Each step's UI handles
          its own empty/loading state so users can jump to any phase of the flow. */}
      <div className="flex gap-1 mb-4">
        {STEPS.map((s) => {
          const sIdx = stepOrder.indexOf(s.key);
          const isActive = s.key === state.step
            || (state.step === 'angle_grading' && s.key === 'angle_generation')
            || (state.step === 'generating_final' && s.key === 'persona_lock');
          const isDone = currentStepIndex > sIdx;
          return (
            <div
              key={s.key}
              className="flex-1 text-center"
              onClick={() => dispatch({ type: 'JUMP_TO_STEP', step: s.key })}
              style={{ cursor: 'pointer' }}
              title={`Jump to ${s.label}`}
            >
              <div className="h-1 mb-1 rounded-full transition-colors"
                style={{ backgroundColor: isDone ? '#D0A030' : isActive ? '#582a72' : '#2a2a3e' }} />
              <div className="text-xs uppercase tracking-wider" style={{
                color: isDone ? '#D0A030' : isActive ? '#582a72' : '#666',
                fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '9px',
              }}>{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════
          STEP 1: Front Face Discovery
          ══════════════════════════════════════════════════════════ */}
      {state.step === 'front_discovery' && (
        <FrontDiscoveryStep
          state={state} dispatch={dispatch} tuning={tuning} gen={generation}
          displayIndex={displayIndex} displayCandidate={displayCandidate}
          abortRef={abortRef} referencePhotos={referencePhotos}
        />
      )}

      {/* ══════════════════════════════════════════════════════════
          STEP 2-3: Multi-Angle Generation & Grading
          ══════════════════════════════════════════════════════════ */}
      {/* NOTE: this gate was already `false &&` (disabled) before extraction — preserved as-is. */}
      {false && (state.step === 'angle_generation' || state.step === 'angle_grading') && (
        <AngleSteps
          state={state} dispatch={dispatch} tuning={tuning} gen={generation}
          characterData={characterData}
          pickingFor={pickingFor} setPickingFor={setPickingFor} availableAngleFiles={availableAngleFiles}
          allGraded={allGraded} hasBadAngles={hasBadAngles} hasAnyGood={hasAnyGood}
        />
      )}

      {/* ══════════════════════════════════════════════════════════
          STEP 4: Body Discovery
          ══════════════════════════════════════════════════════════ */}
      {state.step === 'body_discovery' && (
        <BodyDiscoveryStep
          state={state} dispatch={dispatch} tuning={tuning} gen={generation}
          bodyCandidates={bodyCandidates} bodyDisplayIndex={bodyDisplayIndex} bodyDisplayImage={bodyDisplayImage}
          characterId={characterId}
        />
      )}

      {/* ══════════════════════════════════════════════════════════
          STEP 4.5: Finetune (Kontext Edit)
          ══════════════════════════════════════════════════════════ */}
      {state.step === 'finetune' && (
        <FinetunePanel
          sourceImage={bodyDisplayImage || state.bodyImage || state.lockedFace}
          finetuneHistory={state.finetuneHistory}
          finetuneGenerating={state.finetuneGenerating}
          generationStartTime={state.generationStartTime}
          onGenerate={generateFinetune}
          onBake={bakeFinetune}
          onLoadSaved={(imagePath, prompt) => dispatch({ type: 'FINETUNE_LOAD_SAVED', imagePath, prompt })}
          onUndo={() => dispatch({ type: 'FINETUNE_UNDO' })}
          onReroll={async (prompt) => {
            // Reroll: use the source from BEFORE the last layer, reuse its mask if any, generate new result
            const ftHist = state.finetuneHistory || [];
            const lastEntry = ftHist[ftHist.length - 1];
            const sourceBeforeLast = ftHist.length > 1 ? ftHist[ftHist.length - 2].imagePath : (bodyDisplayImage || state.bodyImage || state.lockedFace);
            if (!sourceBeforeLast) return;
            const storedPaintData = lastEntry?.paintData || undefined;
            dispatch({ type: 'FINETUNE_UNDO' });
            dispatch({ type: 'FINETUNE_GENERATING' });
            try {
              const res = await fetch('/api/portraits/edit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sourceImagePath: sourceBeforeLast,
                  editPrompt: prompt,
                  characterId: (characterData as Record<string, unknown>).characterId as string || 'creation-preview',
                  paintData: storedPaintData,
                }),
              });
              const data = await res.json();
              if (!res.ok || !data.success) throw new Error(data.error || 'Reroll failed');
              dispatch({ type: 'FINETUNE_COMPLETE', imagePath: data.imagePath, prompt, paintData: storedPaintData });
            } catch (e) {
              dispatch({ type: 'FINETUNE_ERROR', error: e instanceof Error ? e.message : 'Reroll failed' });
            }
          }}
          onReset={() => dispatch({ type: 'FINETUNE_RESET' })}
          onAccept={() => dispatch({ type: 'ADVANCE_TO_LOCK' })}
          onBack={() => dispatch({ type: 'JUMP_TO_STEP', step: 'body_discovery' })}
          onSkip={() => dispatch({ type: 'ADVANCE_TO_LOCK' })}
        />
      )}

      {/* ══════════════════════════════════════════════════════════
          STEP 5: Identity Testing
          ══════════════════════════════════════════════════════════ */}
      {state.step === 'identity_test' && (
        <IdentityTestStep
          state={state}
          dispatch={dispatch}
          onGenerateTest={generateTest}
        />
      )}

      {/* ══════════════════════════════════════════════════════════
          STEP 6: Persona Lock
          ══════════════════════════════════════════════════════════ */}
      {(state.step === 'persona_lock' || state.step === 'generating_final') && (
        <PersonaLockStep state={state} dispatch={dispatch} tuning={tuning} gen={generation} />
      )}

      {/* Error Display */}
      {state.error && (
        <div className="mt-3 p-2 text-xs" style={{
          color: '#E8585A', fontFamily: 'var(--font-terminal), Consolas, monospace',
          backgroundColor: '#1a0a0a', border: '1px solid #E8585A40', borderRadius: '3px',
        }}>
          {state.error}
        </div>
      )}

      {/* Debug Panel */}
      {/* Debug panel hidden — future admin toggle */}
      {debugInfo && <DebugPanel info={debugInfo} />}
      </div>{/* end wizard content */}
      </div>{/* end flex wrapper */}
    </div>
  );
}

