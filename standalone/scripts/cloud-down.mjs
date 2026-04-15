// Hibernate the pod (stop but keep network volume + config).
import fs from 'node:fs';
import { rp } from './runpod-api.mjs';

const ID = fs.readFileSync('C:/Projects/GRO.WTH/standalone/.ssh/pod-id.txt', 'utf-8').trim();
await rp(`/pods/${ID}/stop`, { method: 'POST' });
console.log(`pod ${ID} stopped. Volume + config preserved. Resume later with cloud-up.`);
