'use client';

import React, { useReducer, useCallback, useEffect, useRef, useState } from 'react';

// ============================================================
// Types
// ============================================================

type AngleKey = 'three_quarter_left' | 'three_quarter_right' | 'profile_left' | 'profile_right';

interface FrontCandidate {
  imagePath: string;
  seed: number;
  tier: 'sketch' | 'refined';  // sketch = Pass 1 low-res, refined = Pass 2 img2img final
}

interface AngleResult {
  imagePath: string | null;
  seed: number | null;
  grade: 'bad' | 'good' | 'almost_perfect' | null;
  generating: boolean;
  error: string | null;
}

interface TestImage {
  imagePath: string;
  steeringWords: string;
  composition: string;
  seed: number;
}

type WizardStep =
  | 'front_discovery'     // Generate front face candidates, player picks one
  | 'angle_generation'    // Generate 4 angles using locked front as PuLID ref
  | 'angle_grading'       // Player grades each angle
  | 'body_discovery'      // Full body with PuLID reference
  | 'identity_test'       // Test with different outfits/poses/expressions
  | 'persona_lock'        // Final confirmation + lock
  | 'generating_final'    // Generating canonical portraits
  | 'complete';

interface WizardState {
  step: WizardStep;

  // Front face candidates (step 1)
  frontCandidates: FrontCandidate[];
  frontGenerating: boolean;
  selectedFrontIndex: number | null;

  // Locked front face — PuLID reference for everything after
  lockedFace: string | null;
  lockedSeed: number | null;

  // Multi-angle results (step 2-3)
  angles: Record<AngleKey, AngleResult>;
  currentAngleGenerating: AngleKey | null;

  // Body (step 4)
  bodyImage: string | null;
  bodyGenerating: boolean;

  // Testing (step 5)
  testImages: TestImage[];
  testGenerating: boolean;

  // Final canonical portraits
  finalBust: string | null;
  finalFullBody: string | null;

  error: string | null;
  generationStartTime: number | null;
}

// ============================================================
// Constants
// ============================================================

const ANGLE_KEYS: AngleKey[] = ['three_quarter_left', 'three_quarter_right', 'profile_left', 'profile_right'];
const ANGLE_LABELS: Record<AngleKey, string> = {
  three_quarter_left: '3/4 Left',
  three_quarter_right: '3/4 Right',
  profile_left: 'Profile Left',
  profile_right: 'Profile Right',
};

const COMPOSITION_OPTIONS = [
  { value: 'bust', label: 'Bust Portrait' },
  { value: 'half_body', label: 'Half Body' },
  { value: 'full_body', label: 'Full Body' },
  { value: 'action', label: 'Action Pose' },
];

const TEST_PRESETS = [
  'plate armor, sword on hip',
  'leather armor, hooded cloak',
  'noble robes, gold jewelry',
  'battle stance, fierce expression',
  'serene expression, meditating',
  'ragged clothes, injured, bloodied',
];

// ============================================================
// Reducer
// ============================================================

function emptyAngle(): AngleResult {
  return { imagePath: null, seed: null, grade: null, generating: false, error: null };
}

function initialState(): WizardState {
  return {
    step: 'front_discovery',
    // Front face: iterative Bad/Good/Perfect grading
    frontCandidates: [],           // History of all generated faces
    frontGenerating: false,
    selectedFrontIndex: null,      // Not used in new flow (kept for state compat)
    lockedFace: null,
    lockedSeed: null,
    angles: {
      three_quarter_left: emptyAngle(),
      three_quarter_right: emptyAngle(),
      profile_left: emptyAngle(),
      profile_right: emptyAngle(),
    },
    currentAngleGenerating: null,
    bodyImage: null,
    bodyGenerating: false,
    testImages: [],
    testGenerating: false,
    finalBust: null,
    finalFullBody: null,
    error: null,
    generationStartTime: null,
  };
}

type Action =
  // Front face — iterative grading
  | { type: 'FRONT_GENERATING' }
  | { type: 'FRONT_CANDIDATE_DONE'; imagePath: string; seed: number; tier: 'sketch' | 'refined' }
  | { type: 'FRONT_CANDIDATE_ERROR'; error: string }
  | { type: 'FRONT_GRADE_BAD' }        // Retry with new seed
  | { type: 'FRONT_GRADE_GOOD' }       // Use this as PuLID ref, generate again to converge
  | { type: 'FRONT_GRADE_PERFECT'; index?: number }    // Lock this face, proceed to angles
  // Angles
  | { type: 'START_ANGLES' }
  | { type: 'ANGLE_GENERATING'; angle: AngleKey }
  | { type: 'ANGLE_COMPLETE'; angle: AngleKey; imagePath: string; seed: number }
  | { type: 'ANGLE_ERROR'; angle: AngleKey; error: string }
  | { type: 'ALL_ANGLES_DONE' }
  | { type: 'GRADE_ANGLE'; angle: AngleKey; grade: 'bad' | 'good' | 'almost_perfect' }
  | { type: 'REGEN_BAD_ANGLES' }
  | { type: 'REGEN_ALL_ANGLES' }
  // Body
  | { type: 'BODY_GENERATING' }
  | { type: 'BODY_COMPLETE'; imagePath: string }
  | { type: 'BODY_ERROR'; error: string }
  | { type: 'ADVANCE_TO_TEST' }
  // Navigation — jump to any step (subject to prerequisites — caller checks)
  | { type: 'JUMP_TO_STEP'; step: WizardStep }
  // Testing
  | { type: 'TEST_GENERATING' }
  | { type: 'TEST_COMPLETE'; imagePath: string; steeringWords: string; composition: string; seed: number }
  | { type: 'TEST_ERROR'; error: string }
  | { type: 'ADVANCE_TO_LOCK' }
  // Final
  | { type: 'START_FINAL' }
  | { type: 'FINAL_BUST_DONE'; imagePath: string }
  | { type: 'FINAL_BODY_DONE'; imagePath: string }
  | { type: 'COMPLETE' }
  // Navigation
  | { type: 'BACK_TO_FRONT' }
  | { type: 'BACK_TO_ANGLES' }
  | { type: 'SKIP_BODY' }
  | { type: 'SKIP_TESTS' }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'CLEAR_ERROR' };

function reducer(state: WizardState, action: Action): WizardState {
  switch (action.type) {
    // ── Front Face (iterative grading) ──
    case 'FRONT_GENERATING':
      return { ...state, frontGenerating: true, generationStartTime: Date.now(), error: null };
    case 'FRONT_CANDIDATE_DONE': {
      // Dedup by imagePath — prevents double-entries when existing scan + fresh generation race.
      if (state.frontCandidates.some(c => c.imagePath === action.imagePath)) {
        return { ...state, frontGenerating: false, generationStartTime: null };
      }
      return {
        ...state,
        frontGenerating: false,
        generationStartTime: null,
        frontCandidates: [...state.frontCandidates, { imagePath: action.imagePath, seed: action.seed, tier: action.tier }],
      };
    }
    case 'FRONT_CANDIDATE_ERROR':
      return { ...state, frontGenerating: false, generationStartTime: null, error: action.error };
    case 'FRONT_GRADE_BAD':
      // Bad = start fresh with a new random seed, no PuLID ref from this one
      return state;
    case 'FRONT_GRADE_GOOD':
      // Good = use this face as PuLID reference for next generation (converge)
      return state;
    case 'FRONT_GRADE_PERFECT': {
      // Perfect = lock selected face, proceed to angles
      const idx = action.index ?? state.frontCandidates.length - 1;
      const latest = state.frontCandidates[idx];
      return {
        ...state,
        lockedFace: latest.imagePath,
        lockedSeed: latest.seed,
        step: 'angle_generation',
        angles: { three_quarter_left: emptyAngle(), three_quarter_right: emptyAngle(), profile_left: emptyAngle(), profile_right: emptyAngle() },
      };
    }

    // ── Angles ──
    case 'START_ANGLES':
      return { ...state, step: 'angle_generation' };
    case 'ANGLE_GENERATING':
      return {
        ...state,
        currentAngleGenerating: action.angle,
        generationStartTime: Date.now(),
        angles: { ...state.angles, [action.angle]: { ...state.angles[action.angle], generating: true, error: null } },
      };
    case 'ANGLE_COMPLETE':
      return {
        ...state,
        currentAngleGenerating: null,
        generationStartTime: null,
        angles: {
          ...state.angles,
          [action.angle]: { imagePath: action.imagePath, seed: action.seed, grade: null, generating: false, error: null },
        },
      };
    case 'ANGLE_ERROR':
      return {
        ...state,
        currentAngleGenerating: null,
        generationStartTime: null,
        angles: { ...state.angles, [action.angle]: { ...state.angles[action.angle], generating: false, error: action.error } },
      };
    case 'ALL_ANGLES_DONE':
      return { ...state, step: 'angle_grading' };
    case 'GRADE_ANGLE':
      return { ...state, angles: { ...state.angles, [action.angle]: { ...state.angles[action.angle], grade: action.grade } } };
    case 'REGEN_BAD_ANGLES': {
      const newAngles = { ...state.angles };
      for (const key of ANGLE_KEYS) {
        if (newAngles[key].grade === 'bad') newAngles[key] = emptyAngle();
      }
      return { ...state, step: 'angle_generation', angles: newAngles };
    }
    case 'REGEN_ALL_ANGLES':
      return {
        ...state,
        step: 'angle_generation',
        angles: { three_quarter_left: emptyAngle(), three_quarter_right: emptyAngle(), profile_left: emptyAngle(), profile_right: emptyAngle() },
      };

    // ── Body ──
    case 'BODY_GENERATING':
      return { ...state, step: 'body_discovery', bodyGenerating: true, generationStartTime: Date.now(), error: null };
    case 'BODY_COMPLETE':
      return { ...state, bodyGenerating: false, bodyImage: action.imagePath, generationStartTime: null };
    case 'BODY_ERROR':
      return { ...state, bodyGenerating: false, error: action.error, generationStartTime: null };
    case 'ADVANCE_TO_TEST':
      return { ...state, step: 'identity_test' };
    case 'JUMP_TO_STEP':
      return { ...state, step: action.step };
    case 'SKIP_BODY':
      return { ...state, step: 'identity_test' };

    // ── Testing ──
    case 'TEST_GENERATING':
      return { ...state, testGenerating: true, generationStartTime: Date.now(), error: null };
    case 'TEST_COMPLETE':
      return {
        ...state,
        testGenerating: false,
        generationStartTime: null,
        testImages: [...state.testImages, { imagePath: action.imagePath, steeringWords: action.steeringWords, composition: action.composition, seed: action.seed }],
      };
    case 'TEST_ERROR':
      return { ...state, testGenerating: false, generationStartTime: null, error: action.error };
    case 'ADVANCE_TO_LOCK':
      return { ...state, step: 'persona_lock' };
    case 'SKIP_TESTS':
      return { ...state, step: 'persona_lock' };

    // ── Final ──
    case 'START_FINAL':
      return { ...state, step: 'generating_final', generationStartTime: Date.now(), error: null };
    case 'FINAL_BUST_DONE':
      return { ...state, finalBust: action.imagePath };
    case 'FINAL_BODY_DONE':
      return { ...state, finalFullBody: action.imagePath, generationStartTime: null };
    case 'COMPLETE':
      return { ...state, step: 'complete' };

    // ── Navigation ──
    case 'BACK_TO_FRONT':
      return { ...state, step: 'front_discovery' };
    case 'BACK_TO_ANGLES':
      return { ...state, step: 'angle_grading' };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'CLEAR_ERROR':
      return { ...state, error: null };

    default:
      return state;
  }
}

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

  const [matureContent, setMatureContent] = useState(false);

  // Fetch campaign AI settings (mature content toggle)
  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const ai = data?.campaign?.aiSettings || data?.aiSettings;
        if (ai) {
          try {
            const settings = typeof ai === 'string' ? JSON.parse(ai) : ai;
            setMatureContent(!!settings.matureContent);
          } catch { /* ignore */ }
        }
      })
      .catch(() => {});
  }, [campaignId]);
  const abortRef = useRef(false);

  // Primary reference photo (for PuLID on front face generation)
  const primaryRef = referencePhotos[0] || undefined;

  // Which candidate is currently displayed (defaults to latest)
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const displayIndex = viewingIndex ?? (state.frontCandidates.length - 1);
  const displayCandidate = state.frontCandidates[displayIndex] || null;

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
        const candidates: Array<{ imagePath: string; tier: string; angleKey?: string }> = data.candidates || [];
        const onDisk = new Set(candidates.map(c => c.imagePath));

        // 1) Populate sketch + refined front candidates
        for (const c of candidates) {
          if (c.tier === 'sketch' || c.tier === 'refined') {
            dispatch({ type: 'FRONT_CANDIDATE_DONE', imagePath: c.imagePath, seed: 0, tier: c.tier });
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

        // 4) Populate bodyImage from disk (newest body/ entry wins).
        const bodyEntry = candidates.find(c => c.tier === 'body');
        if (bodyEntry) {
          dispatch({ type: 'BODY_COMPLETE', imagePath: bodyEntry.imagePath });
        }

        // 5) Cache all angle files for the per-angle manual picker.
        const angleFiles = candidates.filter(c => c.tier === 'angle').map(c => c.imagePath);
        setAvailableAngleFiles(angleFiles);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Core generation helper ─────────────────────────────────
  // Debug info from last generation
  const [debugInfo, setDebugInfo] = useState<{ prompt: string; negativePrompt: string; seed: number; timeMs: number; workflow: string; failures: string[]; refs: string } | null>(null);

  const generate = useCallback(async (opts: {
    referenceImagePath?: string;
    referenceImagePaths?: string[];
    overrides?: Record<string, unknown>;
    creationMode?: boolean;
  }): Promise<{ imagePath: string; seed: number } | null> => {
    const res = await fetch('/api/portraits/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        characterData,
        creationMode: opts.creationMode ?? true,
        referenceImagePath: opts.referenceImagePath,
        referenceImagePaths: opts.referenceImagePaths,
        overrides: opts.overrides,
        campaignStyle: { allowNudity: matureContent },
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Generation failed');
    }
    const data = await res.json();
    setViewingIndex(null);  // Reset to show latest
    setDebugInfo({
      prompt: data.metadata.prompt || '',
      negativePrompt: data.metadata.negativePrompt || '',
      seed: data.metadata.seed,
      timeMs: data.metadata.generationTimeMs,
      workflow: data.metadata.workflowUsed || 'unknown',
      failures: data.metadata.failedWorkflows || [],
      refs: data.metadata.debugRefs || '',
    });
    return { imagePath: data.imagePath, seed: data.metadata.seed };
  }, [characterData, matureContent]);

  // ── Step 1: Front face generation (two-pass: sketch → img2img refine) ───────
  // Pass 1: Sketch (384/4/no LoRAs) with player photo → clean bald face
  // User grades the sketch. If good:
  // Pass 2: img2img refine — sketch as base image, PuLID from player photo, all LoRAs,
  //         denoise 0.65 preserves bald composition while adding style
  const generateFrontFace = useCallback(async (pulidRef?: string, baseImage?: string) => {
    abortRef.current = false;
    dispatch({ type: 'FRONT_GENERATING' });
    // 3-step pipeline (matches bf706666 golden discovery):
    // Step 1 — Face Discovery (no baseImage): draft quality, PuLID only, NO ControlNet.
    //   Goal: clean bald face with identity locked to player photo. User iterates
    //   Try Again / Looks Good until happy.
    // Step 2 — Front Lock (baseImage = Step 1 output): final quality, img2img refine
    //   WITH ControlNet for exact front pose. PuLID ref is the Step 1 output (clean
    //   bald image, no photo-artifact contamination).
    // Step 3 — Angles: handled by runAngleGeneration, uses locked face as PuLID ref.
    try {
      if (baseImage) {
        // Step 2: fresh txt2img.
        // PuLID primary = Step 1 image (high weight 0.8) — dominant identity.
        // PuLID secondary = player photos (low weight 0.3, chained in a 2nd PuLID node) —
        //   pulls in fine details (makeup, eye nuance) without overpowering primary.
        // Position/framing = ControlNet + angle-refs/front.jpg.
        // Quality = final 768×20, all style LoRAs active.
        const secondaries = referencePhotos.filter(p => p !== baseImage);
        const refsOrdered = [baseImage, ...secondaries];
        const result = await generate({
          referenceImagePath: baseImage,
          referenceImagePaths: refsOrdered,  // provider splits [0] as primary, rest as secondaries
          overrides: {
            anglePreset: 'front',
            quality: 'final',
          },
        });
        if (result) {
          dispatch({ type: 'FRONT_CANDIDATE_DONE', imagePath: result.imagePath, seed: result.seed, tier: 'refined' });
        }
      } else {
        // Step 1: face discovery. Single player photo ref, draft quality, NO ControlNet.
        const result = await generate({
          referenceImagePath: pulidRef || primaryRef,
          overrides: { anglePreset: 'front', quality: 'draft', skipControlNet: true },
        });
        if (result) {
          dispatch({ type: 'FRONT_CANDIDATE_DONE', imagePath: result.imagePath, seed: result.seed, tier: 'sketch' });
        }
      }
    } catch (e) {
      dispatch({ type: 'FRONT_CANDIDATE_ERROR', error: e instanceof Error ? e.message : 'Generation failed' });
    }
  }, [generate, primaryRef, referencePhotos]);

  // Grade handlers for front face
  const handleFrontBad = useCallback(() => {
    dispatch({ type: 'FRONT_GRADE_BAD' });
    // Fresh sketch pass
    generateFrontFace();
  }, [generateFrontFace]);

  const handleFrontGood = useCallback(() => {
    // Use the DISPLAYED candidate (what user is looking at), not the latest.
    // Lets user click a specific sketch (e.g. a saved golden) and refine THAT one.
    const selected = displayCandidate ?? state.frontCandidates[state.frontCandidates.length - 1];
    dispatch({ type: 'FRONT_GRADE_GOOD' });
    generateFrontFace(primaryRef, selected?.imagePath);
  }, [generateFrontFace, displayCandidate, state.frontCandidates, primaryRef]);

  const handleFrontPerfect = useCallback(() => {
    dispatch({ type: 'FRONT_GRADE_PERFECT', index: displayIndex >= 0 ? displayIndex : undefined });
  }, [displayIndex]);

  // Don't auto-generate — existing images load on mount, player can pick or generate new
  useEffect(() => {
    return () => { abortRef.current = true; };
  }, []);

  // ── Step 2: Multi-angle generation (uses locked front as PuLID ref) ──
  const runAngleGeneration = useCallback(async (onlyBad: boolean) => {
    if (!state.lockedFace) return;
    // Share ONE seed across all angles so skin tone / lighting / color stay consistent.
    // Reuse the seed from any already-generated angle so single-angle regens (onlyBad=true)
    // match the color of the surviving good angles. Only pick a fresh seed if no angle
    // has been generated yet in this session.
    const existingSeed = ANGLE_KEYS
      .map(a => state.angles[a].seed)
      .find((s): s is number => typeof s === 'number');
    const sharedSeed = existingSeed ?? Math.floor(Math.random() * 2147483647);
    for (const angle of ANGLE_KEYS) {
      if (abortRef.current) return;
      if (onlyBad && state.angles[angle].imagePath && state.angles[angle].grade !== 'bad') continue;
      if (!onlyBad && state.angles[angle].imagePath) continue;

      dispatch({ type: 'ANGLE_GENERATING', angle });
      try {
        const result = await generate({
          referenceImagePath: state.lockedFace,
          overrides: { anglePreset: angle, quality: 'final', seed: sharedSeed },
        });
        if (result) {
          dispatch({ type: 'ANGLE_COMPLETE', angle, imagePath: result.imagePath, seed: result.seed });
        }
      } catch (e) {
        dispatch({ type: 'ANGLE_ERROR', angle, error: e instanceof Error ? e.message : 'Generation failed' });
      }
    }
    if (!abortRef.current) {
      dispatch({ type: 'ALL_ANGLES_DONE' });
    }
  }, [state.lockedFace, state.angles, generate]);

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

  // ── Step 3: Body generation ─────────────────────────────────
  const generateBody = useCallback(async () => {
    if (!state.lockedFace) return;
    dispatch({ type: 'BODY_GENERATING' });
    // Body gen uses SINGLE PuLID ref (just locked face). PuLID only embeds the face
    // region per image — stacking 9 refs (face + 4 angles + 4 player photos) all
    // encode the same face box and cost 9× BiSeNet parses for marginal identity gain.
    // Hair, skin, body-level detail come from prompt (character.identity fields),
    // not from PuLID. Keeping body gen to 1 ref cuts ~60% off gen time.
    try {
      const result = await generate({
        referenceImagePath: state.lockedFace,
        creationMode: true,
        overrides: { composition: 'full_body', quality: 'final' },
      });
      if (result) {
        dispatch({ type: 'BODY_COMPLETE', imagePath: result.imagePath });
      }
    } catch (e) {
      dispatch({ type: 'BODY_ERROR', error: e instanceof Error ? e.message : 'Body generation failed' });
    }
  }, [state.lockedFace, generate]);

  // ── Step 4: Test generation ─────────────────────────────────
  const generateTest = useCallback(async (steeringWords: string, composition: string) => {
    if (!state.lockedFace) return;
    dispatch({ type: 'TEST_GENERATING' });
    try {
      const result = await generate({
        referenceImagePath: state.lockedFace,
        overrides: {
          composition,
          steeringWords: steeringWords.split(',').map(w => w.trim()).filter(Boolean),
          quality: 'final',
        },
        creationMode: false,  // Allow clothing/equipment in tests
      });
      if (result) {
        dispatch({ type: 'TEST_COMPLETE', imagePath: result.imagePath, steeringWords, composition, seed: result.seed });
      }
    } catch (e) {
      dispatch({ type: 'TEST_ERROR', error: e instanceof Error ? e.message : 'Test generation failed' });
    }
  }, [state.lockedFace, generate]);

  // ── Step 5: Final generation + persona lock ─────────────────
  const generateFinalAndLock = useCallback(async () => {
    if (!state.lockedFace) return;
    dispatch({ type: 'START_FINAL' });
    try {
      // Canonical bust
      const bust = await generate({
        referenceImagePath: state.lockedFace,
        overrides: { composition: 'bust', seed: state.lockedSeed, quality: 'final' },
      });
      if (bust) dispatch({ type: 'FINAL_BUST_DONE', imagePath: bust.imagePath });

      // Canonical full body
      const body = await generate({
        referenceImagePath: state.lockedFace,
        overrides: { composition: 'full_body', seed: state.lockedSeed, quality: 'final' },
      });
      if (body) dispatch({ type: 'FINAL_BODY_DONE', imagePath: body.imagePath });

      // Call persona lock API if character exists in DB
      if (characterId) {
        try {
          const histRes = await fetch(`/api/portraits/history?characterId=${characterId}`);
          const histData = await histRes.json();
          const latest = histData.portraits?.[0];
          if (latest) {
            await fetch('/api/portraits/lock', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ generationId: latest.id, characterId }),
            });
          }
        } catch {
          console.warn('[IdentityLock] Persona lock API failed — portraits still saved');
        }
      }

      dispatch({ type: 'COMPLETE' });
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: e instanceof Error ? e.message : 'Final generation failed' });
    }
  }, [state.lockedFace, state.lockedSeed, generate, characterId]);

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
    { key: 'angle_generation', label: 'Angles' },
    { key: 'body_discovery', label: 'Body' },
    { key: 'identity_test', label: 'Test' },
    { key: 'persona_lock', label: 'Lock' },
  ];
  const stepOrder: WizardStep[] = ['front_discovery', 'angle_generation', 'angle_grading', 'body_discovery', 'identity_test', 'persona_lock', 'generating_final', 'complete'];
  const currentStepIndex = stepOrder.indexOf(state.step);

  return (
    <div className="border p-4" style={{ borderColor: '#D0A030', borderRadius: '3px', backgroundColor: '#0d0d1f' }}>
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
                style={{ backgroundColor: isDone ? '#D0A030' : isActive ? '#7050A8' : '#2a2a3e' }} />
              <div className="text-xs uppercase tracking-wider" style={{
                color: isDone ? '#D0A030' : isActive ? '#7050A8' : '#666',
                fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '9px',
              }}>{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════
          STEP 1: Front Face Discovery
          ══════════════════════════════════════════════════════════ */}
      {state.step === 'front_discovery' && (() => {
        const currentTier = displayCandidate?.tier ?? 'sketch';
        const tieredCandidates = state.frontCandidates
          .map((c, i) => ({ c, i }))
          .filter(({ c }) => c.tier === currentTier);
        const displayRankInTier = tieredCandidates.findIndex(({ i }) => i === displayIndex) + 1;
        const stepLabel = currentTier === 'refined' ? 'Step 2 — Lock Your Face' : 'Step 1 — Find Your Face';
        const stepHelp = currentTier === 'refined'
          ? 'Full-quality locked front. Rate to regenerate at Step 1, or lock as your character.'
          : (primaryRef
              ? 'Generating from your reference photo + description. Rate each result to refine.'
              : 'Generating from your physical description. Upload a reference photo for better results.');

        // Find latest of each tier for the tier-switch buttons.
        const latestSketchIdx = (() => { for (let i = state.frontCandidates.length - 1; i >= 0; i--) if (state.frontCandidates[i].tier === 'sketch') return i; return -1; })();
        const latestRefinedIdx = (() => { for (let i = state.frontCandidates.length - 1; i >= 0; i--) if (state.frontCandidates[i].tier === 'refined') return i; return -1; })();
        const sketchCount = state.frontCandidates.filter(c => c.tier === 'sketch').length;
        const refinedCount = state.frontCandidates.filter(c => c.tier === 'refined').length;

        return (
        <div>
          {/* Tier switch tabs — lets user flip between Step 1 and Step 2 views */}
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => latestSketchIdx >= 0 && setViewingIndex(latestSketchIdx)}
              disabled={sketchCount === 0}
              className="px-3 py-1 text-xs uppercase tracking-wider transition-colors"
              style={{
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                backgroundColor: currentTier === 'sketch' ? '#D0A030' : '#1a1a2e',
                color: currentTier === 'sketch' ? '#000' : (sketchCount === 0 ? '#333' : '#888'),
                border: `1px solid ${currentTier === 'sketch' ? '#D0A030' : '#2a2a3e'}`,
                borderRadius: '2px',
                cursor: sketchCount === 0 ? 'not-allowed' : 'pointer',
              }}>
              Step 1 ({sketchCount})
            </button>
            <button
              onClick={() => latestRefinedIdx >= 0 && setViewingIndex(latestRefinedIdx)}
              disabled={refinedCount === 0}
              className="px-3 py-1 text-xs uppercase tracking-wider transition-colors"
              style={{
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                backgroundColor: currentTier === 'refined' ? '#D0A030' : '#1a1a2e',
                color: currentTier === 'refined' ? '#000' : (refinedCount === 0 ? '#333' : '#888'),
                border: `1px solid ${currentTier === 'refined' ? '#D0A030' : '#2a2a3e'}`,
                borderRadius: '2px',
                cursor: refinedCount === 0 ? 'not-allowed' : 'pointer',
              }}>
              Step 2 ({refinedCount})
            </button>
          </div>

          <div className="text-xs mb-1" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            {stepLabel}
          </div>
          <div className="text-xs mb-3" style={{ color: '#666', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
            {stepHelp}
          </div>

          <div className="flex gap-4 justify-center mb-4">
            {/* Previous attempts of the SAME tier (small, scrollable) */}
            {tieredCandidates.length > 1 && (
              <div className="flex flex-col items-center">
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: '#444', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '8px' }}>
                  {currentTier === 'refined' ? 'Step 2' : 'Step 1'} Attempts ({tieredCandidates.length})
                </div>
                <div className="overflow-y-auto flex flex-col gap-1 pr-1" style={{ maxHeight: '220px', width: '56px' }}>
                  {tieredCandidates.map(({ c, i }) => (
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
                {state.frontGenerating ? 'Generating...' : `Attempt ${displayRankInTier} of ${tieredCandidates.length}`}
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
                    <div className="animate-pulse text-sm" style={{ color: '#7050A8', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                      Generating...
                    </div>
                    <ElapsedTimer startTime={state.generationStartTime} />
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

          {/* Actions — two buttons per tier.
               Sketch tier: [Try Again] [Increase Quality] (advance to refined)
               Refined tier: [Try Again] [Perfect — Lock It] */}
          {!state.frontGenerating && (
            <div className="space-y-2">
              {displayCandidate ? (
                <>
                  <div className="text-xs text-center mb-2" style={{ color: '#888', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                    {displayCandidate.tier === 'sketch'
                      ? 'Low-res sketch. Is the face right?'
                      : 'Full quality. Lock this as the character\'s face?'}
                  </div>
                  <div className="flex gap-3 justify-center">
                    <button onClick={handleFrontBad}
                      className="px-5 py-2.5 text-xs uppercase tracking-wider transition-colors"
                      style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', backgroundColor: '#1a1a2e', color: '#E8585A', border: '1px solid #E8585A60', borderRadius: '2px' }}>
                      Try Again
                    </button>
                    {displayCandidate.tier === 'sketch' ? (
                      <button onClick={handleFrontGood}
                        className="px-5 py-2.5 text-xs uppercase tracking-wider transition-colors"
                        style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', backgroundColor: '#1a1a2e', color: '#22ab94', border: '1px solid #22ab9460', borderRadius: '2px' }}>
                        Increase Quality
                      </button>
                    ) : (
                      <button onClick={handleFrontPerfect}
                        className="px-5 py-2.5 text-xs uppercase tracking-wider transition-colors font-bold"
                        style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', backgroundColor: '#D0A030', color: '#000', border: '1px solid #D0A030', borderRadius: '2px' }}>
                        Perfect — Lock It
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex justify-center">
                  <button onClick={() => generateFrontFace()}
                    className="px-4 py-2 text-xs uppercase tracking-wider transition-colors"
                    style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', backgroundColor: '#582a72', color: '#fff', border: '1px solid #582a72', borderRadius: '2px' }}>
                    Generate Face
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════
          STEP 2-3: Multi-Angle Generation & Grading
          ══════════════════════════════════════════════════════════ */}
      {(state.step === 'angle_generation' || state.step === 'angle_grading') && (
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
                {state.lockedFace && <FaceCropImage src={state.lockedFace} alt="Locked face" faceCrop />}
              </div>
            </div>

            {/* Angle results */}
            {ANGLE_KEYS.map(angle => {
              const a = state.angles[angle];
              return (
                <div key={angle} className="flex flex-col items-center">
                  <div className="text-xs uppercase tracking-wider mb-1" style={{
                    color: a.grade === 'almost_perfect' ? '#D0A030' : a.grade === 'good' ? '#22ab94' : a.grade === 'bad' ? '#E8585A' : '#8e7cc3',
                    fontFamily: 'var(--font-terminal), Consolas, monospace',
                  }}>
                    {ANGLE_LABELS[angle]}
                  </div>
                  <div className="relative border overflow-hidden" style={{
                    borderColor: a.grade === 'almost_perfect' ? '#D0A030' : a.grade === 'good' ? '#22ab94' : a.imagePath ? '#582a72' : '#2a2a3e',
                    borderWidth: a.grade === 'almost_perfect' ? '2px' : '1px',
                    backgroundColor: '#111', width: '130px', aspectRatio: '3/4',
                  }}>
                    {a.imagePath ? (
                      <FaceCropImage src={a.imagePath} alt={ANGLE_LABELS[angle]} faceCrop />
                    ) : a.generating ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className="animate-pulse text-sm" style={{ color: '#7050A8', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
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
          {pickingFor && (
            <div className="mb-4 p-2" style={{ backgroundColor: '#0a0a18', border: '1px solid #D0A030' }}>
              <div className="text-xs uppercase tracking-wider mb-2" style={{ color: '#D0A030', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Assign a file to {ANGLE_LABELS[pickingFor]} — {availableAngleFiles.length} files available
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {availableAngleFiles.map(p => (
                  <div
                    key={p}
                    onClick={() => {
                      dispatch({ type: 'ANGLE_COMPLETE', angle: pickingFor, imagePath: p, seed: 0 });
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
          )}

          {/* Grading actions */}
          {state.step === 'angle_grading' && (
            <div className="flex flex-wrap gap-2 justify-center">
              {hasBadAngles && (
                <WizardButton onClick={() => dispatch({ type: 'REGEN_BAD_ANGLES' })} color="#7050A8" label="Regenerate Bad" />
              )}
              <WizardButton onClick={() => dispatch({ type: 'REGEN_ALL_ANGLES' })} color="#582a72" label="Redo All Angles" />
              {allGraded && hasAnyGood && (
                <>
                  <WizardButton onClick={() => generateBody()} color="#22ab94" label="See Full Body" />
                  <WizardButton onClick={() => dispatch({ type: 'SKIP_BODY' })} color="#444" label="Skip to Testing" />
                </>
              )}
              <WizardButton onClick={() => dispatch({ type: 'BACK_TO_FRONT' })} color="#333" label="Back to Face" />
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          STEP 4: Body Discovery
          ══════════════════════════════════════════════════════════ */}
      {state.step === 'body_discovery' && (
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
                Identity ({[state.lockedFace, ...ANGLE_KEYS.map(k => state.angles[k].imagePath)].filter(Boolean).length})
              </div>
              <div className="border p-1 grid grid-cols-2 gap-1" style={{ borderColor: '#D0A030', borderWidth: '2px', width: '140px', backgroundColor: '#111' }}>
                {state.lockedFace && (
                  <div className="border overflow-hidden" style={{ borderColor: '#D0A030', aspectRatio: '3/4' }}>
                    <img src={state.lockedFace} alt="Locked front" className="w-full h-full object-cover" />
                  </div>
                )}
                {ANGLE_KEYS.map(k => {
                  const p = state.angles[k].imagePath;
                  if (!p) return null;
                  return (
                    <div key={k} className="border overflow-hidden" style={{ borderColor: '#7050A8', aspectRatio: '3/4' }}>
                      <img src={p} alt={ANGLE_LABELS[k]} className="w-full h-full object-cover" />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Body */}
            <div className="flex flex-col items-center">
              <div className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8e7cc3', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                Full Body
              </div>
              <div className="relative border overflow-hidden" style={{ borderColor: state.bodyImage ? '#22ab94' : '#2a2a3e', width: '140px', aspectRatio: '3/4', backgroundColor: '#111' }}>
                {state.bodyImage ? (
                  <img src={state.bodyImage} alt="Full body" className="w-full h-full object-cover" />
                ) : state.bodyGenerating ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="animate-pulse text-sm" style={{ color: '#7050A8', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>Generating...</div>
                    <ElapsedTimer startTime={state.generationStartTime} />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {state.bodyImage && !state.bodyGenerating && (
            <div className="flex gap-2 justify-center">
              <WizardButton onClick={() => dispatch({ type: 'ADVANCE_TO_TEST' })} color="#22ab94" label="Accept — Test Identity" />
              <WizardButton onClick={() => generateBody()} color="#582a72" label="Retry Body" />
              <WizardButton onClick={() => dispatch({ type: 'BACK_TO_ANGLES' })} color="#333" label="Back to Angles" />
            </div>
          )}
          {!state.bodyImage && !state.bodyGenerating && (
            <div className="flex gap-2 justify-center">
              <WizardButton onClick={() => generateBody()} color="#22ab94" label="Generate Body" />
              <WizardButton onClick={() => dispatch({ type: 'BACK_TO_ANGLES' })} color="#333" label="Back to Angles" />
            </div>
          )}
        </div>
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
                borderColor={state.angles[k].grade === 'almost_perfect' ? '#D0A030' : '#22ab94'} />
            ))}
            {state.bodyImage && (
              <MiniFrame label="Body" imagePath={state.bodyImage} borderColor="#8e7cc3" />
            )}

            {/* Final portraits (show as they generate) */}
            {state.step === 'generating_final' && (
              <>
                {state.finalBust ? (
                  <MiniFrame label="Official Bust" imagePath={state.finalBust} borderColor="#22ab94" />
                ) : (
                  <MiniFramePlaceholder label="Official Bust" startTime={state.generationStartTime} />
                )}
                {state.finalFullBody ? (
                  <MiniFrame label="Official Body" imagePath={state.finalFullBody} borderColor="#22ab94" />
                ) : (
                  <MiniFramePlaceholder label="Official Body" startTime={state.finalBust ? state.generationStartTime : null} />
                )}
              </>
            )}
          </div>

          {state.step === 'persona_lock' && (
            <div className="flex gap-2 justify-center">
              <WizardButton onClick={generateFinalAndLock} color="#D0A030" textColor="#000" label="Lock Identity & Generate Portraits" />
              <WizardButton onClick={() => dispatch({ type: 'BACK_TO_ANGLES' })} color="#333" label="Back" />
            </div>
          )}
        </div>
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
      {debugInfo && <DebugPanel info={debugInfo} />}
    </div>
  );
}

// ============================================================
// Identity Test Step (separated for state isolation)
// ============================================================

function IdentityTestStep({ state, dispatch, onGenerateTest }: {
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
            style={{ backgroundColor: '#1a1a2e', color: '#ccc', border: '1px solid #582a72', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
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
            style={{ backgroundColor: '#1a1a2e', color: '#ccc', border: '1px solid #582a72', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
          >
            {COMPOSITION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <WizardButton
          onClick={() => onGenerateTest(steeringWords, composition)}
          color={state.testGenerating ? '#333' : '#7050A8'}
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
                <div className="border overflow-hidden" style={{ borderColor: '#582a72', width: '100px', aspectRatio: '3/4', backgroundColor: '#111' }}>
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
                    <div className="animate-pulse text-xs" style={{ color: '#7050A8', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>...</div>
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
        <WizardButton onClick={() => dispatch({ type: 'BACK_TO_ANGLES' })} color="#333" label="Back" />
      </div>
    </div>
  );
}

// ============================================================
// Shared Sub-components
// ============================================================

function GradeButton({ label, title, active, color, onClick }: {
  label: string; title: string; active: boolean; color: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} title={title}
      className="w-7 h-7 flex items-center justify-center text-sm transition-all"
      style={{
        backgroundColor: active ? color : '#1a1a2e',
        color: active ? '#000' : color,
        border: `1px solid ${active ? color : color + '60'}`,
        borderRadius: '3px', fontWeight: active ? 'bold' : 'normal',
      }}
      dangerouslySetInnerHTML={{ __html: label }}
    />
  );
}

function WizardButton({ onClick, color, textColor, label }: {
  onClick: () => void; color: string; textColor?: string; label: string;
}) {
  return (
    <button onClick={onClick}
      className="px-4 py-2 text-xs uppercase tracking-wider transition-colors"
      style={{
        fontFamily: 'var(--font-terminal), Consolas, monospace',
        backgroundColor: color, color: textColor || '#fff',
        border: `1px solid ${color}`, borderRadius: '2px',
      }}>
      {label}
    </button>
  );
}

function MiniFrame({ label, imagePath, borderColor }: { label: string; imagePath: string; borderColor: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-xs uppercase tracking-wider mb-1" style={{ color: borderColor, fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '8px' }}>
        {label}
      </div>
      <div className="border overflow-hidden" style={{ borderColor, width: '80px', aspectRatio: '3/4', backgroundColor: '#111' }}>
        <img src={imagePath} alt={label} className="w-full h-full object-cover" />
      </div>
    </div>
  );
}

function MiniFramePlaceholder({ label, startTime }: { label: string; startTime: number | null }) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-xs uppercase tracking-wider mb-1" style={{ color: '#444', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '8px' }}>
        {label}
      </div>
      <div className="relative border overflow-hidden" style={{ borderColor: '#2a2a3e', width: '80px', aspectRatio: '3/4', backgroundColor: '#111' }}>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="animate-pulse text-xs" style={{ color: '#7050A8', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>...</div>
          <ElapsedTimer startTime={startTime} />
        </div>
      </div>
    </div>
  );
}

/**
 * Displays a generated image cropped to the face region via CSS.
 * On hover, shows the full uncropped image in an overlay.
 * The actual file is stored uncropped (better for PuLID reference).
 */
function FaceCropImage({ src, alt, faceCrop }: { src: string; alt: string; faceCrop?: boolean }) {
  const [hoverOpen, setHoverOpen] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const handleMouseEnter = useCallback(() => {
    if (imgRef.current) {
      const rect = imgRef.current.getBoundingClientRect();
      // Position overlay to the right of the image, or left if too close to edge
      const x = rect.right + 10 + 400 > window.innerWidth ? rect.left - 410 : rect.right + 10;
      const y = Math.max(10, rect.top - 50);
      setPos({ x, y });
    }
    setHoverOpen(true);
  }, []);

  return (
    <>
      <div ref={imgRef} onMouseEnter={handleMouseEnter} onMouseLeave={() => setHoverOpen(false)}
        className="w-full h-full cursor-zoom-in">
        <img src={src} alt={alt}
          className="w-full h-full"
          style={faceCrop ? {
            objectFit: 'cover',
            objectPosition: 'center 20%',  // Face is usually upper-center in a portrait
          } : {
            objectFit: 'cover',
          }}
        />
      </div>
      {/* Full-size hover overlay */}
      {hoverOpen && (
        <div className="fixed z-50 border-2 shadow-2xl" style={{
          left: pos.x, top: pos.y,
          borderColor: '#D0A030', backgroundColor: '#000',
          maxWidth: '400px', maxHeight: '500px',
          pointerEvents: 'none',
        }}>
          <img src={src} alt={`${alt} (full)`} style={{ width: '100%', height: 'auto', display: 'block' }} />
        </div>
      )}
    </>
  );
}

function DebugPanel({ info }: { info: { prompt: string; negativePrompt: string; seed: number; timeMs: number; workflow: string; failures: string[]; refs: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border" style={{ borderColor: '#333', borderRadius: '3px', backgroundColor: '#0a0a15' }}>
      <button onClick={() => setOpen(!open)} className="w-full text-left px-2 py-1 flex justify-between items-center"
        style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px', color: '#555' }}>
        <span>Debug — Workflow: <span style={{ color: info.workflow.includes('controlnet') ? '#22ab94' : info.workflow.includes('pulid') ? '#D0A030' : '#E8585A' }}>{info.workflow}</span> | Seed: {info.seed} | {(info.timeMs / 1000).toFixed(1)}s</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-2" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px' }}>
          <div>
            <div style={{ color: '#22ab94' }}>PROMPT:</div>
            <div style={{ color: '#888', wordBreak: 'break-all' }}>{info.prompt}</div>
          </div>
          <div>
            <div style={{ color: '#E8585A' }}>NEGATIVE:</div>
            <div style={{ color: '#666', wordBreak: 'break-all' }}>{info.negativePrompt}</div>
          </div>
          {info.refs && (
            <div>
              <div style={{ color: '#8e7cc3' }}>REFS:</div>
              <div style={{ color: '#888', wordBreak: 'break-all' }}>{info.refs}</div>
            </div>
          )}
          {info.failures.length > 0 && (
            <div>
              <div style={{ color: '#D0A030' }}>FAILED WORKFLOWS:</div>
              {info.failures.map((f, i) => (
                <div key={i} style={{ color: '#E8585A', wordBreak: 'break-all' }}>{f}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ElapsedTimer({ startTime }: { startTime: number | null }) {
  const [elapsed, setElapsed] = React.useState(0);
  useEffect(() => {
    if (!startTime) { setElapsed(0); return; }
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [startTime]);
  if (!startTime) return null;
  return (
    <div className="mt-1 text-xs" style={{ color: '#555', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
      {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, '0')} / ~2:00
    </div>
  );
}
