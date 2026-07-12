// One-shot status: is the pod running and is ComfyUI answering on the proxy.
// No SSH (standing rule: RunPod proxy only). Pod id: app/.ssh/pod-id.txt.
import fs from 'node:fs';
import path from 'node:path';
import { rp } from './runpod-api.mjs';

const ID = fs.readFileSync(path.join(import.meta.dirname, '..', '.ssh', 'pod-id.txt'), 'utf-8').trim();
const pod = await rp(`/pods/${ID}`);
console.log(`pod: ${pod.id}  name=${pod.name}  status=${pod.desiredStatus}  $${pod.costPerHr}/hr`);

if (pod.desiredStatus !== 'RUNNING') {
  console.log('hibernated — wake with: node scripts/cloud-up.mjs');
  process.exit(0);
}

const url = `https://${ID}-8188.proxy.runpod.net`;
try {
  const r = await fetch(`${url}/system_stats`, { signal: AbortSignal.timeout(15_000) });
  if (r.ok) {
    const stats = await r.json();
    const gpu = stats?.devices?.[0];
    console.log(`comfy: UP at ${url}`);
    if (gpu) console.log(`gpu: ${gpu.name}  vram_free=${Math.round((gpu.vram_free ?? 0) / 1e9)}GB / ${Math.round((gpu.vram_total ?? 0) / 1e9)}GB`);
  } else {
    console.log(`comfy: proxy answered ${r.status} — ComfyUI may still be starting`);
  }
} catch {
  console.log(`comfy: NOT answering at ${url} (starting up, or launch ComfyUI on the pod)`);
}
