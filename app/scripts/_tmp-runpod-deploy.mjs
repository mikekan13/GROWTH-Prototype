// Create the serverless template + endpoint for portrait generation.
// Idempotent-ish: pass "check" to just list, "deploy" to create.
import fs from 'node:fs';
const env = fs.readFileSync('.env.local', 'utf-8');
const KEY = env.match(/^RUNPOD_API_KEY=["']?([^"'\r\n]+)/m)[1];
const headers = { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };
const api = async (method, path, body) => {
  const r = await fetch(`https://rest.runpod.io/v1${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const out = await r.json().catch(() => null);
  return { status: r.status, out };
};

const IMAGE = 'runpod/worker-comfyui:5.8.6-base';
const VOLUME = 'o5y6of5tje';
const DC = 'US-NE-1';

// 1. Template
const tpl = await api('POST', '/templates', {
  name: 'growth-portraits-comfyui',
  imageName: IMAGE,
  isServerless: true,
  containerDiskInGb: 25,
  env: { COMFY_LOG_LEVEL: 'INFO' },
});
console.log('TEMPLATE:', tpl.status, JSON.stringify(tpl.out).slice(0, 400));
const templateId = tpl.out?.id;
if (!templateId) process.exit(1);

// 2. Endpoint — scale to zero, one worker, H100/A100 80GB class in the volume's DC
const ep = await api('POST', '/endpoints', {
  name: 'growth-portraits',
  templateId,
  computeType: 'GPU',
  gpuTypeIds: ['NVIDIA H100 80GB HBM3', 'NVIDIA A100-SXM4-80GB', 'NVIDIA A100 80GB PCIe'],
  gpuCount: 1,
  networkVolumeId: VOLUME,
  dataCenterIds: [DC],
  workersMin: 0,
  workersMax: 1,
  idleTimeout: 120,
  scalerType: 'QUEUE_DELAY',
  scalerValue: 4,
  flashboot: true,
});
console.log('ENDPOINT:', ep.status, JSON.stringify(ep.out).slice(0, 600));
