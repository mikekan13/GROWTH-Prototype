// Direct RunPod REST status/start — bypasses the app's auth for pair-session ops.
import fs from 'node:fs';

const env = fs.readFileSync('.env.local', 'utf-8');
const get = (k) => env.match(new RegExp(`^${k}=["']?([^"'\\r\\n]+)`, 'm'))?.[1];
const KEY = get('RUNPOD_API_KEY');
let POD = get('RUNPOD_POD_ID');
if (!POD) { try { POD = fs.readFileSync('.ssh/pod-id.txt', 'utf-8').trim(); } catch { /* */ } }
if (!KEY || !POD) { console.error('missing', { KEY: !!KEY, POD }); process.exit(1); }

const headers = { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };
const action = process.argv[2] || 'status';

const path = action === 'start' ? '/start' : action === 'stop' ? '/stop' : '';
const r = await fetch(`https://rest.runpod.io/v1/pods/${POD}${path}`, {
  method: path ? 'POST' : 'GET',
  headers,
});
const body = await r.json().catch(() => ({}));
console.log(JSON.stringify({
  http: r.status,
  id: body.id,
  desiredStatus: body.desiredStatus,
  lastStatusChange: body.lastStatusChange,
  costPerHr: body.costPerHr,
  gpu: body.machine?.gpuTypeId ?? body.gpuTypeId,
}, null, 1));
