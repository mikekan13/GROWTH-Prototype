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
} from '../types';
import { buildPortraitPrompt, type PromptBuildOptions } from '../prompt-builder';
import { getDefaultStyleConfig, applyCampaignStyle, TRIGGER_NSFW } from '../style-config';

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
      const promptOutput = buildPortraitPrompt(input.characterData, {
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
        // Body canvas bumped 768x1152 → 896x1344 so the face gets enough pixels.
        // At 768x1152 the head occupies ~200px square, not enough for PuLID detail.
        // At 896x1344 it's ~230px square — ~1.5x the detail area. Same 2:3 aspect.
        width: isSketch ? 384 : isDraft ? 640 : (input.overrides?.composition === 'full_body' ? 896 : DEFAULT_WIDTH),
        height: isSketch ? 384 : isDraft ? 640 : (input.overrides?.composition === 'full_body' ? 1344 : DEFAULT_HEIGHT),
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
        // Body reference: keep the painterly LoRA at half strength (brings
        // Tara's painterly realism without the illustrated-fantasy dominance).
        // 0 was too cartoony; 0.5 summoned gowns. 0.25 is the middle ground.
        styleLoraWeight: isSketch ? 0.6
          : isFaceLock ? (isFinal ? 0.75 : 0.6)
          : (input.creationMode && input.overrides?.composition === 'full_body') ? 0.4
          : config.loraStrength,
        detailLoraWeight: isSketch ? 0
          : isFaceLock ? (isFinal ? 0.7 : 0.5)
          : (input.creationMode && input.overrides?.composition === 'full_body') ? 0.4
          : 0.55,
        campaignLora: isSketch ? undefined : 'dark-fantasy-v2-flux.safetensors',
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
      const MAX_PULID_REFS = isFullBodyGen ? 5 : 3;
      const primaryIn = input.personaLock?.referenceImagePath;
      const batchIn = input.personaLock?.referenceImagePaths || [];
      // Merge primary + secondaries so the locked face stays at index 0.
      // Dedupe in case primaryIn is also in batchIn.
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
      let outputInfo: { filename: string; subfolder: string; type: string };
      const usePulid = !!params.referenceImagePath;
      const workflowPriority: string[] = [];

      if (!isFullBodyGen && useControlnet && usePulid && params.controlnetImagePath) {
        workflowPriority.push('character-face-controlnet-instantx');  // InstantX ControlNet + PuLID + LoRAs (standard pipeline)
        workflowPriority.push('character-face-controlnet');            // XLabs fallback
      }
      if (usePulid) {
        workflowPriority.push('character-portrait-pulid');   // PuLID only (primary path for body)
      }
      workflowPriority.push('character-portrait');           // Basic (always fallback)

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
