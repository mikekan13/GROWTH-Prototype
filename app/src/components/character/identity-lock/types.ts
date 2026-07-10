// ============================================================
// Types
// ============================================================

export type AngleKey = 'three_quarter_left' | 'three_quarter_right' | 'profile_left' | 'profile_right';

export interface FrontCandidate {
  imagePath: string;
  seed: number;
  tier: 'sketch' | 'refined';  // sketch = Pass 1 low-res, refined = Pass 2 img2img final
}

export interface AngleResult {
  imagePath: string | null;
  seed: number | null;
  grade: 'bad' | 'good' | 'almost_perfect' | null;
  generating: boolean;
  error: string | null;
}

export interface TestImage {
  imagePath: string;
  steeringWords: string;
  composition: string;
  seed: number;
}

export type WizardStep =
  | 'front_discovery'     // Generate front face candidates, player picks one
  | 'angle_generation'    // Generate 4 angles using locked front as PuLID ref
  | 'angle_grading'       // Player grades each angle
  | 'body_discovery'      // Full body with PuLID reference
  | 'finetune'            // Edit body image with Kontext (clothes, hair, mods)
  | 'identity_test'       // Test with different outfits/poses/expressions
  | 'persona_lock'        // Final confirmation + lock
  | 'generating_final'    // Generating canonical portraits
  | 'complete';

export interface WizardState {
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
  bodyCandidates: { imagePath: string; seed: number }[];
  bodyGenerating: boolean;

  // Finetune (step 4.5) — Kontext edits on body image (iterative chain)
  finetuneHistory: { imagePath: string; prompt: string; paintData?: { mode: string; dataUrl: string } | null }[];
  finetuneGenerating: boolean;

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

export const ANGLE_KEYS: AngleKey[] = ['three_quarter_left', 'three_quarter_right', 'profile_left', 'profile_right'];
export const ANGLE_LABELS: Record<AngleKey, string> = {
  three_quarter_left: '3/4 Left',
  three_quarter_right: '3/4 Right',
  profile_left: 'Profile Left',
  profile_right: 'Profile Right',
};

export const COMPOSITION_OPTIONS = [
  { value: 'bust', label: 'Bust Portrait' },
  { value: 'half_body', label: 'Half Body' },
  { value: 'full_body', label: 'Full Body' },
  { value: 'action', label: 'Action Pose' },
];

export const TEST_PRESETS = [
  'plate armor, sword on hip',
  'leather armor, hooded cloak',
  'noble robes, gold jewelry',
  'battle stance, fierce expression',
  'serene expression, meditating',
  'ragged clothes, injured, bloodied',
];
