// Resume the hibernated pod and update standalone/.env with its URL.
import fs from 'node:fs';
import { rp } from './runpod-api.mjs';

import path from 'node:path';
const ID = fs.readFileSync(path.join(import.meta.dirname, '..', '.ssh', 'pod-id.txt'), 'utf-8').trim();

// Start (if stopped)
let pod = await rp(`/pods/${ID}`);
if (pod.desiredStatus !== 'RUNNING') {
  await rp(`/pods/${ID}/start`, { method: 'POST' });
  console.log('resume requested — waiting for RUNNING...');
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    pod = await rp(`/pods/${ID}`);
    if (pod.desiredStatus === 'RUNNING' && pod.publicIp) break;
    process.stdout.write('.');
  }
  console.log('');
}

const url = `https://${ID}-8188.proxy.runpod.net`;
console.log(`pod up: ${url}`);

// Patch standalone/.env COMFYUI_URL
const envPath = path.join(import.meta.dirname, '..', '.env');
let env = fs.readFileSync(envPath, 'utf-8');
env = env.replace(/^COMFYUI_URL=.*$/m, `COMFYUI_URL=${url}`);
if (!/^COMFYUI_URL=/m.test(env)) env += `\nCOMFYUI_URL=${url}\n`;
fs.writeFileSync(envPath, env);
console.log('standalone/.env → COMFYUI_URL patched');
