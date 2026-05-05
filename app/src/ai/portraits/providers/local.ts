import 'server-only';

/**
 * GRO.WTH Portrait Pipeline — Local Provider (ComfyUI)
 *
 * Communicates with a ComfyUI instance (typically the RunPod H100 + FLUX.2 Dev
 * stack — see pod-keepalive.ts) to generate character portraits. All face,
 * body, and edit paths route through FLUX.2 multi-reference workflows; the
 * legacy FLUX.1 PuLID / InfiniteYou / ControlNet / Kontext / Fill code was
 * removed 2026-04-21. `COMFYUI_URL=http://127.0.0.1:8188` is still honored
 * for local development against a self-hosted ComfyUI that has FLUX.2 models
 * loaded.
 */

import crypto from 'crypto';
import { spawn, execSync, type ChildProcess } from 'child_process';
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
import { buildPortraitPrompt } from '../prompt-builder';
import { composeStylePrompt } from '../growth-style-prompts';
import { markUsed } from '../pod-keepalive';
import { stripBackground } from '../rmbg';
import { normalizeHex } from '../color-utils';

const COMFYUI_URL = process.env.COMFYUI_URL || 'http://127.0.0.1:8188';
const COMFYUI_PATH = process.env.COMFYUI_PATH || 'C:/AI/ComfyUI';
// Remote ComfyUI (e.g. RunPod) — we can't fs.access models from this process, so
// trust the remote instance and skip local filesystem pre-checks. Any model
// mismatch surfaces as a ComfyUI /prompt 400 at submit time, which is the right
// failure point anyway.
const COMFYUI_REMOTE = !/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/i.test(COMFYUI_URL);

// FLUX.2 defaults. Face is 1024² via pose template; body is 1024×1536.
// The flux2 generator methods override these per-call as needed.
const DEFAULT_CFG = 1.0;        // FLUX.2 uses CFG 1.0 + FluxGuidance (4.0) in workflow
const DEFAULT_WIDTH = 1024;
const DEFAULT_HEIGHT = 1024;

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
      // 1. Ensure ComfyUI is running (and on local installs, free VRAM).
      await this.ensureRunning();
      if (!COMFYUI_REMOTE) await this.freeVram();

      // 2. Decide whether identity refs will drive the face. When true we drop
      //    physical-identity text from the prompt so it doesn't fight the refs.
      const hasRefs = !!(
        input.personaLock?.referenceImagePath ||
        (input.personaLock?.referenceImagePaths && input.personaLock.referenceImagePaths.length > 0)
      );
      const promptOutput = buildPortraitPrompt(input.characterData, {
        campaignStyle: input.campaignStyle,
        overrides: input.overrides,
        creationMode: input.creationMode === true,
        hasReferences: hasRefs,
      });

      console.log('[ComfyUI] anglePreset:', input.overrides?.anglePreset || 'none');
      console.log('[ComfyUI] t5xxl:', promptOutput.t5xxl.slice(0, 200) + '…');

      // 3. Upload identity refs (dedup cache so ComfyUI can keep node-level cache).
      const refCache = ((this as unknown as { _refCache?: Map<string, string> })._refCache ??= new Map());
      const primary = input.personaLock?.referenceImagePath;
      const secondaries = input.personaLock?.referenceImagePaths || [];
      // Chain: primary first, then secondaries. FLUX.2 supports up to 10 refs;
      // the flux2 methods cap at 5 (workflow slot count).
      // Dedupe: personaLock sometimes contains the primary also in secondaries,
      // which would feed the same image into two REF slots. Keep unique paths
      // only, preserving primary-first order.
      const seen = new Set<string>();
      const dedupedRefs = [primary, ...secondaries].filter((r): r is string => {
        if (!r || seen.has(r)) return false;
        seen.add(r);
        return true;
      });
      // Per-pass ref filters from the wizard. If a filter is undefined, that
      // pass uses all dedupedRefs. We upload the UNION so both passes can
      // resolve their refs to uploaded ComfyUI filenames.
      const pass1RefFilter = Array.isArray(input.overrides?.pass1Refs) ? input.overrides!.pass1Refs as string[] : undefined;
      const pass2RefFilter = Array.isArray(input.overrides?.pass2Refs) ? input.overrides!.pass2Refs as string[] : undefined;
      const unionSet = new Set<string>();
      (pass1RefFilter && pass1RefFilter.length > 0 ? pass1RefFilter : dedupedRefs).forEach(r => unionSet.add(r));
      (pass2RefFilter && pass2RefFilter.length > 0 ? pass2RefFilter : dedupedRefs).forEach(r => unionSet.add(r));
      // Preserve dedupedRefs' order for any ref in the union.
      const refsToUpload = dedupedRefs.filter(r => unionSet.has(r));

      // Upload each ref once; track original-path → uploaded-name map so both
      // passes can resolve their assignments to ComfyUI filenames.
      const refPathToName: Record<string, string> = {};
      for (const r of refsToUpload) {
        try {
          let name = refCache.get(r);
          if (!name) {
            // RMBG: strip background from identity refs before upload. Cached on
            // disk as `.clean.png` alongside the source, so this runs once per ref
            // and is skipped on subsequent gens.
            const abs = path.join(process.cwd(), 'public', r.replace(/^\//, ''));
            let cleanedRef = r;
            try {
              const cleanedAbs = await stripBackground(abs);
              const rel = '/' + path.relative(path.join(process.cwd(), 'public'), cleanedAbs).replace(/\\/g, '/');
              cleanedRef = rel;
              console.log(`[ComfyUI] RMBG ref "${r}" → "${cleanedRef}"`);
            } catch (rmbgErr) {
              console.warn(`[ComfyUI] RMBG failed for "${r}", using original:`, rmbgErr instanceof Error ? rmbgErr.message : rmbgErr);
            }
            name = await this.uploadReferenceImage(cleanedRef);
            refCache.set(r, name);
          }
          refPathToName[r] = name;
        } catch (err) {
          console.warn(`[ComfyUI] skipping missing ref "${r}":`, err instanceof Error ? err.message : err);
        }
      }

      // Resolve per-pass uploaded-name lists (in user-specified order).
      const pass1Paths = (pass1RefFilter && pass1RefFilter.length > 0) ? pass1RefFilter : dedupedRefs;
      const pass2Paths = (pass2RefFilter && pass2RefFilter.length > 0) ? pass2RefFilter : dedupedRefs;
      const uploadedRefs = pass1Paths.map(p => refPathToName[p]).filter((n): n is string => !!n);
      const pass2RefNames = pass2Paths.map(p => refPathToName[p]).filter((n): n is string => !!n);

      // 4. Build the params object consumed by the flux2 path methods.
      const seed = input.overrides?.seed ?? Math.floor(Math.random() * 2147483647);
      const isFullBody = input.overrides?.composition === 'full_body';
      const params: ComfyUIWorkflowParams = {
        clipL: promptOutput.clipL,
        t5xxl: promptOutput.t5xxl,
        negativePrompt: promptOutput.negativePrompt,
        seed,
        // T10 recipe values — locked 2026-04-22 before the Klein/Turbo detour:
        // Dev 32B at 20 steps, 1280×1280 face, 1024×1536 body. FLUX.2 is
        // a rectified-flow model; 20 steps is the empirical sweet spot for
        // identity resolution. Fewer smears identity; more plateaus.
        // Turbo lever: when enabled, drop to 8 steps (LoRA handles convergence).
        steps: input.overrides?.useTurbo === true ? 8 : 20,
        cfg: DEFAULT_CFG,
        // Back to 1280 baseline — 1536 experiment produced garbage; returning
        // to the known-good identity-lock sweet spot until we debug.
        width: isFullBody ? 1024 : 1280,
        height: isFullBody ? 1536 : 1280,
        referenceImagePath: uploadedRefs[0],
        referenceImagePaths: uploadedRefs.slice(1),
        customPrompt: input.overrides?.customPrompt as string | undefined,
        customPass2Prompt: input.overrides?.customPass2Prompt as string | undefined,
        // Face-gen lever values — consumed by generateFaceFlux2 for workflow injection + pass 2 re-run.
        pass1Guidance: typeof input.overrides?.pass1Guidance === 'number' ? input.overrides.pass1Guidance : undefined,
        pass2Guidance: typeof input.overrides?.pass2Guidance === 'number' ? input.overrides.pass2Guidance : undefined,
        runPass2: input.overrides?.runPass2 === true,
        useTurbo: input.overrides?.useTurbo === true,
        useTurboPass2: input.overrides?.useTurboPass2 === true,
        pass2RefNames,
      } as ComfyUIWorkflowParams;

      if (uploadedRefs.length === 0) {
        throw new Error('Portrait generation requires at least one reference image on the FLUX.2 path');
      }

      // 5. Route to the appropriate FLUX.2 method.
      const result = isFullBody
        ? await this.generateBodyFlux2(input, params, promptOutput, startTime)
        : await this.generateFaceFlux2(input, params, promptOutput, startTime);

      if (result) return result;

      return {
        success: false,
        metadata: {
          prompt: '', negativePrompt: '', seed,
          model: 'flux2-dev-fp8mixed',
          steps: params.steps ?? 20,
          cfg: params.cfg ?? DEFAULT_CFG,
          width: params.width ?? DEFAULT_WIDTH,
          height: params.height ?? DEFAULT_HEIGHT,
          generationTimeMs: Date.now() - startTime,
        },
        error: `flux2-${isFullBody ? 'body' : 'face'} pipeline returned null — see server logs`,
      };
    } catch (e) {
      return {
        success: false,
        metadata: {
          prompt: '', negativePrompt: '', seed: 0,
          model: 'flux2-dev-fp8mixed',
          steps: 20, cfg: DEFAULT_CFG,
          width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT,
          generationTimeMs: Date.now() - startTime,
        },
        error: e instanceof Error ? e.message : String(e),
      };
    } finally {
      if (!COMFYUI_REMOTE) await this.releaseVram();
    }
  }

  async extractIdentity(_imageData: Buffer): Promise<IdentityData> {
    // FLUX.2 multi-ref uses raw reference photos directly — no embedding
    // extraction step needed. This method is kept to satisfy the
    // ImageGenerationProvider interface but is never called on the FLUX.2 path.
    throw new Error('extractIdentity is not implemented for FLUX.2 — reference images are used raw');
  }

  // ============================================================
  // ComfyUI Communication
  // ============================================================

  private async queuePrompt(workflow: object, clientId: string): Promise<ComfyUIQueueResponse> {
    // Temporary diagnostic — dump every submission so we can replay user's
    // failing requests directly against ComfyUI. Remove once the multi-ref
    // failure mode is identified.
    try {
      const dumpDir = path.join(process.cwd(), 'tmp');
      await fs.mkdir(dumpDir, { recursive: true });
      const dumpPath = path.join(dumpDir, `comfy-submitted-${Date.now()}.json`);
      await fs.writeFile(dumpPath, JSON.stringify(workflow, null, 2));
      console.log(`[ComfyUI] Workflow dumped to: ${dumpPath}`);
    } catch { /* best-effort */ }

    const res = await fetch(`${COMFYUI_URL}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    });

    if (!res.ok) {
      const errorText = await res.text();
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
    } catch {
      throw new Error(
        `Workflow "${name}" not found at ${workflowPath}. ` +
        'Design your workflow in ComfyUI GUI and export it using "Save (API Format)".'
      );
    }
  }

  // ============================================================
  // Image Storage
  // ============================================================

  private async savePortrait(
    characterId: string,
    imageData: Buffer,
    step?: string,
    seed?: number,
    meta?: Record<string, unknown>,
  ): Promise<{ imagePath: string; thumbnailPath: string }> {
    const generationId = crypto.randomUUID();
    const relDir = step
      ? path.join(PORTRAIT_ROOT, characterId, step)
      : path.join(PORTRAIT_ROOT, characterId);
    const dirPath = path.join('public', relDir);
    const thumbsDir = path.join(dirPath, '.thumbs');
    await fs.mkdir(dirPath, { recursive: true });
    await fs.mkdir(thumbsDir, { recursive: true });

    // PNG stays in main folder for easy browsing
    const pngPath = path.join(relDir, `${generationId}.png`);
    await fs.writeFile(path.join('public', pngPath), imageData);

    // WebP + thumbnail go into .thumbs subfolder (hidden from file browser)
    const webpPath = path.join(relDir, '.thumbs', `${generationId}.webp`);
    const thumbPath = path.join(relDir, '.thumbs', `${generationId}_thumb.webp`);
    await Promise.all([
      sharp(imageData).webp({ quality: 90 }).toFile(path.join('public', webpPath)),
      sharp(imageData).resize(256, 256, { fit: 'cover' }).webp({ quality: 80 }).toFile(path.join('public', thumbPath)),
    ]);

    // Save generation metadata in .thumbs (hidden from file browser)
    const metaPath = path.join(relDir, '.thumbs', `${generationId}.meta.json`);
    const metaData = {
      generationId,
      timestamp: new Date().toISOString(),
      seed,
      ...(meta || {}),
    };
    await fs.writeFile(path.join('public', metaPath), JSON.stringify(metaData, null, 2));

    // Save seed to seeds.json for persistence (legacy compat)
    if (seed !== undefined) {
      const seedsPath = path.join('public', PORTRAIT_ROOT, characterId, 'seeds.json');
      let seeds: Record<string, number> = {};
      try { seeds = JSON.parse(await fs.readFile(seedsPath, 'utf-8')); } catch { /* new file */ }
      seeds['/' + webpPath.replace(/\\/g, '/')] = seed;
      await fs.writeFile(seedsPath, JSON.stringify(seeds, null, 2));
    }

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
    // Remote ComfyUI (cloud pod): hand off to the warm-keeper. markUsed() bumps
    // the idle timer AND resumes the pod if it's currently hibernated (no-op
    // if already running). The watcher auto-hibernates after 2 min of no calls.
    if (COMFYUI_REMOTE) {
      await markUsed();
      if (await this.isAvailable()) return;
      throw new Error(
        `Remote ComfyUI at ${COMFYUI_URL} is not responding after pod resume. ` +
        `Check RUNPOD_POD_ID / RUNPOD_API_KEY env vars, or run cloud-up.mjs manually.`
      );
    }

    // Local dev: spawn ComfyUI if not already up.
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
   * For local dev against a self-hosted ComfyUI on the same workstation as
   * an Ollama server. No-op on the remote-pod path — the pod is GPU-only.
   */
  private async freeVram(): Promise<void> {
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

  /**
   * Edit an image using FLUX.2 Dev. Picks the right sub-workflow based on
   * the caller's options: flux2-edit-with-refpull when an object-pull
   * reference is supplied, flux2-edit-masked when a paint mask is present,
   * else flux2-edit-reference for a whole-image edit.
   * Takes a source image + text prompt describing the desired edit.
   * Returns the edited image with identity preserved.
   */
  async editImage(
    sourceImagePath: string,
    editPrompt: string,
    options?: {
      seed?: number;
      guidance?: number;
      characterId?: string;
      paintData?: { mode: string; dataUrl: string; feather?: number };
      /** Optional object-pull reference (photo/drawing/sketch). When set, the
       *  workflow switches to flux2-edit-with-refpull and the prompt is
       *  augmented with a restyle instruction so the item adopts the
       *  character's GROWTH aesthetic regardless of the ref's source style. */
      objectRefImagePath?: string;
    },
  ): Promise<PortraitResult> {
    await this.ensureRunning();

    const seed = options?.seed ?? Math.floor(Math.random() * 2147483647);
    const guidance = options?.guidance ?? 5.0;
    const characterId = options?.characterId ?? 'anonymous';
    const paintData = options?.paintData;
    const objectRefImagePath = options?.objectRefImagePath;
    console.log(`[Flux2Edit] editImage called: source=${sourceImagePath}, prompt="${editPrompt.slice(0,50)}", paint=${paintData?.mode || 'none'}, objRef=${objectRefImagePath ? 'yes' : 'no'}`);

    // 1. Resolve source path — prefer full-res PNG over .thumbs webp for both upload and local sharp ops
    let resolvedSourcePath = sourceImagePath;
    let absolutePath = path.join(process.cwd(), 'public', sourceImagePath.replace(/^\//, ''));
    try { await fs.access(absolutePath); } catch {
      const pngPath = absolutePath.replace(/\.thumbs[/\\]/, '').replace(/\.webp$/, '.png');
      try {
        await fs.access(pngPath);
        absolutePath = pngPath;
        resolvedSourcePath = sourceImagePath.replace(/\.thumbs[/\\]/, '').replace(/\.webp$/, '.png');
      } catch { /* use original */ }
    }
    // If source is a .thumbs webp but PNG sibling exists, prefer PNG for upload too
    if (sourceImagePath.includes('.thumbs') && sourceImagePath.endsWith('.webp')) {
      const altRel = sourceImagePath.replace(/\.thumbs[/\\]/, '').replace(/\.webp$/, '.png');
      const altAbs = path.join(process.cwd(), 'public', altRel.replace(/^\//, ''));
      try { await fs.access(altAbs); resolvedSourcePath = altRel; absolutePath = altAbs; } catch { /* stick with thumb */ }
    }
    const uploadedName = await this.uploadReferenceImage(resolvedSourcePath);
    console.log(`[Flux2Edit] Uploaded source image: ${uploadedName} (resolved from ${sourceImagePath})`);

    // 2. Mask mode: prepare mask buffer for post-compositing after generation
    let maskBuffer: Buffer | null = null;
    let maskDims: { w: number; h: number } | null = null;
    if (paintData?.mode === 'mask' && paintData.dataUrl) {
      try {
        const paintBuf = Buffer.from(paintData.dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
        const sourceMeta = await sharp(absolutePath).metadata();
        const sw = sourceMeta.width || 1024;
        const sh = sourceMeta.height || 2048;
        // Mask: dilate (expand at full opacity) by margin pixels, then light edge blur
        // Single pipeline avoids raw/PNG buffer confusion
        const margin = Math.max(0, paintData.feather ?? 20);
        const blurRadius = margin > 0 ? Math.max(margin / 2, 2) : 2;
        let pipeline = sharp(paintBuf)
          .resize(sw, sh, { fit: 'fill' })
          .flatten({ background: { r: 0, g: 0, b: 0 } })
          .grayscale()
          .blur(blurRadius);
        if (margin > 0) {
          pipeline = pipeline.threshold(128).blur(4);
        }
        maskBuffer = await pipeline.png().toBuffer();
        maskDims = { w: sw, h: sh };
        console.log(`[Flux2Edit] Mask prepared for post-composite: ${sw}x${sh}`);
      } catch (maskErr) {
        console.error('[Flux2Edit] Mask prep failed, no compositing will happen:', maskErr);
      }
    }

    // 3. Pick the FLUX.2 edit workflow:
    //    objectRefImagePath → flux2-edit-with-refpull (source + object-pull ref)
    //    paintData mask     → flux2-edit-masked (SetLatentNoiseMask confine)
    //    else               → flux2-edit-reference (whole-image edit)
    const useObjectPull = !!objectRefImagePath && !paintData; // mutually exclusive with mask for now
    const useMaskedWorkflow = !!(maskBuffer && maskDims) && !useObjectPull;
    const workflowName = useObjectPull
      ? 'flux2-edit-with-refpull'
      : useMaskedWorkflow
        ? 'flux2-edit-masked'
        : 'flux2-edit-reference';
    const workflow = await this.loadWorkflow(workflowName);

    // Upload mask (masked path only)
    let uploadedMaskName: string | null = null;
    if (useMaskedWorkflow && maskBuffer) {
      try {
        uploadedMaskName = await this.uploadBuffer(maskBuffer, `edit-mask-${seed}.png`);
        console.log(`[Flux2Edit] Uploaded mask: ${uploadedMaskName}`);
      } catch (e) {
        console.error('[Flux2Edit] mask upload failed — falling back to unmasked edit', e);
      }
    }

    // Upload object-pull reference (object-pull path only)
    let uploadedObjRefName: string | null = null;
    if (useObjectPull && objectRefImagePath) {
      try {
        uploadedObjRefName = await this.uploadReferenceImage(objectRefImagePath);
        console.log(`[Flux2Edit] Uploaded object-pull ref: ${uploadedObjRefName}`);
      } catch (e) {
        console.error('[Flux2Edit] object-ref upload failed — aborting edit', e);
        throw new Error(`Could not upload object reference: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Prompt augmentation for the object-pull path. Forces restyle even when
    // the ref is a photo/drawing/sketch in a completely different style.
    const effectiveEditPrompt = useObjectPull
      ? `${editPrompt}\n\nThe second reference image shows the item to transfer. ` +
        `Extract ONLY that item and apply it to the character in the first image. ` +
        `Render the item in the same GROWTH aesthetic as the first image — identical ` +
        `lighting, color grade, material treatment, and rendering style. Ignore the ` +
        `second reference's original style completely (it may be a photo, drawing, or ` +
        `simple sketch — all are valid inputs). The character's identity, pose, and ` +
        `framing must stay exactly as in the first image; only the specified item changes.`
      : editPrompt;

    // 4. Inject parameters
    const w = JSON.parse(JSON.stringify(workflow)) as Record<string, Record<string, unknown>>;

    for (const key of Object.keys(w)) {
      if (key.startsWith('_')) delete w[key];
    }

    for (const [, node] of Object.entries(w)) {
      const classType = node.class_type as string;
      const inputs = node.inputs as Record<string, unknown>;
      if (!inputs) continue;

      switch (classType) {
        case 'LoadImage': {
          const meta = node._meta as Record<string, string> | undefined;
          if (meta?.title === 'Source Image') {
            inputs.image = uploadedName;
          } else if (meta?.title === 'Mask Image' && uploadedMaskName) {
            inputs.image = uploadedMaskName;
          } else if (meta?.title === 'Object Reference' && uploadedObjRefName) {
            inputs.image = uploadedObjRefName;
          }
          break;
        }
        case 'CLIPTextEncode':
          inputs.text = composeStylePrompt('finetune', effectiveEditPrompt);
          break;
        case 'FluxGuidance':
          inputs.guidance = guidance;
          break;
        case 'RandomNoise':
          inputs.noise_seed = seed;
          break;
      }

      delete node._meta;
    }


    // 4. Queue and wait
    const clientId = crypto.randomUUID();
    console.log(`[Flux2Edit] Queuing edit: "${editPrompt.slice(0, 80)}" guidance=${guidance} seed=${seed}`);
    const startMs = Date.now();

    const queueRes = await this.queuePrompt(w, clientId);
    const output = await this.waitForCompletion(queueRes.prompt_id);
    let imageData = await this.downloadImage(output.filename, output.subfolder, output.type);

    const elapsedMs = Date.now() - startMs;
    console.log(`[Flux2Edit] Edit complete in ${(elapsedMs / 1000).toFixed(1)}s`);

    // 5. Simple dilated-user-mask composite (diagnostic simplification)
    // Purpose: isolate whether "no change" is upstream (paint data / Kontext) or downstream (composite).
    // Just take the user's painted mask, dilate it, feather, and swap in generated pixels there.
    if (maskBuffer && maskDims) {
      try {
        const W = maskDims.w, H = maskDims.h;
        const sourceBuf = await fs.readFile(absolutePath);
        const srcRaw = await sharp(sourceBuf).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const genRaw = await sharp(imageData).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const maskRaw = await sharp(maskBuffer).grayscale().raw().toBuffer({ resolveWithObject: true });

        const N = W * H;

        // Diagnostic: how different is gen from src? If ~0, Kontext produced a no-op.
        let totalDiff = 0, changedPixels = 0;
        for (let p = 0, i = 0; p < N; p++, i += 3) {
          const d = Math.abs(srcRaw.data[i] - genRaw.data[i])
                  + Math.abs(srcRaw.data[i + 1] - genRaw.data[i + 1])
                  + Math.abs(srcRaw.data[i + 2] - genRaw.data[i + 2]);
          totalDiff += d;
          if (d > 30) changedPixels++;
        }
        console.log(`[Flux2Edit] DIAG: gen-vs-src avg-diff=${(totalDiff / N).toFixed(2)}, changed-pixels=${changedPixels} (${(100 * changedPixels / N).toFixed(1)}%)`);

        // Diagnostic: how much did the user paint?
        let userMaskCount = 0;
        for (let p = 0; p < N; p++) if (maskRaw.data[p] > 100) userMaskCount++;
        console.log(`[Flux2Edit] DIAG: user-mask pixels=${userMaskCount} (${(100 * userMaskCount / N).toFixed(1)}%)`);

        if (userMaskCount === 0) {
          console.warn('[Flux2Edit] User mask is empty! paintData reached server but contains no paint. Returning raw gen output.');
        } else {
          // Feather the user mask by blur alone — no erosion, no component detection
          const featheredMask = await sharp(maskBuffer)
            .grayscale()
            .blur(8)
            .raw()
            .toBuffer({ resolveWithObject: true });

          // Composite: result = gen * mask + src * (1 - mask)
          const out = Buffer.alloc(srcRaw.data.length);
          for (let i = 0, p = 0; i < out.length; i += 3, p++) {
            const m = featheredMask.data[p] / 255;
            out[i] = Math.round(genRaw.data[i] * m + srcRaw.data[i] * (1 - m));
            out[i + 1] = Math.round(genRaw.data[i + 1] * m + srcRaw.data[i + 1] * (1 - m));
            out[i + 2] = Math.round(genRaw.data[i + 2] * m + srcRaw.data[i + 2] * (1 - m));
          }
          imageData = await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
          console.log(`[Flux2Edit] Simple mask composite done`);
        }
      } catch (compErr) {
        console.error('[Flux2Edit] Composite failed, using raw output:', compErr);
      }
    } else {
      console.log(`[Flux2Edit] No mask path — paintData=${!!paintData}, maskBuffer=${!!maskBuffer}, maskDims=${!!maskDims}`);
    }

    // 6. Save
    const { imagePath, thumbnailPath } = await this.savePortrait(characterId, imageData, 'finetune');

    return {
      success: true,
      imagePath,
      thumbnailPath,
      metadata: {
        seed,
        generationTimeMs: elapsedMs,
        model: 'flux-kontext-dev',
        prompt: editPrompt,
        negativePrompt: '',
        steps: 28,
        cfg: 1.0,
        width: 0,
        height: 0,
      } as PortraitMetadata,
    };
  }

  /**
   * FLUX.2 Dev face generation with multi-reference identity + angle-specific
   * pose template. Replaces the PuLID/InfiniteYou/ControlNet stack.
   *
   * - Pose template: public/portraits/pose-refs/{angle}.png (bald canonical
   *   portrait). Run through Canny to strip color/identity; only structural
   *   edges reach the model via ReferenceLatent.
   * - Identity refs: the user's uploaded photos (already uploaded to ComfyUI
   *   by the generatePortrait caller — names in params.referenceImagePath +
   *   params.referenceImagePaths). Chained as ReferenceLatent anchors.
   *
   * Returns null if the workflow file or pose template is missing, or if the
   * identity refs are empty — caller falls through to the legacy chain.
   */
  private async generateFaceFlux2(
    input: PortraitInput,
    params: ComfyUIWorkflowParams,
    promptOutput: { clipL: string; t5xxl: string; negativePrompt: string },
    startTime: number,
  ): Promise<PortraitResult | null> {
    try {
      // Collect identity ref names (already uploaded + RMBG'd by the caller)
      const idRefs: string[] = [];
      if (params.referenceImagePath) idRefs.push(params.referenceImagePath);
      if (params.referenceImagePaths?.length) idRefs.push(...params.referenceImagePaths);
      if (idRefs.length === 0) return null;
      // Cap identity refs at 3 to leave room for pose (slot n+1) and style
      // (slot n+2) in a 5-slot workflow.
      const usedRefs = idRefs.slice(0, 3);
      const n = usedRefs.length;

      // Face gen is always front-facing. Angle variants live in the finetune step.

      // New workflow: flux2-face-cloud.json — mirrors the cloud ComfyUI
      // 'Image Edit (Flux.2 Dev)' subgraph the user verified works. 5 REF
      // slots with linear chain REFLAT_5 → REFLAT_4 → ... → REFLAT_1 →
      // GUIDER. By prepend rule, Image 1 in prompt = REFLAT_1 = primary
      // subject. Slots: REF1..n = identity, REF_{n+1} = pose,
      // REF_{n+2} = style.
      const workflowName = 'flux2-face-cloud';
      const wf = JSON.parse(JSON.stringify(await this.loadWorkflow(workflowName))) as Record<string, Record<string, unknown>>;
      delete wf._comment;

      // Populate identity refs into LOAD_REF1..n
      for (let i = 0; i < n; i++) {
        (wf[`LOAD_REF${i + 1}`].inputs as Record<string, unknown>).image = usedRefs[i];
      }

      // Auto pose/style refs disabled — they pushed the slot count to 5 and
      // tipped the cudaMallocAsync pool into OOM territory on multi-ref runs.
      // Re-enable behind a toggle if/when needed.
      const anglePoseActive = false;
      const styleRefCount = 0;
      const poseSlotIdx = n + 1;
      const styleSlotIdx = n + 2;

      // Total active ref slots
      const kTotal = n;

      // Strip unused slots and rewire chain root.
      // In the template, REFLAT_5 chains on GUIDANCE. If kTotal < 5, delete
      // slots (kTotal+1)..5 and make REFLAT_kTotal chain on GUIDANCE instead.
      for (let i = kTotal + 1; i <= 5; i++) {
        delete wf[`LOAD_REF${i}`];
        delete wf[`SCALE_REF${i}`];
        delete wf[`ENCODE_REF${i}`];
        delete wf[`REFLAT_${i}`];
      }
      if (kTotal < 5 && kTotal >= 1) {
        (wf[`REFLAT_${kTotal}`].inputs as Record<string, unknown>).conditioning = ['GUIDANCE', 0];
      }

      // Slot layout (cloud workflow + prepend rule):
      //   Chain: GUIDANCE → REFLAT_kTotal → REFLAT_(kTotal-1) → ... → REFLAT_1 → GUIDER
      //   Prepend rule: Image 1 in prompt = REFLAT_1 (last in chain, closest to guider).
      //   REF1..n    = identity refs (primary subject)
      //   REF_{n+1}  = pose ref
      //   REF_{n+2}  = style ref

      // Prompt — user-verified on Comfy Cloud (2026-04-23) with identical
      // model files:
      //   "make a straight on portrait of the woman in image reference 1
      //    but change the style to the image reference 2. Don't use the
      //    face or hair from image reference 2."
      // Pattern: composition+subject → "but change style to [style]" →
      //          explicit targeted negation on style ref face/hair.
      // Dynamic ref phrase using range form ("1-N" for >=2). Single ref says "image reference 1".
      const idRefsPhrase = n === 1 ? 'image reference 1' : `image references 1-${n}`;
      const defaultPrompt = (() => {
        // Pass 1 = photorealistic identity lock, woven with structured physical
        // attributes from the character sheet. FLUX.2 prefers natural prose
        // sentences over comma-separated tag lists, so attributes are folded
        // into a single descriptive sentence.
        const id = input.characterData?.identity;
        const sexRaw = (id?.sex || '').toString().toLowerCase();
        const subject = sexRaw === 'female' ? 'woman' : sexRaw === 'male' ? 'man' : 'person';

        // Build the descriptive clause. Each segment is a natural noun phrase.
        const segments: string[] = [];
        if (id?.skinTone) segments.push(`${id.skinTone.trim()} skin`);

        const hairColor = id?.hairColor?.trim();
        const hairTexture = id?.hairTexture?.trim();
        const hairStyle = id?.hairStyle?.trim();
        if (hairColor || hairTexture || hairStyle) {
          const hairBits = [hairTexture, hairColor].filter(Boolean).join(' ');
          let hair = hairBits ? `${hairBits} hair` : 'hair';
          if (hairStyle) hair += ` styled in a ${hairStyle}`;
          segments.push(hair);
        }
        if (id?.eyeColor) segments.push(`${id.eyeColor.trim()} eyes`);

        const facial = id?.facialHair?.trim();
        const facialLower = (facial || '').toLowerCase();
        const noFacial = !facial || facialLower === 'none' || facialLower === 'clean-shaven' || facialLower === 'clean shaven' || facialLower === 'no';
        if (!noFacial) segments.push(`a ${facial}`);

        // Join into "with A, B, and C"
        let physClause = '';
        if (segments.length === 1) physClause = ` with ${segments[0]}`;
        else if (segments.length === 2) physClause = ` with ${segments[0]} and ${segments[1]}`;
        else if (segments.length >= 3) physClause = ` with ${segments.slice(0, -1).join(', ')}, and ${segments[segments.length - 1]}`;

        let base =
          `A photograph of a ${subject}${physClause} in ${idRefsPhrase}. Match their exact facial identity — face shape, skin tone, eyes, nose, lips, brows, and hair — from the references with high fidelity. Do not invent, average, or embellish features.\n` +
          `Head-and-shoulders portrait, shoulders-up, straight-on front view, eye-level, looking directly at the camera, neutral expression with closed mouth. Nude, bare shoulders. No clothing.\n\n` +
          `Plain mid-grey studio backdrop, completely flat and minimal. Soft, even, diffused studio lighting. No dramatic shadows.`;
        if (anglePoseActive) {
          base += ` Posed as shown in image reference ${poseSlotIdx}.`;
        }
        if (styleRefCount > 0) {
          base += ` Rendered in the painted illustration art style of image reference ${styleSlotIdx}. Don't use the face, hair, or outfit from image reference ${styleSlotIdx}.`;
        }
        return base;
      })();

      const rawCustom = params.customPrompt?.trim();
      // Placeholder substitution so custom prompts don't need to hard-code slots:
      //   {id}    → "image reference 1" (single) | "image references 1 and 2" (etc.)
      //   {pose}  → "image reference N+1" or ""
      //   {style} → "image reference N+2" or ""
      const customPrompt = rawCustom
        ? rawCustom
            .replaceAll('{id}', idRefsPhrase)
            .replaceAll('{pose}', anglePoseActive ? `image reference ${poseSlotIdx}` : '')
            .replaceAll('{style}', styleRefCount > 0 ? `image reference ${styleSlotIdx}` : '')
        : undefined;
      const finalPrompt = customPrompt && customPrompt.length > 0 ? customPrompt : defaultPrompt;
      if (customPrompt) console.log(`[Flux2Face] using custom prompt override (${customPrompt.length} chars)`);

      // Inject parameters. Cloud workflow drives width/height from GetImageSize
      // on REF1, but we override for consistency with our T10 recipe.
      const width  = params.width  ?? 1280;
      const height = params.height ?? 1280;
      const steps  = params.steps  ?? 20;
      for (const node of Object.values(wf)) {
        const cls = node.class_type as string;
        const inp = node.inputs as Record<string, unknown> | undefined;
        if (!inp) continue;
        if (cls === 'CLIPTextEncode')        inp.text = finalPrompt;
        if (cls === 'RandomNoise')           inp.noise_seed = params.seed;
        if (cls === 'EmptyFlux2LatentImage') { inp.width = width; inp.height = height; inp.batch_size = 1; }
        if (cls === 'Flux2Scheduler')        { inp.steps = steps; inp.width = width; inp.height = height; }
        delete node._meta;
      }

      // Diagnostic: capture the ReferenceLatent chain for UI debug panel.
      let chainDebug = '';
      {
        const refNodes = Object.entries(wf).filter(([k]) => k.startsWith('REFLAT_'));
        const chainStr = refNodes.map(([k, node]) => {
          const inp = node.inputs as Record<string, unknown>;
          const cond = Array.isArray(inp?.conditioning) ? inp.conditioning[0] : '?';
          return `${k}←${cond}`;
        }).join(' | ');
        const guiderCond = Array.isArray((wf.GUIDER?.inputs as Record<string, unknown>)?.conditioning)
          ? ((wf.GUIDER.inputs as Record<string, unknown>).conditioning as unknown[])[0]
          : '?';
        chainDebug = `${chainStr} | guider←${guiderCond}`;
        console.log(`[Flux2Face] chain: ${chainDebug}`);
      }
      // Runtime lever injection: pass 1 guidance + turbo LoRA.
      // Workflow already has GUIDANCE (FluxGuidance) + LORA_TURBO (strength 0 = off) + SCHEDULER (steps 20) nodes wired.
      if (wf.GUIDANCE && (wf.GUIDANCE.inputs as Record<string, unknown>)) {
        const pass1G = typeof params.pass1Guidance === 'number' ? params.pass1Guidance : 4.0;
        (wf.GUIDANCE.inputs as Record<string, unknown>).guidance = pass1G;
      }
      if (params.useTurbo) {
        if (wf.LORA_TURBO && (wf.LORA_TURBO.inputs as Record<string, unknown>)) {
          (wf.LORA_TURBO.inputs as Record<string, unknown>).strength_model = 1.0;
        }
        if (wf.SCHEDULER && (wf.SCHEDULER.inputs as Record<string, unknown>)) {
          (wf.SCHEDULER.inputs as Record<string, unknown>).steps = 8;
        }
        console.log(`[Flux2Face] turbo lever ON — LORA_TURBO strength=1.0, SCHEDULER steps=8`);
      }
      console.log(`[Flux2Face] queueing — ${workflowName}, ${n} identity refs, ${width}x${height}, seed=${params.seed}, guidance=${(wf.GUIDANCE?.inputs as Record<string, unknown>)?.guidance ?? 4.0}, turbo=${params.useTurbo ? 'on' : 'off'}`);
      const clientId = crypto.randomUUID();
      const queueResponse = await this.queuePrompt(wf, clientId);
      const output = await this.waitForCompletion(queueResponse.prompt_id);
      const imageData = await this.downloadImage(output.filename, output.subfolder, output.type);

      const isFinalQuality = input.overrides?.quality === 'final';
      const step = isFinalQuality ? 'faces' : 'sketch';
      const { imagePath, thumbnailPath } = await this.savePortrait(
        input.characterId,
        imageData,
        step,
        params.seed,
      );

      // Pass 2 — full workflow re-run with Pass 1 output as primary ref.
      // Pass 1's output image becomes the identity anchor (slot 1); user-assigned
      // pass2Refs fill the remaining slots as secondary refs for style/additional
      // identity cues. Uses its own guidance, turbo, seed, and prompt.
      let pass2Status: 'ok' | 'failed' | 'errored' | 'skipped' = 'skipped';
      // Pass 2 default = minimal style-pull prompt. Pass 1 output is always
      // slot 1; any Pass 2 refs sit at slots 2..N. Targeted-attribute pattern
      // tells the model to keep the subject from slot 1 and pull only the
      // visual style from the rest. If no Pass 2 refs are attached, the prompt
      // degrades to a passthrough so the workflow still runs cleanly.
      const buildPass2Default = (totalRefs: number): string => {
        if (totalRefs <= 1) {
          return `A head-and-shoulders portrait of the person from image reference 1, shoulders-up, nude, bare shoulders, no clothing.`;
        }
        const styleRange = totalRefs === 2 ? 'image reference 2' : `image references 2-${totalRefs}`;
        return (
          `Render the person from image reference 1 in the visual style of ${styleRange}. ` +
          `Do not use the face, hair, skin, clothing, pose, framing, or background from ${styleRange} — only the art style and rendering.\n\n` +
          `Painterly semi-realistic rendering with a slight CGI sheen and dark-fantasy mood. Highly detailed face, sharp features, fine skin texture with subtle subsurface scattering, soft specular highlights. Rembrandt lighting — a soft key light from the upper side casting a gentle triangle of light on the shadowed cheek, smooth falloff, no harsh shadows.\n\n` +
          `Head-and-shoulders portrait, shoulders-up, straight-on front view, nude, bare shoulders, no clothing. Plain mid-grey studio backdrop, completely flat and minimal.`
        );
      };
      const cleanupPrompt: string | null = params.runPass2
        ? (params.customPass2Prompt && params.customPass2Prompt.trim().length > 0
            ? params.customPass2Prompt
            : null) // resolve once we know p2n inside the try block
        : null;
      // Captures the actual Pass 2 prompt sent (custom or dynamically resolved
      // default). Populated inside the try block; surfaced in metadata.
      let actualPass2Prompt: string | null = null;
      let finalResult: { imagePath: string; thumbnailPath: string; imageData: Buffer } = { imagePath, thumbnailPath, imageData };
      if (params.runPass2) {
        try {
          // 1. Upload Pass 1 output as a fresh ref (no RMBG — already a clean generated portrait).
          const pass1OutputName = await this.uploadBuffer(imageData, `pass1_${params.seed}.png`);

          // 2. Build Pass 2 ref chain: [pass1Output, ...pass2RefNames] capped at 5 slots.
          const pass2Refs = [pass1OutputName, ...(params.pass2RefNames ?? [])].slice(0, 5);
          const p2n = pass2Refs.length;

          // 3. Load fresh workflow clone for Pass 2.
          const wf2 = JSON.parse(JSON.stringify(await this.loadWorkflow(workflowName))) as Record<string, Record<string, unknown>>;
          delete wf2._comment;

          // 4. Populate LOAD_REF1..p2n.
          for (let i = 0; i < p2n; i++) {
            (wf2[`LOAD_REF${i + 1}`].inputs as Record<string, unknown>).image = pass2Refs[i];
          }
          // Strip unused slots and rewire chain root.
          for (let i = p2n + 1; i <= 5; i++) {
            delete wf2[`LOAD_REF${i}`];
            delete wf2[`SCALE_REF${i}`];
            delete wf2[`ENCODE_REF${i}`];
            delete wf2[`REFLAT_${i}`];
          }
          if (p2n < 5 && p2n >= 1) {
            (wf2[`REFLAT_${p2n}`].inputs as Record<string, unknown>).conditioning = ['GUIDANCE', 0];
          }

          // 5. Pass 2 parameter injection — fresh seed so it doesn't collapse into Pass 1.
          const pass2G = typeof params.pass2Guidance === 'number' ? params.pass2Guidance : 4.0;
          const pass2Steps = params.useTurboPass2 ? 8 : 20;
          const pass2Seed = Math.floor(Math.random() * 2147483647);
          for (const node of Object.values(wf2)) {
            const cls = node.class_type as string;
            const inp = node.inputs as Record<string, unknown> | undefined;
            if (!inp) continue;
            if (cls === 'CLIPTextEncode')        inp.text = cleanupPrompt ?? buildPass2Default(p2n);
            if (cls === 'RandomNoise')           inp.noise_seed = pass2Seed;
            if (cls === 'EmptyFlux2LatentImage') { inp.width = width; inp.height = height; inp.batch_size = 1; }
            if (cls === 'Flux2Scheduler')        { inp.steps = pass2Steps; inp.width = width; inp.height = height; }
            delete node._meta;
          }
          // Guidance + Turbo override.
          if (wf2.GUIDANCE?.inputs) (wf2.GUIDANCE.inputs as Record<string, unknown>).guidance = pass2G;
          if (params.useTurboPass2) {
            if (wf2.LORA_TURBO?.inputs) (wf2.LORA_TURBO.inputs as Record<string, unknown>).strength_model = 1.0;
            if (wf2.SCHEDULER?.inputs)  (wf2.SCHEDULER.inputs as Record<string, unknown>).steps = 8;
          }
          actualPass2Prompt = cleanupPrompt ?? buildPass2Default(p2n);
          console.log(`[Flux2Face] pass 2 queueing — ${p2n} refs, guidance=${pass2G}, steps=${pass2Steps}, turbo=${params.useTurboPass2 ? 'on' : 'off'}, prompt="${actualPass2Prompt.slice(0, 80)}"`);

          // 6. Submit + download + save.
          const p2ClientId = crypto.randomUUID();
          const p2Queue = await this.queuePrompt(wf2, p2ClientId);
          const p2Output = await this.waitForCompletion(p2Queue.prompt_id);
          const p2ImageData = await this.downloadImage(p2Output.filename, p2Output.subfolder, p2Output.type);
          const p2Saved = await this.savePortrait(input.characterId, p2ImageData, step, pass2Seed);
          finalResult = { imagePath: p2Saved.imagePath, thumbnailPath: p2Saved.thumbnailPath, imageData: p2ImageData };
          pass2Status = 'ok';
          console.log(`[Flux2Face] pass 2 OK — ${finalResult.imagePath}`);
        } catch (e) {
          console.warn('[Flux2Face] pass 2 errored:', e instanceof Error ? e.message : e);
          pass2Status = 'errored';
        }
      }

      const generationTimeMs = Date.now() - startTime;
      return {
        success: true,
        imageData: finalResult.imageData,
        imagePath: finalResult.imagePath,
        thumbnailPath: finalResult.thumbnailPath,
        metadata: {
          prompt: finalPrompt,
          pass2Prompt: pass2Status === 'ok' ? actualPass2Prompt : null,
          clipL: promptOutput.clipL,
          negativePrompt: promptOutput.negativePrompt,
          seed: params.seed,
          model: 'flux2-dev-fp8mixed',
          steps,
          cfg: 1,
          width,
          height,
          generationTimeMs,
          workflowUsed: workflowName,
          debugRefs: `flux2: pose=${anglePoseActive ? 'on' : 'off'} | id=${n} refs | style=${styleRefCount} | ${width}x${height} | pass2=${pass2Status}\nchain: ${chainDebug}`,
        } as PortraitMetadata & { workflowUsed: string; debugRefs: string; pass2Prompt: string | null },
      };
    } catch (e) {
      console.error('[Flux2Face] failed:', e);
      return null;
    }
  }

  /**
   * FLUX.2 Dev full-body generation. Mirrors generateFaceFlux2:
   *
   * - Pose template: public/portraits/pose-refs/FrontBodyPose.png (canonical
   *   full-body stand). Run through Canny in the workflow → only silhouette/
   *   pose edges reach ReferenceLatent. No identity bleed from the template.
   * - Identity refs: whatever the caller uploaded (user photos +/- the locked
   *   face from the prior step). Slot 1 is the primary identity anchor —
   *   typically the locked face so body gen stays consistent with the face
   *   we already committed to. Chained through ReferenceLatent.
   * - Render size: 1024x1536 (portrait aspect — full body plus margin).
   *
   * Returns null on any failure; the caller is responsible for falling back
   * or surfacing the error.
   */
  /**
   * Body generation = single-pass multi-reference. Slot 1 is the locked face
   * from Pass 1 (anchors identity); slot 2 is the built-in body style ref
   * (anchors painted/grunge mood). FLUX.2's ReferenceLatent chain handles
   * identity preservation and style transfer in one sampling pass — no
   * outpaint, no compositing, no chroma-key. Body description, build,
   * underwear, lighting, and style negation all live in the prompt.
   */
  private async generateBodyFlux2(
    input: PortraitInput,
    params: ComfyUIWorkflowParams,
    promptOutput: { clipL: string; t5xxl: string; negativePrompt: string },
    startTime: number,
  ): Promise<PortraitResult | null> {
    try {
      const facePath = input.personaLock?.referenceImagePath;
      if (!facePath) {
        console.warn('[Flux2Body] no locked face — cannot anchor identity');
        return null;
      }

      // Force canvas to 1024×1792 — params come in as 1536 from upstream
      // (`height: isFullBody ? 1536 : 1280`), and at 1536 the model fills the
      // full vertical extent and clips feet. 1792 gives the prompt's framing
      // language room to leave margin above the head and below the feet.
      const canvasW = 1024;
      const canvasH = 1792;
      const steps    = params.useTurbo === true ? 8 : 20;
      const guidance = typeof params.pass1Guidance === 'number' ? params.pass1Guidance : 4.0;

      // 1. Upload locked face as identity ref (slot 1).
      const faceName = await this.uploadReferenceImage(facePath);

      // Style ref disabled: when present at any megapixel size it pulled the
      // body composition (full-frame, tight crop) and clipped head/feet. Style
      // mood now comes purely from the prompt's painterly/CGI/dark-fantasy
      // language. Re-enable when we have a non-figurative texture-only ref.
      const styleName: string | null = null;
      const refs: string[] = [faceName];
      const n = refs.length;

      // 3. Build prompt (identity + body description + underwear + style transfer).
      const finalPrompt = this.buildBodyPrompt(input, !!styleName);

      // 4. Load + customize multi-ref workflow.
      const wf = JSON.parse(JSON.stringify(await this.loadWorkflow('flux2-face-cloud'))) as Record<string, Record<string, unknown>>;
      delete wf._comment;

      for (let i = 0; i < n; i++) {
        (wf[`LOAD_REF${i + 1}`].inputs as Record<string, unknown>).image = refs[i];
      }
      for (let i = n + 1; i <= 5; i++) {
        delete wf[`LOAD_REF${i}`];
        delete wf[`SCALE_REF${i}`];
        delete wf[`ENCODE_REF${i}`];
        delete wf[`REFLAT_${i}`];
      }
      if (n < 5 && n >= 1) {
        (wf[`REFLAT_${n}`].inputs as Record<string, unknown>).conditioning = ['GUIDANCE', 0];
      }

      // Per-ref strength via encoded resolution (FLUX.2 weights refs by their
      // latent token count, so smaller = weaker influence). Style ref dropped
      // to 0.1MP — at 0.25MP its full-frame body composition was still pulling
      // the figure to fill the canvas top-to-bottom and clipping head/feet.
      // Identity ref stays at 1MP.
      if (styleName && wf.SCALE_REF2?.inputs) {
        (wf.SCALE_REF2.inputs as Record<string, unknown>).megapixels = 0.1;
      }

      // 5. Inject parameters.
      for (const node of Object.values(wf)) {
        const cls = node.class_type as string;
        const inp = node.inputs as Record<string, unknown> | undefined;
        if (!inp) continue;
        if (cls === 'CLIPTextEncode')         inp.text = finalPrompt;
        if (cls === 'RandomNoise')            inp.noise_seed = params.seed;
        if (cls === 'EmptyFlux2LatentImage') { inp.width = canvasW; inp.height = canvasH; inp.batch_size = 1; }
        if (cls === 'Flux2Scheduler')        { inp.steps = steps; inp.width = canvasW; inp.height = canvasH; }
        if (cls === 'FluxGuidance')           inp.guidance = guidance;
        delete node._meta;
      }
      if (params.useTurbo) {
        if (wf.LORA_TURBO?.inputs) (wf.LORA_TURBO.inputs as Record<string, unknown>).strength_model = 1.0;
        if (wf.SCHEDULER?.inputs)  (wf.SCHEDULER.inputs as Record<string, unknown>).steps = 8;
      }

      console.log(`[Flux2Body] queueing single-pass — ${n} refs (style=${styleName ? 'on' : 'off'}), ${canvasW}×${canvasH}, steps=${steps}, guidance=${guidance}, seed=${params.seed}`);
      const clientId = crypto.randomUUID();
      const queueResponse = await this.queuePrompt(wf, clientId);
      const output = await this.waitForCompletion(queueResponse.prompt_id);
      const imageData = await this.downloadImage(output.filename, output.subfolder, output.type);

      const { imagePath, thumbnailPath } = await this.savePortrait(
        input.characterId,
        imageData,
        'bodies',
        params.seed,
      );

      const generationTimeMs = Date.now() - startTime;
      return {
        success: true,
        imageData,
        imagePath,
        thumbnailPath,
        metadata: {
          prompt: finalPrompt,
          clipL: promptOutput.clipL,
          negativePrompt: promptOutput.negativePrompt,
          seed: params.seed,
          model: 'flux2-dev-fp8mixed',
          steps,
          cfg: 1,
          width: canvasW,
          height: canvasH,
          generationTimeMs,
          workflowUsed: 'flux2-face-cloud',
          debugRefs: `flux2 body multi-ref: identity=${faceName} | style=${styleName ?? 'none'}`,
        } as PortraitMetadata & { workflowUsed: string; debugRefs: string },
      };
    } catch (e) {
      console.error('[Flux2Body] failed:', e);
      return null;
    }
  }

  /**
   * Build the body prompt for the single-pass multi-ref flow. Identity is
   * pulled from image reference 1 (the locked face); art style is pulled
   * from image reference 2 (body-style1.png) when present. Body proportions,
   * underwear, and composition come from the character sheet + prompt.
   */
  private buildBodyPrompt(input: PortraitInput, hasStyle: boolean): string {
    const id = input.characterData?.identity;
    const sexRaw = (id?.sex || '').toString().toLowerCase();
    const subject = sexRaw === 'female' ? 'woman' : sexRaw === 'male' ? 'man' : 'person';

    // Physical attributes (skin / hair / eyes / build).
    const segs: string[] = [];
    if (id?.skinTone) segs.push(`${id.skinTone.trim()} skin`);

    const hairLen = id?.hairLength?.trim();
    const hairTex = id?.hairTexture?.trim();
    const hairCol = id?.hairColor?.trim();
    const hairSty = id?.hairStyle?.trim();
    if (hairLen || hairTex || hairCol || hairSty) {
      const hairBits = [hairLen, hairTex, hairCol].filter(Boolean).join(' ');
      let hair = hairBits ? `${hairBits} hair` : 'hair';
      if (hairSty) hair += ` styled in a ${hairSty}`;
      segs.push(hair);
    }
    if (id?.eyeColor) segs.push(`${id.eyeColor.trim()} eyes`);
    // Strip the height suffix the adapter bakes into bodyType (e.g.,
    // "slim, 5'7\"") — height was throwing the proportions off. Use just
    // the build descriptor.
    const buildOnly = id?.bodyType?.split(',')[0]?.trim();
    if (buildOnly) segs.push(`a ${buildOnly} body`);

    let physClause = '';
    if (segs.length === 1) physClause = ` with ${segs[0]}`;
    else if (segs.length === 2) physClause = ` with ${segs[0]} and ${segs[1]}`;
    else if (segs.length >= 3) physClause = ` with ${segs.slice(0, -1).join(', ')}, and ${segs[segs.length - 1]}`;

    // Underwear: aesthetic descriptors + secondary style color (FLUX.2 reads hex directly).
    const aesthetics = (id?.styleAesthetics || []).filter(Boolean).map(a => a.toLowerCase());
    const aestheticPhrase = aesthetics.length === 0 ? '' :
      aesthetics.length === 1 ? aesthetics[0] :
      `${aesthetics[0]} and ${aesthetics[1]}`;
    const secondaryHex = normalizeHex(id?.styleColors?.secondary);
    const colorPhrase = secondaryHex || 'neutral';
    const underwearPhrase = aestheticPhrase
      ? `Wearing ${aestheticPhrase} ${colorPhrase} underwear.`
      : `Wearing ${colorPhrase} underwear.`;

    const styleSentence = hasStyle
      ? ` Pull only the painterly brushwork, atmospheric grunge texture, and color rendering style from image reference 2 — nothing else. Do not use the body, pose, anatomy, framing, composition, clothing, underwear, face, hair, skin, or background from image reference 2.`
      : '';

    return (
      `A full-length painted illustration of the ${subject} from image reference 1${physClause}, full body visible from the top of the head to the toes with the figure occupying about 80% of the frame height — clear empty grey space above the head and below the feet, the figure does NOT touch the top or bottom edges of the frame. Tall fashion-model proportions, approximately 8.5 heads tall, with a notably small head relative to the body and long elongated limbs. Match the exact facial identity, hair, and skin tone from image reference 1 with high fidelity. Slight A-pose, arms relaxed at the sides, standing straight facing the camera, neutral expression, looking forward.\n\n` +
      `${underwearPhrase}\n\n` +
      `Plain mid-grey studio backdrop. Soft Rembrandt lighting.\n\n` +
      `Rendered as a painterly semi-realistic digital illustration with visible brushwork, soft painted edges, and a glossy CGI sheen on skin and surfaces — subtle subsurface scattering, polished highlights, smooth rendered textures. Muted desaturated color palette, dark-fantasy mood, atmospheric and slightly stylized — not a photograph, not photorealistic.${styleSentence}`
    );
  }

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
