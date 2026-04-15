import 'server-only';

/**
 * GRO.WTH Portrait Pipeline — Local Provider (ComfyUI)
 *
 * Communicates with a local ComfyUI instance to generate character portraits
 * using FLUX.1 Dev + PuLID for identity preservation.
 */

import crypto from 'crypto';
import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import type {
  ImageGenerationProvider,
  PortraitInput,
  PortraitResult,
  PortraitMetadata,
  IdentityData,
  ProviderStatus,
  ComfyUIQueueResponse,
  ComfyUIWorkflowParams,
  PortraitCharacterData,
} from '../types';
import { buildPortraitPrompt, type PromptBuildOptions } from '../prompt-builder';
import { getDefaultStyleConfig, applyCampaignStyle, TRIGGER_NSFW } from '../style-config';

/**
 * Hardcoded body-reference prompt template, literal port of the test-body-gen.js
 * recipe that produced the Tara reference outputs. Bypasses prompt-builder to
 * eliminate drift — character data is filled into a fixed template, nothing else.
 */
function buildBodyReferencePrompt(char: PortraitCharacterData, allowNude: boolean): {
  clipL: string;
  t5xxl: string;
  negativePrompt: string;
} {
  const identity = char.identity;
  const seed = char.seed;
  const age = identity.age || 25;
  const sex = identity.sex || 'Female';
  const seedName = seed?.name || 'Human';
  const skin = identity.skinTone || 'Fair';
  const eyes = identity.eyeColor || 'brown';
  const build = identity.bodyType || 'average';
  const hairColor = identity.hairColor || 'dark';
  const hairLength = identity.hairLength || '';
  const hairTexture = identity.hairTexture || 'straight';

  const hairPhrase = hairLength
    ? `${hairLength} ${hairTexture} ${hairColor} hair, hair made of individual strands, hair texture clearly visible`
    : `${hairTexture} ${hairColor} hair tied back simply`;

  const clothing = allowNude
    ? 'nude, completely bare, no clothing, no accessories'
    : 'wearing plain neutral grey bra and panties, simple modest underwear only';

  const clothingSentence = allowNude
    ? 'The character is completely nude with bare skin, no clothing whatsoever, no armor, no accessories.'
    : 'The character wears only simple plain neutral grey underwear (bra and panties), no other clothing.';

  // Single-pass full body 768x1152.
  // Composition tokens FIRST (FLUX honors front-loaded structural prompts more
  // strongly). Pose anchors with anti-decoration negatives carry the framing.
  const clipL = [
    'full body anatomy reference photograph',
    'standing facing camera straight on, front view, T-pose A-pose arms relaxed at sides',
    'entire body visible from top of head to soles of feet, both feet planted on the ground at the bottom of the frame',
    'in the style of ckpf, aidmafluxpro1.1',
    'hyperrealistic, extremely detailed, subtle painterly quality',
    `a ${age}-year-old ${sex} ${seedName}`,
    hairPhrase,
    `${skin} skin`,
    `${eyes} eyes`,
    `${build} build`,
    clothing,
    'plain undecorated bare skin, no body paint, no markings, no jewelry',
    'full body reference shot, standing figure centered in frame, long shot framing, wide angle',
    'neutral grey background, balanced even lighting',
  ].join(', ');

  const t5xxl = [
    'A full-body anatomy reference photograph of the entire figure standing facing the camera straight on, front view.',
    'The complete body is visible from the top of the head down to the soles of the feet — both feet are planted on the ground at the very bottom of the frame, head at the top.',
    `A ${age}-year-old ${sex} ${seedName} with ${hairPhrase}, ${skin} skin, ${eyes} eyes, ${build} build.`,
    clothingSentence,
    'Plain undecorated bare skin — no body paint, no tattoos, no markings, no jewelry, no gold, no accessories.',
    'The figure stands in an A-pose with arms held slightly away from the body in a symmetric stance.',
    `In the style of ckpf with aidmafluxpro1.1 detail. Hyperrealistic, extremely detailed.`,
    'Full body reference shot, long shot framing, wide angle, neutral grey background, balanced even lighting.',
  ].join(' ');

  const negativePrompt = 'robe, cloak, cape, dress, gown, kimono, fabric panel, fabric drape, garment, robes, shawl, mantle, train, fabric flowing behind';

  return { clipL, t5xxl, negativePrompt };
}

const COMFYUI_URL = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';
const COMFYUI_PATH = process.env.COMFYUI_PATH || 'C:/AI/ComfyUI';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

// Default generation settings — FLUX GGUF on RTX 4060 8GB
// Requires Ollama stopped. ~40s at 1024/20 steps with enough RAM free.
const DEFAULT_STEPS = 20;
const DEFAULT_CFG = 1.0;        // FLUX uses CFG 1.0 — guidance is in the text encoder node (3.5)
const DEFAULT_WIDTH = 768;      // 768 until RAM upgrade, then 1024
const DEFAULT_HEIGHT = 768;
const MODEL_NAME = 'flux1-dev-Q4_K_S';

// Polling settings
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 360;  // 30 minutes max wait (first run loads all models into VRAM)

// Auto-start settings
const STARTUP_POLL_INTERVAL_MS = 3000;
const STARTUP_MAX_WAIT_MS = 120_000;  // 2 minutes to start

// Portrait storage root (relative to app/public/)
const PORTRAIT_ROOT = 'portraits';

// Singleton ComfyUI process — survives across requests
let comfyProcess: ChildProcess | null = null;
let comfyStarting = false;

export class LocalProvider implements ImageGenerationProvider {
  name = 'local-comfyui';

  // ============================================================
  // Provider Interface
  // ============================================================

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${COMFYUI_URL}/system_stats`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<ProviderStatus> {
    try {
      const [statsRes, queueRes] = await Promise.all([
        fetch(`${COMFYUI_URL}/system_stats`, { signal: AbortSignal.timeout(5000) }),
        fetch(`${COMFYUI_URL}/queue`, { signal: AbortSignal.timeout(5000) }),
      ]);

      if (!statsRes.ok || !queueRes.ok) {
        return { available: false, gpuLoaded: false, queueLength: 0, error: 'ComfyUI not responding' };
      }

      const stats = await statsRes.json();
      const queue = await queueRes.json();
      const pendingCount = (queue.queue_pending?.length || 0) + (queue.queue_running?.length || 0);

      const gpu = stats.devices?.[0];
      return {
        available: true,
        gpuLoaded: !!gpu,
        queueLength: pendingCount,
        vramUsageMb: gpu ? Math.round((gpu.vram_total - gpu.vram_free) / (1024 * 1024)) : undefined,
      };
    } catch (e) {
      return { available: false, gpuLoaded: false, queueLength: 0, error: String(e) };
    }
  }

  async generatePortrait(input: PortraitInput): Promise<PortraitResult> {
    const startTime = Date.now();

    try {
      // 1. Ensure ComfyUI is running and VRAM is available
      await this.ensureRunning();
      await this.freeVram();

      // 2. Build prompt from character data
      const styleConfig = getDefaultStyleConfig();
      const config = applyCampaignStyle(styleConfig, input.campaignStyle);
      const promptOutput = (input.creationMode === true && input.overrides?.composition === 'full_body')
        ? buildBodyReferencePrompt(input.characterData, input.campaignStyle?.allowNudity === true)
        : buildPortraitPrompt(input.characterData, {
            campaignStyle: input.campaignStyle,
            overrides: input.overrides,
            creationMode: input.creationMode === true,
          });

      // Debug: log the prompt and mode
      console.log('[ComfyUI] anglePreset:', input.overrides?.anglePreset || 'none');
      console.log('[ComfyUI] creationMode:', input.creationMode, '→ passed to builder:', input.creationMode === true, '| allowNudity:', input.campaignStyle?.allowNudity, '| composition:', input.overrides?.composition);
      console.log('[ComfyUI] clip_l (FULL):', promptOutput.clipL);
      console.log('[ComfyUI] t5xxl (FULL):', promptOutput.t5xxl);
      console.log('[ComfyUI] Negative:', promptOutput.negativePrompt);

      // 3. Prepare workflow parameters
      const seed = input.overrides?.seed ?? Math.floor(Math.random() * 2147483647);
      const quality = input.overrides?.quality || 'final';
      const isSketch = quality === 'sketch';
      const isDraft = quality === 'draft';
      const isFinal = quality === 'final';
      const isFaceLock = !!input.overrides?.anglePreset;  // Identity lock = clean face, minimal LoRAs
      const params: ComfyUIWorkflowParams = {
        clipL: promptOutput.clipL,
        t5xxl: promptOutput.t5xxl,
        negativePrompt: promptOutput.negativePrompt,
        seed,
        // Body gen: 15 steps (vs 20) — same quality at lower wall time, since body
        // detail needs less fine-sampling than face. Saves ~25% per body gen.
        steps: isSketch ? 4 : isDraft ? 15 : (input.overrides?.composition === 'full_body' ? 15 : DEFAULT_STEPS),
        cfg: DEFAULT_CFG,
        // Full-body generation needs vertical room — square 768×768 biases FLUX toward
        // bust/half-body composition. Tall canvas is the only reliable enforcement.
        // Body canvas: Tara test 768x1152. Face detail comes from a second-pass
        // face-refine composite (refineBodyFace), not from bigger canvas.
        // Single-pass body 768x1152 (Tara test recipe). Face-detailer pass to be
        // added separately so the body comes out clean while we wire that up.
        width: isSketch ? 384 : isDraft ? 640 : (input.overrides?.composition === 'full_body' ? 768 : DEFAULT_WIDTH),
        height: isSketch ? 384 : isDraft ? 640 : (input.overrides?.composition === 'full_body' ? 1152 : DEFAULT_HEIGHT),
        referenceImagePath: input.personaLock?.referenceImagePath,
        // Body gen: lower PuLID primary to 0.7 — at 0.9 it anchors the composition
        // to face-centric framing (PuLID's attention injection runs across all sampling
        // steps, biasing the whole canvas). Face-lock Step 2 stays at 0.9.
        // Step 1 discovery stays at config default (0.8).
        pulidWeight: input.personaLock?.pulidWeight ?? (
          input.overrides?.composition === 'full_body' ? 0.7 :
          (isFaceLock && isFinal ? 0.9 : config.pulidWeight)
        ),
        // Delay PuLID start for non-front angles: lets ControlNet establish the profile
        // rotation before PuLID anchors the face identity. At start_at=0, PuLID's
        // forward-facing signal from the Step 2 front lock competes with CN's rotation
        // cue from step 0 and often wins. Delaying to 0.3 gives CN a 30% runway.
        pulidStartAt: (() => {
          const a = input.overrides?.anglePreset;
          return a && a !== 'front' ? 0.3 : 0.0;
        })(),
        pulidEndAt: 1.0,
        styleLora: config.styleLora,
        // Face-lock weights:
        //   Step 1 (draft):  painterly 0.6, detail 0.5, dark 0.15 — safe discovery.
        //   Step 2 (final):  painterly 0.75, detail 0.7, dark 0.3 — more fantasy/mood.
        // Tara-test weight: 0.5 (config.loraStrength default).
        styleLoraWeight: isSketch ? 0.6 : isFaceLock ? (isFinal ? 0.75 : 0.6) : config.loraStrength,
        // Detail LoRA: match Tara-test weight (0.55) so hands/feet get the
        // same crisp detail the Tara reference gens had.
        detailLoraWeight: isSketch ? 0 : isFaceLock ? (isFinal ? 0.7 : 0.5) : 0.55,
        campaignLora: isSketch ? undefined : 'dark-fantasy-v2-flux.safetensors',
        // Campaign (dark-fantasy) LoRA OFF for creationMode body. The autotest3
        // reference image was generated before this LoRA entered the workflow
        // (commit 7701b7e6 added it). Stacking it on top of painterly+detail+NSFW
        // compromises face detail.
        campaignLoraWeight: isSketch ? 0
          : isFaceLock ? (isFinal ? 0.3 : 0.15)
          : (input.creationMode && input.overrides?.composition === 'full_body') ? 0
          : 0.4,
        // Hand detail LoRA only for face-lock final (close-up where hands might appear).
        // Body gen at full-body framing = hands are tiny, not worth the LoRA compute.
        handDetailLoraWeight: isFinal && input.overrides?.composition !== 'full_body' ? 0.6 : 0,
        // Auto-enable NSFW LoRA for creationMode body gen regardless of campaign flag —
        // nude body references are anatomical templates, not erotic content. Without it,
        // FLUX Dev renders Barbie-smooth (no nipples, flat pubic area). NSFW unlock
        // gives accurate anatomy, which is what we need for a character reference.
        nsfwUnlock: isFinal && (
          input.campaignStyle?.allowNudity
          || (input.creationMode && input.overrides?.composition === 'full_body')
        ),
        nsfwUnlockWeight: 0.8,
      };

      // 4. Upload reference images and split into primary + secondary PuLID refs.
      // Primary (first entry) = referenceImagePath → own ApplyPulidFlux at pulidWeight (0.8).
      // Secondaries (remaining entries) = chained in a SECOND ApplyPulidFlux at secondaryPulidWeight.
      // Face gens cap at 3 refs (5+ OOMs on 8GB). Body gens bump to 5 —
      // hair identity needs multiple angles, and the body workflow skips ControlNet
      // so the VRAM saved goes into PuLID chain length.
      const isFullBodyGen = input.overrides?.composition === 'full_body';
      // For creationMode body: ONLY use the locked bald face as PuLID primary.
      // Player photos as secondary refs were biasing pose/styling toward
      // whatever the source photos showed (3/4 turn, decorations, etc.).
      const isCreationBody = isFullBodyGen && input.creationMode === true;
      const MAX_PULID_REFS = isCreationBody ? 1 : (isFullBodyGen ? 5 : 3);
      const primaryIn = input.personaLock?.referenceImagePath;
      const batchIn = isCreationBody ? [] : (input.personaLock?.referenceImagePaths || []);
      const merged = [primaryIn, ...batchIn].filter((p): p is string => !!p);
      const allInRaw = Array.from(new Set(merged));
      const allIn = allInRaw.slice(0, MAX_PULID_REFS);
      if (allInRaw.length > MAX_PULID_REFS) {
        console.warn(`[ComfyUI] PuLID refs capped from ${allInRaw.length} to ${MAX_PULID_REFS} — 8GB VRAM budget`);
      }
      if (allIn.length > 0) {
        console.log(`[ComfyUI] Uploading ${allIn.length} PuLID reference${allIn.length > 1 ? 's' : ''} (primary + ${allIn.length - 1} secondary)`);
        const uploaded: string[] = [];
        for (const r of allIn) {
          try {
            uploaded.push(await this.uploadReferenceImage(r));
          } catch (err) {
            console.warn(`[ComfyUI] Skipping missing reference "${r}":`, err instanceof Error ? err.message : err);
          }
        }
        if (uploaded.length === 0) {
          throw new Error('All reference images failed to upload — no valid PuLID refs available');
        }
        params.referenceImagePath = uploaded[0];
        params.referenceImagePaths = uploaded.slice(1);  // secondaries only
        // Body gen: 0.4 — strong enough for hair transfer from player photos.
        // Face gen: 0.15 — anything higher contaminated the head-cap with ref hair.
        params.secondaryPulidWeight = isFullBodyGen ? 0.4 : 0.15;
        console.log(`[ComfyUI] PuLID primary: ${uploaded[0]} | ${uploaded.length - 1} secondaries @ weight ${params.secondaryPulidWeight}`);
      }

      // 4b. Upload ControlNet angle reference if provided.
      // skipControlNet=true: ControlNet still loads (strength 0 = no influence) so we can
      // keep using the InstantX workflow instead of routing to the broken pulid-only
      // fallback. Net effect: PuLID does its job, ControlNet contributes nothing.
      const anglePreset = input.overrides?.anglePreset;
      const skipControlNet = input.overrides?.skipControlNet === true;
      const useControlnet = !!anglePreset && await this.isControlNetAvailable();
      if (useControlnet && input.overrides?.anglePreset) {
        const angleRefPath = await this.getAngleReferenceImage(input.overrides.anglePreset);
        console.log('[ComfyUI] ControlNet angle ref path:', angleRefPath);
        if (angleRefPath) {
          const uploadedAngleRef = await this.uploadReferenceImage(angleRefPath);
          params.controlnetImagePath = uploadedAngleRef;
          // Strength ladder:
          //   skipControlNet (Step 1): 0.0 — ControlNet loads but does nothing.
          //   front angle (Step 2):    0.75 — PuLID ref is already front-facing; mild enforcement.
          //   non-front angles:        1.0 — PuLID ref is front-facing but we NEED to rotate.
          //                            CN must win the pose fight against PuLID's forward-facing signal.
          const isNonFrontAngle = !skipControlNet && anglePreset !== undefined && anglePreset !== 'front';
          params.controlnetStrength = skipControlNet ? 0.0 : (isNonFrontAngle ? 1.0 : 0.75);
          console.log(`[ComfyUI] ControlNet ref uploaded as: ${uploadedAngleRef} (strength=${params.controlnetStrength})`);
        } else {
          console.log('[ComfyUI] No angle reference found — ControlNet will be skipped');
        }
      }

      // 4c. Upload base image for img2img refine pass
      if (input.overrides?.baseImagePath) {
        console.log('[ComfyUI] Uploading base image for img2img:', input.overrides.baseImagePath);
        const uploadedBase = await this.uploadReferenceImage(input.overrides.baseImagePath);
        params.baseImagePath = uploadedBase;
        params.denoise = input.overrides.denoise ?? 0.65;
        console.log('[ComfyUI] Base image uploaded as:', uploadedBase, '| denoise:', params.denoise);
      }

      console.log('[ComfyUI] Params — PuLID ref:', params.referenceImagePath || 'NONE', '| CN ref:', params.controlnetImagePath || 'NONE', '| Base:', params.baseImagePath || 'NONE');

      // 5. Select workflow: ControlNet+PuLID → PuLID → Basic (with fallbacks)
      //    Body gen skips InstantX — ControlNet fights the secondary-PuLID hair chain,
      //    and A-pose doesn't need pose steering.
      //
      let outputInfo: { filename: string; subfolder: string; type: string };
      const usePulid = !!params.referenceImagePath;
      const workflowPriority: string[] = [];

      if (!isFullBodyGen && useControlnet && usePulid && params.controlnetImagePath) {
        workflowPriority.push('character-face-controlnet-instantx');
        workflowPriority.push('character-face-controlnet');
      }
      if (usePulid) {
        workflowPriority.push('character-portrait-pulid');
      }
      workflowPriority.push('character-portrait');

      const workflowResult = await this.tryWorkflows(workflowPriority, params);
      outputInfo = workflowResult.output;
      const workflowUsed = workflowResult.workflowName;
      const failedWorkflows = workflowResult.failedWorkflows;

      // 8. Download generated image
      let imageData = await this.downloadImage(
        outputInfo.filename,
        outputInfo.subfolder,
        outputInfo.type,
      );

      // 8b. Face-detailer pass for creationMode body. BiSeNet (face_no_hair
      // mask) → inpaint just the face oval with PuLID at higher PuLID weight.
      // Body/torso/legs untouched. Adds ~90s.
      const doFaceDetailer = input.creationMode === true
        && input.overrides?.composition === 'full_body'
        && !!params.referenceImagePath;
      if (doFaceDetailer) {
        try {
          console.log('[ComfyUI] Face-detailer: BiSeNet mask + PuLID inpaint...');
          imageData = await this.refineFaceWithBiSeNet(imageData, params);
          console.log('[ComfyUI] Face-detailer done.');
        } catch (err) {
          console.warn('[ComfyUI] Face-detailer failed — keeping single-pass body:', err instanceof Error ? err.message : err);
        }
      }

      // 9. Save to filesystem under a step subfolder:
      //   'sketch'   — Step 1 face discovery (draft, no ControlNet)
      //   'refined'  — Step 2 front-lock (final, ControlNet, angle=front)
      //   'angles'   — Step 3 non-front angles (final, ControlNet, angle=profile/3-4)
      //   'body'     — Step 4 full-body generation (final, composition=full_body)
      const angle = input.overrides?.anglePreset;
      const isFinalQuality = input.overrides?.quality === 'final';
      const controlNetOn = input.overrides?.skipControlNet !== true;
      const isFullBody = input.overrides?.composition === 'full_body';
      let step: string = 'sketch';
      if (isFullBody && isFinalQuality) {
        step = 'body';
      } else if (isFinalQuality && !!angle && controlNetOn) {
        step = angle === 'front' ? 'refined' : 'angles';
      }
      const { imagePath, thumbnailPath } = await this.savePortrait(
        input.characterId,
        imageData,
        step,
      );

      const generationTimeMs = Date.now() - startTime;

      const metadata: PortraitMetadata = {
        prompt: promptOutput.t5xxl,
        clipL: promptOutput.clipL,
        negativePrompt: promptOutput.negativePrompt,
        seed,
        model: MODEL_NAME,
        steps: DEFAULT_STEPS,
        cfg: DEFAULT_CFG,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        generationTimeMs,
        pulidWeight: params.pulidWeight,
        styleLoraName: params.styleLora,
        styleLoraWeight: params.styleLoraWeight,
        campaignLoraName: params.campaignLora,
        campaignLoraWeight: params.campaignLoraWeight,
        workflowUsed,
        failedWorkflows,
        debugRefs: `PuLID: ${params.referenceImagePath || 'NONE'} | CN: ${params.controlnetImagePath || 'NONE'}`,
      } as PortraitMetadata & { workflowUsed: string; failedWorkflows: string[]; debugRefs: string };

      return {
        success: true,
        imageData,
        imagePath,
        thumbnailPath,
        metadata,
      };

    } catch (e) {
      return {
        success: false,
        metadata: {
          prompt: '',
          negativePrompt: '',
          seed: 0,
          model: MODEL_NAME,
          steps: DEFAULT_STEPS,
          cfg: DEFAULT_CFG,
          width: DEFAULT_WIDTH,
          height: DEFAULT_HEIGHT,
          generationTimeMs: Date.now() - startTime,
        },
        error: e instanceof Error ? e.message : String(e),
      };
    } finally {
      // Release VRAM after generation
      await this.releaseVram();
    }
  }

  async extractIdentity(imageData: Buffer): Promise<IdentityData> {
    // Phase B: This will call a ComfyUI workflow that extracts InsightFace
    // embeddings from the portrait for PuLID identity preservation.
    // For Phase A, the reference image itself is stored and used directly.
    throw new Error('Identity extraction requires Phase B implementation (PuLID embedding workflow)');
  }

  // ============================================================
  // ComfyUI Communication
  // ============================================================

  private async queuePrompt(workflow: object, clientId: string): Promise<ComfyUIQueueResponse> {
    const res = await fetch(`${COMFYUI_URL}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      // Dump the rejected workflow so we can diagnose validation errors with empty details.
      try {
        const dumpDir = path.join(process.cwd(), 'tmp');
        await fs.mkdir(dumpDir, { recursive: true });
        const dumpPath = path.join(dumpDir, `comfy-rejected-${Date.now()}.json`);
        await fs.writeFile(dumpPath, JSON.stringify(workflow, null, 2));
        console.warn(`[ComfyUI] Rejected workflow dumped to: ${dumpPath}`);
      } catch { /* best-effort */ }
      throw new Error(`ComfyUI queue failed (${res.status}): ${errorText}`);
    }

    return res.json();
  }

  private async waitForCompletion(promptId: string): Promise<{
    filename: string;
    subfolder: string;
    type: string;
  }> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

      const res = await fetch(`${COMFYUI_URL}/history/${promptId}`);
      if (!res.ok) continue;

      const history = await res.json();
      const promptHistory = history[promptId];
      if (!promptHistory) continue;

      // Check for errors
      // Log full status for debugging
      console.log('[ComfyUI] History status:', JSON.stringify(promptHistory.status));

      if (promptHistory.status?.status_str === 'error') {
        // Look for actual error in node outputs or status messages
        const nodeErrors = Object.entries(promptHistory.outputs || {})
          .filter(([, v]) => (v as Record<string, unknown>).errors)
          .map(([k, v]) => `Node ${k}: ${JSON.stringify((v as Record<string, unknown>).errors)}`);

        const statusMsg = promptHistory.status?.messages
          ?.map((m: unknown[]) => typeof m[1] === 'string' ? m[1] : JSON.stringify(m[1]))
          ?.join('; ') || '';

        const errorMsg = nodeErrors.length > 0
          ? nodeErrors.join(', ')
          : statusMsg || 'Unknown ComfyUI error — check ComfyUI console';
        throw new Error(`ComfyUI generation failed: ${errorMsg}`);
      }

      // Check for completed outputs
      if (promptHistory.status?.completed || promptHistory.outputs) {
        // Find the output node with images (usually the SaveImage node)
        for (const nodeId of Object.keys(promptHistory.outputs)) {
          const output = promptHistory.outputs[nodeId];
          if (output.images?.length > 0) {
            const img = output.images[0];
            return {
              filename: img.filename,
              subfolder: img.subfolder || '',
              type: img.type || 'output',
            };
          }
        }
      }
    }

    throw new Error(`ComfyUI generation timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`);
  }

  private async downloadImage(filename: string, subfolder: string, type: string): Promise<Buffer> {
    const params = new URLSearchParams({ filename, subfolder, type });
    const res = await fetch(`${COMFYUI_URL}/view?${params}`);

    if (!res.ok) {
      throw new Error(`Failed to download image from ComfyUI: ${res.status}`);
    }

    return Buffer.from(await res.arrayBuffer());
  }

  private async uploadReferenceImage(imagePath: string): Promise<string> {
    const absolutePath = path.join(process.cwd(), 'public', imagePath.replace(/^\//, ''));
    const imageBuffer = await fs.readFile(absolutePath);
    const filename = path.basename(imagePath);

    const formData = new FormData();
    formData.append('image', new Blob([imageBuffer]), filename);

    const res = await fetch(`${COMFYUI_URL}/upload/image`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Failed to upload reference image: ${res.status}`);
    }

    const result = await res.json();
    return result.name;
  }

  // ============================================================
  // Workflow Management
  // ============================================================

  private async loadWorkflow(name: string): Promise<Record<string, unknown>> {
    const workflowPath = path.join(process.cwd(), 'src', 'ai', 'portraits', 'workflows', `${name}.json`);

    try {
      const content = await fs.readFile(workflowPath, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      throw new Error(
        `Workflow "${name}" not found at ${workflowPath}. ` +
        'Design your workflow in ComfyUI GUI and export it using "Save (API Format)".'
      );
    }
  }

  /**
   * Inject generation parameters into a ComfyUI workflow JSON.
   *
   * ComfyUI workflows are node graphs exported as JSON. Each node has a numeric ID
   * and an "inputs" object. We find nodes by class_type and inject our parameters.
   *
   * This is a generic injection that handles common node types. For custom workflows,
   * the node IDs may need adjustment — the workflow JSON should use consistent naming.
   */
  private injectWorkflowParams(
    workflow: Record<string, unknown>,
    params: ComfyUIWorkflowParams,
  ): Record<string, unknown> {
    const w = JSON.parse(JSON.stringify(workflow)); // Deep clone

    // Strip comment keys (e.g. _comment_pulid) — ComfyUI crashes on non-node keys
    for (const key of Object.keys(w)) {
      if (key.startsWith('_')) delete w[key];
    }

    // Auto-detect available models — fall back to old versions if new ones not downloaded yet
    const modelFallbacks: Record<string, string> = {};
    let useGgufClipLoader = true;  // Switch to standard DualCLIPLoader when using fp8 safetensors
    try {
      const { existsSync } = require('fs');
      const q4ksPath = path.join(COMFYUI_PATH, 'models', 'unet', 'flux1-dev-Q4_K_S.gguf');
      if (!existsSync(q4ksPath) || require('fs').statSync(q4ksPath).size < 6_800_000_000) {
        modelFallbacks['flux1-dev-Q4_K_S.gguf'] = 'flux1-dev-Q4_0.gguf';
      }
      const t5fp8Path = path.join(COMFYUI_PATH, 'models', 'clip', 't5xxl_fp8_e4m3fn.safetensors');
      const t5fp8Ready = existsSync(t5fp8Path) && require('fs').statSync(t5fp8Path).size > 4_800_000_000;  // ~4.89GB expected
      if (!t5fp8Ready) {
        modelFallbacks['t5xxl_fp8_e4m3fn.safetensors'] = 't5-v1_1-xxl-encoder-Q4_K_M.gguf';
      } else {
        useGgufClipLoader = false;  // fp8 safetensors complete — use standard loader
      }
      // Prefer FP8 Union Pro 2.0 (2.1GB) over full Union (6.6GB) — fits in 16GB RAM
      const cnFp8Path = path.join(COMFYUI_PATH, 'models', 'controlnet', 'flux-controlnet-union-pro2-fp8.safetensors');
      const cnFp8Ready = existsSync(cnFp8Path) && require('fs').statSync(cnFp8Path).size > 2_000_000_000;
      if (!cnFp8Ready) {
        // Fall back to full Union, then XLabs Canny
        const cnUnionPath = path.join(COMFYUI_PATH, 'models', 'controlnet', 'flux-controlnet-union.safetensors');
        if (!existsSync(cnUnionPath) || require('fs').statSync(cnUnionPath).size < 6_000_000_000) {
          modelFallbacks['flux-controlnet-union-pro2-fp8.safetensors'] = 'flux-canny-controlnet-v3.safetensors';
        } else {
          modelFallbacks['flux-controlnet-union-pro2-fp8.safetensors'] = 'flux-controlnet-union.safetensors';
        }
      }
    } catch { /* ignore */ }

    for (const [nodeId, node] of Object.entries(w)) {
      const n = node as Record<string, unknown>;
      const classType = n.class_type as string;
      const inputs = n.inputs as Record<string, unknown>;

      if (!classType || !inputs) continue;

      // Apply model fallbacks — swap new model names for old if not yet downloaded
      for (const [newName, oldName] of Object.entries(modelFallbacks)) {
        for (const key of Object.keys(inputs)) {
          if (inputs[key] === newName) {
            inputs[key] = oldName;
            console.log(`[ComfyUI] Model fallback: ${newName} → ${oldName}`);
          }
        }
      }

      // Swap DualCLIPLoaderGGUF → DualCLIPLoader when using fp8 safetensors clip
      if (!useGgufClipLoader && classType === 'DualCLIPLoaderGGUF') {
        n.class_type = 'DualCLIPLoader';
        console.log('[ComfyUI] Swapped DualCLIPLoaderGGUF → DualCLIPLoader (fp8 clip)');
      }

      // CLIPTextEncodeFlux — FLUX dual encoder with separate clip_l (tags) and t5xxl (sentences)
      // Split encoding is the single biggest quality win for FLUX (50-75% improvement).
      if (classType === 'CLIPTextEncodeFlux') {
        const meta = (n._meta as Record<string, unknown>);
        const title = meta?.title as string || '';

        if (title.toLowerCase().includes('positive')) {
          const nsfwTag = params.nsfwUnlock ? `${TRIGGER_NSFW}, ` : '';

          // clip_l: tags/keywords — already built as tags by prompt-builder
          // All 3 style LoRA triggers (ckpf, aidmafluxpro1.1, drkfnts style) are in the global style prefix
          inputs.clip_l = nsfwTag + params.clipL;

          // t5xxl: natural language sentences — already built as prose by prompt-builder
          inputs.t5xxl = nsfwTag + params.t5xxl;

          // Dynamic guidance: shorter prompts get higher guidance for better adherence
          const promptWordCount = params.t5xxl.split(/\s+/).length;
          if (promptWordCount < 30) {
            inputs.guidance = 4.0;   // Short (face lock) — high adherence
          } else if (promptWordCount > 60) {
            inputs.guidance = 2.5;   // Long (full portrait) — avoid over-constraining
          }
          // else: keep workflow default (3.5)
        }
      }

      // Standard CLIP Text Encode nodes — inject prompts (used for negative prompt)
      if (classType === 'CLIPTextEncode') {
        const meta = (n._meta as Record<string, unknown>);
        const title = meta?.title as string || '';

        if (title.toLowerCase().includes('positive')) {
          inputs.text = params.clipL;  // Fallback for non-FLUX workflows
        } else if (title.toLowerCase().includes('negative')) {
          inputs.text = params.negativePrompt;
        }
      }

      // KSampler — inject seed, steps, cfg, and img2img denoise
      if (classType === 'KSampler' || classType === 'KSamplerAdvanced') {
        if (inputs.seed !== undefined) inputs.seed = params.seed;
        if (inputs.noise_seed !== undefined) inputs.noise_seed = params.seed;
        if (inputs.steps !== undefined) inputs.steps = params.steps;
        if (inputs.cfg !== undefined) inputs.cfg = params.cfg;
        // img2img: set denoise < 1.0 to preserve base image composition
        if (params.baseImagePath && params.denoise !== undefined) {
          inputs.denoise = params.denoise;
        }
      }

      // XlabsSampler — inject seed, steps (different field names)
      if (classType === 'XlabsSampler') {
        if (inputs.noise_seed !== undefined) inputs.noise_seed = params.seed;
        if (inputs.steps !== undefined) inputs.steps = params.steps;
      }

      // Empty Latent Image — inject dimensions
      if (classType === 'EmptyLatentImage') {
        inputs.width = params.width;
        inputs.height = params.height;
      }

      // PuLID node — inject weight, start_at, end_at, and reference image
      if (classType.includes('PuLID') || classType.includes('pulid')) {
        if (params.pulidWeight !== undefined && inputs.weight !== undefined) {
          inputs.weight = params.pulidWeight;
        }
        if (params.pulidStartAt !== undefined && inputs.start_at !== undefined) {
          inputs.start_at = params.pulidStartAt;
        }
        if (params.pulidEndAt !== undefined && inputs.end_at !== undefined) {
          inputs.end_at = params.pulidEndAt;
        }
      }

      // Load Image node — inject filenames based on title
      if (classType === 'LoadImage') {
        const meta = (n._meta as Record<string, unknown>);
        const title = meta?.title as string || '';
        if ((title.toLowerCase().includes('reference') || title.toLowerCase().includes('pulid')) && params.referenceImagePath) {
          inputs.image = params.referenceImagePath;
        }
        if (title.toLowerCase().includes('controlnet') || title.toLowerCase().includes('angle')) {
          if (params.controlnetImagePath) {
            inputs.image = params.controlnetImagePath;
          }
        }
      }

      // ControlNet Apply — inject strength and end_percent (when present on the node).
      // Non-front angles need CN holding through full sampling (end_percent 1.0) so pose
      // rotation isn't undone in the final 20% of steps when CN would normally disengage.
      if (classType === 'ApplyFluxControlNet' || classType === 'ApplyAdvancedFluxControlNet' || classType === 'ControlNetApplyAdvanced') {
        if (params.controlnetStrength !== undefined && inputs.strength !== undefined) {
          inputs.strength = params.controlnetStrength;
        }
        if (inputs.end_percent !== undefined && params.controlnetStrength !== undefined && params.controlnetStrength >= 0.9) {
          inputs.end_percent = 1.0;
        }
      }

      // Preprocessor — match resolution to generation size (Canny, DWPose, etc.)
      if (classType === 'CannyEdgePreprocessor' || classType === 'Canny_Edge_Preprocessor' || classType === 'DWPreprocessor' || classType === 'OpenposePreprocessor') {
        if (inputs.resolution !== undefined) {
          const isDWPose = classType === 'DWPreprocessor';
          inputs.resolution = isDWPose ? Math.min(params.width, 384) : params.width;
        }
        // detect_face=enable at res 384 matches the 9445b459 golden and gives the
        // face-position/scale keypoints (eye/nose/mouth dots) needed for framing lock
        // — without bleeding contours into the generation (that only happened at res 640).
        // detect_hand stays disabled — hand keypoints not useful for head-only generation.
        if (classType === 'DWPreprocessor' || classType === 'OpenposePreprocessor') {
          if (inputs.detect_face !== undefined) inputs.detect_face = 'enable';
          if (inputs.detect_hand !== undefined) inputs.detect_hand = 'disable';
          inputs.detect_body = 'enable';
        }
      }

      // LoRA Loader — inject style/campaign/hand/nsfw LoRA
      if (classType === 'LoraLoader' || classType === 'LoRALoader') {
        const meta = (n._meta as Record<string, unknown>);
        const title = meta?.title as string || '';

        if (title.toLowerCase().includes('style')) {
          // Name override only when a style LoRA is explicitly configured. Weight
          // override fires independently — otherwise face-lock's styleLoraWeight=0.6
          // never applied because config.styleLora is undefined by default.
          if (params.styleLora) {
            inputs.lora_name = params.styleLora;
          }
          if (params.styleLoraWeight !== undefined) {
            inputs.strength_model = params.styleLoraWeight;
            inputs.strength_clip = params.styleLoraWeight;
          }
        } else if (title.toLowerCase().includes('campaign')) {
          if (params.campaignLora) {
            inputs.lora_name = params.campaignLora;
          }
          if (params.campaignLoraWeight !== undefined) {
            inputs.strength_model = params.campaignLoraWeight;
            inputs.strength_clip = params.campaignLoraWeight;
          }
        } else if (title.toLowerCase().includes('detail') && !title.toLowerCase().includes('hand')) {
          if (params.detailLoraWeight !== undefined) {
            inputs.strength_model = params.detailLoraWeight;
            inputs.strength_clip = params.detailLoraWeight;
          }
        } else if (title.toLowerCase().includes('hand detail')) {
          if (params.handDetailLoraWeight !== undefined) {
            inputs.strength_model = params.handDetailLoraWeight;
            inputs.strength_clip = params.handDetailLoraWeight;
          }
        } else if (title.toLowerCase().includes('nsfw unlock')) {
          // NSFW LoRA: strength 0 (disabled) unless campaign allows nudity
          if (params.nsfwUnlock) {
            inputs.strength_model = params.nsfwUnlockWeight ?? 0.8;
            inputs.strength_clip = params.nsfwUnlockWeight ?? 0.8;
            console.log('[ComfyUI] NSFW Unlock LoRA enabled, strength:', params.nsfwUnlockWeight ?? 0.8);
          } else {
            inputs.strength_model = 0.0;
            inputs.strength_clip = 0.0;
          }
        }
      }
    }

    // ── Skip LoRAs at strength 0 by rewiring the chain ──
    // If a LoRA has strength_model == 0 AND strength_clip == 0, remove it and
    // point all downstream nodes that referenced its outputs to its inputs instead.
    const loraNodes = Object.entries(w)
      .filter(([, n]) => {
        const cls = (n as Record<string, unknown>).class_type as string;
        return cls === 'LoraLoader' || cls === 'LoRALoader';
      })
      .map(([id, n]) => ({ id, node: n as Record<string, unknown> }));

    for (const { id, node } of loraNodes) {
      const inputs = node.inputs as Record<string, unknown>;
      if (inputs.strength_model === 0 && inputs.strength_clip === 0) {
        // This LoRA is a no-op — rewire downstream refs to skip it
        const modelInput = inputs.model; // e.g. ["16", 0]
        const clipInput = inputs.clip;   // e.g. ["16", 1]
        // Find all nodes that reference this LoRA's outputs and redirect
        for (const [otherId, otherNode] of Object.entries(w)) {
          if (otherId === id) continue;
          const otherInputs = (otherNode as Record<string, unknown>).inputs as Record<string, unknown> | undefined;
          if (!otherInputs) continue;
          for (const [key, val] of Object.entries(otherInputs)) {
            if (Array.isArray(val) && val[0] === id) {
              if (val[1] === 0) otherInputs[key] = modelInput;  // model output
              if (val[1] === 1) otherInputs[key] = clipInput;   // clip output
            }
          }
        }
        delete w[id];
        const title = ((node._meta as Record<string, unknown>)?.title as string) || id;
        console.log(`[ComfyUI] Skipped LoRA "${title}" (strength 0) — removed from chain`);
      }
    }

    // ── img2img: replace EmptyLatentImage with VAEEncode of base image ──
    // Used for refine pass: sketch establishes composition, draft adds style.
    if (params.baseImagePath) {
      // Find the EmptyLatentImage node and the KSampler that uses it
      let emptyLatentId: string | null = null;
      let ksamplerEntry: [string, Record<string, unknown>] | null = null;

      for (const [id, node] of Object.entries(w)) {
        const n = node as Record<string, unknown>;
        if (n.class_type === 'EmptyLatentImage') emptyLatentId = id;
        if (n.class_type === 'KSampler' || n.class_type === 'KSamplerAdvanced') {
          ksamplerEntry = [id, n];
        }
      }

      if (emptyLatentId && ksamplerEntry) {
        // Find the VAE node ID (VAELoader or VAEDecode's vae input)
        let vaeSourceId: string | null = null;
        for (const [id, node] of Object.entries(w)) {
          const n = node as Record<string, unknown>;
          if (n.class_type === 'VAELoader') { vaeSourceId = id; break; }
        }

        if (vaeSourceId) {
          // Add LoadImage node for the base image
          const baseLoadId = '900';
          w[baseLoadId] = {
            class_type: 'LoadImage',
            inputs: { image: params.baseImagePath },
            _meta: { title: 'Base Image (img2img)' },
          };

          // Add VAEEncode node
          const vaeEncodeId = '901';
          w[vaeEncodeId] = {
            class_type: 'VAEEncode',
            inputs: {
              pixels: [baseLoadId, 0],
              vae: [vaeSourceId, 0],
            },
            _meta: { title: 'VAE Encode Base' },
          };

          // Rewire KSampler: latent_image from EmptyLatentImage → VAEEncode
          const ksInputs = ksamplerEntry[1].inputs as Record<string, unknown>;
          ksInputs.latent_image = [vaeEncodeId, 0];

          // Remove EmptyLatentImage node
          delete w[emptyLatentId];

          console.log(`[ComfyUI] img2img: replaced EmptyLatentImage with VAEEncode of base image, denoise: ${params.denoise}`);
        }
      }
    }

    // ── Secondary PuLID: chain a second ApplyPulidFlux for low-weight detail refs ──
    // Primary ApplyPulidFlux node (already configured above with image=referenceImagePath,
    // weight=pulidWeight) handles the dominant identity.
    // If we have secondary refs, chain a SECOND ApplyPulidFlux node:
    //   - model input = primary node's output (stacks embeddings)
    //   - image input = batched secondary refs (ImageBatch if >1)
    //   - weight = secondaryPulidWeight (low, so they nudge details without taking over)
    // Then rewire whatever consumed the primary's model output to consume the secondary's.
    if (params.referenceImagePaths && params.referenceImagePaths.length > 0) {
      let primaryId: string | null = null;
      for (const [id, node] of Object.entries(w)) {
        const ct = (node as Record<string, unknown>).class_type as string;
        if (ct === 'ApplyPulidFlux') { primaryId = id; break; }
      }

      if (primaryId) {
        const primaryNode = w[primaryId] as Record<string, unknown>;
        const primaryInputs = primaryNode.inputs as Record<string, unknown>;
        const secondaryCount = params.referenceImagePaths.length;
        const secondaryWeight = params.secondaryPulidWeight ?? 0.3;

        // Build LoadImage nodes for each secondary, then chain ImageBatch if >1.
        let secondaryImageRef: unknown;
        if (secondaryCount === 1) {
          const loadId = 'pulid_sec_load_0';
          w[loadId] = {
            class_type: 'LoadImage',
            inputs: { image: params.referenceImagePaths[0] },
            _meta: { title: 'PuLID Secondary Ref' },
          };
          secondaryImageRef = [loadId, 0];
        } else {
          // First two LoadImages → ImageBatch, then chain more with additional ImageBatch nodes
          const load0 = 'pulid_sec_load_0';
          w[load0] = { class_type: 'LoadImage', inputs: { image: params.referenceImagePaths[0] }, _meta: { title: 'PuLID Secondary 0' } };
          let lastOutput: unknown = [load0, 0];
          for (let i = 1; i < secondaryCount; i++) {
            const loadId = `pulid_sec_load_${i}`;
            const batchId = `pulid_sec_batch_${i}`;
            w[loadId] = { class_type: 'LoadImage', inputs: { image: params.referenceImagePaths[i] }, _meta: { title: `PuLID Secondary ${i}` } };
            w[batchId] = { class_type: 'ImageBatch', inputs: { image1: lastOutput, image2: [loadId, 0] }, _meta: { title: `PuLID Secondary Batch ${i}` } };
            lastOutput = [batchId, 0];
          }
          secondaryImageRef = lastOutput;
        }

        // Create the secondary ApplyPulidFlux, chained off the primary's model output.
        const secondaryId = 'pulid_secondary_apply';
        w[secondaryId] = {
          class_type: 'ApplyPulidFlux',
          inputs: {
            model: [primaryId, 0],                 // chain: primary → secondary
            pulid_flux: primaryInputs.pulid_flux,   // reuse same loader outputs
            eva_clip: primaryInputs.eva_clip,
            face_analysis: primaryInputs.face_analysis,
            image: secondaryImageRef,
            weight: secondaryWeight,
            start_at: primaryInputs.start_at ?? 0,
            end_at: primaryInputs.end_at ?? 1,
          },
          _meta: { title: 'PuLID Secondary (low weight)' },
        };

        // Rewire downstream: any node that referenced [primaryId, 0] for model flow
        // should now reference [secondaryId, 0] so the secondary's output is what
        // reaches the KSampler. (Nodes referencing primary for pulid_flux/eva_clip/
        // face_analysis outputs are NOT rewired — those aren't model outputs.)
        for (const [otherId, otherNode] of Object.entries(w)) {
          if (otherId === primaryId || otherId === secondaryId) continue;
          const otherInputs = (otherNode as Record<string, unknown>).inputs as Record<string, unknown> | undefined;
          if (!otherInputs) continue;
          for (const [key, val] of Object.entries(otherInputs)) {
            if (Array.isArray(val) && val[0] === primaryId && val[1] === 0) {
              // This was consuming primary's model output — redirect to secondary.
              otherInputs[key] = [secondaryId, 0];
            }
          }
        }

        console.log(`[ComfyUI] PuLID chained: primary weight=${primaryInputs.weight}, secondary weight=${secondaryWeight} (${secondaryCount} ref${secondaryCount > 1 ? 's' : ''})`);
      }
    }

    return w;
  }

  // ============================================================
  // Image Storage
  // ============================================================

  private async savePortrait(
    characterId: string,
    imageData: Buffer,
    step?: string,  // e.g. 'sketch' | 'refined' — creates a subfolder so step 1 vs step 2 outputs are organized
  ): Promise<{ imagePath: string; thumbnailPath: string }> {
    const generationId = crypto.randomUUID();
    const relDir = step
      ? path.join(PORTRAIT_ROOT, characterId, step)
      : path.join(PORTRAIT_ROOT, characterId);
    const dirPath = path.join('public', relDir);
    await fs.mkdir(dirPath, { recursive: true });

    // Save full portrait as WebP (display) and PNG (PuLID reference, max quality)
    const webpPath = path.join(relDir, `${generationId}.webp`);
    const pngPath = path.join(relDir, `${generationId}.png`);
    await Promise.all([
      sharp(imageData).webp({ quality: 90 }).toFile(path.join('public', webpPath)),
      fs.writeFile(path.join('public', pngPath), imageData),
    ]);

    const thumbPath = path.join(relDir, `${generationId}_thumb.webp`);
    await sharp(imageData).resize(256, 256, { fit: 'cover' }).webp({ quality: 80 }).toFile(path.join('public', thumbPath));

    // Normalize to forward slashes for URLs (Windows path.join returns backslashes)
    return {
      imagePath: '/' + webpPath.replace(/\\/g, '/'),
      thumbnailPath: '/' + thumbPath.replace(/\\/g, '/'),
    };
  }

  // ============================================================
  // ComfyUI Lifecycle
  // ============================================================

  /**
   * Ensure ComfyUI is running. If not, start it as a child process.
   * The process persists across requests (singleton) and is cleaned up on app exit.
   */
  private async ensureRunning(): Promise<void> {
    // Already running?
    if (await this.isAvailable()) return;

    // Another request is already starting it — wait
    if (comfyStarting) {
      return this.waitForStartup();
    }

    comfyStarting = true;
    try {
      // Verify ComfyUI directory exists
      await fs.access(path.join(COMFYUI_PATH, 'main.py'));

      console.log('[ComfyUI] Starting server (PULID_KEEP_HAIR=1 for secondary PuLID hair transfer)...');
      comfyProcess = spawn('python', ['main.py', '--normalvram', '--listen', '127.0.0.1', '--port', '8188'], {
        cwd: COMFYUI_PATH,
        stdio: 'ignore',
        detached: false,
        windowsHide: true,
        // PULID_KEEP_HAIR=1 flips pulidflux.py's bg_label from default
        // (masks hair) to the alternate (preserves hair). Required for the
        // secondary PuLID chain in body gen — without it, secondaries only
        // transfer face, not hair.
        env: { ...process.env, PULID_KEEP_HAIR: '1' },
      });

      comfyProcess.on('error', (err) => {
        console.error('[ComfyUI] Process error:', err.message);
        comfyProcess = null;
      });

      comfyProcess.on('exit', (code) => {
        console.log(`[ComfyUI] Process exited with code ${code}`);
        comfyProcess = null;
      });

      // Clean up on app exit
      const cleanup = () => {
        if (comfyProcess) {
          console.log('[ComfyUI] Shutting down...');
          comfyProcess.kill();
          comfyProcess = null;
        }
      };
      process.once('exit', cleanup);
      process.once('SIGINT', cleanup);
      process.once('SIGTERM', cleanup);

      await this.waitForStartup();
      console.log('[ComfyUI] Server ready.');
    } catch (err) {
      throw new Error(
        `Failed to start ComfyUI at ${COMFYUI_PATH}: ${err instanceof Error ? err.message : String(err)}. ` +
        'Ensure Python and ComfyUI are installed.'
      );
    } finally {
      comfyStarting = false;
    }
  }

  /** Poll until ComfyUI responds or timeout */
  private async waitForStartup(): Promise<void> {
    const deadline = Date.now() + STARTUP_MAX_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, STARTUP_POLL_INTERVAL_MS));
      if (await this.isAvailable()) return;
    }
    throw new Error(`ComfyUI did not start within ${STARTUP_MAX_WAIT_MS / 1000}s`);
  }

  // ============================================================
  // VRAM Management
  // ============================================================

  /**
   * Free VRAM by unloading Ollama models.
   * The RTX 4060 has 8GB VRAM shared between Ollama (gemma2:9b) and ComfyUI.
   */
  private async freeVram(): Promise<void> {
    const { execSync } = require('child_process');

    // Kill Ollama process entirely — it uses 4+ GB RAM even when idle
    try {
      execSync('taskkill /F /IM ollama.exe 2>nul', { stdio: 'ignore' });
      console.log('[ComfyUI] Killed Ollama to free RAM');
    } catch {
      // Ollama may not be running — that's fine
    }

    // Shut down WSL — uses ~1.3GB RAM
    try {
      execSync('wsl --shutdown 2>nul', { stdio: 'ignore' });
      console.log('[ComfyUI] Shut down WSL to free RAM');
    } catch {
      // WSL may not be running
    }

    // Give OS time to reclaim memory
    await new Promise(r => setTimeout(r, 3000));
  }

  /** Tell ComfyUI to free VRAM after generation */
  private async releaseVram(): Promise<void> {
    try {
      await fetch(`${COMFYUI_URL}/free`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unload_models: true, free_memory: true }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Non-critical
    }
  }

  // ============================================================
  // ControlNet Support
  // ============================================================

  /** Check if ControlNet model is available */
  private async isControlNetAvailable(): Promise<boolean> {
    // Check for InstantX Union (preferred) or XLabs Canny (fallback)
    const candidates = [
      path.join(COMFYUI_PATH, 'models', 'controlnet', 'flux-controlnet-union-pro2-fp8.safetensors'),
      path.join(COMFYUI_PATH, 'models', 'controlnet', 'flux-controlnet-union.safetensors'),
      path.join(COMFYUI_PATH, 'models', 'xlabs', 'controlnets', 'flux-canny-controlnet-v3.safetensors'),
    ];
    for (const p of candidates) {
      try { await fs.access(p); return true; } catch { /* next */ }
    }
    return false;
  }

  /**
   * Get a bundled reference image for a specific angle. These are face-only
   * photos at precise angles — ControlNet Canny extracts edges to force
   * the generation composition. Identity comes from PuLID, not these refs.
   */
  private async getAngleReferenceImage(angle: string): Promise<string | null> {
    // Map angle keys to bundled reference filenames
    const ANGLE_REF_FILES: Record<string, string> = {
      front: 'front.jpg',
      three_quarter_left: 'three_quarter_left.jpg',
      three_quarter_right: 'three_quarter_right.jpg',
      profile_left: 'profile_left.jpg',
      profile_right: 'profile_right.jpg',
    };

    const filename = ANGLE_REF_FILES[angle];
    if (!filename) return null;

    const refPath = `${PORTRAIT_ROOT}/angle-refs/${filename}`;
    // Try both relative and absolute paths (process.cwd() may vary)
    const candidates = [
      path.join('public', refPath),
      path.join(process.cwd(), 'public', refPath),
    ];

    for (const fullRefPath of candidates) {
      try {
        await fs.access(fullRefPath);
        console.log(`[ControlNet] Found angle ref: ${fullRefPath}`);
        return `/${refPath}`;
      } catch {
        // try next
      }
    }
    console.log(`[ControlNet] Angle reference not found for "${angle}". Tried:`, candidates);
    return null;
  }

  /**
   * Try workflows in priority order with fallbacks.
   * First success wins; failures cascade to next workflow.
   */
  private failedWorkflows: string[] = [];

  private async tryWorkflows(
    workflowNames: string[],
    params: ComfyUIWorkflowParams,
  ): Promise<{ output: { filename: string; subfolder: string; type: string }; workflowName: string; failedWorkflows: string[] }> {
    this.failedWorkflows = [];
    for (let i = 0; i < workflowNames.length; i++) {
      const name = workflowNames[i];
      try {
        const workflow = await this.loadWorkflow(name);
        const preparedWorkflow = this.injectWorkflowParams(workflow, params);
        const clientId = crypto.randomUUID();
        const queueResponse = await this.queuePrompt(preparedWorkflow, clientId);
        const output = await this.waitForCompletion(queueResponse.prompt_id);
        console.log(`[ComfyUI] Generation complete using workflow: ${name}`);
        return { output, workflowName: name, failedWorkflows: this.failedWorkflows };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.failedWorkflows.push(`${name}: ${errMsg}`);
        const isLast = i === workflowNames.length - 1;
        if (isLast) throw err;
        console.warn(`[ComfyUI] Workflow "${name}" failed, trying next:`, errMsg);
      }
    }
    throw new Error('All workflows failed');
  }

  // ============================================================
  // Two-Pass Hair Inpainting
  // ============================================================

  /**
   * Generate an oval face mask — white = face (keep), black = hair/background (inpaint).
   * For ComfyUI inpainting, the MASK is what gets regenerated (white = inpaint).
   * So we create an inverted mask: white everywhere EXCEPT the face oval.
   */
  private async generateHairMask(imageData: Buffer): Promise<Buffer> {
    const meta = await sharp(imageData).metadata();
    const w = meta.width || 640;
    const h = meta.height || 640;

    // Face oval: tight around face features only — expose forehead, sides, chin area for inpainting
    const cx = Math.round(w / 2);
    const cy = Math.round(h * 0.50);  // Face center at middle
    const rx = Math.round(w * 0.22);  // Tight horizontal radius (just cheeks)
    const ry = Math.round(h * 0.25);  // Tight vertical radius (eyes to mouth)

    // Create SVG with white background (inpaint) and black oval (keep face)
    const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${w}" height="${h}" fill="white"/>
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="black"/>
    </svg>`;

    return sharp(Buffer.from(svg))
      .png()
      .toBuffer();
  }

  /**
   * Pass 2: Inpaint the hair region of a face portrait.
   * Takes the pass 1 image, generates a face-shaped mask, and inpaints
   * everything outside the face with a hair-control prompt.
   */
  private async inpaintHair(
    pass1Image: Buffer,
    params: ComfyUIWorkflowParams,
  ): Promise<Buffer> {
    // 1. Generate the hair mask
    const maskBuffer = await this.generateHairMask(pass1Image);

    // 2. Upload pass 1 image and mask to ComfyUI
    const pass1Name = await this.uploadBuffer(pass1Image, 'pass1_face.png');
    const maskName = await this.uploadBuffer(maskBuffer, 'hair_mask.png');

    // 3. Load and configure the inpainting workflow
    const workflow = await this.loadWorkflow('hair-inpaint');
    const w = JSON.parse(JSON.stringify(workflow));

    // Strip comment keys
    for (const key of Object.keys(w)) {
      if (key.startsWith('_')) delete w[key];
    }

    // Apply model fallbacks (same as main pipeline)
    const { existsSync } = require('fs');
    const q4ksPath = path.join(COMFYUI_PATH, 'models', 'unet', 'flux1-dev-Q4_K_S.gguf');
    if (!existsSync(q4ksPath) || require('fs').statSync(q4ksPath).size < 6_800_000_000) {
      for (const [, node] of Object.entries(w)) {
        const inputs = (node as Record<string, unknown>).inputs as Record<string, unknown>;
        if (inputs?.unet_name === 'flux1-dev-Q4_K_S.gguf') inputs.unet_name = 'flux1-dev-Q4_0.gguf';
      }
    }
    const t5fp8Path = path.join(COMFYUI_PATH, 'models', 'clip', 't5xxl_fp8_e4m3fn.safetensors');
    const t5fp8Ready = existsSync(t5fp8Path) && require('fs').statSync(t5fp8Path).size > 4_800_000_000;
    if (t5fp8Ready) {
      for (const [, node] of Object.entries(w)) {
        if ((node as Record<string, unknown>).class_type === 'DualCLIPLoaderGGUF') {
          (node as Record<string, unknown>).class_type = 'DualCLIPLoader';
        }
      }
    } else {
      for (const [, node] of Object.entries(w)) {
        const inputs = (node as Record<string, unknown>).inputs as Record<string, unknown>;
        if (inputs?.clip_name1 === 't5xxl_fp8_e4m3fn.safetensors') {
          inputs.clip_name1 = 't5-v1_1-xxl-encoder-Q4_K_M.gguf';
        }
      }
    }

    // Inject prompts and images — split for dual CLIP encoding
    const hairClipL = 'hair pulled back tightly, bun behind head, forehead exposed, ears visible, plain grey background';
    const hairT5xxl = 'The subject has their hair pulled back very tightly in a bun behind the head. All hair is swept away from the face. The forehead is fully exposed and ears are visible. Plain grey background.';
    const hairNegative = 'loose hair, bangs, hair on forehead, hair covering face';

    for (const [, node] of Object.entries(w)) {
      const n = node as Record<string, unknown>;
      const cls = n.class_type as string;
      const inputs = n.inputs as Record<string, unknown>;
      const title = ((n._meta as Record<string, unknown>)?.title as string) || '';

      if (cls === 'CLIPTextEncodeFlux') {
        inputs.clip_l = hairClipL;
        inputs.t5xxl = hairT5xxl;
      }
      if (cls === 'CLIPTextEncode' && title.toLowerCase().includes('negative')) {
        inputs.text = hairNegative;
      }
      if (cls === 'LoadImage') {
        if (title.includes('Pass 1')) inputs.image = pass1Name;
        if (title.includes('Hair Mask')) inputs.image = maskName;
      }
      if (cls === 'KSampler') {
        inputs.seed = params.seed + 1;  // Different seed from pass 1
        inputs.steps = 15;
        inputs.denoise = 0.85;
      }
    }

    // 4. Queue and wait
    const clientId = crypto.randomUUID();
    const queueResponse = await this.queuePrompt(w, clientId);
    const outputInfo = await this.waitForCompletion(queueResponse.prompt_id);

    // 5. Download inpainted result
    return this.downloadImage(outputInfo.filename, outputInfo.subfolder, outputInfo.type);
  }

  /**
   * AUTOTEST3 RECIPE — Body pass 2 (head extension only).
   *
   * Pass 1 produced a 768x768 body with feet visible at bottom, head cropped
   * ABOVE the frame. This method pads UP by 384px (final canvas 768x1152),
   * then inpaints the new top 384 strip with head + neck connecting to the
   * existing shoulders. Bottom 768 (pass 1 body+feet) is preserved.
   *
   * Head gets a generous 384x768 region — large enough that PuLID renders a
   * sharp face without "tiny floating egg head" artifacts.
   */
  private async outpaintHeadAbove(
    bodyImage: Buffer,
    params: ComfyUIWorkflowParams,
  ): Promise<Buffer> {
    const HEAD_BAND = 384;
    const BODY_SIZE = 768;
    const OUT_W = 768;
    const OUT_H = HEAD_BAND + BODY_SIZE; // 1152

    // 1. Pad pass 1 image upward (add 384 grey above).
    const padded = await sharp(bodyImage)
      .resize(BODY_SIZE, BODY_SIZE, { fit: 'fill' })
      .extend({
        top: HEAD_BAND, bottom: 0, left: 0, right: 0,
        background: { r: 180, g: 180, b: 180 },
      })
      .png()
      .toBuffer();

    // 2. Mask: top 384 = white (inpaint), bottom 768 = black (preserve).
    const maskSvg = `<svg width="${OUT_W}" height="${OUT_H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${OUT_W}" height="${OUT_H}" fill="black"/>
      <rect x="0" y="0" width="${OUT_W}" height="${HEAD_BAND}" fill="white"/>
    </svg>`;
    const maskBuf = await sharp(Buffer.from(maskSvg)).png().toBuffer();

    const stamp = Date.now();
    const paddedName = await this.uploadBuffer(padded, `body_p2_padded_${stamp}.png`);
    const maskName = await this.uploadBuffer(maskBuf, `body_p2_mask_${stamp}.png`);

    // 3. Load PuLID workflow + GGUF→fp8 swap
    const w = JSON.parse(JSON.stringify(await this.loadWorkflow('character-portrait-pulid')));
    for (const k of Object.keys(w)) if (k.startsWith('_')) delete w[k];
    for (const node of Object.values(w) as Record<string, unknown>[]) {
      if ((node as Record<string, unknown>).class_type === 'DualCLIPLoaderGGUF') {
        (node as Record<string, unknown>).class_type = 'DualCLIPLoader';
      }
    }

    // 4. Pass 2 prompt: head + neck attached to existing shoulders (visible at bottom of head strip).
    const p2ClipL = 'in the style of ckpf, aidmafluxpro1.1, hyperrealistic photograph, extremely detailed, a head and face attached to the existing shoulders below by the neck, face centered horizontally, proportional adult human head, head fills the upper portion of the frame, neutral grey background, subtle painterly quality';
    const p2T5xxl = 'Outpainting extension above an existing nude body photograph. The body in the lower portion of the frame continues upward with a proportionally sized adult head attached via the neck to the existing shoulders. The face is centered horizontally and looks straight ahead. Realistic head proportions, head smoothly attached to neck, head NOT floating or disconnected. Neutral grey background matching the existing body lighting.';
    const p2Neg = 'floating head, disconnected head, head not attached to body, head separated from body, two heads, duplicate body, mini body, tiny person, robe, cloak, cape, dress, gown, clothing, garment, jewelry, headdress, crown, hat, helmet';

    let emptyLatentId: string | null = null;
    let vaeNodeId: string | null = null;
    let ksamplerId: string | null = null;
    for (const [id, node] of Object.entries(w) as [string, Record<string, unknown>][]) {
      const ct = node.class_type as string;
      if (ct === 'EmptyLatentImage') emptyLatentId = id;
      if (ct === 'VAELoader') vaeNodeId = id;
      if (ct === 'KSampler') ksamplerId = id;
    }
    if (!emptyLatentId || !vaeNodeId || !ksamplerId) {
      throw new Error(`outpaintHeadAbove: missing nodes`);
    }

    const loadPaddedId = `p2_load_${stamp}`;
    const loadMaskId = `p2_mask_${stamp}`;
    const imgToMaskId = `p2_i2m_${stamp}`;
    const growMaskId = `p2_grow_${stamp}`;
    const vaeEncodeId = `p2_enc_${stamp}`;
    const setMaskId = `p2_setmask_${stamp}`;

    w[loadPaddedId] = { class_type: 'LoadImage', inputs: { image: paddedName }, _meta: { title: 'Pass2 Padded' } };
    w[loadMaskId] = { class_type: 'LoadImage', inputs: { image: maskName }, _meta: { title: 'Pass2 Mask' } };
    w[imgToMaskId] = { class_type: 'ImageToMask', inputs: { image: [loadMaskId, 0], channel: 'red' }, _meta: { title: 'Mask→Mask' } };
    w[growMaskId] = { class_type: 'GrowMask', inputs: { mask: [imgToMaskId, 0], expand: 24, tapered_corners: true }, _meta: { title: 'Feather' } };
    w[vaeEncodeId] = { class_type: 'VAEEncode', inputs: { pixels: [loadPaddedId, 0], vae: [vaeNodeId, 0] }, _meta: { title: 'Encode' } };
    w[setMaskId] = { class_type: 'SetLatentNoiseMask', inputs: { samples: [vaeEncodeId, 0], mask: [growMaskId, 0] }, _meta: { title: 'Noise Mask' } };

    const ksamplerInputs = (w[ksamplerId] as Record<string, unknown>).inputs as Record<string, unknown>;
    ksamplerInputs.latent_image = [setMaskId, 0];
    ksamplerInputs.denoise = 0.95;
    ksamplerInputs.steps = 15;
    ksamplerInputs.cfg = 1.0;
    ksamplerInputs.seed = Math.floor(Math.random() * 2147483647);

    delete w[emptyLatentId];

    for (const [, node] of Object.entries(w) as [string, Record<string, unknown>][]) {
      const cls = node.class_type as string;
      const inputs = node.inputs as Record<string, unknown>;
      const title = ((node._meta as Record<string, unknown>)?.title as string || '').toLowerCase();
      if (!inputs) continue;

      if (cls === 'CLIPTextEncodeFlux' && title.includes('positive')) {
        inputs.clip_l = p2ClipL;
        inputs.t5xxl = p2T5xxl;
      }
      if (cls === 'CLIPTextEncode' && title.includes('negative')) {
        inputs.text = p2Neg;
      }
      if (cls === 'ApplyPulidFlux') {
        inputs.weight = 0.85;
      }
      if (cls === 'LoadImage' && (title.includes('pulid') || title.includes('reference'))) {
        if (params.referenceImagePath) inputs.image = params.referenceImagePath;
      }
      // Pass 2 LoRAs: just detail. Keep it light to fit 8GB alongside PuLID + base + mask.
      if (cls === 'LoraLoader') {
        if (title.includes('detail') && !title.includes('hand')) {
          inputs.strength_model = 0.55; inputs.strength_clip = 0.55;
        } else {
          inputs.strength_model = 0; inputs.strength_clip = 0;
        }
      }
    }

    // Strip 0-weight LoRAs
    for (const [id, node] of Object.entries(w) as [string, Record<string, unknown>][]) {
      if ((node.class_type as string) !== 'LoraLoader') continue;
      const inputs = node.inputs as Record<string, unknown>;
      if (inputs.strength_model === 0 && inputs.strength_clip === 0) {
        const modelIn = inputs.model;
        const clipIn = inputs.clip;
        for (const other of Object.values(w) as Record<string, unknown>[]) {
          const oi = other.inputs as Record<string, unknown> | undefined;
          if (!oi) continue;
          for (const [k, v] of Object.entries(oi)) {
            if (Array.isArray(v) && v[0] === id) {
              if (v[1] === 0) oi[k] = modelIn;
              if (v[1] === 1) oi[k] = clipIn;
            }
          }
        }
        delete w[id];
      }
    }

    const clientId = crypto.randomUUID();
    const queueRes = await this.queuePrompt(w, clientId);
    const outputInfo = await this.waitForCompletion(queueRes.prompt_id);
    return this.downloadImage(outputInfo.filename, outputInfo.subfolder, outputInfo.type);
  }

  /**
   * FACE-DETAILER for body gens.
   *
   * Run BiSeNet (Segformer-B5) face-parsing on the body image to extract a
   * tight face oval mask (face_no_hair = skin/eyes/brows/nose/mouth, EXCLUDES
   * hair/neck/torso). Inpaint that masked region with PuLID at high weight
   * to sharpen the face. Body/torso/legs/hair are never touched.
   *
   * Adds ~10s mask + ~75s inpaint = ~90s on 8GB.
   */
  private async refineFaceWithBiSeNet(
    bodyImage: Buffer,
    params: ComfyUIWorkflowParams,
  ): Promise<Buffer> {
    const stamp = Date.now();
    const tmpRoot = path.join(process.cwd(), 'tmp', `face-refine-${stamp}`);
    await fs.mkdir(tmpRoot, { recursive: true });
    const bodyPath = path.join(tmpRoot, 'body.png');
    await fs.writeFile(bodyPath, bodyImage);

    // 1. Run face_parse.py via standalone's venv
    const repoRoot = path.resolve(process.cwd(), '..');
    const pythonExe = path.join(repoRoot, 'standalone', '.venv', 'Scripts', 'python.exe');
    const scriptPath = path.join(repoRoot, 'standalone', 'scripts', 'face_parse.py');
    const maskOutDir = path.join(tmpRoot, 'masks');

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(pythonExe, [
        scriptPath,
        bodyPath,
        '--out-dir', maskOutDir,
        '--region', 'head_with_hair',  // larger area = more pixels to refine
        '--feather', '6',                // tighter blend so the refinement isn't washed out
      ], { stdio: 'pipe', windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`face_parse.py exited ${code}: ${stderr.slice(0, 400)}`));
      });
      proc.on('error', reject);
    });

    const maskPath = path.join(maskOutDir, 'mask_head_with_hair.png');
    const maskBuffer = await fs.readFile(maskPath);

    // Sanity check: if mask is mostly black (BiSeNet didn't find a face) skip.
    const maskStats = await sharp(maskBuffer).stats();
    const meanWhite = maskStats.channels[0].mean;
    if (meanWhite < 5) {
      throw new Error(`face_no_hair mask is empty (mean=${meanWhite.toFixed(1)}) — face not detected`);
    }
    console.log(`[ComfyUI] Face mask: ${meanWhite.toFixed(1)} avg coverage`);

    // 2. Upload body + mask to ComfyUI
    const bodyName = await this.uploadBuffer(bodyImage, `face_refine_body_${stamp}.png`);
    const maskName = await this.uploadBuffer(maskBuffer, `face_refine_mask_${stamp}.png`);

    // 3. Build inpaint workflow
    const w = JSON.parse(JSON.stringify(await this.loadWorkflow('character-portrait-pulid')));
    for (const k of Object.keys(w)) if (k.startsWith('_')) delete w[k];
    for (const node of Object.values(w) as Record<string, unknown>[]) {
      if ((node as Record<string, unknown>).class_type === 'DualCLIPLoaderGGUF') {
        (node as Record<string, unknown>).class_type = 'DualCLIPLoader';
      }
    }

    // Face-focused prompt: tight on facial features. Body context preserved by mask.
    const fdClipL = 'in the style of ckpf, aidmafluxpro1.1, hyperrealistic close-up face, extremely detailed face, sharp focused eyes, fine pore skin texture, detailed lips, realistic facial features, soft natural lighting';
    const fdT5xxl = 'A hyperrealistic close-up face with extremely detailed skin showing fine pore texture, sharp focused eyes with detailed iris, realistic lips, detailed eyebrows. Crisp focus on facial features.';
    const fdNeg = 'blurry, soft focus, low detail, deformed face, distorted features, doll face, plastic skin, big head, oversized head';

    let emptyLatentId: string | null = null;
    let vaeNodeId: string | null = null;
    let ksamplerId: string | null = null;
    for (const [id, node] of Object.entries(w) as [string, Record<string, unknown>][]) {
      const ct = node.class_type as string;
      if (ct === 'EmptyLatentImage') emptyLatentId = id;
      if (ct === 'VAELoader') vaeNodeId = id;
      if (ct === 'KSampler') ksamplerId = id;
    }
    if (!emptyLatentId || !vaeNodeId || !ksamplerId) {
      throw new Error('refineFaceWithBiSeNet: missing nodes');
    }

    const loadBodyId = `fd_load_${stamp}`;
    const loadMaskId = `fd_mask_${stamp}`;
    const imgToMaskId = `fd_i2m_${stamp}`;
    const growMaskId = `fd_grow_${stamp}`;
    const vaeEncodeId = `fd_enc_${stamp}`;
    const setMaskId = `fd_setmask_${stamp}`;

    w[loadBodyId] = { class_type: 'LoadImage', inputs: { image: bodyName }, _meta: { title: 'FD Body' } };
    w[loadMaskId] = { class_type: 'LoadImage', inputs: { image: maskName }, _meta: { title: 'FD Mask' } };
    w[imgToMaskId] = { class_type: 'ImageToMask', inputs: { image: [loadMaskId, 0], channel: 'red' }, _meta: { title: 'FD Mask→Mask' } };
    w[growMaskId] = { class_type: 'GrowMask', inputs: { mask: [imgToMaskId, 0], expand: 4, tapered_corners: true }, _meta: { title: 'FD Feather' } };
    w[vaeEncodeId] = { class_type: 'VAEEncode', inputs: { pixels: [loadBodyId, 0], vae: [vaeNodeId, 0] }, _meta: { title: 'FD Encode' } };
    w[setMaskId] = { class_type: 'SetLatentNoiseMask', inputs: { samples: [vaeEncodeId, 0], mask: [growMaskId, 0] }, _meta: { title: 'FD Noise Mask' } };

    const ksamplerInputs = (w[ksamplerId] as Record<string, unknown>).inputs as Record<string, unknown>;
    ksamplerInputs.latent_image = [setMaskId, 0];
    ksamplerInputs.denoise = 0.7;   // higher — actually rebuild the head with PuLID precision
    ksamplerInputs.steps = 18;       // a few more steps so the refine resolves cleanly
    ksamplerInputs.cfg = 1.0;
    ksamplerInputs.seed = Math.floor(Math.random() * 2147483647);

    delete w[emptyLatentId];

    for (const [, node] of Object.entries(w) as [string, Record<string, unknown>][]) {
      const cls = node.class_type as string;
      const inputs = node.inputs as Record<string, unknown>;
      const title = ((node._meta as Record<string, unknown>)?.title as string || '').toLowerCase();
      if (!inputs) continue;

      if (cls === 'CLIPTextEncodeFlux' && title.includes('positive')) {
        inputs.clip_l = fdClipL;
        inputs.t5xxl = fdT5xxl;
      }
      if (cls === 'CLIPTextEncode' && title.includes('negative')) {
        inputs.text = fdNeg;
      }
      if (cls === 'ApplyPulidFlux') {
        inputs.weight = 0.95;  // near-max face lock — this is THE face refinement
      }
      if (cls === 'LoadImage' && (title.includes('pulid') || title.includes('reference'))) {
        if (params.referenceImagePath) inputs.image = params.referenceImagePath;
      }
      if (cls === 'LoraLoader') {
        if (title.includes('detail') && !title.includes('hand')) {
          inputs.strength_model = 0.6; inputs.strength_clip = 0.6;
        } else {
          inputs.strength_model = 0; inputs.strength_clip = 0;
        }
      }
    }

    // Strip 0-weight LoRAs
    for (const [id, node] of Object.entries(w) as [string, Record<string, unknown>][]) {
      if ((node.class_type as string) !== 'LoraLoader') continue;
      const inputs = node.inputs as Record<string, unknown>;
      if (inputs.strength_model === 0 && inputs.strength_clip === 0) {
        const modelIn = inputs.model;
        const clipIn = inputs.clip;
        for (const other of Object.values(w) as Record<string, unknown>[]) {
          const oi = other.inputs as Record<string, unknown> | undefined;
          if (!oi) continue;
          for (const [k, v] of Object.entries(oi)) {
            if (Array.isArray(v) && v[0] === id) {
              if (v[1] === 0) oi[k] = modelIn;
              if (v[1] === 1) oi[k] = clipIn;
            }
          }
        }
        delete w[id];
      }
    }

    const clientId = crypto.randomUUID();
    const queueRes = await this.queuePrompt(w, clientId);
    const outputInfo = await this.waitForCompletion(queueRes.prompt_id);
    const refined = await this.downloadImage(outputInfo.filename, outputInfo.subfolder, outputInfo.type);

    // Cleanup tmp dir (best effort)
    fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});

    return refined;
  }

  /**
   * (Disused) Body pass 2 that inpainted both head AND feet strips. Kept for
   * reference — the simpler outpaintHeadAbove is the active path.
   */
  private async inpaintHeadAndFeet(
    torsoImage: Buffer,
    params: ComfyUIWorkflowParams,
  ): Promise<Buffer> {
    const TOP_BAND = 192;
    const BOT_BAND = 192;
    const TORSO_SIZE = 768;
    const OUT_W = 768;
    const OUT_H = TOP_BAND + TORSO_SIZE + BOT_BAND; // 1152

    // 1. Pad torso image vertically with neutral grey (matches "neutral grey background" in prompt).
    const padded = await sharp(torsoImage)
      .resize(TORSO_SIZE, TORSO_SIZE, { fit: 'fill' })
      .extend({
        top: TOP_BAND,
        bottom: BOT_BAND,
        left: 0,
        right: 0,
        background: { r: 180, g: 180, b: 180 },
      })
      .png()
      .toBuffer();

    // 2. Build inpaint mask: white where we INPAINT (top + bottom), black where we PRESERVE (middle torso).
    const maskSvg = `<svg width="${OUT_W}" height="${OUT_H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${OUT_W}" height="${OUT_H}" fill="black"/>
      <rect x="0" y="0" width="${OUT_W}" height="${TOP_BAND}" fill="white"/>
      <rect x="0" y="${TOP_BAND + TORSO_SIZE}" width="${OUT_W}" height="${BOT_BAND}" fill="white"/>
    </svg>`;
    const maskBuf = await sharp(Buffer.from(maskSvg)).png().toBuffer();

    // 3. Upload padded + mask to ComfyUI
    const stamp = Date.now();
    const paddedName = await this.uploadBuffer(padded, `body_pass2_padded_${stamp}.png`);
    const maskName = await this.uploadBuffer(maskBuf, `body_pass2_mask_${stamp}.png`);

    // 4. Load the PuLID workflow and mutate it for inpaint
    const w = JSON.parse(JSON.stringify(await this.loadWorkflow('character-portrait-pulid')));
    for (const k of Object.keys(w)) if (k.startsWith('_')) delete w[k];

    // GGUF → fp8 swap (same as main pipeline)
    for (const node of Object.values(w) as Record<string, unknown>[]) {
      if ((node as Record<string, unknown>).class_type === 'DualCLIPLoaderGGUF') {
        (node as Record<string, unknown>).class_type = 'DualCLIPLoader';
      }
    }

    // Pass 2 prompt: emphasize head (top) + feet (bottom) context. Torso is preserved
    // from pass 1 so we don't need to re-describe it — we just need FLUX to paint
    // head + feet coherently onto the standing torso.
    // Pass 2 prompt — middle is LOCKED (shoulders-to-knees torso from pass 1).
    // Top 192px: head + neck connecting to existing shoulders.
    // Bottom 192px: calves + feet connecting to existing knees.
    const p2ClipL = 'in the style of ckpf, aidmafluxpro1.1, hyperrealistic photograph, extremely detailed, a standing nude figure continues upward with a proportional head attached to the existing shoulders by the neck, face visible and centered, and continues downward with calves and bare feet attached below the existing knees, feet planted on the ground at the bottom of the frame, realistic human proportions, A-pose standing, neutral grey background, subtle painterly quality';
    const p2T5xxl = 'Outpainting extension of a cropped body photograph. The existing body in the middle of the frame (shoulders to knees) continues upward with a proportionally sized head attached via neck to the existing shoulders, face visible and centered horizontally. Below the existing knees, the lower legs continue downward with calves and bare feet planted on the ground at the bottom of the frame. Realistic adult human proportions, not oversized head, not floating disconnected head, head smoothly attached to neck, feet clearly visible on the ground. Neutral grey background with even lighting matching the existing body.';
    const p2Neg = 'floating head, disconnected head, head not attached to body, two bodies, mini body, tiny person, squished body, bobblehead, big head, oversized head, chibi, portrait framing, bust shot, close-up, duplicate body, extra figure, robe, cloak, cape, dress, gown, clothing, garment, jewelry, headdress, crown, hat, helmet';

    // Find key nodes
    let emptyLatentId: string | null = null;
    let vaeNodeId: string | null = null;
    let ksamplerId: string | null = null;
    for (const [id, node] of Object.entries(w) as [string, Record<string, unknown>][]) {
      const ct = node.class_type as string;
      if (ct === 'EmptyLatentImage') emptyLatentId = id;
      if (ct === 'VAELoader') vaeNodeId = id;
      if (ct === 'KSampler') ksamplerId = id;
    }
    if (!emptyLatentId || !vaeNodeId || !ksamplerId) {
      throw new Error(`inpaintHeadAndFeet: missing nodes — empty=${emptyLatentId} vae=${vaeNodeId} ksampler=${ksamplerId}`);
    }

    // Inject inpaint chain:
    //   LoadImage(padded) → VAEEncode → SetLatentNoiseMask(mask) → KSampler
    const loadPaddedId = `p2_load_padded_${stamp}`;
    const loadMaskId = `p2_load_mask_${stamp}`;
    const imgToMaskId = `p2_img_to_mask_${stamp}`;
    const growMaskId = `p2_grow_mask_${stamp}`;
    const vaeEncodeId = `p2_vae_enc_${stamp}`;
    const setMaskId = `p2_set_mask_${stamp}`;

    w[loadPaddedId] = { class_type: 'LoadImage', inputs: { image: paddedName }, _meta: { title: 'Pass2 Padded Body' } };
    w[loadMaskId] = { class_type: 'LoadImage', inputs: { image: maskName }, _meta: { title: 'Pass2 Mask' } };
    w[imgToMaskId] = { class_type: 'ImageToMask', inputs: { image: [loadMaskId, 0], channel: 'red' }, _meta: { title: 'Pass2 Mask→Mask' } };
    w[growMaskId] = { class_type: 'GrowMask', inputs: { mask: [imgToMaskId, 0], expand: 16, tapered_corners: true }, _meta: { title: 'Pass2 Feather' } };
    w[vaeEncodeId] = { class_type: 'VAEEncode', inputs: { pixels: [loadPaddedId, 0], vae: [vaeNodeId, 0] }, _meta: { title: 'Pass2 Encode' } };
    w[setMaskId] = { class_type: 'SetLatentNoiseMask', inputs: { samples: [vaeEncodeId, 0], mask: [growMaskId, 0] }, _meta: { title: 'Pass2 Noise Mask' } };

    // Rewire KSampler.latent_image FROM [emptyLatentId, 0] TO [setMaskId, 0].
    // Pass 2 at 15 steps, denoise 0.9 — enough detail for head/feet while keeping
    // pass 2 wall time to ~2 min. 20 steps at full denoise took 29 min under VRAM
    // pressure; 15 is the sweet spot.
    const ksamplerInputs = (w[ksamplerId] as Record<string, unknown>).inputs as Record<string, unknown>;
    ksamplerInputs.latent_image = [setMaskId, 0];
    ksamplerInputs.denoise = 0.9;
    ksamplerInputs.steps = 15;
    ksamplerInputs.cfg = 1.0;
    ksamplerInputs.seed = Math.floor(Math.random() * 2147483647);

    // Remove the unused EmptyLatentImage
    delete w[emptyLatentId];

    // Inject prompts + canvas dims + LoRA weights (match pass 1)
    for (const [, node] of Object.entries(w) as [string, Record<string, unknown>][]) {
      const cls = node.class_type as string;
      const inputs = node.inputs as Record<string, unknown>;
      const title = ((node._meta as Record<string, unknown>)?.title as string || '').toLowerCase();
      if (!inputs) continue;

      if (cls === 'CLIPTextEncodeFlux' && title.includes('positive')) {
        inputs.clip_l = p2ClipL;
        inputs.t5xxl = p2T5xxl;
      }
      if (cls === 'CLIPTextEncode' && title.includes('negative')) {
        inputs.text = p2Neg;
      }
      if (cls === 'ApplyPulidFlux') {
        inputs.weight = 0.8;  // strong face lock at head region
      }
      if (cls === 'LoadImage' && (title.includes('pulid') || title.includes('reference'))) {
        if (params.referenceImagePath) inputs.image = params.referenceImagePath;
      }
      // Pass 2 LoRAs: trim to just detail (for face sharpness). Style is already
      // baked into the pass 1 torso; NSFW isn't needed at head/feet. This cuts
      // ~1.5GB VRAM pressure so pass 2 fits on 8GB alongside PuLID + base + mask.
      if (cls === 'LoraLoader') {
        if (title.includes('detail') && !title.includes('hand')) {
          inputs.strength_model = 0.55; inputs.strength_clip = 0.55;
        } else {
          inputs.strength_model = 0; inputs.strength_clip = 0;
        }
      }
    }

    // Strip 0-weight LoRAs from the chain (keeps stack clean)
    for (const [id, node] of Object.entries(w) as [string, Record<string, unknown>][]) {
      if ((node.class_type as string) !== 'LoraLoader') continue;
      const inputs = node.inputs as Record<string, unknown>;
      if (inputs.strength_model === 0 && inputs.strength_clip === 0) {
        const modelIn = inputs.model;
        const clipIn = inputs.clip;
        for (const other of Object.values(w) as Record<string, unknown>[]) {
          const oi = other.inputs as Record<string, unknown> | undefined;
          if (!oi) continue;
          for (const [k, v] of Object.entries(oi)) {
            if (Array.isArray(v) && v[0] === id) {
              if (v[1] === 0) oi[k] = modelIn;
              if (v[1] === 1) oi[k] = clipIn;
            }
          }
        }
        delete w[id];
      }
    }

    // Queue + wait + download
    const clientId = crypto.randomUUID();
    const queueRes = await this.queuePrompt(w, clientId);
    const outputInfo = await this.waitForCompletion(queueRes.prompt_id);
    return this.downloadImage(outputInfo.filename, outputInfo.subfolder, outputInfo.type);
  }

  /**
   * Two-stage face refine for full-body gens. Crops the head region, regens
   * it at native face-lock resolution (768x768) with low denoise so PuLID
   * can paint crisp facial detail, then composites back onto the body.
   *
   * This is the "head rendered separately at higher resolution then pasted
   * onto the body" technique from the Tara sessions.
   */
  private async refineBodyFace(
    bodyImage: Buffer,
    params: ComfyUIWorkflowParams,
  ): Promise<Buffer> {
    const meta = await sharp(bodyImage).metadata();
    const W = meta.width || 768;
    const H = meta.height || 1152;

    // Face crop: center-horizontal square covering head + some neck/shoulder.
    // Head in a full body gen sits roughly in the top 0-30% of the frame.
    // Square crop of size ~W (face typically ~W/3 wide, so W-sized crop leaves
    // headroom above and includes shoulders below — good blend context).
    const cropSize = W;                     // 768
    const cropX = 0;                         // full width
    const cropY = 0;                         // from top
    const cropBuf = await sharp(bodyImage)
      .extract({ left: cropX, top: cropY, width: cropSize, height: cropSize })
      .png()
      .toBuffer();

    // Upload crop as img2img base
    const baseName = await this.uploadBuffer(cropBuf, `body_face_crop_${Date.now()}.png`);

    // Load the PuLID workflow and configure for face refine
    const w = JSON.parse(JSON.stringify(await this.loadWorkflow('character-portrait-pulid')));
    for (const k of Object.keys(w)) if (k.startsWith('_')) delete w[k];

    // GGUF → fp8 swap (same as main pipeline)
    for (const node of Object.values(w) as Record<string, unknown>[]) {
      if ((node as Record<string, unknown>).class_type === 'DualCLIPLoaderGGUF') {
        (node as Record<string, unknown>).class_type = 'DualCLIPLoader';
      }
    }

    // Face-focused prompt: style-consistent, detail-focused, no body-composition talk
    const faceClipL = 'in the style of ckpf, aidmafluxpro1.1, hyperrealistic fantasy portrait, extremely detailed, sharp focus, luminous detailed eyes, fine pore texture skin, close-up face portrait, face centered in frame, neutral grey background';
    const faceT5xxl = 'A hyperrealistic close-up face portrait with extremely detailed skin showing fine pore texture, luminous detailed eyes, crisp sharp focus. Face centered in the frame with a neutral grey background.';
    const faceNeg = 'blurry, low quality, deformed, disfigured, bad anatomy';

    // Face-refine params: low denoise (preserve composition), higher PuLID
    const refineSeed = Math.floor(Math.random() * 2147483647);

    for (const [, node] of Object.entries(w) as [string, Record<string, unknown>][]) {
      const cls = node.class_type as string;
      const inputs = node.inputs as Record<string, unknown>;
      const title = ((node._meta as Record<string, unknown>)?.title as string || '').toLowerCase();
      if (!inputs) continue;

      if (cls === 'EmptyLatentImage') { inputs.width = 768; inputs.height = 768; }
      if (cls === 'KSampler') {
        inputs.seed = refineSeed;
        inputs.steps = 15;
        inputs.cfg = 1.0;
        inputs.denoise = 0.45;
      }
      if (cls === 'CLIPTextEncodeFlux' && title.includes('positive')) {
        inputs.clip_l = faceClipL;
        inputs.t5xxl = faceT5xxl;
      }
      if (cls === 'CLIPTextEncode' && title.includes('negative')) {
        inputs.text = faceNeg;
      }
      if (cls === 'ApplyPulidFlux') {
        inputs.weight = 0.85;  // stronger for face-only refine
      }
      if (cls === 'LoadImage' && (title.includes('pulid') || title.includes('reference'))) {
        if (params.referenceImagePath) inputs.image = params.referenceImagePath;
      }
      // LoRA weights match face-lock (detail for sharpness; skip hand-detail)
      if (cls === 'LoraLoader') {
        if (title.includes('style')) { inputs.strength_model = 0.5; inputs.strength_clip = 0.5; }
        else if (title.includes('campaign')) { inputs.strength_model = 0.3; inputs.strength_clip = 0.3; }
        else if (title.includes('hand detail')) { inputs.strength_model = 0; inputs.strength_clip = 0; }
        else if (title.includes('nsfw')) { inputs.strength_model = 0; inputs.strength_clip = 0; }
        else if (title.includes('detail')) { inputs.strength_model = 0.7; inputs.strength_clip = 0.7; }
      }
    }

    // Inject img2img: convert EmptyLatentImage to VAEEncode(base) → SetLatentNoiseMask-less img2img.
    // Find the EmptyLatentImage node, replace with VAEEncode of the uploaded base.
    let emptyLatentId: string | null = null;
    let vaeNodeId: string | null = null;
    for (const [id, node] of Object.entries(w) as [string, Record<string, unknown>][]) {
      if ((node.class_type as string) === 'EmptyLatentImage') emptyLatentId = id;
      if ((node.class_type as string) === 'VAELoader' || (node.class_type as string) === 'VAELoaderFlux') vaeNodeId = id;
    }
    if (emptyLatentId && vaeNodeId) {
      const loadId = `face_base_load_${Date.now()}`;
      w[loadId] = { class_type: 'LoadImage', inputs: { image: baseName }, _meta: { title: 'Face Base' } };
      const encId = `face_base_enc_${Date.now()}`;
      w[encId] = {
        class_type: 'VAEEncode',
        inputs: { pixels: [loadId, 0], vae: [vaeNodeId, 0] },
        _meta: { title: 'Face Base Encode' },
      };
      // Rewire any consumer of [emptyLatentId, 0] → [encId, 0]
      for (const [otherId, otherNode] of Object.entries(w) as [string, Record<string, unknown>][]) {
        if (otherId === loadId || otherId === encId) continue;
        const inputs = otherNode.inputs as Record<string, unknown>;
        if (!inputs) continue;
        for (const [k, v] of Object.entries(inputs)) {
          if (Array.isArray(v) && v[0] === emptyLatentId) inputs[k] = [encId, 0];
        }
      }
      delete w[emptyLatentId];
    }

    // Queue + wait
    const clientId = crypto.randomUUID();
    const queueRes = await this.queuePrompt(w, clientId);
    const outputInfo = await this.waitForCompletion(queueRes.prompt_id);
    const refinedBuf = await this.downloadImage(outputInfo.filename, outputInfo.subfolder, outputInfo.type);

    // Resize refined back to the crop size and composite onto body.
    // Feather the bottom edge so the face-to-body transition doesn't show a seam.
    const refinedSized = await sharp(refinedBuf)
      .resize(cropSize, cropSize, { fit: 'fill' })
      .png()
      .toBuffer();

    // Build a vertical alpha gradient: opaque at top, feathered at bottom 15%.
    const featherPx = Math.round(cropSize * 0.15);
    const alphaSvg = `<svg width="${cropSize}" height="${cropSize}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="${((cropSize - featherPx) / cropSize).toFixed(3)}" stop-color="white" stop-opacity="1"/>
          <stop offset="1" stop-color="white" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="${cropSize}" height="${cropSize}" fill="url(#g)"/>
    </svg>`;
    const alphaBuf = await sharp(Buffer.from(alphaSvg)).extractChannel(0).toBuffer();

    const refinedWithAlpha = await sharp(refinedSized)
      .ensureAlpha()
      .joinChannel(alphaBuf)
      .png()
      .toBuffer();

    return sharp(bodyImage)
      .composite([{ input: refinedWithAlpha, left: cropX, top: cropY, blend: 'over' }])
      .png()
      .toBuffer();
  }

  /**
   * Crop a reference photo to just the face region before PuLID processes it.
   * Removes hair context so PuLID only embeds facial identity, not hairstyle.
   * For portrait/character art, face is typically centered in upper portion.
   */
  private async cropReferenceToFace(imagePath: string): Promise<Buffer> {
    const absolutePath = path.join(process.cwd(), 'public', imagePath.replace(/^\//, ''));
    const imageBuffer = await fs.readFile(absolutePath);
    const meta = await sharp(imageBuffer).metadata();
    const w = meta.width || 512;
    const h = meta.height || 512;

    // Face region: center-upper crop, ~45% of smallest dimension
    const cropSize = Math.round(Math.min(w, h) * 0.45);
    const left = Math.round((w - cropSize) / 2);
    const top = Math.round(h * 0.15);  // Face starts ~15% from top in portraits

    const cropped = await sharp(imageBuffer)
      .extract({
        left: Math.max(0, left),
        top: Math.max(0, top),
        width: Math.min(cropSize, w - left),
        height: Math.min(cropSize, h - top),
      })
      .resize(512, 512, { fit: 'contain', background: { r: 128, g: 128, b: 128 } })
      .png()
      .toBuffer();

    console.log(`[ComfyUI] Cropped ref: ${w}x${h} → ${cropSize}x${cropSize} face region @ (${left}, ${top})`);
    return cropped;
  }

  /** Upload a buffer directly to ComfyUI (not from disk) */
  private async uploadBuffer(buffer: Buffer, filename: string): Promise<string> {
    const formData = new FormData();
    formData.append('image', new Blob([new Uint8Array(buffer)]), filename);
    const res = await fetch(`${COMFYUI_URL}/upload/image`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(`Failed to upload buffer: ${res.status}`);
    const result = await res.json();
    return result.name;
  }

}
