import { AngleKey, AngleResult, WizardState, WizardStep } from './types';
import { ANGLE_KEYS } from './types';

// ============================================================
// Reducer
// ============================================================

export function emptyAngle(): AngleResult {
  return { imagePath: null, seed: null, grade: null, generating: false, error: null };
}

export function initialState(): WizardState {
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
    bodyCandidates: [],
    bodyGenerating: false,
    finetuneHistory: [],
    finetuneGenerating: false,
    testImages: [],
    testGenerating: false,
    finalBust: null,
    finalFullBody: null,
    error: null,
    generationStartTime: null,
  };
}

export type Action =
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
  | { type: 'BODY_COMPLETE'; imagePath: string; seed?: number }
  | { type: 'BODY_ERROR'; error: string }
  | { type: 'SET_BODY_CANDIDATES'; candidates: { imagePath: string; seed: number }[] }
  | { type: 'ADVANCE_TO_FINETUNE' }
  // Finetune (Kontext edit)
  | { type: 'FINETUNE_GENERATING' }
  | { type: 'FINETUNE_COMPLETE'; imagePath: string; prompt: string; paintData?: { mode: string; dataUrl: string } | null }
  | { type: 'FINETUNE_RESET' }
  | { type: 'FINETUNE_UNDO' }
  | { type: 'FINETUNE_REROLL' }
  | { type: 'FINETUNE_BAKE_COMPLETE'; imagePath: string }
  | { type: 'FINETUNE_LOAD_SAVED'; imagePath: string; prompt: string }
  | { type: 'FINETUNE_ERROR'; error: string }
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

export function reducer(state: WizardState, action: Action): WizardState {
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
      // Perfect = lock selected face, proceed to body
      const idx = action.index ?? state.frontCandidates.length - 1;
      const latest = state.frontCandidates[idx];
      return {
        ...state,
        lockedFace: latest.imagePath,
        lockedSeed: latest.seed,
        step: 'body_discovery',
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
    case 'BODY_COMPLETE': {
      // Dedup by imagePath — prevents double-entries when existing scan + fresh generation race
      const alreadyHas = state.bodyCandidates.some(c => c.imagePath === action.imagePath);
      return {
        ...state,
        bodyGenerating: false,
        bodyImage: action.imagePath,
        bodyCandidates: alreadyHas ? state.bodyCandidates : [...state.bodyCandidates, { imagePath: action.imagePath, seed: action.seed ?? 0 }],
        generationStartTime: null,
      };
    }
    case 'BODY_ERROR':
      return { ...state, bodyGenerating: false, error: action.error, generationStartTime: null };
    case 'SET_BODY_CANDIDATES': {
      const latest = action.candidates[action.candidates.length - 1];
      return { ...state, bodyCandidates: action.candidates, bodyImage: latest?.imagePath ?? state.bodyImage };
    }
    case 'ADVANCE_TO_FINETUNE':
      return { ...state, step: 'finetune' };

    // ── Finetune (Kontext) ──
    case 'FINETUNE_GENERATING':
      return { ...state, finetuneGenerating: true, generationStartTime: Date.now(), error: null };
    case 'FINETUNE_COMPLETE':
      return { ...state, finetuneGenerating: false, finetuneHistory: [...(state.finetuneHistory || []), { imagePath: action.imagePath, prompt: action.prompt, paintData: action.paintData || null }], generationStartTime: null };
    case 'FINETUNE_RESET':
      return { ...state, finetuneHistory: [] };
    case 'FINETUNE_BAKE_COMPLETE':
      // After bake, replace the history with just the baked image (fresh baseline)
      return { ...state, finetuneGenerating: false, finetuneHistory: [{ imagePath: action.imagePath, prompt: '[baked]' }], generationStartTime: null };
    case 'FINETUNE_LOAD_SAVED':
      // Replace history with a saved layer as the new baseline
      return { ...state, finetuneHistory: [{ imagePath: action.imagePath, prompt: action.prompt }] };
    case 'FINETUNE_UNDO':
      return { ...state, finetuneHistory: (state.finetuneHistory || []).slice(0, -1) };
    case 'FINETUNE_REROLL': {
      // Remove last entry and start generating (the generate callback will add the new result)
      const hist = (state.finetuneHistory || []);
      return { ...state, finetuneHistory: hist.slice(0, -1), finetuneGenerating: true, generationStartTime: Date.now(), error: null };
    }
    case 'FINETUNE_ERROR':
      return { ...state, finetuneGenerating: false, error: action.error, generationStartTime: null };

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
