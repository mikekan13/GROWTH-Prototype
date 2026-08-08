// Temp pod to fix the volume's model layout. Usage:
//   node _tmp-volfix-pod.mjs inspect   — show old pod's image/env
//   node _tmp-volfix-pod.mjs create    — create cheap temp pod w/ volume
//   node _tmp-volfix-pod.mjs info <id> — publicIp + ssh port of temp pod
//   node _tmp-volfix-pod.mjs kill <id> — terminate temp pod
import fs from 'node:fs';
const env = fs.readFileSync('.env.local', 'utf-8');
const KEY = env.match(/^RUNPOD_API_KEY=["']?([^"'\r\n]+)/m)[1];
const headers = { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };
const api = async (method, path, body) => {
  const r = await fetch(`https://rest.runpod.io/v1${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, out: await r.json().catch(() => null) };
};

const [, , action, arg] = process.argv;

if (action === 'inspect') {
  const { status, out } = await api('GET', '/pods/iucnxl51ddxzpq');
  console.log(status, JSON.stringify({
    image: out?.image ?? out?.imageName,
    env: out?.env ? Object.keys(out.env) : null,
    ports: out?.ports,
    volumeMountPath: out?.volumeMountPath,
    dockerStartCmd: out?.dockerStartCmd,
    templateId: out?.templateId,
  }, null, 1));
} else if (action === 'create') {
  const { status: st0, out: old } = await api('GET', '/pods/iucnxl51ddxzpq');
  const image = old?.image ?? old?.imageName;
  console.log('old image:', st0, image);
  const { status, out } = await api('POST', '/pods', {
    name: 'growth-volfix-temp',
    imageName: image,
    cloudType: 'SECURE',
    gpuTypeIds: [
      'NVIDIA RTX A4000', 'NVIDIA RTX A4500', 'NVIDIA RTX A5000', 'NVIDIA A40', 'NVIDIA L40S', 'NVIDIA L40', 'NVIDIA RTX 6000 Ada Generation', 'NVIDIA RTX A6000', 'NVIDIA A100 80GB PCIe', 'NVIDIA A100-SXM4-80GB', 'NVIDIA H100 PCIe', 'NVIDIA H100 80GB HBM3', 'NVIDIA H200', 'NVIDIA H100 NVL',
      'NVIDIA GeForce RTX 4090', 'NVIDIA RTX 2000 Ada Generation', 'NVIDIA L4',
    ],
    gpuCount: 1,
    networkVolumeId: 'o5y6of5tje',
    volumeMountPath: '/workspace',
    containerDiskInGb: 15,
    env: { PUBLIC_KEY: process.env.VOLFIX_PUBKEY },
    ports: ['22/tcp'],

  });
  console.log('CREATE:', status, JSON.stringify(out).slice(0, 500));
} else if (action === 'info') {
  const { status, out } = await api('GET', `/pods/${arg}`);
  console.log(status, JSON.stringify({
    desired: out?.desiredStatus, ip: out?.publicIp, ports: out?.portMappings,
  }));
} else if (action === 'kill') {
  const { status, out } = await api('DELETE', `/pods/${arg}`);
  console.log('DELETE:', status, JSON.stringify(out).slice(0, 200));
}
