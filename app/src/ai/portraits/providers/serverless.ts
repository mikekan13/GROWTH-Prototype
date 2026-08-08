import 'server-only';

/**
 * RunPod Serverless provider — same generation pipeline as LocalProvider
 * (all workflow templating, saving, and DB logic inherited), with the
 * ComfyUI transport swapped for the worker-comfyui serverless contract:
 *
 *   queue   → POST /v2/{endpoint}/run   {input: {workflow, images[]}}
 *   wait    → GET  /v2/{endpoint}/status/{jobId} until COMPLETED
 *   images  → returned base64 in output.images[] (no /view fetch)
 *   uploads → ride along in the job payload (no /upload/image)
 *
 * Scale-to-zero: no pod to wake or park. Cold starts show up as a long
 * IN_QUEUE phase on the first job — the 30-minute poll ceiling absorbs it.
 * Selected by getLocalProvider() whenever RUNPOD_ENDPOINT_ID is set.
 */

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import type { ComfyUIQueueResponse, ProviderStatus } from '../types';
import { LocalProvider } from './local';

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_ATTEMPTS = 450; // 30 min — covers cold starts + generation
/** /run payload cap is 10MB; refs ride base64 inside it, so bound them. */
const MAX_REF_DIM = 1024;

function endpointBase(): string {
  return `https://api.runpod.ai/v2/${process.env.RUNPOD_ENDPOINT_ID}`;
}

function authHeaders(): Record<string, string> {
  return { authorization: `Bearer ${process.env.RUNPOD_API_KEY}` };
}

export class ServerlessProvider extends LocalProvider {
  name = 'runpod-serverless';

  /** Images staged for the NEXT queued job (worker has no upload endpoint). */
  private pendingImages = new Map<string, string>();
  /** Completed job outputs, keyed by job id, until downloadImage collects. */
  private jobOutputs = new Map<string, Buffer[]>();

  override async isAvailable(): Promise<boolean> {
    if (!process.env.RUNPOD_ENDPOINT_ID || !process.env.RUNPOD_API_KEY) return false;
    try {
      const res = await fetch(`${endpointBase()}/health`, {
        headers: authHeaders(),
        signal: AbortSignal.timeout(8000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  override async getStatus(): Promise<ProviderStatus> {
    try {
      const res = await fetch(`${endpointBase()}/health`, {
        headers: authHeaders(),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return { available: false, gpuLoaded: false, queueLength: 0, error: `Endpoint health ${res.status}` };
      }
      const health = await res.json();
      const workers = health.workers ?? {};
      const jobs = health.jobs ?? {};
      return {
        available: true,
        gpuLoaded: (workers.ready ?? 0) + (workers.running ?? 0) > 0,
        queueLength: (jobs.inQueue ?? 0) + (jobs.inProgress ?? 0),
      };
    } catch (e) {
      return { available: false, gpuLoaded: false, queueLength: 0, error: String(e) };
    }
  }

  /** Serverless spins workers up on demand — nothing to start. */
  protected override async ensureRunning(): Promise<void> { /* no-op */ }

  /** Workers scale to zero on their own — nothing to free. */
  protected override async releaseVram(): Promise<void> { /* no-op */ }

  protected override async uploadReferenceImage(imagePath: string): Promise<string> {
    const absolutePath = path.join(process.cwd(), 'public', imagePath.replace(/^\//, ''));
    const raw = await fs.readFile(absolutePath);
    // Downscale + normalize to PNG so multi-ref payloads stay under the cap.
    const png = await sharp(raw)
      .resize(MAX_REF_DIM, MAX_REF_DIM, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    const stem = path.basename(imagePath).replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const name = `${stem}-${png.length.toString(36)}.png`;
    this.pendingImages.set(name, `data:image/png;base64,${png.toString('base64')}`);
    return name;
  }

  protected override async uploadBuffer(buffer: Buffer, filename: string): Promise<string> {
    this.pendingImages.set(filename, `data:image/png;base64,${buffer.toString('base64')}`);
    return filename;
  }

  protected override async queuePrompt(workflow: object, _clientId: string): Promise<ComfyUIQueueResponse> {
    const images = [...this.pendingImages].map(([name, image]) => ({ name, image }));
    this.pendingImages.clear();

    const res = await fetch(`${endpointBase()}/run`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        input: { workflow, ...(images.length ? { images } : {}) },
      }),
    });
    if (!res.ok) {
      throw new Error(`Serverless queue failed (${res.status}): ${(await res.text()).slice(0, 600)}`);
    }
    const job = await res.json();
    if (!job?.id) {
      throw new Error(`Serverless queue returned no job id: ${JSON.stringify(job).slice(0, 300)}`);
    }
    return { prompt_id: job.id, number: 0 };
  }

  protected override async waitForCompletion(promptId: string): Promise<{
    filename: string;
    subfolder: string;
    type: string;
  }> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

      let status: { status?: string; output?: { images?: Array<{ data?: string }>; errors?: string[] }; error?: unknown };
      try {
        const res = await fetch(`${endpointBase()}/status/${promptId}`, {
          headers: authHeaders(),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) continue;
        status = await res.json();
      } catch {
        continue; // transient network blip — keep polling
      }

      if (status.status === 'COMPLETED') {
        const images = status.output?.images ?? [];
        if (!images.length) {
          throw new Error(
            `Serverless job produced no images${status.output?.errors ? `: ${JSON.stringify(status.output.errors).slice(0, 400)}` : ''}`,
          );
        }
        this.jobOutputs.set(
          promptId,
          images.map(img => Buffer.from(String(img.data ?? '').replace(/^data:[^,]+,/, ''), 'base64')),
        );
        return { filename: '0', subfolder: promptId, type: 'serverless' };
      }

      if (status.status === 'FAILED' || status.status === 'CANCELLED' || status.status === 'TIMED_OUT') {
        throw new Error(
          `Serverless job ${status.status}: ${JSON.stringify(status.output ?? status.error ?? {}).slice(0, 800)}`,
        );
      }
      // IN_QUEUE (cold start) or IN_PROGRESS — keep polling.
    }
    throw new Error('Serverless generation timed out after 30 minutes');
  }

  protected override async downloadImage(filename: string, subfolder: string, type: string): Promise<Buffer> {
    if (type !== 'serverless') return super.downloadImage(filename, subfolder, type);
    const buffers = this.jobOutputs.get(subfolder);
    if (!buffers) throw new Error(`No stored output for serverless job ${subfolder}`);
    const buf = buffers[Number(filename) || 0];
    if (!buf) throw new Error(`Serverless job ${subfolder} has no image #${filename}`);
    this.jobOutputs.delete(subfolder);
    return buf;
  }
}
