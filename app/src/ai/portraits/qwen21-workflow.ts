/**
 * Qwen-Image-2.1 portraits: prompt builders + workflow assembly (pure, no I/O).
 *
 * Ruling 2026-10-13 (ruling-switch-to-qwen-image-2-1): TWO steps, never mixed.
 *   1. identity lock = photos + a SHORT prompt (no style paragraph)
 *   2. style pass    = lock as <image1> + style refs as <image2>.. "keep the face of <image1>"
 * LIVE 13 Oct: single pass (photos + painted prompt) is the default; the two-step
 * second pass degrades. Style = three layers (style-config.ts): MEDIUM (fixed,
 * subject-agnostic) + MOOD (per campaign) here in the prompt, FINISH (finish.ts)
 * after the model. Qwen follows short prose, so MEDIUM is <= 4 sentences and a
 * mood is 2.
 */

import { GROWTH_MEDIUM, GROWTH_MEDIUM_TRAINING, GROWTH_MEDIUM_GOLD, GROWTH_MEDIUM_REMINDER, getCampaignMood, getFlux2Backdrop } from './style-config';

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
/**
 * The base lock's own canvas (Mike, 14 Oct: "we need everyone to be same framing and pose"). Without an explicit
 * size the output copies the reference photo's aspect — a tall 2:3 phone shot invites a chest-down bust and every
 * character got a different frame. 4:5 is the passport head-and-shoulders ratio; /16 on both sides.
 */
export const QWEN21_LOCK_SIZE = { width: 832, height: 1040 } as const;

type Workflow = Record<string, Record<string, unknown>>;

/** "<image1>", "<image1> and <image2>", "<image1>, <image2> and <image3>" for slots from..to. */
export function imageTagList(from: number, to: number): string {
  const tags: string[] = [];
  for (let i = from; i <= to; i++) tags.push(`<image${i}>`);
  if (tags.length <= 1) return tags[0] ?? '';
  return `${tags.slice(0, -1).join(', ')} and ${tags[tags.length - 1]}`;
}

const LOCK_BACKDROP = 'Blank flat uniform mid-grey backdrop, nothing else.';

/**
 * Step 1 — identity lock. Photos are <image1>..<imageN>.
 * painted=false: photo-real reference, no style words (two-step modes).
 * painted=true (single-pass, the DEFAULT look since 2026-10-13): identity/framing
 * sentences + MEDIUM + MOOD + backdrop in ONE pass. A second pass over a generated
 * image added HDR grain and freckles every time (iterative-edit degradation).
 * `mood` = a mood key or genre (style-config resolveMoodKey; unset → 'growth').
 * `medium` overrides GROWTH_MEDIUM (style lab --medium-file only).
 */
/**
 * COMPOSITION layer for the BASE lock (Mike ruled 2026-10-13: "for the base I want to
 * keep the framing and pose exact regardless of character"; angles come later as
 * derived views). Fixed for every character and species. Passport-photo wording is
 * what Qwen obeys most reliably.
 */
// Trimmed (sheet 8): the binding text had grown long enough to drown the style words.
// Mike (14 Oct, LoRA at 0.9 with the medium stripped): the style LoRA's prior pulls wider, chest-down busts and the
// gate passed one — the crop's BOTTOM edge is now stated outright ("ends just below the collarbones") in both the
// composition and the closer, and the gate checks it.
export const LOCK_COMPOSITION =
  'Composed exactly like a passport photo: facing the camera squarely, head upright and centred, both ears visible, shoulders level, ' +
  // "the frame ending just below the collarbones" painted a literal grey bar across the bottom (seed 8 sweep) — say "cropped".
  'head and shoulders with a little space above the head, cropped just below the collarbones so no chest or torso is in view, ' +
  'neutral expression, closed mouth, eyes straight into the camera; no tilt, no lean, no three-quarter view. ' +
  'Nothing is worn: bare skin from the collarbones up, no clothing, no choker, no jewellery.';

/** Short restatement appended at the very END of the lock prompt (recency wins against style words). */
export const LOCK_CLOSER = 'Unclothed with bare shoulders, facing the camera squarely, head level, cropped just below the collarbones.';

/**
 * The one realism line from the GOLD medium, kept when the rest of the medium is stripped for the style LoRA
 * (Mike, 14 Oct: "I want just a bit more photo realism"). The rest of that paragraph pulled costume and pose; this
 * sentence is the "double-take" dial. Empty medium + LoRA → this rides right after the identity line.
 */
export const LOCK_REALISM = 'Lifelike and photographic in its detail — real skin texture, true proportions and natural eyes — so refined it almost passes for a photograph of a real person.';

// Tried (14 Oct) and rolled back: a "lifelike portrait … painted with photographic realism" lead ("that went too far") and a
// firmer "Photographic realism: pores, catchlights, lit like a photograph" line (also too far). THIS wording + the
// "painted character illustration" lead + LoRA 0.75 + ink at 75% = the best so far (style-refs/lab/2026-10-14-ink-mid/lora-0.75-realism).

/**
 * POSE / FRAME REFERENCE clause (Mike, 14 Oct: "We need it to be solid for the base. Do the reference"). Qwen-Image-Edit
 * 2509+ (and 2.1) natively take a ControlNet-style KEYPOINT MAP as an input image ("Make the person in Image 1 copy the
 * exact pose from Image 2"). The lock feeds an OpenPose skeleton of the passport bust as its LAST image. A photoreal
 * mannequin in that slot became the subject (14 Oct test) — a coloured stick figure cannot. `tag` is that image's <imageN>.
 */
export function lockFrameRefClause(tag: string): string {
  // v2 wording (14 Oct): the first run inset the portrait inside a grey border — the painting must fill the canvas.
  return `Make the person copy the exact pose and framing of the pose skeleton in ${tag}: the head, eyes, ears and shoulders exactly where the skeleton's keypoints are, the same head size, the same head-and-shoulders crop. The painting fills the whole canvas edge to edge, no border, no inset, no inner frame. ${tag} is a keypoint map only; draw no skeleton, lines or dots in the picture.`;
}

export function buildQwen21LockPrompt(photoCount: number, painted = false, mood?: string, medium: string = GROWTH_MEDIUM, opts: { frameRef?: boolean } = {}): string {
  // With a frame reference the photos are <image1>..<imageN-1> and the mannequin is <imageN>.
  const total = Math.max(1, Math.min(photoCount, QWEN21_MAX_IMAGES));
  const n = opts.frameRef ? Math.max(1, total - 1) : total;
  const frameTag = opts.frameRef ? `<image${total}>` : '';
  if (!painted) {
    return (
      `A head-and-shoulders portrait of the person in ${imageTagList(1, n)}. ` +
      LOCK_COMPOSITION + ' ' +
      (frameTag ? lockFrameRefClause(frameTag) + ' ' : '') +
      LOCK_BACKDROP
    );
  }
  // Order: identity → composition → MEDIUM → mood → backdrop → closer. Sheet 9 proved that putting the
  // medium first makes the style win outright (all seeds dressed, seated, off-pose): the look words
  // carry period costume and pose. Composition stays first; the ink LINES come from the finish layer.
  const loraLook = !medium.trim(); // the LoRA carries the look: the realism dial rides instead of the medium
  return [
    `A painted character illustration of the person in ${imageTagList(1, n)}, head and shoulders.`,
    'Match their exact facial identity from the photos.',
    loraLook ? LOCK_REALISM : '',
    LOCK_COMPOSITION,
    frameTag ? lockFrameRefClause(frameTag) : '',
    medium.trim(),
    getCampaignMood(mood),
    LOCK_BACKDROP,
    LOCK_CLOSER,
  ].filter(Boolean).join(' ');
}

/**
 * Text-only base (no photos): a described subject in the fixed base composition. Used by the
 * style lab to build a DIVERSE training set for the style LoRA (Mike, 13 Oct: "generate").
 * The description is the only subject-specific text; everything else is the fixed stack.
 */
export function buildQwen21DescribePrompt(
  description: string,
  mood?: string,
  medium: string = GROWTH_MEDIUM,
  opts: { training?: boolean; styleRef?: boolean; contentRef?: boolean; lead?: string } = {},
): string {
  const d = description.trim().replace(/[.\s]+$/, '');
  // opts.lead (lab only): replaces the default lead sentence; "{d}" is substituted with the description.
  const customLead = opts.lead ? opts.lead.replace('{d}', d) : undefined;
  if (opts.training && opts.contentRef) {
    // CONTENT-REF training mode (Mike, 13 Oct: "none of these match the style or fidelity of our golden image"):
    // the gold came from a real photo in the reference slot + the look-first medium on OUR lane. So: a plain
    // photo-real content image is <image1>, the model keeps its subject/pose/clothing/setting and repaints it.
    // The medium is the GOLD paragraph verbatim (Mike: "same seed, prompt and also some style reference").
    // Optional <image2> = a headless/greyscale style reference (proven not to bleed its subject).
    const goldMedium = medium === GROWTH_MEDIUM ? GROWTH_MEDIUM_GOLD : medium;
    return [
      customLead ?? `A painted character illustration of exactly the subject in <image1>${d ? ` (${d})` : ''}: keep the same person or subject, face, pose, expression, clothing, framing and setting as <image1>.`,
      opts.styleRef ? '<image2> is only a style reference: use its art style, ink linework, painted shading, finish, palette and lighting, and nothing else from it.' : '',
      goldMedium.trim(),
      getCampaignMood(mood),
    ].filter(Boolean).join(' ');
  }
  if (opts.training) {
    // TRAINING-SET mode (Mike, 13 Oct: a style LoRA "needs fabric and scenes"): the LOOK words lead
    // (that is what produces the gold-standard linework), free pose, clothing and setting come from
    // the description, no passport binding. These images train the LoRA; they are never base locks.
    // styleRef: the gold-standard image is <image1>; copy its art style only.
    const trainingMedium = medium === GROWTH_MEDIUM ? GROWTH_MEDIUM_TRAINING : medium;
    // Style-ref phrasing variants (QWEN21_STYLEREF_PHRASING): 'instyle' = the InStyle-LoRA idiom
    // "Make an image in this style of …" (reference first, subject after); default = explicit role clause.
    const instyle = process.env.QWEN21_STYLEREF_PHRASING === 'instyle';
    const lead = customLead ?? (opts.styleRef && instyle
      ? `Make an image in this style of ${d}. <image1> is only a style reference: use its art style, ink linework, painted shading, palette and lighting, and nothing else from it.`
      : `A painted character illustration of ${d}.`);
    const refClause = opts.styleRef && !instyle
      ? 'Painted in exactly the art style of <image1>: the same ink linework, painted shading, finish, palette and lighting. Do not copy the person, face, hair, clothing, pose or framing of <image1>.'
      : '';
    return [
      lead,
      refClause,
      trainingMedium.trim(),
      getCampaignMood(mood),
      'Half-length or head-and-shoulders portrait with a natural pose and expression.',
    ].filter(Boolean).join(' ');
  }
  return [
    `A painted character illustration of ${d}, head and shoulders.`,
    LOCK_COMPOSITION,
    medium.trim(),
    getCampaignMood(mood),
    LOCK_BACKDROP,
    LOCK_CLOSER,
  ].filter(Boolean).join(' ');
}

/** MEDIUM + MOOD as one line (two-step style pass / body). Subject-agnostic. */
export function getQwen21StyleLine(mood?: string, medium: string = GROWTH_MEDIUM): string {
  return [medium.trim(), getCampaignMood(mood)].filter(Boolean).join(' ');
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

/**
 * The body step is ALWAYS underwear only (Mike 2026-10-17: "every body step is rendered just in
 * underwear"). The old default "simple neutral underclothing" painted Kristopher in a tee, jeans and
 * sneakers, so the default names the garments and the bare skin around them outright.
 */
export function defaultUnderwear(gender?: string): string {
  return isMale(gender) ? 'plain fitted grey boxer briefs'
    : isFemale(gender) ? 'a plain grey bra and plain grey briefs'
      // No sex on the sheet: underwear nouns only — "bandeau top" painted Kristopher a tee (17 Oct).
      : 'plain grey briefs and a plain grey bandeau bra';
}
const isMale = (g?: string) => /^(m|male|man)$/i.test((g ?? '').trim());
const isFemale = (g?: string) => /^(f|female|woman)$/i.test((g ?? '').trim());

/**
 * Full body from the styled bust (<image1>), in underwear only. Underclothing = character data.
 * POSITIVE words only: "no shirt" painted a white tee on Kristopher (17 Oct) — a named garment is
 * drawn even when it is forbidden, as with FLUX. The bare skin is named instead.
 */
export function buildQwen21BodyPrompt(underclothing?: string, mood?: string, gender?: string): string {
  const under = (underclothing?.trim() || defaultUnderwear(gender)).replace(/[.\s]+$/, '');
  const skin = isMale(gender)
    ? 'Bare-chested: bare torso, bare shoulders, bare arms, bare legs and bare feet'
    : 'Bare midriff, bare shoulders, bare arms, bare legs and bare feet';
  return (
    'A full-length front view of the person in <image1> standing in a relaxed A-pose, arms at the sides, feet visible, ' +
    'with clear margin above the head and below the feet. ' +
    `${skin}, wearing only ${under}. ` +
    'Keep the face and hair of <image1> exactly. ' +
    `${getQwen21StyleLine(mood)} ` +
    getFlux2Backdrop('studio')
  );
}

/** Instruction edit on <image1>: the instruction, a ONE-clause medium reminder, the mood, "Change nothing else." */
export function buildQwen21EditPrompt(instruction: string, mood?: string): string {
  const t = instruction.trim();
  const ended = /[.!?]$/.test(t) ? t : `${t}.`;
  const reminder = GROWTH_MEDIUM_REMINDER.charAt(0).toUpperCase() + GROWTH_MEDIUM_REMINDER.slice(1);
  return `${ended} ${reminder}. ${getCampaignMood(mood)} Change nothing else.`;
}

/**
 * POLISH (Mike, 15 Oct: "once the user is happy with the face and body they should hit approve and it should
 * re-render the face and body to fix any errors… a clean re-render to fix any artifacts or weird things because
 * of the compositing"). The approved image is <image1> AND the init latent (resumeFrom at QWEN21_POLISH_AT):
 * the model finishes the last stretch of the generation from the picture itself, in one consistent hand.
 * No medium paragraph — the style LoRA carries the look.
 */
export function buildQwen21PolishPrompt(mood?: string): string {
  return [
    'A painted character illustration of exactly the subject in <image1>: keep the same person, face, hair, marks, pose, expression, clothing, framing, backdrop and lighting as <image1>.',
    'Finished and consistent everywhere: one continuous brushwork and finish across the whole picture, every edge and transition clean; no seams, patches, smudges, blur, doubled lines or artifacts.',
    getCampaignMood(mood),
  ].filter(Boolean).join(' ');
}

/**
 * How far through the generation the polish resumes (fraction of steps kept from the image; the rest is re-run).
 * Violet lab, 15 Oct: 0.7 and 0.6 left a faint remnant of a composite patch on the wall, 0.55 cleaned it fully with
 * identity and marks intact → 0.55.
 */
export function qwen21PolishAtFromEnv(): number {
  const n = Number(process.env.QWEN21_POLISH_AT);
  return Number.isFinite(n) && n > 0.2 && n < 0.95 ? n : 0.55;
}

// ============================================================
// Community style-LoRA stack (2026-10-13)
// ============================================================

/** One LoRA in the blend. `file` = name under ComfyUI models/loras (/runpod-volume/models/loras). */
export interface Qwen21Lora {
  file: string;
  strength: number;
  /** Trigger word the LoRA was trained on (cine1p, Inklingv2) — prepended to the prompt. */
  trigger?: string;
}

/**
 * Parse a LoRA spec: `file:strength[:trigger],file:strength[:trigger]`, e.g.
 * `cine1p_c1-st4000.safetensors:0.7:cine1p,Inklingv2-qwen21_c1-st6000.safetensors:0.25:Inklingv2`.
 * Empty / undefined → []. Throws on a malformed entry (strength 0–2, *.safetensors, bare file name).
 */
export function parseQwen21Loras(spec: string | undefined | null): Qwen21Lora[] {
  if (!spec || !spec.trim()) return [];
  return spec.split(',').map(s => s.trim()).filter(Boolean).map(entry => {
    const parts = entry.split(':').map(p => p.trim());
    if (parts.length < 2 || parts.length > 3) throw new Error(`LoRA spec "${entry}": expected file:strength[:trigger]`);
    const [file, strengthStr, trigger] = parts;
    if (!/\.safetensors$/i.test(file)) throw new Error(`LoRA spec "${entry}": file must end with .safetensors`);
    if (/[\\/]/.test(file)) throw new Error(`LoRA spec "${entry}": file must be a bare name (no path separators)`);
    if (!/^\d+(\.\d+)?$|^\.\d+$/.test(strengthStr)) throw new Error(`LoRA spec "${entry}": strength must be a number`);
    const strength = Number(strengthStr);
    if (!(strength >= 0 && strength <= 2)) throw new Error(`LoRA spec "${entry}": strength must be between 0 and 2`);
    if (parts.length === 3 && !trigger) throw new Error(`LoRA spec "${entry}": empty trigger`);
    return trigger ? { file, strength, trigger } : { file, strength };
  });
}

/** Back to the spec string (round-trips parseQwen21Loras). '' for none. */
export function formatQwen21Loras(loras: readonly Qwen21Lora[] | undefined): string {
  return (loras ?? []).map(l => `${l.file}:${l.strength}${l.trigger ? `:${l.trigger}` : ''}`).join(',');
}

/** Short human label for sheets: "cine1p 0.7 + Inklingv2 0.25" (trigger, else file stem). '' for none. */
export function qwen21LoraLabel(loras: readonly Qwen21Lora[] | undefined): string {
  return (loras ?? []).map(l => `${l.trigger ?? l.file.replace(/\.safetensors$/i, '')} ${l.strength}`).join(' + ');
}

/**
 * THE GROWTH STYLE LoRA (grwthpaint v1, trained 13 Oct on the 130-image approved corpus).
 * Mike (14 Oct, Violet seed-8 strength sheet): "we will sit at 60% lora with stripped prompt" — the
 * medium paragraph comes OUT of the lock prompt when this LoRA is active (see buildQwen21LockPrompt
 * callers); the trigger word carries the look. Lives on the volume at models/loras.
 */
export const GROWTH_STYLE_LORA_TRIGGER = 'grwthpaint';
export const GROWTH_STYLE_LORA_FILE = 'grwthpaint_v1.safetensors';
/** Mike (14 Oct, after the seed-21499 check): "just set the lora to 90% for every gen", then "90 was too much. Lets try 70%", then "bring the lora down to 65%", then with the finish layer OFF "crank the lora back to 90%", then with the pose skeleton in "drop our lora to 70%", then with mid-generation ink "set lora to 75%", then "set lora to .70 and ink at 80%" — one strength, every step. */
export const GROWTH_STYLE_LORA: Qwen21Lora = { file: GROWTH_STYLE_LORA_FILE, strength: 0.7, trigger: GROWTH_STYLE_LORA_TRIGGER };

/** True when the blend carries the GROWTH style LoRA (any strength). */
export function hasGrowthStyleLora(loras: readonly Qwen21Lora[] | undefined): boolean {
  return (loras ?? []).some(l => l.trigger === GROWTH_STYLE_LORA_TRIGGER || l.file === GROWTH_STYLE_LORA_FILE);
}

/**
 * The env default (QWEN21_LORAS). UNSET → [GROWTH_STYLE_LORA] (grwthpaint_v1 at 0.7, the 14 Oct
 * baseline, for every generation); set to "" / "none" → no LoRAs; any other value → that blend.
 */
export function qwen21LorasFromEnv(): Qwen21Lora[] {
  const env = process.env.QWEN21_LORAS;
  if (env === undefined) return [GROWTH_STYLE_LORA];
  if (env.trim().toLowerCase() === 'none') return [];
  return parseQwen21Loras(env);
}

/** A LoRA start fraction clamped to [0, 0.9]; NaN/undefined → 0 (LoRA on for every step). */
export function clampLoraStart(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v) || v <= 0) return 0;
  return Math.min(0.9, v);
}

/** The env default for the LoRA start (QWEN21_LORA_START, a fraction 0–0.9). Unset/invalid → QWEN21_LORA_START_DEFAULT. */
export const QWEN21_LORA_START_DEFAULT = 0;
export function qwen21LoraStartFromEnv(): number {
  const env = process.env.QWEN21_LORA_START;
  if (env === undefined || env.trim() === '') return QWEN21_LORA_START_DEFAULT;
  return clampLoraStart(Number(env));
}

/**
 * MID-GENERATION INK for the live base lock (Mike, 14 Oct: "set lora to .70 and ink at 80%"): the lock stops at this
 * fraction, the finish ink (lines only, FINISH.ink) is drawn on the clean midpoint, and the lock resumes from the inked
 * image to the end — see Qwen21WorkflowOptions.stopAt/resumeFrom. Env QWEN21_LOCK_INK_AT (fraction; "off"/0 = plain
 * single-pass lock). Best-so-far recipe: style-refs/lab/2026-10-14-ink-mid/lora-0.75-realism (then 0.7 / 80%).
 */
export const QWEN21_LOCK_INK_AT_DEFAULT = 0.8;
export function qwen21LockInkAtFromEnv(): number {
  const env = process.env.QWEN21_LOCK_INK_AT;
  if (env === undefined || env.trim() === '') return QWEN21_LOCK_INK_AT_DEFAULT;
  if (env.trim().toLowerCase() === 'off') return 0;
  return clampLoraStart(Number(env));
}

/** Prepend each LoRA trigger once, in order, as "<t1>, <t2>, <prompt>". Triggers already leading the prompt are not repeated. */
export function applyQwen21LoraTriggers(prompt: string, loras: readonly Qwen21Lora[] | undefined): string {
  const triggers: string[] = [];
  for (const l of loras ?? []) if (l.trigger && !triggers.includes(l.trigger)) triggers.push(l.trigger);
  if (triggers.length === 0) return prompt;
  const prefix = triggers.map(t => `${t}, `).join('');
  return prompt.startsWith(prefix) ? prompt : prefix + prompt;
}

export interface Qwen21WorkflowOptions {
  prompt: string;
  /** Community style LoRAs, chained UNET → LORA_1 → … → (old UNET consumers). Omitted/[] = unchanged workflow. */
  loras?: Qwen21Lora[];
  /**
   * LoRA START (Mike, 14 Oct: "can the lora start later? after the base prompt has created the form"): the fraction
   * of the denoising steps that run on the BARE model before the LoRA chain takes over. Composition is settled in the
   * early high-noise steps, so 0.3 = the first 30% of steps frame the image without the style, the rest paint it.
   * 0 / omitted = the LoRA is on for every step (single sampler, unchanged workflow).
   */
  loraStart?: number;
  /** Uploaded ComfyUI image names → images.image_1..N (in order). */
  images: string[];
  seed: number;
  steps?: number;
  resolution?: number;
  /** Explicit canvas (EmptyLatentImage); omit = use TEXT_ENCODE's latent. */
  size?: { width: number; height: number };
  filenamePrefix?: string;
  /**
   * MID-GENERATION INK (Mike, 14 Oct: "halfway through the generation make the lines and then just have the generation
   * continue with the lines in place"). Two jobs share one seed/prompt/LoRA:
   *   stopAt: fraction — job A runs steps [0, k) and SNAPS to the model's clean prediction at k (KSamplerAdvanced,
   *           return_with_leftover_noise=disable), i.e. a soft early image to draw the ink on;
   *   resumeFrom: {image, at} — job B VAE-encodes that inked image, RE-NOISES it to step k's level (add_noise=enable,
   *           start_at_step=k) and runs [k, N) to the end. Composition, identity refs and the skeleton stay in the
   *           conditioning; the ink lines are now part of the picture the model finishes.
   */
  stopAt?: number;
  resumeFrom?: { image: string; at: number };
}

/**
 * Assemble a runnable API-format workflow from qwen21-edit.json. LOAD_REF1 is
 * the template slot; one LoadImage per image is cloned from it and wired into
 * TEXT_ENCODE.inputs['images.image_N'].
 */
export function buildQwen21Workflow(template: Record<string, unknown>, opts: Qwen21WorkflowOptions): Workflow {
  // Zero images = pure text-to-image; it then needs an explicit canvas (EmptyLatentImage).
  if (opts.images.length < 1 && !opts.size) throw new Error('Qwen-Image-2.1 workflow needs at least one image (image_1) or an explicit size');
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
  if (opts.images.length === 0) delete wf.LOAD_REF1; // text-to-image: no reference slot at all
  opts.images.forEach((name, idx) => {
    const id = `LOAD_REF${idx + 1}`;
    const node = JSON.parse(JSON.stringify(refTemplate)) as Record<string, unknown>;
    (node.inputs as Record<string, unknown>).image = name;
    wf[id] = node;
    enc[`images.image_${idx + 1}`] = [id, 0];
  });

  enc.prompt = applyQwen21LoraTriggers(opts.prompt, opts.loras);
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

  // Mid-generation ink: job A (stopAt) or job B (resumeFrom) — a KSamplerAdvanced in place of the KSampler.
  const stopAt = clampLoraStart(opts.stopAt);
  const resumeAt = opts.resumeFrom ? clampLoraStart(opts.resumeFrom.at) : 0;
  if (stopAt > 0 || (opts.resumeFrom && resumeAt > 0)) {
    const steps = Number(sample.steps);
    const k = Math.min(steps - 1, Math.max(1, Math.round(steps * (stopAt || resumeAt))));
    const shared = {
      model: sample.model, positive: sample.positive, negative: sample.negative, cfg: sample.cfg,
      sampler_name: sample.sampler_name, scheduler: sample.scheduler, steps, noise_seed: sample.seed,
    };
    if (stopAt > 0) {
      wf.SAMPLE = {
        class_type: 'KSamplerAdvanced',
        inputs: { ...shared, latent_image: sample.latent_image, add_noise: 'enable', start_at_step: 0, end_at_step: k, return_with_leftover_noise: 'disable' },
      };
    } else {
      wf.LOAD_INIT = { class_type: 'LoadImage', inputs: { image: opts.resumeFrom!.image } };
      wf.VAE_ENCODE = { class_type: 'VAEEncode', inputs: { pixels: ['LOAD_INIT', 0], vae: ['VAE', 0] } };
      wf.SAMPLE = {
        class_type: 'KSamplerAdvanced',
        inputs: { ...shared, latent_image: ['VAE_ENCODE', 0], add_noise: 'enable', start_at_step: k, end_at_step: 10000, return_with_leftover_noise: 'disable' },
      };
    }
  }

  const loraStart = clampLoraStart(opts.loraStart);
  if (opts.loras && opts.loras.length > 0 && loraStart === 0) {
    if (!wf.UNET) throw new Error('qwen21 workflow template is missing node UNET (needed for LoRAs)');
    // Rewire every consumer of the DiT (CACHE.model today) to the end of the LoRA chain.
    const last = `LORA_${opts.loras.length}`;
    for (const node of Object.values(wf)) {
      const inputs = node.inputs as Record<string, unknown> | undefined;
      if (!inputs) continue;
      for (const [k, v] of Object.entries(inputs)) {
        if (Array.isArray(v) && v.length === 2 && v[0] === 'UNET' && v[1] === 0) inputs[k] = [last, 0];
      }
    }
    opts.loras.forEach((l, i) => {
      wf[`LORA_${i + 1}`] = {
        class_type: 'LoraLoaderModelOnly',
        inputs: { lora_name: l.file, strength_model: l.strength, model: [i === 0 ? 'UNET' : `LORA_${i}`, 0] },
      };
    });
  } else if (opts.loras && opts.loras.length > 0) {
    // TWO-STAGE sampling: SAMPLE_A runs steps [0, k) on the bare (cached) model and hands its leftover noise to
    // SAMPLE, which runs [k, N) on the LoRA chain patched onto the SAME cached model (CACHE → LORA_1 → … → LORA_n),
    // so the DiT is loaded once. Both stages share the conditioning, seed, sampler and schedule.
    if (!wf.CACHE) throw new Error('qwen21 workflow template is missing node CACHE (needed for a LoRA start)');
    const last = `LORA_${opts.loras.length}`;
    opts.loras.forEach((l, i) => {
      wf[`LORA_${i + 1}`] = {
        class_type: 'LoraLoaderModelOnly',
        inputs: { lora_name: l.file, strength_model: l.strength, model: [i === 0 ? 'CACHE' : `LORA_${i}`, 0] },
      };
    });
    const steps = Number(sample.steps);
    const k = Math.min(steps - 1, Math.max(1, Math.round(steps * loraStart)));
    const shared = {
      positive: sample.positive, negative: sample.negative, cfg: sample.cfg,
      sampler_name: sample.sampler_name, scheduler: sample.scheduler, steps, noise_seed: sample.seed,
    };
    wf.SAMPLE_A = {
      class_type: 'KSamplerAdvanced',
      inputs: { ...shared, model: ['CACHE', 0], latent_image: sample.latent_image, add_noise: 'enable', start_at_step: 0, end_at_step: k, return_with_leftover_noise: 'enable' },
    };
    wf.SAMPLE = {
      class_type: 'KSamplerAdvanced',
      inputs: { ...shared, model: [last, 0], latent_image: ['SAMPLE_A', 0], add_noise: 'disable', start_at_step: k, end_at_step: 10000, return_with_leftover_noise: 'disable' },
    };
  }

  if (opts.filenamePrefix) (wf.SAVE.inputs as Record<string, unknown>).filename_prefix = opts.filenamePrefix;
  for (const node of Object.values(wf)) delete node._meta;
  return wf;
}
