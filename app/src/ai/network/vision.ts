/**
 * ai/network/vision — the ONE door for image-understanding calls (2026-10-13).
 *
 * Christophoros (the WSL box that ran Ollama) is shut down, so no vision call
 * may default to localhost. VISION_PROVIDER picks the model:
 *   pod    (default) — the serverless text lane (the local lane). Its
 *                      Qwen3.8-27B checkpoint is a VL model (visual.* weights
 *                      served, vLLM multi-modal warmup on boot) and speaks the
 *                      OpenAI `image_url` content-part dialect. Company compute:
 *                      INSIDE the wall, so real-person photos may go here.
 *   claude           — Anthropic, AI_VISION_MODEL (default = judgment model).
 *                      CROSSES the wall: fiction only (mayCrossWall) — `real`
 *                      content is refused fail-closed, exactly as route() does
 *                      for text. Every call that goes writes [wall→cloud].
 *   ollama           — a local Ollama (OLLAMA_URL); loopback/private/tailnet
 *                      hosts only. Opt-in only.
 *
 * Callers (portraits/lock-gate.ts, references/describe) keep their own
 * prompts, parsing and failure policy; this module only answers "what does
 * the model say about this image".
 */

import 'server-only';
import { localLane, ollamaUrl, visionModel, visionProvider, type ModelProviderChoice } from './config';
import { openAiCompatChat } from './transports/openai-compat';
import { anthropicChatText, type AnthropicMessagesClient } from './transports/anthropic';
import { auditCloudCall, auditRefusal } from './audit';
import { recordAiCall } from './metering';
import { WallViolationError } from './errors';
import { mayCrossWall, type ContentClass } from './types';

export type VisionProvider = ModelProviderChoice;

export interface DescribeImageOptions {
  /** Stable caller id for metering / audit. */
  caller: string;
  /** What the image is (the wall's vocabulary): `real` never reaches Claude. */
  contentClass: ContentClass;
  prompt: string;
  /** Raw image bytes or base64 (no data-URL prefix). */
  image: Buffer | string;
  /** Default image/jpeg. */
  mediaType?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** Ask for a JSON object (Ollama `format: 'json'`; no-op elsewhere — the prompt must say so). */
  json?: boolean;
  /** Override VISION_PROVIDER. */
  provider?: VisionProvider;
  /** Override the provider's model (lane model / AI_VISION_MODEL / Ollama tag). */
  model?: string;
  /** Override OLLAMA_URL (ollama only). */
  ollamaUrl?: string;
  campaignId?: string;
  /** Injected Anthropic client (tests). */
  anthropicClient?: AnthropicMessagesClient;
  /** false = no AiCall ledger row (lab scripts). */
  meter?: boolean;
}

export interface DescribeImageResult {
  text: string;
  provider: VisionProvider;
  model: string;
}

/** Loopback, RFC1918, CGNAT/tailnet (100.64/10), *.local, *.ts.net, localhost. */
export function isLocalVisionHost(url: string): boolean {
  let host: string;
  try { host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch { return false; }
  if (host === 'localhost' || host === '::1' || host.endsWith('.local') || host.endsWith('.ts.net')) return true;
  const ip = host.split('.').map(Number);
  if (ip.length !== 4 || ip.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = ip;
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
}

function toBase64(image: Buffer | string): string {
  return typeof image === 'string' ? image : image.toString('base64');
}

/** Which provider a call will use (for callers that log or pick a model name). */
export function resolveVisionProvider(override?: VisionProvider): VisionProvider {
  return override ?? visionProvider();
}

/**
 * Send one image + prompt to the configured vision provider and return the
 * model's text. Throws on transport failure or a wall refusal — the caller
 * owns the policy (the lock gate fails open; the describe route returns 500).
 */
export async function describeImage(opts: DescribeImageOptions): Promise<DescribeImageResult> {
  const provider = resolveVisionProvider(opts.provider);
  const mediaType = opts.mediaType ?? 'image/jpeg';
  const base64 = toBase64(opts.image);
  const maxTokens = opts.maxTokens ?? 1024;
  const temperature = opts.temperature ?? 0;
  const meter = opts.meter !== false;

  if (provider === 'pod') {
    const lane = localLane();
    if (!lane) throw new Error('Vision: VISION_PROVIDER=pod but the local lane is not configured (AI_LOCAL_BASE_URL)');
    const model = opts.model ?? lane.model;
    const res = await openAiCompatChat({
      baseUrl: lane.baseUrl,
      apiKey: lane.apiKey,
      model,
      maxTokens,
      temperature,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
          { type: 'text', text: opts.prompt },
        ],
      }],
      ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
    });
    if (meter) recordAiCall({ lane: 'local', provider: 'openai-compat', model: res.model, caller: opts.caller, campaignId: opts.campaignId, usage: res.usage, meta: { vision: true } });
    return { text: res.text, provider, model: res.model };
  }

  if (provider === 'claude') {
    if (!mayCrossWall(opts.contentClass)) {
      auditRefusal(opts.caller, opts.contentClass, 'class-may-not-cross');
      throw new WallViolationError(`Task '${opts.caller}' tried to send a ${opts.contentClass} image to Claude (VISION_PROVIDER=claude) — refused; use pod or ollama.`);
    }
    const model = opts.model ?? visionModel();
    auditCloudCall({ caller: opts.caller, lane: 'vision', contentClass: opts.contentClass, bytesIn: Buffer.byteLength(opts.prompt, 'utf8') + base64.length, chunksToned: 0, campaignId: opts.campaignId });
    const res = await anthropicChatText({
      model,
      maxTokens,
      temperature,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: opts.prompt },
        ],
      }],
    }, opts.anthropicClient);
    if (meter) recordAiCall({ lane: 'vision', provider: 'anthropic', model: res.model, caller: opts.caller, campaignId: opts.campaignId, usage: res.usage, meta: { vision: true } });
    return { text: res.text, provider, model: res.model };
  }

  // ollama — explicit opt-in only.
  const url = (opts.ollamaUrl ?? ollamaUrl()).replace(/\/$/, '');
  if (!isLocalVisionHost(url)) throw new Error(`Vision: Ollama host is not local (privacy wall) — ${url}`);
  const model = opts.model ?? 'qwen2.5vl:7b';
  const res = await fetch(`${url}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: opts.prompt,
      images: [base64],
      stream: false,
      ...(opts.json ? { format: 'json' } : {}),
      keep_alive: '15m',
      options: { temperature, num_predict: maxTokens },
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ollama ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  const data = (await res.json()) as { response?: unknown };
  return { text: String(data.response ?? ''), provider, model };
}
