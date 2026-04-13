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
import { getDefaultStyleConfig, applyCampaignStyle } from '../style-config';

const COMFYUI_URL = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';
const COMFYUI_PATH = process.env.COMFYUI_PATH || 'C:/AI/ComfyUI';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

// Default generation settings — FLUX GGUF on RTX 4060 8GB
// Requires Ollama stopped. ~40s at 1024/20 steps with enough RAM free.
const DEFAULT_STEPS = 20;
const DEFAULT_CFG = 1.0;        // FLUX uses CFG 1.0 — guidance is in the text encoder node (3.5)
const DEFAULT_WIDTH = 768;      // 768 until RAM upgrade, then 1024
const DEFAULT_HEIGHT = 768;
const MODEL_NAME = 'flux1-dev-Q4_0';

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
      const promptOutput = buildPortraitPrompt(input.characterData, input.campaignStyle, input.overrides);

      // Debug: log the prompt and mode
      console.log('[ComfyUI] anglePreset:', input.overrides?.anglePreset || 'none');
      console.log('[ComfyUI] Prompt:', promptOutput.prompt.substring(0, 200) + '...');
      console.log('[ComfyUI] Negative (first 100):', promptOutput.negativePrompt.substring(0, 100) + '...');

      // 3. Prepare workflow parameters
      const seed = input.overrides?.seed ?? Math.floor(Math.random() * 2147483647);
      const params: ComfyUIWorkflowParams = {
        prompt: promptOutput.prompt,
        negativePrompt: promptOutput.negativePrompt,
        seed,
        steps: DEFAULT_STEPS,
        cfg: DEFAULT_CFG,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        referenceImagePath: input.personaLock?.referenceImagePath,
        pulidWeight: input.personaLock?.pulidWeight ?? config.pulidWeight,
        styleLora: config.styleLora,
        styleLoraWeight: config.loraStrength,
        campaignLora: input.campaignStyle?.campaignLora,
        campaignLoraWeight: input.campaignStyle?.campaignLoraStrength,
      };

      // 4. Upload reference images BEFORE workflow injection (need ComfyUI filenames)
      if (input.personaLock?.referenceImagePath) {
        console.log('[ComfyUI] Uploading PuLID reference:', input.personaLock.referenceImagePath);
        const uploadedRefName = await this.uploadReferenceImage(input.personaLock.referenceImagePath);
        params.referenceImagePath = uploadedRefName;
        console.log('[ComfyUI] PuLID ref uploaded as:', uploadedRefName);
      }

      // 4b. Upload ControlNet angle reference if provided
      // NOTE: XLabs Canny v3 model is incompatible with standard ComfyUI ControlNet loader.
      // XLabs nodes try to load their own FLUX copy (won't fit in 8GB VRAM alongside GGUF).
      // Need InstantX FLUX ControlNet Union (~6.6GB) for standard pipeline compatibility.
      // Disabled until proper model is downloaded. Falling back to prompt-only + PuLID.
      // ControlNet DISABLED — XLabs pipeline incompatible with LoRA style control.
      // XlabsSampler's denoise_controlnet bypasses LoRA patches, pulling output to photorealism.
      // Need InstantX ControlNet Union (6.6GB) which uses standard KSampler pipeline.
      // TODO: Enable when InstantX model is downloaded.
      const anglePreset = input.overrides?.anglePreset;
      const useControlnet = false; // !!anglePreset && await this.isControlNetAvailable();
      if (useControlnet && input.overrides?.anglePreset) {
        const angleRefPath = await this.getAngleReferenceImage(input.overrides.anglePreset);
        console.log('[ComfyUI] ControlNet angle ref path:', angleRefPath);
        if (angleRefPath) {
          const uploadedAngleRef = await this.uploadReferenceImage(angleRefPath);
          params.controlnetImagePath = uploadedAngleRef;
          params.controlnetStrength = 0.2;  // Minimal — just guide head angle/position, not style or geometry
          console.log('[ComfyUI] ControlNet ref uploaded as:', uploadedAngleRef);
        } else {
          console.log('[ComfyUI] No angle reference found — ControlNet will be skipped');
        }
      }

      console.log('[ComfyUI] Params — PuLID ref:', params.referenceImagePath || 'NONE', '| CN ref:', params.controlnetImagePath || 'NONE');

      // 5. Select workflow: ControlNet+PuLID → PuLID → Basic (with fallbacks)
      let outputInfo: { filename: string; subfolder: string; type: string };
      const usePulid = !!params.referenceImagePath;
      const workflowPriority: string[] = [];

      if (useControlnet && usePulid && params.controlnetImagePath) {
        workflowPriority.push('character-face-controlnet');  // ControlNet + PuLID
      }
      if (usePulid) {
        workflowPriority.push('character-portrait-pulid');   // PuLID only
      }
      workflowPriority.push('character-portrait');           // Basic (always fallback)

      const workflowResult = await this.tryWorkflows(workflowPriority, params);
      outputInfo = workflowResult.output;
      const workflowUsed = workflowResult.workflowName;
      const failedWorkflows = workflowResult.failedWorkflows;

      // 8. Download generated image
      const imageData = await this.downloadImage(
        outputInfo.filename,
        outputInfo.subfolder,
        outputInfo.type,
      );

      // 9. Save to filesystem (full image + thumbnail)
      const { imagePath, thumbnailPath } = await this.savePortrait(
        input.characterId,
        imageData,
      );

      const generationTimeMs = Date.now() - startTime;

      const metadata: PortraitMetadata = {
        prompt: promptOutput.prompt,
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

    for (const [nodeId, node] of Object.entries(w)) {
      const n = node as Record<string, unknown>;
      const classType = n.class_type as string;
      const inputs = n.inputs as Record<string, unknown>;

      if (!classType || !inputs) continue;

      // CLIPTextEncodeFlux — FLUX-specific encoder with separate clip_l and t5xxl inputs
      // The guidance value is embedded in conditioning (not KSampler cfg)
      if (classType === 'CLIPTextEncodeFlux') {
        const meta = (n._meta as Record<string, unknown>);
        const title = meta?.title as string || '';

        if (title.toLowerCase().includes('positive')) {
          inputs.clip_l = params.prompt;
          inputs.t5xxl = params.prompt;
          // guidance stays at workflow default (3.5) unless overridden
        }
      }

      // Standard CLIP Text Encode nodes — inject prompts (used for negative prompt)
      if (classType === 'CLIPTextEncode') {
        const meta = (n._meta as Record<string, unknown>);
        const title = meta?.title as string || '';

        if (title.toLowerCase().includes('positive')) {
          inputs.text = params.prompt;
        } else if (title.toLowerCase().includes('negative')) {
          inputs.text = params.negativePrompt;
        }
      }

      // KSampler — inject seed, steps, cfg
      if (classType === 'KSampler' || classType === 'KSamplerAdvanced') {
        if (inputs.seed !== undefined) inputs.seed = params.seed;
        if (inputs.noise_seed !== undefined) inputs.noise_seed = params.seed;
        if (inputs.steps !== undefined) inputs.steps = params.steps;
        if (inputs.cfg !== undefined) inputs.cfg = params.cfg;
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

      // PuLID node — inject weight and reference image
      if (classType.includes('PuLID') || classType.includes('pulid')) {
        if (params.pulidWeight !== undefined && inputs.weight !== undefined) {
          inputs.weight = params.pulidWeight;
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

      // ControlNet Apply — inject strength (supports both XLabs and standard nodes)
      if (classType === 'ApplyFluxControlNet' || classType === 'ApplyAdvancedFluxControlNet' || classType === 'ControlNetApplyAdvanced') {
        if (params.controlnetStrength !== undefined && inputs.strength !== undefined) {
          inputs.strength = params.controlnetStrength;
        }
      }

      // Canny preprocessor — match resolution to generation size
      if (classType === 'CannyEdgePreprocessor' || classType === 'Canny_Edge_Preprocessor') {
        if (inputs.resolution !== undefined) {
          inputs.resolution = params.width;
        }
      }

      // LoRA Loader — inject style/campaign LoRA
      if (classType === 'LoraLoader' || classType === 'LoRALoader') {
        const meta = (n._meta as Record<string, unknown>);
        const title = meta?.title as string || '';

        if (title.toLowerCase().includes('style') && params.styleLora) {
          inputs.lora_name = params.styleLora;
          if (params.styleLoraWeight !== undefined) {
            inputs.strength_model = params.styleLoraWeight;
            inputs.strength_clip = params.styleLoraWeight;
          }
        } else if (title.toLowerCase().includes('campaign') && params.campaignLora) {
          inputs.lora_name = params.campaignLora;
          if (params.campaignLoraWeight !== undefined) {
            inputs.strength_model = params.campaignLoraWeight;
            inputs.strength_clip = params.campaignLoraWeight;
          }
        }
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
  ): Promise<{ imagePath: string; thumbnailPath: string }> {
    const generationId = crypto.randomUUID();
    const dirPath = path.join('public', PORTRAIT_ROOT, characterId);
    await fs.mkdir(dirPath, { recursive: true });

    // Save full portrait as WebP (display) and PNG (PuLID reference, max quality)
    const webpPath = path.join(PORTRAIT_ROOT, characterId, `${generationId}.webp`);
    const pngPath = path.join(PORTRAIT_ROOT, characterId, `${generationId}.png`);
    await Promise.all([
      sharp(imageData).webp({ quality: 90 }).toFile(path.join('public', webpPath)),
      fs.writeFile(path.join('public', pngPath), imageData),
    ]);

    // Generate thumbnail (256x256)
    const thumbPath = path.join(PORTRAIT_ROOT, characterId, `${generationId}_thumb.webp`);
    await sharp(imageData).resize(256, 256, { fit: 'cover' }).webp({ quality: 80 }).toFile(path.join('public', thumbPath));

    return {
      imagePath: `/${webpPath}`,
      thumbnailPath: `/${thumbPath}`,
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

      console.log('[ComfyUI] Starting server...');
      comfyProcess = spawn('python', ['main.py', '--normalvram', '--listen', '127.0.0.1', '--port', '8188'], {
        cwd: COMFYUI_PATH,
        stdio: 'ignore',
        detached: false,
        windowsHide: true,
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
    try {
      const controlnetPath = path.join(COMFYUI_PATH, 'models', 'xlabs', 'controlnets', 'flux-canny-controlnet-v3.safetensors');
      await fs.access(controlnetPath);
      return true;
    } catch {
      return false;
    }
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

}
