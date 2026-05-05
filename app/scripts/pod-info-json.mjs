import fs from 'node:fs';
import { rp } from './runpod-api.mjs';
const ID = fs.readFileSync('C:/Projects/GRO.WTH/standalone/.ssh/pod-id.txt', 'utf-8').trim();
const pod = await rp(`/pods/${ID}`);
console.log(JSON.stringify({ id: pod.id, status: pod.desiredStatus, publicIp: pod.publicIp, portMappings: pod.portMappings || {} }));
