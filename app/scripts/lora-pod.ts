/**
 * LoRA training pod lifecycle on RunPod (GraphQL, the API that has worked since April). Never prints the key.
 *   npx tsx scripts/lora-pod.ts create          # ai-toolkit image on the volume's datacenter; tries GPUs in order
 *   npx tsx scripts/lora-pod.ts info <podId>    # status, public IP, SSH port, cost
 *   npx tsx scripts/lora-pod.ts stop <podId>    # hibernate (volume persists)
 *   npx tsx scripts/lora-pod.ts terminate <podId>
 */
import { config } from 'dotenv';
import fs from 'fs/promises';
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

const KEY = process.env.RUNPOD_API_KEY;
if (!KEY) { console.error('RUNPOD_API_KEY missing'); process.exit(1); }

const VOLUME = 'o5y6of5tje';
const DATACENTER = 'US-NE-1';
const IMAGE = 'ostris/aitoolkit:latest';
const GPUS = ['NVIDIA H100 80GB HBM3', 'NVIDIA H200', 'NVIDIA RTX PRO 6000 Blackwell Server Edition', 'NVIDIA A100-SXM4-80GB'];
const PUBKEY_PATH = 'C:/Projects/GROWTH Character Creator/.ssh/runpod_growth.pub';

async function gql(query: string, variables: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const r = await fetch('https://api.runpod.io/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ query, variables }),
  });
  const j = (await r.json()) as { data?: Record<string, unknown>; errors?: { message: string }[] };
  if (j.errors) throw new Error(j.errors.map(e => e.message).join('; '));
  return j.data ?? {};
}

async function create() {
  const pub = (await fs.readFile(PUBKEY_PATH, 'utf8')).trim();
  for (const gpu of GPUS) {
    try {
      const d = await gql(
        `mutation($in: PodFindAndDeployOnDemandInput) { podFindAndDeployOnDemand(input: $in) { id costPerHr machine { gpuDisplayName } } }`,
        { in: {
          cloudType: 'SECURE', gpuCount: 1, volumeInGb: 0, containerDiskInGb: 60, minVcpuCount: 4, minMemoryInGb: 32,
          gpuTypeId: gpu, name: 'growth-lora-train', imageName: IMAGE, dockerArgs: '', ports: '22/tcp,8675/http',
          volumeMountPath: '/workspace', networkVolumeId: VOLUME, dataCenterId: DATACENTER, supportPublicIp: true,
          env: [{ key: 'PUBLIC_KEY', value: pub }, { key: 'AI_TOOLKIT_AUTH', value: 'growth-train' }],
        } },
      );
      const pod = d.podFindAndDeployOnDemand as { id: string; costPerHr: number; machine: { gpuDisplayName: string } } | null;
      if (pod) { console.log(JSON.stringify({ id: pod.id, gpu: pod.machine?.gpuDisplayName ?? gpu, costPerHr: pod.costPerHr })); return; }
      console.log(`no stock: ${gpu}`);
    } catch (e) {
      console.log(`${gpu}: ${(e as Error).message.slice(0, 200)}`);
    }
  }
  console.error('no GPU available from the list');
  process.exitCode = 1;
}

async function info(id: string) {
  const d = await gql(`query($id: String!) { pod(input: { podId: $id }) { id name desiredStatus costPerHr machine { gpuDisplayName } runtime { uptimeInSeconds ports { ip isIpPublic privatePort publicPort type } } } }`, { id });
  const p = d.pod as { runtime?: { ports?: { ip: string; isIpPublic: boolean; privatePort: number; publicPort: number; type: string }[] } } | null;
  const ssh = p?.runtime?.ports?.find(x => x.privatePort === 22 && x.isIpPublic);
  console.log(JSON.stringify({ ...p, ssh: ssh ? `${ssh.ip}:${ssh.publicPort}` : null }));
}

async function main() {
  const [cmd, id] = process.argv.slice(2);
  if (cmd === 'create') await create();
  else if (cmd === 'info') await info(id);
  else if (cmd === 'stop') console.log(JSON.stringify(await gql(`mutation($id: String!) { podStop(input: { podId: $id }) { id desiredStatus } }`, { id })));
  else if (cmd === 'terminate') console.log(JSON.stringify(await gql(`mutation($id: String!) { podTerminate(input: { podId: $id }) }`, { id })));
  else console.log('create | info <id> | stop <id> | terminate <id>');
}

main().catch(e => { console.error(e.message); process.exitCode = 1; });
