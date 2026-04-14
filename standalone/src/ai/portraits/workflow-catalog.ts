/**
 * Workflow catalog — maps portrait generation tasks to ComfyUI workflow JSON files.
 *
 * Authored during 2026-04-14 overnight mission. See `memory/overnight-log-2026-04-14.md`
 * for benchmarks + known compatibility caveats.
 *
 * All workflows target FLUX.1 Dev GGUF Q4_K_S on 8GB VRAM (RTX 4060 floor).
 */

import * as path from 'node:path';

const WORKFLOWS_DIR = path.resolve(process.cwd(), 'src/ai/portraits/workflows');

export type WorkflowKind =
  // Baseline 20-step Dev (quality, ~180s) — existing
  | 'portrait-baseline'
  // Baseline + PuLID identity lock — existing
  | 'portrait-pulid'
  // Hyper-FLUX 8-step + WaveSpeed FBCache (~76s warm, 2.38x speedup) — NEW
  | 'body-fast'
  // Face region inpaint with 19-label Segformer masks (~155s per region) — NEW
  | 'face-region-inpaint'
  // IP-Adapter-Flux (Shakker), CPU provider, 768×768 for 8GB (334s first, ~150s warm) — NEW
  | 'face-ipadapter'
  // IP-Adapter + Hyper-FLUX 8-step (120s, 2.77x vs IPA baseline) — NEW
  | 'face-ipadapter-fast'
  // OpenPose + ControlNet Union Pro 2 FP8 — NEW (scaffold, smoke test pending)
  | 'pose-controlnet'
  // Hair inpaint (legacy) — existing
  | 'hair-inpaint'
  // LivePortrait expression retargeting — NEW (BLOCKED: py3.13 face-detect deps)
  | 'liveportrait-smoke';

interface WorkflowMeta {
  file: string;
  purpose: string;
  typicalSeconds: number;
  vramMaxMb: number;
  quality: 'sketch' | 'draft' | 'final';
  status: 'production' | 'benchmarked' | 'scaffold' | 'blocked';
  notes?: string;
}

export const WORKFLOW_CATALOG: Record<WorkflowKind, WorkflowMeta> = {
  'portrait-baseline': {
    file: 'character-portrait.json',
    purpose: 'Vanilla 20-step body/portrait gen — default final tier.',
    typicalSeconds: 180,
    vramMaxMb: 6500,
    quality: 'final',
    status: 'production',
  },
  'portrait-pulid': {
    file: 'character-portrait-pulid.json',
    purpose: 'Portrait with PuLID identity lock (golden recipe).',
    typicalSeconds: 210,
    vramMaxMb: 7200,
    quality: 'final',
    status: 'production',
    notes: 'Requires C:/AI/ComfyUI/custom_nodes/ComfyUI-PuLID-Flux/pulidflux.py hair-label patch.',
  },
  'body-fast': {
    file: 'character-body-fast.json',
    purpose: 'Hyper-FLUX 8-step + WaveSpeed FBCache. For in-play equipment/mood regens.',
    typicalSeconds: 76,
    vramMaxMb: 6500,
    quality: 'draft',
    status: 'benchmarked',
    notes:
      'Requires patched C:/AI/ComfyUI/custom_nodes/Comfy-WaveSpeed/first_block_cache.py (forward_orig kwargs).',
  },
  'face-region-inpaint': {
    file: 'face-region-inpaint.json',
    purpose: 'Mask-driven region inpaint (eye color, beauty marks, mouth shape).',
    typicalSeconds: 155,
    vramMaxMb: 6500,
    quality: 'final',
    status: 'benchmarked',
    notes:
      'Pair with scripts/face_parse.py to generate masks from 19-label Segformer. CPU ONNX inference ~1.2s.',
  },
  'face-ipadapter': {
    file: 'character-face-ipadapter.json',
    purpose: 'Identity lock from a single reference photo (Shakker IPAdapter-Flux).',
    typicalSeconds: 334,
    vramMaxMb: 7800,
    quality: 'final',
    status: 'benchmarked',
    notes:
      'MUST run at 768×768 + provider=cpu on 8GB. Requires custom_nodes/ComfyUI-IPAdapter-Flux patches to utils.py and flux/layers.py. SigLIP cached at ~/.cache/huggingface/hub/.',
  },
  'face-ipadapter-fast': {
    file: 'character-face-ipadapter-fast.json',
    purpose: 'IPAdapter + Hyper-FLUX 8-step combo. In-play identity-locked regens.',
    typicalSeconds: 120,
    vramMaxMb: 7800,
    quality: 'draft',
    status: 'benchmarked',
    notes:
      'Cannot combine with WaveSpeed FBCache — DoubleStreamBlockIPA.forward() incompatible with FBCache patch stack. Drop node 33 if attempting.',
  },
  'pose-controlnet': {
    file: 'character-pose-controlnet.json',
    purpose: 'Full-body pose control via OpenPose + FLUX ControlNet Union Pro 2 FP8.',
    typicalSeconds: 90,
    vramMaxMb: 7000,
    quality: 'draft',
    status: 'scaffold',
    notes:
      'Untested end-to-end during overnight session. Uses controlnet_aux OpenposePreprocessor → LoadFluxControlNet → ApplyFluxControlNet → XlabsSampler. Requires pose_reference.png staged in ComfyUI/input/.',
  },
  'hair-inpaint': {
    file: 'hair-inpaint.json',
    purpose: 'Legacy hair-only inpaint — predates face-region-inpaint.',
    typicalSeconds: 60,
    vramMaxMb: 6000,
    quality: 'draft',
    status: 'production',
  },
  'liveportrait-smoke': {
    file: 'liveportrait-smoke.json',
    purpose: 'Expression/pose retargeting from a driving image via LivePortraitKJ.',
    typicalSeconds: 0,
    vramMaxMb: 0,
    quality: 'draft',
    status: 'blocked',
    notes:
      'BLOCKED on Python 3.13: mediapipe.framework C-extension absent, insightface.utils.transform missing, face_alignment relative-import fails. Needs py3.11-3.12 venv for ComfyUI.',
  },
};

export function workflowPath(kind: WorkflowKind): string {
  const meta = WORKFLOW_CATALOG[kind];
  return path.join(WORKFLOWS_DIR, meta.file);
}

export function pickWorkflow(opts: {
  task: 'portrait' | 'inpaint' | 'pose' | 'expression';
  identityRef?: boolean;
  fast?: boolean;
}): WorkflowKind {
  if (opts.task === 'inpaint') return 'face-region-inpaint';
  if (opts.task === 'pose') return 'pose-controlnet';
  if (opts.task === 'expression') return 'liveportrait-smoke';
  // portrait
  if (opts.identityRef && opts.fast) return 'face-ipadapter-fast';
  if (opts.identityRef) return 'face-ipadapter';
  if (opts.fast) return 'body-fast';
  return 'portrait-baseline';
}
