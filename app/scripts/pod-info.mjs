import fs from 'node:fs';
import { rp } from './runpod-api.mjs';

const ID = fs.readFileSync('C:/Projects/GRO.WTH/standalone/.ssh/pod-id.txt', 'utf-8').trim();
const pod = await rp(`/pods/${ID}`);
console.log('status:', pod.desiredStatus, '/', pod.runtime?.podStatus || 'n/a');
console.log('publicIp:', pod.publicIp || pod.runtime?.ports?.find(p => p.privatePort === 22)?.ip || '(not yet)');
if (pod.runtime?.ports) {
  for (const p of pod.runtime.ports) {
    console.log(`  ${p.privatePort}/${p.type} → ${p.isIpPublic ? 'public' : 'proxy'} ${p.ip}:${p.publicPort}`);
  }
}
console.log('---');
console.log(JSON.stringify(pod.runtime, null, 2)?.slice(0, 1500));
