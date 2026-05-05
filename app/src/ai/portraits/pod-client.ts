import 'server-only';
/**
 * Thin wrapper for the RunPod REST API.
 *
 * Used by pod-keepalive.ts to wake/hibernate the ComfyUI pod automatically
 * around generation activity. Reads the pod id + API key from env:
 *
 *   RUNPOD_POD_ID        — the pod to control (e.g. "iucnxl51ddxzpq")
 *   RUNPOD_API_KEY       — Bearer token
 *
 * If either is missing, the helpers are no-ops — the caller falls back to
 * hitting the existing COMFYUI_URL directly. That means local-only dev
 * without a pod still works; only the warm-keeper becomes inert.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://rest.runpod.io/v1';

interface PodInfo {
  id: string;
  desiredStatus: 'RUNNING' | 'EXITED' | 'TERMINATED' | string;
  publicIp?: string;
  costPerHr?: number;
  portMappings?: Record<string, number>;
}

let cachedPodId: string | null = null;
let cachedApiKey: string | null = null;

/**
 * Resolve the pod ID and API key. Tries env first; falls back to the dev
 * paths used by the standalone scripts (for local workstation convenience).
 */
async function getCreds(): Promise<{ podId: string; apiKey: string } | null> {
  if (cachedPodId && cachedApiKey) return { podId: cachedPodId, apiKey: cachedApiKey };

  let podId = process.env.RUNPOD_POD_ID || '';
  let apiKey = process.env.RUNPOD_API_KEY || '';

  // Fallback: dev workstation paths (only hit when env vars are absent).
  // Reads from this project's root — process.cwd() in `next dev` is the app root.
  if (!podId) {
    try {
      podId = (await fs.readFile(`${process.cwd()}/.ssh/pod-id.txt`, 'utf-8')).trim();
    } catch { /* ignore */ }
  }
  if (!apiKey) {
    try {
      const envFile = await fs.readFile(`${process.cwd()}/.env.local`, 'utf-8');
      apiKey = envFile.match(/^RUNPOD_API_KEY=(.+)$/m)?.[1]?.trim() || '';
    } catch { /* ignore */ }
  }

  if (!podId || !apiKey) return null;
  cachedPodId = podId;
  cachedApiKey = apiKey;
  return { podId, apiKey };
}

async function rp<T = unknown>(subpath: string, init: RequestInit = {}): Promise<T | null> {
  const creds = await getCreds();
  if (!creds) return null;
  const r = await fetch(BASE + subpath, {
    ...init,
    headers: {
      authorization: `Bearer ${creds.apiKey}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  });
  const text = await r.text();
  if (!r.ok) {
    console.warn(`[pod-client] ${subpath} → ${r.status}: ${text.slice(0, 200)}`);
    return null;
  }
  return text ? (JSON.parse(text) as T) : (null as T);
}

export async function getPodStatus(): Promise<PodInfo | null> {
  const creds = await getCreds();
  if (!creds) return null;
  return rp<PodInfo>(`/pods/${creds.podId}`);
}

export async function isPodRunning(): Promise<boolean> {
  const p = await getPodStatus();
  return p?.desiredStatus === 'RUNNING';
}

export async function resumePod(): Promise<boolean> {
  const creds = await getCreds();
  if (!creds) return false;
  const r = await rp(`/pods/${creds.podId}/start`, { method: 'POST' });
  return r !== null;
}

export async function stopPod(): Promise<boolean> {
  const creds = await getCreds();
  if (!creds) return false;
  const r = await rp(`/pods/${creds.podId}/stop`, { method: 'POST' });
  return r !== null;
}

/** Build the ComfyUI proxy URL for the pod (e.g. https://<id>-8188.proxy.runpod.net) */
export function getProxyUrl(): string | null {
  if (!cachedPodId) return null;
  return `https://${cachedPodId}-8188.proxy.runpod.net`;
}

/**
 * Wait (polling) until the pod's ComfyUI proxy answers /system_stats.
 * Returns true on success, false on timeout.
 */
export async function waitForComfyReady(timeoutMs = 300_000): Promise<boolean> {
  const url = getProxyUrl();
  if (!url) return false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${url}/system_stats`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) return true;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 3000));
  }
  return false;
}
