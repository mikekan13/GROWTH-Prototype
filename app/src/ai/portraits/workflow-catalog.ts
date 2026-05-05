/**
 * Workflow catalog — maps portrait pipeline stages to ComfyUI workflow JSONs.
 *
 * All workflows target FLUX.2 Dev (fp8 mixed transformer + fp8 Mistral-3 text
 * encoder + small-decoder VAE) on an H100 80 GB pod. Legacy FLUX.1 workflows
 * (PuLID/InfiniteYou/ControlNet/Kontext/Fill) were removed 2026-04-21 —
 * FLUX.2's multi-reference + SetLatentNoiseMask cover every use case.
 */

import * as path from 'node:path';

const WORKFLOWS_DIR = path.resolve(process.cwd(), 'src/ai/portraits/workflows');

export type WorkflowKind =
  | 'flux2-t2i'                  // Plain text-to-image (no refs, no pose template)
  | 'flux2-face-multiref'        // Face identity gen from N refs (no pose lock)
  | 'flux2-face-posed-multiref'  // Face + pose template (Canny-stripped) + N identity refs
  | 'flux2-body-posed-multiref'  // Full-body + pose template + N identity refs
  | 'flux2-edit-reference'       // Whole-image edit (Kontext replacement)
  | 'flux2-edit-masked';         // Masked edit / inpaint / fill via SetLatentNoiseMask

interface WorkflowMeta {
  file: string;
  purpose: string;
  typicalSeconds: number;
  quality: 'final';
  notes?: string;
}

export const WORKFLOW_CATALOG: Record<WorkflowKind, WorkflowMeta> = {
  'flux2-t2i': {
    file: 'flux2-t2i.json',
    purpose: 'Plain text-to-image. Smoke test / ideation gen with no refs.',
    typicalSeconds: 20,
    quality: 'final',
  },
  'flux2-face-multiref': {
    file: 'flux2-face-multiref.json',
    purpose: 'Face identity gen from 1–5 reference images. No pose template.',
    typicalSeconds: 55,
    quality: 'final',
    notes: 'Used when the caller wants identity but no pose constraint.',
  },
  'flux2-face-posed-multiref': {
    file: 'flux2-face-posed-multiref.json',
    purpose:
      'Face identity gen — pose/framing locked by angle-specific pose-ref template ' +
      '(public/portraits/pose-refs/{angle}.png), identity driven by 1–5 reference images.',
    typicalSeconds: 80,
    quality: 'final',
    notes: 'Primary face path. Pose template is Canny-stripped inside the workflow so it contributes structure only.',
  },
  'flux2-body-posed-multiref': {
    file: 'flux2-body-posed-multiref.json',
    purpose:
      'Full-body gen — pose/framing locked by FrontBodyPose.png (Canny), identity ' +
      'driven by 1–5 reference images (locked face + user uploads). 1024×1536 default.',
    typicalSeconds: 90,
    quality: 'final',
    notes: 'Replaced the old FLUX.1 Fill body pipeline.',
  },
  'flux2-edit-reference': {
    file: 'flux2-edit-reference.json',
    purpose: 'Whole-image edit — source ref anchors identity + composition, prompt drives the change.',
    typicalSeconds: 25,
    quality: 'final',
    notes: 'Default finetune path. No mask — prompt targets what changes.',
  },
  'flux2-edit-masked': {
    file: 'flux2-edit-masked.json',
    purpose: 'Mask-confined edit. SetLatentNoiseMask resamples only painted pixels; rest is pixel-locked.',
    typicalSeconds: 25,
    quality: 'final',
    notes: 'Mask-aware inpaint/fill path for FLUX.2 Dev (no dedicated Fill model needed).',
  },
};

export function getWorkflowPath(kind: WorkflowKind): string {
  return path.join(WORKFLOWS_DIR, WORKFLOW_CATALOG[kind].file);
}
