import fs from 'node:fs';
const env = fs.readFileSync('.env.local', 'utf-8');
const KEY = env.match(/^RUNPOD_API_KEY=["']?([^"'\r\n]+)/m)[1];
const r = await fetch('https://rest.runpod.io/v1/pods/iucnxl51ddxzpq', {
  headers: { authorization: `Bearer ${KEY}` },
});
const p = await r.json();
console.log(JSON.stringify({ publicIp: p.publicIp, portMappings: p.portMappings }));
