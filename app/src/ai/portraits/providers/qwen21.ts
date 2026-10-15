import 'server-only';

/**
 * Qwen-Image-2.1 portrait provider (RunPod serverless, ruling 2026-10-13).
 *
 * Same transport as the FLUX.2 serverless path (ServerlessProvider: /run
 * payload uploads, /status polling, base64 outputs, endpoint error mapping) —
 * only the endpoint id (RUNPOD_QWEN_ENDPOINT_ID) and the generation steps differ.
 *
 * TWO-STEP portraits, never mixing identity photos and style refs in one call
 * (style refs + photos together → the style refs' faces win):
 *   lockIdentity  photos → short prompt → blank-grey identity lock   (faces/)
 *   applyStyle    lock <image1> + style refs <image2..6> → styled bust (faces/)
 *   generateBody  styled bust <image1> → full-length A-pose on the studio wall (bodies/)
 *   edit          instruction edit on <image1>; masks are applied by
 *                 post-compositing (TextEncodeQwenImage21 has no mask input)
 *
 * Selected by getLocalProvider() when PORTRAIT_PROVIDER=qwen21 (provider-flag.ts).
 *
 * Style = three layers (style-config.ts / finish.ts): MEDIUM + MOOD in the prompt
 * (mood = input.campaignStyle.styleMood, filled from Campaign.genre by
 * portrait-service; default 'growth'), FINISH applied to every saved output.
 * The raw model output is saved beside it at <dir>/raw/<name>.png and is what
 * chained steps (style pass, body, edits) consume — never finish twice.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import type { PortraitInput, PortraitMetadata, PortraitResult } from '../types';
import { ServerlessProvider } from './serverless';
import { PortraitEndpointError } from '@/lib/errors';
import {
  QWEN21_BODY_SIZE,
  QWEN21_LOCK_SIZE,
  QWEN21_MAX_IMAGES,
  QWEN21_MAX_STYLE_REFS,
  QWEN21_STEPS,
  buildQwen21BodyPrompt,
  buildQwen21EditPrompt,
  buildQwen21LockPrompt,
  buildQwen21DescribePrompt,
  buildQwen21StylePrompt,
  buildQwen21Workflow,
  formatQwen21Loras,
  getQwen21StyleLine,
  hasGrowthStyleLora,
  qwen21LorasFromEnv,
  qwen21LoraStartFromEnv,
  qwen21LockInkAtFromEnv,
  type Qwen21Lora,
} from '../qwen21-workflow';
import { buildCorpusContentPrompt } from '../corpus-prompts';
import { compositeEditWithMask } from '../mask-composite';
import { LOCALIZE_FEATHER, localizeMask, type Localized } from '../edit-localize';
import { finishEnabled, finishImage, inkImage, rawSiblingPath } from '../finish';
import { resolveMoodKey } from '../style-config';
import { checkBaseLock, lockGateEnabled, type LockGateMeta, type LockGateVerdict } from '../lock-gate';
import { photoPrepEnabled, prepSiblingPath } from '../photo-prep';

/** Re-rolls after a failed base-lock gate (seed S → S+1 → S+2). */
export const LOCK_GATE_MAX_RETRIES = 2;

const WORKFLOW_NAME = 'qwen21-edit';
const MODEL_NAME = 'qwen-image-2.1-int8';
/** The lock's pose skeleton (OpenPose keypoint map of the face-tight passport frame), drawn by scripts/lock-pose-skeleton.ts. */
const LOCK_POSE_REF_PATH = 'src/ai/portraits/refs/lock-pose-grey.png';
/** undefined = not read yet; null = missing (warned once). */
let lockPoseRefCache: Buffer | null | undefined;
const STYLE_REF_DIM = 1024;
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

/**
 * Style mode. 'single' (DEFAULT since 2026-10-13): the lock pass carries the painted
 * look; no second pass. 'refs': two-step with style reference images. 'prose':
 * two-step, prompt-only second pass. Both two-step modes added HDR grain and
 * freckles on every run (a second pass over a generated image degrades it).
 */
export function qwen21StyleMode(): 'single' | 'refs' | 'prose' {
  const m = (process.env.QWEN21_STYLE_MODE || 'single').toLowerCase();
  return m === 'refs' || m === 'prose' ? m : 'single';
}

/** The three old gens used for the 2026-10-13 A/B (style-refs/inbox/Old Gens). */
export const QWEN21_FALLBACK_STYLE_REFS = [
  '22f7507e-988d-4023-912f-db48613a11b0.png',
  '5f154145-fe3c-4184-8f05-f46f354cfefb.png',
  '078408e2-a87a-4c94-8e32-dfdc68901a35.png',
  // 2026-10-13 smoke: the horned/grime bust (ed7cdb10) pulled grain, freckles and a
  // weathered wall into the style pass → swapped for a clean bust. Keep refs clean-skinned.
];

/**
 * Style refs, resolved at runtime (never copied into app/public):
 * style-refs/approved/* (first 5, sorted) if any exist, else the three A/B old gens.
 * `repoRoot` defaults to the parent of app/ (process.cwd() is app/ under Next + scripts).
 */
export async function resolveQwen21StyleRefs(repoRoot: string = path.resolve(process.cwd(), '..')): Promise<string[]> {
  const approvedDir = path.join(repoRoot, 'style-refs', 'approved');
  try {
    const files = (await fs.readdir(approvedDir)).filter(f => IMAGE_EXT.test(f)).sort();
    if (files.length > 0) return files.slice(0, QWEN21_MAX_STYLE_REFS).map(f => path.join(approvedDir, f));
  } catch { /* no approved dir yet */ }

  const oldGens = path.join(repoRoot, 'style-refs', 'inbox', 'Old Gens');
  const found: string[] = [];
  for (const f of QWEN21_FALLBACK_STYLE_REFS) {
    const p = path.join(oldGens, f);
    try { await fs.access(p); found.push(p); } catch { /* missing */ }
  }
  return found;
}

/** A stored, generated portrait (an existing lock) vs. an uploaded photo. */
export function isStoredPortraitPath(webPath: string): boolean {
  return /^\/?portraits\//.test(webPath.replace(/\\/g, '/'));
}

export interface Qwen21StepResult {
  imagePath: string;
  thumbnailPath: string;
  /** FINISHED image (what the app shows). Equals rawData when GROWTH_FINISH=off. */
  imageData: Buffer;
  /** RAW model output — chained into later steps (never finish twice) and saved under raw/. */
  rawData: Buffer;
  /** Web path of the raw copy: <dir>/raw/<name>.png. */
  rawPath: string;
  seed: number;
  prompt: string;
  width: number;
  height: number;
  generationTimeMs: number;
  /** Base-lock gate result (painted lock only). */
  gate?: LockGateMeta;
}

/** A source image: a web path under public/ or an in-memory buffer (previous step's output). */
export type Qwen21Image = string | Buffer;

export class Qwen21Provider extends ServerlessProvider {
  override name = 'runpod-serverless-qwen21';

  protected override endpointId(): string | undefined {
    return process.env.RUNPOD_QWEN_ENDPOINT_ID;
  }

  /** Instance-wide LoRA blend (scripts' --loras); undefined → QWEN21_LORAS env. */
  private loraOverride?: Qwen21Lora[];

  /** Override the env LoRA blend for every later call on this instance ([] = no LoRAs, undefined = env). */
  setLoras(loras: Qwen21Lora[] | undefined): void {
    this.loraOverride = loras;
  }

  /** The LoRA blend a call uses: explicit per-call → instance override → QWEN21_LORAS env (unset = grwthpaint_v1 at 0.7). */
  activeLoras(explicit?: Qwen21Lora[]): Qwen21Lora[] {
    return explicit ?? this.loraOverride ?? qwen21LorasFromEnv();
  }

  /**
   * The lock's default POSE REFERENCE: src/ai/portraits/refs/lock-pose-grey.png (drawn by scripts/lock-pose-skeleton.ts),
   * an OpenPose keypoint map of the face-tight passport frame on mid-grey. Read once; missing file or
   * QWEN21_LOCK_POSE_REF=off → no reference (the old prompt-only lock). Overridable for tests.
   */
  protected async defaultLockPoseRef(): Promise<Buffer | undefined> {
    if ((process.env.QWEN21_LOCK_POSE_REF ?? 'on').trim().toLowerCase() === 'off') return undefined;
    if (lockPoseRefCache === undefined) {
      try {
        lockPoseRefCache = await fs.readFile(path.join(process.cwd(), LOCK_POSE_REF_PATH));
      } catch (e) {
        console.warn(`[Qwen21] lock pose reference missing (${LOCK_POSE_REF_PATH}): ${(e as Error).message} — locking without it`);
        lockPoseRefCache = null;
      }
    }
    return lockPoseRefCache ?? undefined;
  }

  // ============================================================
  // The four steps
  // ============================================================

  /**
   * The lock pass WITHOUT saving: photos (web paths under public/ or buffers) → raw model
   * output + the prompt used. The style lab calls this directly.
   */
  async renderLock(
    photos: Qwen21Image[],
    seed: number,
    opts?: {
      painted?: boolean; mood?: string; medium?: string; loras?: Qwen21Lora[]; size?: { width: number; height: number }; frameRef?: Qwen21Image | false;
      /** Mid-generation ink (lab): job A stops at a fraction; job B resumes from an (inked) image at that fraction. */
      stage?: { stopAt?: number; resumeFrom?: { image: Qwen21Image; at: number } };
    },
  ): Promise<{ raw: Buffer; prompt: string; loras: Qwen21Lora[] }> {
    // POSE REFERENCE (Mike, 14 Oct): the OpenPose skeleton of the fixed face-tight passport frame rides as the LAST
    // image by default (QWEN21_LOCK_POSE_REF=off or opts.frameRef=false disables; an explicit image replaces it).
    const frameRef: Qwen21Image | undefined = opts?.frameRef === false ? undefined : (opts?.frameRef ?? await this.defaultLockPoseRef());
    const used = photos.slice(0, frameRef ? QWEN21_MAX_IMAGES - 1 : QWEN21_MAX_IMAGES);
    if (used.length === 0) throw new Error('lockIdentity needs at least one reference photo');
    const names: string[] = [];
    for (let i = 0; i < used.length; i++) {
      const p = used[i];
      // Stored uploads go through the PHOTO PREPARER (face-tight passport crop, photo-prep.ts) — the `.prep.jpg`
      // sibling written at upload, or prepared now for older uploads. Buffers (lab) are the caller's business.
      names.push(Buffer.isBuffer(p) ? await this.uploadImage(p, `qwen21-photo-${i + 1}`) : await this.uploadReferenceImage(await this.preferPrepared(p)));
    }
    if (frameRef) {
      names.push(Buffer.isBuffer(frameRef) ? await this.uploadImage(frameRef, 'qwen21-lock-pose') : await this.uploadReferenceImage(frameRef));
    }
    // QWEN21_STYLE_MODE=single → the lock pass carries the painted look itself (no second pass).
    const painted = opts?.painted ?? qwen21StyleMode() === 'single';
    // Mike (14 Oct): with the GROWTH style LoRA active the MEDIUM paragraph is stripped — the trigger word
    // carries the look, and the medium words only pull costume/pose at low strengths (Violet seed-8 sheet).
    const loras = this.activeLoras(opts?.loras);
    const medium = opts?.medium ?? (hasGrowthStyleLora(loras) ? '' : undefined);
    const prompt = buildQwen21LockPrompt(names.length, painted, opts?.mood, medium, { frameRef: !!frameRef });
    let stage: { stopAt?: number; resumeFrom?: { image: string; at: number } } | undefined;
    if (opts?.stage?.resumeFrom) {
      const init = opts.stage.resumeFrom.image;
      const name = Buffer.isBuffer(init) ? await this.uploadImage(init, 'qwen21-ink-mid', { jpeg: true }) : await this.uploadReferenceImage(init);
      stage = { resumeFrom: { image: name, at: opts.stage.resumeFrom.at } };
    } else if (opts?.stage?.stopAt) {
      stage = { stopAt: opts.stage.stopAt };
    }
    // Fixed canvas: the lock never inherits the photo's aspect (QWEN21_LOCK_SIZE, 4:5 passport frame).
    return { raw: await this.runWorkflow(prompt, names, seed, opts?.size ?? QWEN21_LOCK_SIZE, loras, stage), prompt, loras };
  }

  /**
   * The live lock render: MID-GENERATION INK when QWEN21_LOCK_INK_AT > 0 (default 0.8 — Mike, 14 Oct: "set lora to .70
   * and ink at 80%"): stop at that fraction, draw the finish ink (lines only, FINISH.ink) on the clean midpoint, resume
   * from the inked image to the end — two jobs, one seed, one LoRA strength throughout. 0/off → the plain single-pass
   * renderLock. Returns the final raw (what the gate judges and lockIdentity saves).
   */
  async renderLockInked(
    photos: Qwen21Image[],
    seed: number,
    opts?: { painted?: boolean; mood?: string; medium?: string; loras?: Qwen21Lora[]; frameRef?: Qwen21Image | false; inkAt?: number },
  ): Promise<{ raw: Buffer; prompt: string; loras: Qwen21Lora[]; inkAt: number }> {
    const inkAt = opts?.inkAt ?? qwen21LockInkAtFromEnv();
    if (!(inkAt > 0)) return { ...(await this.renderLock(photos, seed, opts)), inkAt: 0 };
    const soft = await this.renderLock(photos, seed, { ...opts, stage: { stopAt: inkAt } });
    const inked = await inkImage(soft.raw);
    const done = await this.renderLock(photos, seed, { ...opts, stage: { resumeFrom: { image: inked, at: inkAt } } });
    return { ...done, inkAt };
  }

  /**
   * V1 GROWTH STYLE, text-to-image (Mike, 14 Oct: "Calling this v1 growth style… generating 7 diverse images… the first
   * 7 into our running training data"): no photos, no skeleton — a described subject on an explicit canvas, the style
   * LoRA at its default strength and the same MID-GENERATION INK as the lock (stop at inkAt, ink the clean midpoint,
   * resume). Nothing is saved; the caller owns the files (scripts/style-v1-set.ts).
   */
  async renderStyled(
    prompt: string,
    seed: number,
    size: { width: number; height: number },
    opts?: { inkAt?: number; loras?: Qwen21Lora[]; images?: Qwen21Image[] },
  ): Promise<{ raw: Buffer; soft?: Buffer; inked?: Buffer; inkAt: number }> {
    const inkAt = opts?.inkAt ?? qwen21LockInkAtFromEnv();
    const refs = opts?.images ?? [];
    if (!(inkAt > 0)) return { raw: await this.runWorkflow(prompt, await this.uploadRefs(refs), seed, size, opts?.loras), inkAt: 0 };
    const soft = await this.runStyledStage(prompt, seed, size, { stopAt: inkAt }, opts?.loras, refs);
    const inked = await inkImage(soft);
    const raw = await this.runStyledStage(prompt, seed, size, { resumeFrom: { image: inked, at: inkAt } }, opts?.loras, refs);
    return { raw, soft, inked, inkAt };
  }

  /** One stage of a styled render (lab): stop at a fraction, or resume from an (inked) image at it. `refs` = <image1..N>. */
  async runStyledStage(
    prompt: string,
    seed: number,
    size: { width: number; height: number },
    stage: { stopAt: number } | { resumeFrom: { image: Buffer; at: number } },
    loras?: Qwen21Lora[],
    refs: Qwen21Image[] = [],
  ): Promise<Buffer> {
    const names = await this.uploadRefs(refs);
    if ('stopAt' in stage) return this.runWorkflow(prompt, names, seed, size, loras, { stopAt: stage.stopAt });
    const name = await this.uploadImage(stage.resumeFrom.image, 'qwen21-ink-mid', { jpeg: true });
    return this.runWorkflow(prompt, names, seed, size, loras, { resumeFrom: { image: name, at: stage.resumeFrom.at } });
  }

  private async uploadRefs(refs: Qwen21Image[]): Promise<string[]> {
    const names: string[] = [];
    for (let i = 0; i < refs.length; i++) {
      const r = refs[i];
      names.push(Buffer.isBuffer(r) ? await this.uploadImage(r, `qwen21-ref-${i + 1}`, { maxDim: 1024 }) : await this.uploadReferenceImage(r));
    }
    return names;
  }

  /**
   * Step 1 — identity lock from reference photos (web paths under public/).
   *
   * BASE-LOCK GATE (single/painted mode): each render is judged on the LOCAL vision
   * model (lock-gate.ts) against the fixed base composition. Fail → re-roll with
   * seed S+1, then S+2 (deterministic). First pass wins; all fail → the best-scoring
   * attempt, flagged. Only the chosen attempt is saved. QWEN21_LOCK_GATE=off bypasses.
   * Painted locks render through renderLockInked (mid-generation ink, QWEN21_LOCK_INK_AT).
   */
  async lockIdentity(
    characterId: string,
    photos: string[],
    seed: number,
    opts?: { painted?: boolean; mood?: string },
  ): Promise<Qwen21StepResult> {
    const t0 = Date.now();
    const painted = opts?.painted ?? qwen21StyleMode() === 'single';
    if (!painted) {
      const { raw, prompt, loras } = await this.renderLock(photos, seed, opts);
      return this.saveStep(characterId, 'faces', 'identity-lock', prompt, raw, seed, Date.now() - t0, opts?.mood, { loras });
    }
    if (!lockGateEnabled()) {
      const { raw, prompt, loras, inkAt } = await this.renderLockInked(photos, seed, { ...opts, painted });
      const r = await this.saveStep(characterId, 'faces', 'identity-lock', prompt, raw, seed, Date.now() - t0, opts?.mood, { loras, inkAt });
      return { ...r, gate: { pass: true, reasons: ['gate off'], attempts: 1, seed, score: 1, bypassed: true } };
    }

    let best: { raw: Buffer; prompt: string; loras: Qwen21Lora[]; inkAt: number; seed: number; verdict: LockGateVerdict } | null = null;
    let attempts = 0;
    for (let i = 0; i <= LOCK_GATE_MAX_RETRIES; i++) {
      const s = seed + i;
      const { raw, prompt, loras, inkAt } = await this.renderLockInked(photos, s, { ...opts, painted });
      attempts++;
      const verdict = await this.checkLock(raw);
      console.log(`[Qwen21] lock gate seed=${s}: ${verdict.pass ? 'PASS' : 'FAIL'} ${verdict.reasons.join('; ')}`);
      if (!best || verdict.score > best.verdict.score) best = { raw, prompt, loras, inkAt, seed: s, verdict };
      if (verdict.pass) { best = { raw, prompt, loras, inkAt, seed: s, verdict }; break; }
    }
    const chosen = best!;
    const r = await this.saveStep(characterId, 'faces', 'identity-lock', chosen.prompt, chosen.raw, chosen.seed, Date.now() - t0, opts?.mood, { loras: chosen.loras, inkAt: chosen.inkAt });
    return {
      ...r,
      gate: { pass: chosen.verdict.pass, reasons: chosen.verdict.reasons, attempts, seed: chosen.seed, score: chosen.verdict.score },
    };
  }

  /** The base-lock check (local vision only). Overridable for tests. */
  protected checkLock(raw: Buffer): Promise<LockGateVerdict> {
    return checkBaseLock(raw);
  }

  /**
   * Text-only base from a description (no photos) in the fixed base composition — for the
   * style lab's diverse LoRA training set. Same stack as the painted lock minus the identity refs.
   */
  async describeBase(
    characterId: string,
    description: string,
    seed: number,
    mood?: string,
    opts: { training?: boolean; styleRefPath?: string; contentRefPath?: string; loras?: Qwen21Lora[]; medium?: string; lead?: string; size?: { width: number; height: number } } = {},
  ): Promise<Qwen21StepResult> {
    const images: string[] = [];
    if (opts.contentRefPath) {
      images.push(await this.uploadStyleRef(opts.contentRefPath, 0));
      if (opts.styleRefPath) images.push(await this.uploadStyleRef(opts.styleRefPath, 1)); // <image2> style ref
    } else if (opts.styleRefPath) {
      images.push(await this.uploadStyleRef(opts.styleRefPath, 0));
    }
    // opts.medium: an explicit medium paragraph (e.g. the frozen GOLD text) instead of the mode's default.
    const prompt = buildQwen21DescribePrompt(description, mood, opts.medium, {
      training: opts.training,
      contentRef: !!opts.contentRefPath,
      styleRef: !!opts.styleRefPath,
      lead: opts.lead,
    });
    // opts.size: output dims (e.g. matched to the content image's aspect); default = the base-lock portrait.
    return this.runStep(characterId, 'faces', opts.training ? 'describe-training' : 'describe-base', prompt, images, seed, opts.size ?? { width: 832, height: 1248 }, mood, { loras: opts.loras });
  }

  /**
   * CORPUS CONTENT (style-LoRA corpus, content half): plain text-to-image with NO style stack —
   * no medium, no mood, no refs, no finish. The prompt is the corpus entry plus a neutral clarity
   * line; the size is explicit (EmptyLatentImage). The RAW output is the deliverable — a separate
   * style-transfer pass (QwenStyle on a pod) re-renders it in the GROWTH style later.
   */
  async generateContent(
    characterId: string,
    prompt: string,
    seed: number,
    size: { width: number; height: number },
  ): Promise<Qwen21StepResult> {
    // Plain content by design: no style LoRAs either (the env blend would leak the look into the corpus).
    return this.runStep(characterId, 'corpus', 'content', buildCorpusContentPrompt(prompt), [], seed, size, undefined, { finish: false, loras: [] });
  }

  /** Step 2 — paint the lock in the GROWTH style from style refs (absolute paths; default = resolveQwen21StyleRefs()). */
  async applyStyle(characterId: string, lockImage: Qwen21Image, seed: number, styleRefs?: string[], mood?: string): Promise<Qwen21StepResult> {
    // QWEN21_STYLE_MODE=prose → no style refs; the look comes from the prompt alone.
    // 2026-10-13 smoke: with refs attached, Qwen copies their surface texture (grain,
    // freckles, mottled wall) onto the skin regardless of the prompt.
    const proseOnly = qwen21StyleMode() === 'prose';
    const refs = proseOnly ? [] : (styleRefs ?? (await this.defaultStyleRefs())).slice(0, QWEN21_MAX_STYLE_REFS);
    if (!proseOnly && refs.length === 0) {
      throw new Error('No style refs found (style-refs/approved/ or style-refs/inbox/Old Gens/) — the style pass needs at least one (or set QWEN21_STYLE_MODE=prose)');
    }
    const lockName = await this.uploadImage(lockImage, `qwen21-lock-${seed}`);
    const refNames: string[] = [];
    for (let i = 0; i < refs.length; i++) refNames.push(await this.uploadStyleRef(refs[i], i));
    const prompt = buildQwen21StylePrompt(refNames.length, getQwen21StyleLine(mood));
    return this.runStep(characterId, 'faces', 'styled-bust', prompt, [lockName, ...refNames], seed, undefined, mood);
  }

  /** Full body from the styled bust (portrait canvas via EmptyLatentImage). Pass the RAW bust buffer or a stored path. */
  async generateBody(characterId: string, styledBust: Qwen21Image, seed: number, underclothing?: string, mood?: string): Promise<Qwen21StepResult> {
    const bustName = await this.uploadImage(styledBust, `qwen21-bust-${seed}`);
    const prompt = buildQwen21BodyPrompt(underclothing, mood);
    return this.runStep(characterId, 'bodies', 'body', prompt, [bustName], seed, { ...QWEN21_BODY_SIZE }, mood);
  }

  /**
   * Instruction edit on a base image. The model always edits the WHOLE frame
   * (no mask input on TextEncodeQwenImage21), so the canvas is pinned to the
   * base's size and the result is alpha-composited over the base: through the
   * painted mask when one is given, else — `localize` (designer edits, Mike
   * 2026-10-15) — through a mask found by edit-localize (vision box → pixel
   * diff → none, in which case the whole repaint is kept and reported).
   */
  async edit(
    characterId: string,
    baseImage: string,
    instruction: string,
    seed: number,
    mask?: { dataUrl: string; feather?: number },
    mood?: string,
    localize = false,
  ): Promise<Qwen21StepResult & { localized?: Localized }> {
    // Edit the RAW base when one exists, so the finish is applied once, not compounded.
    const baseWeb = await this.preferRaw(await this.fullResWebPath(baseImage));
    const baseName = await this.uploadReferenceImage(baseWeb);
    const baseBuf = await fs.readFile(this.publicAbs(baseWeb));
    const baseMeta = await sharp(baseBuf).metadata();
    const size = baseMeta.width && baseMeta.height ? { width: baseMeta.width, height: baseMeta.height } : undefined;
    const prompt = buildQwen21EditPrompt(instruction, mood);
    const t0 = Date.now();
    // NO style LoRA on an edit (Mike, 15 Oct: "maybe edits don't need it anyways"): the base already
    // carries the look; the LoRA only restyles the patch and pulls the repaint away from the base.
    // QWEN21_EDIT_LORA=on restores the active blend.
    const loras = process.env.QWEN21_EDIT_LORA === 'on' ? undefined : [];
    let out = await this.runWorkflow(prompt, [baseName], seed, size, loras);
    let localized: Localized | undefined;
    let stage = 'edit';
    if (mask?.dataUrl) {
      const maskBuf = Buffer.from(mask.dataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      out = await compositeEditWithMask(baseBuf, out, maskBuf, mask.feather ?? 20);
      stage = 'masked-edit';
    } else if (localize) {
      // Keep the pure repaint beside the result (lab reruns of the localizer need it).
      await this.saveRepaint(characterId, seed, out);
      const found = await localizeMask(baseBuf, out, instruction);
      localized = found.how;
      if (found.mask) {
        out = await compositeEditWithMask(baseBuf, found.edited, found.mask, LOCALIZE_FEATHER);
        stage = `local-edit-${found.how}`;
      }
      console.log(`[Qwen21] edit localized: ${found.how}`);
    }
    const r = await this.saveStep(characterId, 'finetune', stage, prompt, out, seed, Date.now() - t0, mood);
    return localized ? { ...r, localized } : r;
  }

  // ============================================================
  // Route entry points (same signatures as LocalProvider)
  // ============================================================

  /**
   * Bust: no lock yet (refs are uploaded photos) → lockIdentity → applyStyle;
   * an existing lock (a stored /portraits/... image) → applyStyle on it.
   * full_body: generateBody on the locked/styled bust.
   */
  override async generatePortrait(input: PortraitInput): Promise<PortraitResult> {
    const startTime = Date.now();
    const seed = input.overrides?.seed ?? Math.floor(Math.random() * 2147483647);
    try {
      const seen = new Set<string>();
      const refs = [input.personaLock?.referenceImagePath, ...(input.personaLock?.referenceImagePaths ?? [])]
        .filter((r): r is string => !!r && !seen.has(r) && !!seen.add(r));
      if (refs.length === 0) throw new Error('Portrait generation requires at least one reference image');
      // MOOD layer: portrait-service fills styleMood from Campaign.genre; unset → 'growth'.
      const mood = resolveMoodKey({ styleMood: input.campaignStyle?.styleMood });

      if (input.overrides?.composition === 'full_body') {
        const body = await this.generateBody(input.characterId, refs[0], seed, input.characterData?.identity?.underclothing, mood);
        return this.toResult(body, Date.now() - startTime, `qwen21 body: bust=${refs[0]} mood=${mood}`);
      }

      const hasLock = isStoredPortraitPath(refs[0]);
      const lock = hasLock ? null : await this.lockIdentity(input.characterId, refs, seed, { mood });
      // single mode: the painted lock IS the styled bust (second pass over a generated image degrades it)
      const single = qwen21StyleMode() === 'single';
      const styled = single && lock ? lock : await this.applyStyle(input.characterId, lock ? lock.rawData : refs[0], seed, undefined, mood);
      return this.toResult(
        styled,
        Date.now() - startTime,
        hasLock
          ? `qwen21 style pass on existing lock ${refs[0]}`
          : `qwen21 two-step: ${refs.length} photo(s) → lock ${lock!.imagePath} → styled`,
        {
          mood,
          rawPath: styled.rawPath,
          ...(lock ? { lockPrompt: lock.prompt, lockImagePath: lock.imagePath } : {}),
          ...(lock?.gate ? { gate: lock.gate } : {}),
        },
      );
    } catch (e) {
      if (e instanceof PortraitEndpointError) throw e;
      console.error('[Qwen21] generatePortrait failed:', e);
      return {
        success: false,
        metadata: this.meta('', seed, 0, 0, Date.now() - startTime),
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /** /api/portraits/edit entry point. Object-pull refs are not supported on Qwen yet. */
  override async editImage(
    sourceImagePath: string,
    editPrompt: string,
    options?: {
      seed?: number;
      guidance?: number;
      characterId?: string;
      paintData?: { mode: string; dataUrl: string; feather?: number };
      objectRefImagePath?: string;
      mood?: string;
      localize?: boolean;
    },
  ): Promise<PortraitResult> {
    const seed = options?.seed ?? Math.floor(Math.random() * 2147483647);
    if (options?.objectRefImagePath) {
      return {
        success: false,
        metadata: this.meta(editPrompt, seed, 0, 0, 0),
        error: 'Object-reference edits are not supported on the Qwen-Image-2.1 provider yet',
      };
    }
    const mask = options?.paintData?.mode === 'mask' && options.paintData.dataUrl
      ? { dataUrl: options.paintData.dataUrl, feather: options.paintData.feather }
      : undefined;
    const r = await this.edit(options?.characterId ?? 'anonymous', sourceImagePath, editPrompt, seed, mask, resolveMoodKey(options?.mood), !!options?.localize && !mask);
    return this.toResult(
      r,
      r.generationTimeMs,
      mask ? 'qwen21 masked edit (post-composite)' : r.localized ? `qwen21 localized edit (${r.localized})` : 'qwen21 edit',
      r.localized ? { localized: r.localized } : {},
    );
  }

  // ============================================================
  // Helpers
  // ============================================================

  /** Style refs used when the caller passes none. */
  protected defaultStyleRefs(): Promise<string[]> {
    return resolveQwen21StyleRefs();
  }

  /** The pure, uncomposited repaint of a localized edit: public/portraits/<id>/finetune/repaint/<seed>.png. */
  private async saveRepaint(characterId: string, seed: number, repaint: Buffer): Promise<void> {
    try {
      const abs = this.publicAbs(`/portraits/${characterId}/finetune/repaint/${seed}.png`);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, repaint);
    } catch (e) {
      console.warn(`[Qwen21] could not keep the repaint: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Write the RAW model output beside the finished one: public/<dir>/raw/<name>.png. */
  protected async saveRaw(imageWebPath: string, raw: Buffer): Promise<string> {
    const rawWeb = rawSiblingPath(imageWebPath);
    const abs = this.publicAbs(rawWeb);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, raw);
    return rawWeb;
  }

  /** A stored portrait's raw/ copy when it exists (so chained steps never finish twice). */
  /**
   * A stored reference photo's PREPARED sibling (`<stem>.prep.jpg`, the face-tight passport crop) when it exists;
   * for older uploads without one, prepare it now and write the sibling (one vision call, then cached on disk).
   * QWEN21_PHOTO_PREP=off, a non-upload path, or any failure → the original. Overridable for tests.
   */
  protected async preferPrepared(webPath: string): Promise<string> {
    if (!photoPrepEnabled() || !webPath.startsWith('/uploads/references/')) return webPath;
    const prepWeb = prepSiblingPath(webPath);
    try { await fs.access(this.publicAbs(prepWeb)); return prepWeb; } catch { /* not prepared yet */ }
    try {
      const { prepareStoredReference } = await import('@/services/reference-photo');
      const prep = await prepareStoredReference(webPath);
      if (prep.cropped && prep.path) { console.log(`[Qwen21] prepared reference on the fly: ${webPath}`); return prep.path; }
      console.log(`[Qwen21] reference used unprepared (${prep.check.unavailable ?? prep.check.warnings.join('; ') ?? 'no face'}): ${webPath}`);
    } catch (e) {
      console.warn(`[Qwen21] photo prep failed for ${webPath}: ${(e as Error).message}`);
    }
    return webPath;
  }

  private async preferRaw(webPath: string): Promise<string> {
    if (!isStoredPortraitPath(webPath)) return webPath;
    let rawWeb: string;
    try { rawWeb = rawSiblingPath(webPath); } catch { return webPath; }
    try { await fs.access(this.publicAbs(rawWeb)); return rawWeb; } catch { return webPath; }
  }

  private async runWorkflow(
    prompt: string,
    images: string[],
    seed: number,
    size?: { width: number; height: number },
    loras?: Qwen21Lora[],
    stage?: { stopAt?: number; resumeFrom?: { image: string; at: number } },
  ): Promise<Buffer> {
    const template = await this.loadWorkflow(WORKFLOW_NAME);
    const used = this.activeLoras(loras);
    const loraStart = used.length ? qwen21LoraStartFromEnv() : 0;
    const wf = buildQwen21Workflow(template, { prompt, images, seed, size, loras: used, loraStart, filenamePrefix: 'qwen21', ...(stage ?? {}) });
    const loraNote = used.length ? `, loras=${formatQwen21Loras(used)}${loraStart ? ` start=${loraStart}` : ''}` : '';
    const stageNote = stage?.stopAt ? `, stop@${stage.stopAt}` : stage?.resumeFrom ? `, resume@${stage.resumeFrom.at}` : '';
    console.log(`[Qwen21] queueing — ${images.length} image(s), seed=${seed}${size ? `, ${size.width}x${size.height}` : ''}${loraNote}${stageNote}, prompt="${prompt.slice(0, 100)}…"`);
    const queued = await this.queuePrompt(wf, crypto.randomUUID());
    const out = await this.waitForCompletion(queued.prompt_id);
    return this.downloadImage(out.filename, out.subfolder, out.type);
  }

  private async runStep(
    characterId: string,
    folder: string,
    stage: string,
    prompt: string,
    images: string[],
    seed: number,
    size?: { width: number; height: number },
    mood?: string,
    opts?: { finish?: boolean; loras?: Qwen21Lora[]; inkAt?: number },
  ): Promise<Qwen21StepResult> {
    const t0 = Date.now();
    const data = await this.runWorkflow(prompt, images, seed, size, opts?.loras);
    return this.saveStep(characterId, folder, stage, prompt, data, seed, Date.now() - t0, mood, opts);
  }

  /**
   * FINISH the raw output (unless GROWTH_FINISH=off or opts.finish === false), save the finished
   * image, save the raw beside it.
   */
  private async saveStep(
    characterId: string,
    folder: string,
    stage: string,
    prompt: string,
    rawData: Buffer,
    seed: number,
    ms: number,
    mood?: string,
    opts?: { finish?: boolean; loras?: Qwen21Lora[]; inkAt?: number },
  ): Promise<Qwen21StepResult> {
    const finished = opts?.finish !== false && finishEnabled();
    const imageData = finished ? await finishImage(rawData, seed) : rawData;
    const { imagePath, thumbnailPath } = await this.savePortrait(characterId, imageData, folder, seed, {
      provider: 'qwen21', stage, prompt, model: MODEL_NAME, mood: mood ?? null, finish: finished ? 'on' : 'off',
      loras: formatQwen21Loras(this.activeLoras(opts?.loras)) || null,
      loraStart: this.activeLoras(opts?.loras).length ? qwen21LoraStartFromEnv() : 0,
      inkAt: opts?.inkAt ?? 0,
    });
    const rawPath = await this.saveRaw(imagePath, rawData);
    const m = await sharp(imageData).metadata();
    return { imagePath, thumbnailPath, imageData, rawData, rawPath, seed, prompt, width: m.width ?? 0, height: m.height ?? 0, generationTimeMs: ms };
  }

  /**
   * Upload a buffer (or a stored web path). `maxDim` downsizes a REFERENCE the way stored uploads are (the serverless
   * body is capped at 10 MiB — four full-size PNG refs plus an init image blew it, 14 Oct); `jpeg` sends a full-size
   * init image (the inked midpoint) as a q95 JPEG, a fifth of the PNG bytes, latent still matching the canvas.
   */
  private async uploadImage(img: Qwen21Image, stem: string, opts: { maxDim?: number; jpeg?: boolean } = {}): Promise<string> {
    if (Buffer.isBuffer(img)) {
      let s = sharp(img);
      if (opts.maxDim) s = s.resize(opts.maxDim, opts.maxDim, { fit: 'inside', withoutEnlargement: true });
      if (opts.jpeg) {
        const jpg = await s.jpeg({ quality: 95 }).toBuffer();
        return this.uploadBuffer(jpg, `${stem}-${jpg.length.toString(36)}.jpg`);
      }
      const png = await s.png().toBuffer();
      return this.uploadBuffer(png, `${stem}-${png.length.toString(36)}.png`);
    }
    return this.uploadReferenceImage(await this.preferRaw(await this.fullResWebPath(img)));
  }

  private async uploadStyleRef(absPath: string, index: number): Promise<string> {
    const raw = await fs.readFile(absPath);
    const png = await sharp(raw)
      .resize(STYLE_REF_DIM, STYLE_REF_DIM, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    const hash = crypto.createHash('sha1').update(png).digest('hex').slice(0, 10);
    return this.uploadBuffer(png, `qwen21-style-${index + 1}-${hash}.png`);
  }

  private publicAbs(webPath: string): string {
    return path.join(process.cwd(), 'public', webPath.replace(/^\//, ''));
  }

  /** savePortrait hands back the .thumbs webp; prefer the full-res PNG sibling. */
  private async fullResWebPath(webPath: string): Promise<string> {
    if (!/\.thumbs[/\\]/.test(webPath) || !webPath.endsWith('.webp')) return webPath;
    const png = webPath.replace(/\.thumbs[/\\]/, '').replace(/\.webp$/, '.png');
    try { await fs.access(this.publicAbs(png)); return png; } catch { return webPath; }
  }

  private meta(prompt: string, seed: number, width: number, height: number, ms: number): PortraitMetadata {
    return { prompt, negativePrompt: '', seed, model: MODEL_NAME, steps: QWEN21_STEPS, cfg: 1, width, height, generationTimeMs: ms };
  }

  private toResult(r: Qwen21StepResult, ms: number, debugRefs: string, extra: Record<string, unknown> = {}): PortraitResult {
    return {
      success: true,
      imageData: r.imageData,
      imagePath: r.imagePath,
      thumbnailPath: r.thumbnailPath,
      metadata: {
        ...this.meta(r.prompt, r.seed, r.width, r.height, ms),
        workflowUsed: WORKFLOW_NAME,
        debugRefs,
        ...extra,
      } as PortraitMetadata,
    };
  }
}
