/**
 * The text pod follows the session (Michael 2026-10-30): the pure pieces — which lane is a pod, where a boot is —
 * and the keep-warm loop's start/stop reaching the pod. RunPod is mocked at fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { podIdFromUrl, podPhase, type PodView } from './text-pod';

const view = (over: Partial<PodView> = {}): PodView => ({ podId: 'abc123', desiredStatus: 'RUNNING', costPerHr: 1.29, gpu: 'MIG', uptimeSeconds: 40, ...over });

describe('podIdFromUrl', () => {
  it('reads the pod id off a proxy lane URL and nothing off a serverless one', () => {
    expect(podIdFromUrl('https://05d8euwufcq2np-8000.proxy.runpod.net/v1')).toBe('05d8euwufcq2np');
    expect(podIdFromUrl('https://api.runpod.ai/v2/y0lkvhwp0xkzrs/openai/v1')).toBeNull();
    expect(podIdFromUrl('http://localhost:8000/v1')).toBeNull();
    expect(podIdFromUrl(undefined)).toBeNull();
  });
});

describe('podPhase', () => {
  it('an answering model is ready whatever the pod says', () => {
    expect(podPhase(view({ desiredStatus: 'EXITED' }), 'ready')).toBe('ready');
  });
  it('a stopped pod is "host" — nothing boots until it is resumed', () => {
    expect(podPhase(view({ desiredStatus: 'EXITED', uptimeSeconds: null }), 'offline')).toBe('host');
  });
  it('resumed but not yet placed is "host"; placed and loading weights is "loading"', () => {
    expect(podPhase(view({ uptimeSeconds: null }), 'warming')).toBe('host');
    expect(podPhase(view({ uptimeSeconds: 90 }), 'warming')).toBe('loading');
  });
  it('no view at all: the probe decides', () => {
    expect(podPhase(null, 'offline')).toBe('offline');
    expect(podPhase(null, 'warming')).toBe('loading');
  });
});

describe('keep-warm loop ↔ pod', () => {
  const savedEnv = { ...process.env };
  const calls: string[] = [];
  let desired = 'EXITED';
  beforeEach(() => {
    process.env.DAYA_L1_URL = 'https://abc123-8000.proxy.runpod.net/v1';
    process.env.DAYA_L1_MODEL = 'm';
    process.env.RUNPOD_API_KEY = 'k';
    calls.length = 0;
    (globalThis as { __textPodLast?: Map<string, unknown> }).__textPodLast = new Map();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
      const q = init?.body ? (JSON.parse(init.body) as { query?: string }).query ?? '' : '';
      if (/podResume/.test(q)) { calls.push('resume'); desired = 'RUNNING'; return { json: async () => ({ data: { podResume: { id: 'abc123', desiredStatus: 'RUNNING' } } }) }; }
      if (/podStop/.test(q)) { calls.push('stop'); desired = 'EXITED'; return { json: async () => ({ data: { podStop: { id: 'abc123', desiredStatus: 'EXITED' } } }) }; }
      if (/pod\(input/.test(q)) return { json: async () => ({ data: { pod: { desiredStatus: desired, costPerHr: 1.29, runtime: desired === 'RUNNING' ? { uptimeInSeconds: 5 } : null, machine: { gpuDisplayName: 'MIG' } } } }) };
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' }; // the chat probe
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); process.env = { ...savedEnv }; });

  it('resumes a stopped pod and stops it again on release', async () => {
    const { resumeTextPod, stopTextPod } = await import('./text-pod');
    expect(await resumeTextPod('test')).toBe('resumed');
    expect(await resumeTextPod('test')).toBe('already-running'); // debounced, no second mutation
    expect(await stopTextPod('test')).toBe('stopped');
    expect(calls).toEqual(['resume', 'stop']);
  });

  it('a serverless lane is left alone', async () => {
    process.env.DAYA_L1_URL = 'https://api.runpod.ai/v2/xyz/openai/v1';
    const { resumeTextPod, stopTextPod } = await import('./text-pod');
    expect(await resumeTextPod('test')).toBe('not-a-pod');
    expect(await stopTextPod('test')).toBe('not-a-pod');
    expect(calls).toEqual([]);
  });
});
