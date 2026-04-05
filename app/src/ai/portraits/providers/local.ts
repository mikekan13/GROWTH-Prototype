import 'server-only';

/**
 * GRO.WTH Portrait Pipeline — Local Provider (ComfyUI)
 *
 * Communicates with a local ComfyUI instance to generate character portraits
 * using FLUX.1 Dev + PuLID for identity preservation.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
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
import { buildPortraitPrompt } from '../prompt-builder';
import { getDefaultStyleConfig, applyCampaignStyle } from '../style-config';

const COMFYUI_URL = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

// Default generation settings
const DEFAULT_STEPS = 20;
const DEFAULT_CFG = 3.5;        // Flux uses lower CFG than SDXL
const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 1024;
const MODEL_NAME = 'flux1-dev-Q4_0';

// Polling settings
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 120;  // 4 minutes max wait

// Portrait storage root (relative to app/public/)
const PORTRAIT_ROOT = 'portraits';

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
      // 1. Ensure VRAM is available (unload Ollama)
      await this.freeVram();

      // 2. Build prompt from character data
      const styleConfig = getDefaultStyleConfig();
      const config = applyCampaignStyle(styleConfig, input.campaignStyle);
      const promptOutput = buildPortraitPrompt(input.characterData, input.campaignStyle, input.overrides);

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

      // 4. Load and inject workflow template
      const workflowName = input.personaLock
        ? 'character-portrait-pulid'
        : 'character-portrait';
      const workflow = await this.loadWorkflow(workflowName);
      const preparedWorkflow = this.injectWorkflowParams(workflow, params);

      // 5. Upload reference image if using persona lock
      if (input.personaLock?.referenceImagePath) {
        await this.uploadReferenceImage(input.personaLock.referenceImagePath);
      }

      // 6. Queue generation in ComfyUI
      const clientId = crypto.randomUUID();
      const queueResponse = await this.queuePrompt(preparedWorkflow, clientId);

      // 7. Wait for completion
      const outputInfo = await this.waitForCompletion(queueResponse.prompt_id);

      // 8. Download generated image
      const imageData = await this.downloadImage(
        outputInfo.filename,
        outputInfo.subfolder,
        outputInfo.type,
      );

      // 9. Save to filesystem
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
      };

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
      if (promptHistory.status?.status_str === 'error') {
        const errorMsg = promptHistory.status?.messages?.[0]?.[1] || 'Unknown ComfyUI error';
        throw new Error(`ComfyUI generation failed: ${errorMsg}`);
      }

      // Check for completed outputs
      if (promptHistory.outputs) {
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
    const absolutePath = path.resolve('public', imagePath);
    const imageBuffer = await fs.readFile(absolutePath);
    const filename = path.basename(imagePath);

    const formData = new FormData();
    formData.append('image', new Blob([imageBuffer]), filename);
    formData.append('subfolder', 'portraits');

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

      // Load Image node (for reference) — inject filename
      if (classType === 'LoadImage' && params.referenceImagePath) {
        const meta = (n._meta as Record<string, unknown>);
        const title = meta?.title as string || '';
        if (title.toLowerCase().includes('reference') || title.toLowerCase().includes('pulid')) {
          inputs.image = path.basename(params.referenceImagePath);
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

    // Save full portrait as WebP
    const imagePath = path.join(PORTRAIT_ROOT, characterId, `${generationId}.webp`);
    const fullPath = path.join('public', imagePath);

    // For Phase A, save the raw output (PNG from ComfyUI).
    // WebP conversion would require sharp — defer to Phase B.
    // Save as PNG for now, filename still uses .webp extension pattern.
    const pngPath = imagePath.replace('.webp', '.png');
    await fs.writeFile(path.join('public', pngPath), imageData);

    // Thumbnail generation deferred to Phase B (requires sharp)
    const thumbnailPath = pngPath.replace('.png', '_thumb.png');

    return { imagePath: pngPath, thumbnailPath };
  }

  // ============================================================
  // VRAM Management
  // ============================================================

  /**
   * Free VRAM by unloading Ollama models.
   * The RTX 4060 has 8GB VRAM shared between Ollama (gemma2:9b) and ComfyUI.
   */
  private async freeVram(): Promise<void> {
    try {
      await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gemma2:9b', keep_alive: 0 }),
        signal: AbortSignal.timeout(5000),
      });
      // Brief pause for VRAM to actually free
      await new Promise(r => setTimeout(r, 1500));
    } catch {
      // Ollama may not be running — that's fine
    }
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
}
