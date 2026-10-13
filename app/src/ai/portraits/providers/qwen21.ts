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
  qwen21LorasFromEnv,
  type Qwen21Lora,
} from '../qwen21-workflow';
import { buildCorpusContentPrompt } from '../corpus-prompts';
import { compositeEditWithMask } from '../mask-composite';
import { finishEnabled, finishImage, rawSiblingPath } from '../finish';
import { resolveMoodKey } from '../style-config';
import { checkBaseLock, lockGateEnabled, type LockGateMeta, type LockGateVerdict } from '../lock-gate';

/** Re-rolls after a failed base-lock gate (seed S → S+1 → S+2). */
export const LOCK_GATE_MAX_RETRIES = 2;

const WORKFLOW_NAME = 'qwen21-edit';
const MODEL_NAME = 'qwen-image-2.1-int8';
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

  /** The LoRA blend a call uses: explicit per-call → instance override → QWEN21_LORAS env. */
  activeLoras(explicit?: Qwen21Lora[]): Qwen21Lora[] {
    return explicit ?? this.loraOverride ?? qwen21LorasFromEnv();
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
    opts?: { painted?: boolean; mood?: string; medium?: string; loras?: Qwen21Lora[] },
  ): Promise<{ raw: Buffer; prompt: string }> {
    const used = photos.slice(0, QWEN21_MAX_IMAGES);
    if (used.length === 0) throw new Error('lockIdentity needs at least one reference photo');
    const names: string[] = [];
    for (let i = 0; i < used.length; i++) {
      const p = used[i];
      names.push(Buffer.isBuffer(p) ? await this.uploadImage(p, `qwen21-photo-${i + 1}`) : await this.uploadReferenceImage(p));
    }
    // QWEN21_STYLE_MODE=single → the lock pass carries the painted look itself (no second pass).
    const painted = opts?.painted ?? qwen21StyleMode() === 'single';
    const prompt = buildQwen21LockPrompt(names.length, painted, opts?.mood, opts?.medium);
    return { raw: await this.runWorkflow(prompt, names, seed, undefined, opts?.loras), prompt };
  }

  /**
   * Step 1 — identity lock from reference photos (web paths under public/).
   *
   * BASE-LOCK GATE (single/painted mode): each render is judged on the LOCAL vision
   * model (lock-gate.ts) against the fixed base composition. Fail → re-roll with
   * seed S+1, then S+2 (deterministic). First pass wins; all fail → the best-scoring
   * attempt, flagged. Only the chosen attempt is saved. QWEN21_LOCK_GATE=off bypasses.
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
      const { raw, prompt } = await this.renderLock(photos, seed, opts);
      return this.saveStep(characterId, 'faces', 'identity-lock', prompt, raw, seed, Date.now() - t0, opts?.mood);
    }
    if (!lockGateEnabled()) {
      const { raw, prompt } = await this.renderLock(photos, seed, { ...opts, painted });
      const r = await this.saveStep(characterId, 'faces', 'identity-lock', prompt, raw, seed, Date.now() - t0, opts?.mood);
      return { ...r, gate: { pass: true, reasons: ['gate off'], attempts: 1, seed, score: 1, bypassed: true } };
    }

    let best: { raw: Buffer; prompt: string; seed: number; verdict: LockGateVerdict } | null = null;
    let attempts = 0;
    for (let i = 0; i <= LOCK_GATE_MAX_RETRIES; i++) {
      const s = seed + i;
      const { raw, prompt } = await this.renderLock(photos, s, { ...opts, painted });
      attempts++;
      const verdict = await this.checkLock(raw);
      console.log(`[Qwen21] lock gate seed=${s}: ${verdict.pass ? 'PASS' : 'FAIL'} ${verdict.reasons.join('; ')}`);
      if (!best || verdict.score > best.verdict.score) best = { raw, prompt, seed: s, verdict };
      if (verdict.pass) { best = { raw, prompt, seed: s, verdict }; break; }
    }
    const chosen = best!;
    const r = await this.saveStep(characterId, 'faces', 'identity-lock', chosen.prompt, chosen.raw, chosen.seed, Date.now() - t0, opts?.mood);
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
    opts: { training?: boolean; styleRefPath?: string; contentRefPath?: string; loras?: Qwen21Lora[] } = {},
  ): Promise<Qwen21StepResult> {
    const images: string[] = [];
    if (opts.contentRefPath) {
      images.push(await this.uploadStyleRef(opts.contentRefPath, 0));
      if (opts.styleRefPath) images.push(await this.uploadStyleRef(opts.styleRefPath, 1)); // <image2> style ref
    } else if (opts.styleRefPath) {
      images.push(await this.uploadStyleRef(opts.styleRefPath, 0));
    }
    const prompt = buildQwen21DescribePrompt(description, mood, undefined, {
      training: opts.training,
      contentRef: !!opts.contentRefPath,
      styleRef: !!opts.styleRefPath,
    });
    return this.runStep(characterId, 'faces', opts.training ? 'describe-training' : 'describe-base', prompt, images, seed, { width: 832, height: 1248 }, mood, { loras: opts.loras });
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
   * Instruction edit on a base image. With a mask, the model still edits the
   * whole frame (no mask input on TextEncodeQwenImage21) and the result is
   * alpha-composited over the base so only the painted area changes.
   */
  async edit(
    characterId: string,
    baseImage: string,
    instruction: string,
    seed: number,
    mask?: { dataUrl: string; feather?: number },
    mood?: string,
  ): Promise<Qwen21StepResult> {
    // Edit the RAW base when one exists, so the finish is applied once, not compounded.
    const baseWeb = await this.preferRaw(await this.fullResWebPath(baseImage));
    const baseName = await this.uploadReferenceImage(baseWeb);
    const prompt = buildQwen21EditPrompt(instruction, mood);
    const t0 = Date.now();
    let out = await this.runWorkflow(prompt, [baseName], seed);
    if (mask?.dataUrl) {
      const baseBuf = await fs.readFile(this.publicAbs(baseWeb));
      const maskBuf = Buffer.from(mask.dataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      out = await compositeEditWithMask(baseBuf, out, maskBuf, mask.feather ?? 20);
    }
    return this.saveStep(characterId, 'finetune', mask ? 'masked-edit' : 'edit', prompt, out, seed, Date.now() - t0, mood);
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
    const r = await this.edit(options?.characterId ?? 'anonymous', sourceImagePath, editPrompt, seed, mask, resolveMoodKey(options?.mood));
    return this.toResult(r, r.generationTimeMs, mask ? 'qwen21 masked edit (post-composite)' : 'qwen21 edit');
  }

  // ============================================================
  // Helpers
  // ============================================================

  /** Style refs used when the caller passes none. */
  protected defaultStyleRefs(): Promise<string[]> {
    return resolveQwen21StyleRefs();
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
  ): Promise<Buffer> {
    const template = await this.loadWorkflow(WORKFLOW_NAME);
    const used = this.activeLoras(loras);
    const wf = buildQwen21Workflow(template, { prompt, images, seed, size, loras: used, filenamePrefix: 'qwen21' });
    const loraNote = used.length ? `, loras=${formatQwen21Loras(used)}` : '';
    console.log(`[Qwen21] queueing — ${images.length} image(s), seed=${seed}${size ? `, ${size.width}x${size.height}` : ''}${loraNote}, prompt="${prompt.slice(0, 100)}…"`);
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
    opts?: { finish?: boolean; loras?: Qwen21Lora[] },
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
    opts?: { finish?: boolean; loras?: Qwen21Lora[] },
  ): Promise<Qwen21StepResult> {
    const finished = opts?.finish !== false && finishEnabled();
    const imageData = finished ? await finishImage(rawData, seed) : rawData;
    const { imagePath, thumbnailPath } = await this.savePortrait(characterId, imageData, folder, seed, {
      provider: 'qwen21', stage, prompt, model: MODEL_NAME, mood: mood ?? null, finish: finished ? 'on' : 'off',
      loras: formatQwen21Loras(this.activeLoras(opts?.loras)) || null,
    });
    const rawPath = await this.saveRaw(imagePath, rawData);
    const m = await sharp(imageData).metadata();
    return { imagePath, thumbnailPath, imageData, rawData, rawPath, seed, prompt, width: m.width ?? 0, height: m.height ?? 0, generationTimeMs: ms };
  }

  private async uploadImage(img: Qwen21Image, stem: string): Promise<string> {
    if (Buffer.isBuffer(img)) {
      const png = await sharp(img).png().toBuffer();
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
