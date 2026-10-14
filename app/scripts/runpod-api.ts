/**
 * Minimal RunPod GraphQL/REST helper for pod work (LoRA training pods). Never prints the key.
 *   npx tsx scripts/runpod-api.ts whoami            # balance, volumes, pods
 *   npx tsx scripts/runpod-api.ts gpus              # GPU types + availability for our volume's datacenter
 *   npx tsx scripts/runpod-api.ts gql "<query>"     # raw query
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

const KEY = process.env.RUNPOD_API_KEY;
if (!KEY) { console.error('RUNPOD_API_KEY missing'); process.exit(1); }

export async function gql(query: string, variables: Record<string, unknown> = {}): Promise<unknown> {
  const r = await fetch('https://api.runpod.io/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ query, variables }),
  });
  const j = (await r.json()) as { data?: unknown; errors?: unknown };
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

export async function rest(method: string, p: string, body?: unknown): Promise<unknown> {
  const r = await fetch(`https://rest.runpod.io/v1${p}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  try { return { status: r.status, body: JSON.parse(text) }; } catch { return { status: r.status, body: text }; }
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'whoami') {
    console.log(JSON.stringify(await gql('{ myself { id clientBalance networkVolumes { id name size dataCenterId } pods { id name desiredStatus machine { gpuDisplayName } costPerHr } } }'), null, 2));
  } else if (cmd === 'gpus') {
    console.log(JSON.stringify(await gql('{ gpuTypes { id displayName memoryInGb secureCloud communityCloud lowestPrice(input: { gpuCount: 1 }) { minimumBidPrice uninterruptablePrice stockStatus } } }'), null, 2));
  } else if (cmd === 'gql') {
    console.log(JSON.stringify(await gql(process.argv[3]), null, 2));
  } else if (cmd === 'rest') {
    console.log(JSON.stringify(await rest(process.argv[3], process.argv[4], process.argv[5] ? JSON.parse(process.argv[5]) : undefined), null, 2));
  } else {
    console.log('commands: whoami | gpus | gql <query> | rest <METHOD> <path> [json]');
  }
}

if (process.argv[1] && /runpod-api\.ts$/.test(process.argv[1])) main().catch(e => { console.error(e.message); process.exitCode = 1; });
