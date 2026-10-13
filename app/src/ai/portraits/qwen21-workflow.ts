/**
 * Qwen-Image-2.1 portraits: prompt builders + workflow assembly (pure, no I/O).
 *
 * Ruling 2026-10-13 (ruling-switch-to-qwen-image-2-1): TWO steps, never mixed.
 *   1. identity lock = photos + a SHORT prompt (no style paragraph)
 *   2. style pass    = lock as <image1> + style refs as <image2>.. "keep the face of <image1>"
 * Qwen follows a few sentences better than a paragraph, so every prompt here is
 * at most three sentences; only the style pass carries a style line, and that
 * line is trimmed to two sentences of getFlux2StyleProse() (subject-agnostic).
 */

import { getFlux2StyleProse, getFlux2Backdrop } from './style-config';

/** TextEncodeQwenImage21 exposes images.image_1..image_16. */
export const QWEN21_MAX_IMAGES = 16;
/** Style refs per style pass (lock = image_1, refs = image_2..6). */
export const QWEN21_MAX_STYLE_REFS = 5;
/** Template sampler from the ComfyUI Qwen-Image-2.1 template. */
export const QWEN21_STEPS = 25;
/** `resolution` = total pixel budget (INT), aspect follows image_1. Official default. */
export const QWEN21_RESOLUTION = 1024;
/** Body canvas: EmptyLatentImage replaces the encoder latent (A/B run C, worked). */
export const QWEN21_BODY_SIZE = { width: 832, height: 1216 } as const;

type Workflow = Record<string, Record<string, unknown>>;

/** "<image1>", "<image1> and <image2>", "<image1>, <image2> and <image3>" for slots from..to. */
export function imageTagList(from: number, to: number): string {
  const tags: string[] = [];
  for (let i = from; i <= to; i++) tags.push(`<image${i}>`);
  if (tags.length <= 1) return tags[0] ?? '';
  return `${tags.slice(0, -1).join(', ')} and ${tags[tags.length - 1]}`;
}

/** Step 1 — identity lock. Photos are <image1>..<imageN>. No style words. */
export function buildQwen21LockPrompt(photoCount: number, painted = false): string {
  const n = Math.max(1, Math.min(photoCount, QWEN21_MAX_IMAGES));
  if (!painted) {
    return (
      `A head-and-shoulders portrait of the person in ${imageTagList(1, n)}. ` +
      'Straight-on front view, eye-level, neutral expression, closed mouth, bare shoulders, no clothing. ' +
      'Blank flat uniform mid-grey backdrop, nothing else.'
    );
  }
  // Single-pass mode (2026-10-13): style in the SAME pass as the lock. A second
  // pass over a generated image added HDR grain and freckles every time
  // (iterative-edit degradation); the A/B's cleanest result was one pass on the photos.
  return (
    `A painted character illustration of the person in ${imageTagList(1, n)}, head and shoulders. ` +
    'Match their exact facial identity from the photos. ' +
    'Straight-on front view, eye-level, neutral expression, closed mouth, bare shoulders, no clothing. ' +
    'Smooth painted skin with a matte porcelain finish, clean soft shading, soft diffuse light, desaturated palette; no grain, no noise, no added freckles or skin texture. ' +
    'Blank flat uniform mid-grey backdrop, nothing else.' +
    (getQwen21StyleLine() ? ` ${getQwen21StyleLine()}` : '')
  );
}

/**
 * Two sentences of the shared FLUX.2 style paragraph: the medium (first
 * sentence) and the mood line. Read live so style edits flow through.
 */
export function getQwen21StyleLine(prose: string = getFlux2StyleProse()): string {
  const sentences = prose.match(/[^.]+\./g)?.map(s => s.trim()).filter(Boolean) ?? [];
  if (sentences.length === 0) return '';
  const mood = sentences.find(s => /^The mood is/i.test(s));
  const picked = mood && mood !== sentences[0] ? [sentences[0], mood] : sentences.slice(0, 2);
  return picked.join(' ');
}

/** Step 2 — style pass. Lock = <image1>, style refs = <image2>..<image(1+refCount)>. */
export function buildQwen21StylePrompt(styleRefCount: number, styleLine: string = getQwen21StyleLine()): string {
  const k = Math.max(0, Math.min(styleRefCount, QWEN21_MAX_STYLE_REFS));
  // 2026-10-13 smoke rev 2: "exact art style … brushwork, finish" read as a texture
  // overlay (HDR grain, blown-up freckles, weathered wall). Name the painted look
  // directly and forbid the texture. k = 0 → prose-only style pass (no style refs):
  // with refs attached Qwen copies their surface texture onto the skin.
  const inStyleOf = k > 0 ? ` in the style of ${imageTagList(2, k + 1)}` : '';
  return (
    `Repaint <image1> as a painted character illustration${inStyleOf}: smooth painted skin with a matte porcelain finish, clean soft shading, crisp edges, soft diffuse light, desaturated palette. ` +
    'Keep the face, head shape, skin tone, hair and framing of <image1> exactly. ' +
    'No grain, no noise, no added freckles or skin texture, no weathering. Blank flat mid-grey backdrop.' +
    (styleLine ? ` ${styleLine}` : '')
  );
}

const DEFAULT_UNDERCLOTHING = 'simple neutral underclothing with a clean minimal cut';

/** Full body from the styled bust (<image1>). Underclothing = character data. */
export function buildQwen21BodyPrompt(underclothing?: string): string {
  const under = (underclothing?.trim() || DEFAULT_UNDERCLOTHING).replace(/[.\s]+$/, '');
  return (
    'A full-length front view of the person in <image1> standing in a relaxed A-pose, arms at the sides, feet visible, ' +
    'with clear margin above the head and below the feet. ' +
    `Wearing ${under}; keep the face and hair of <image1> exactly. ` +
    getFlux2Backdrop('studio')
  );
}

/** Instruction edit on <image1>. */
export function buildQwen21EditPrompt(instruction: string): string {
  const t = instruction.trim();
  const ended = /[.!?]$/.test(t) ? t : `${t}.`;
  return `${ended} Change nothing else.`;
}

export interface Qwen21WorkflowOptions {
  prompt: string;
  /** Uploaded ComfyUI image names → images.image_1..N (in order). */
  images: string[];
  seed: number;
  steps?: number;
  resolution?: number;
  /** Explicit canvas (EmptyLatentImage); omit = use TEXT_ENCODE's latent. */
  size?: { width: number; height: number };
  filenamePrefix?: string;
}

/**
 * Assemble a runnable API-format workflow from qwen21-edit.json. LOAD_REF1 is
 * the template slot; one LoadImage per image is cloned from it and wired into
 * TEXT_ENCODE.inputs['images.image_N'].
 */
export function buildQwen21Workflow(template: Record<string, unknown>, opts: Qwen21WorkflowOptions): Workflow {
  if (opts.images.length < 1) throw new Error('Qwen-Image-2.1 workflow needs at least one image (image_1)');
  if (opts.images.length > QWEN21_MAX_IMAGES) {
    throw new Error(`Qwen-Image-2.1 takes at most ${QWEN21_MAX_IMAGES} images (got ${opts.images.length})`);
  }
  const wf = JSON.parse(JSON.stringify(template)) as Workflow;
  for (const key of Object.keys(wf)) if (key.startsWith('_')) delete wf[key];
  for (const k of ['LOAD_REF1', 'TEXT_ENCODE', 'SAMPLE', 'SAVE']) {
    if (!wf[k]) throw new Error(`qwen21 workflow template is missing node ${k}`);
  }

  const refTemplate = JSON.parse(JSON.stringify(wf.LOAD_REF1)) as Record<string, unknown>;
  const enc = wf.TEXT_ENCODE.inputs as Record<string, unknown>;
  for (const k of Object.keys(enc)) if (k.startsWith('images.')) delete enc[k];
  opts.images.forEach((name, idx) => {
    const id = `LOAD_REF${idx + 1}`;
    const node = JSON.parse(JSON.stringify(refTemplate)) as Record<string, unknown>;
    (node.inputs as Record<string, unknown>).image = name;
    wf[id] = node;
    enc[`images.image_${idx + 1}`] = [id, 0];
  });

  enc.prompt = opts.prompt;
  enc.negative_prompt = ''; // cfg 1 → unused (template note)
  enc.resolution = opts.resolution ?? QWEN21_RESOLUTION;

  const sample = wf.SAMPLE.inputs as Record<string, unknown>;
  sample.seed = opts.seed;
  sample.steps = opts.steps ?? QWEN21_STEPS;

  if (opts.size) {
    wf.EMPTY_LATENT = {
      class_type: 'EmptyLatentImage',
      inputs: { width: opts.size.width, height: opts.size.height, batch_size: 1 },
    };
    sample.latent_image = ['EMPTY_LATENT', 0];
  }

  if (opts.filenamePrefix) (wf.SAVE.inputs as Record<string, unknown>).filename_prefix = opts.filenamePrefix;
  for (const node of Object.values(wf)) delete node._meta;
  return wf;
}
