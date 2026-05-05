// One-shot status: is pod running, how much have models downloaded, is ComfyUI responding.
import fs from 'node:fs';
import { rp } from './runpod-api.mjs';
import { execSync } from 'node:child_process';

const ID = fs.readFileSync('C:/Projects/GRO.WTH/standalone/.ssh/pod-id.txt', 'utf-8').trim();
const pod = await rp(`/pods/${ID}`);
const ip = pod.publicIp;
const sshPort = pod.portMappings?.['22'];
console.log(`pod: ${pod.id}  status=${pod.desiredStatus}  ip=${ip}  ssh=${sshPort}  $${pod.costPerHr}/hr`);

if (!ip || !sshPort || pod.desiredStatus !== 'RUNNING') {
  console.log('not reachable');
  process.exit(0);
}

const KEY = 'C:/Projects/GRO.WTH/standalone/.ssh/runpod_growth';
function ssh(cmd) {
  try {
    return execSync(
      `ssh -i "${KEY}" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${sshPort} root@${ip} ${JSON.stringify(cmd)}`,
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }
    ).toString();
  } catch (e) {
    return `ERR: ${e.message.slice(0, 100)}`;
  }
}

console.log('--- models ---');
console.log(ssh('du -sh /workspace/ComfyUI/models/*/  2>/dev/null | sort -h'));
console.log('--- download log tail ---');
console.log(ssh('tail -5 /workspace/download-models.log 2>/dev/null'));
console.log('--- comfy running? ---');
console.log(ssh('pgrep -af main.py 2>/dev/null || echo not running'));

// Get the ComfyUI proxy URL (RunPod routes http ports through their proxy)
console.log(`\ncomfy URL (once launched): https://${pod.id}-8188.proxy.runpod.net/`);
