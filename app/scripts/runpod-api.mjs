// Thin wrapper for RunPod REST API. Called by all cloud-* helpers.
import fs from 'node:fs';
import path from 'node:path';

const ENV_FILE = path.resolve(path.join(import.meta.dirname, '..', '.env.local'));
const env = fs.readFileSync(ENV_FILE, 'utf-8');
const key = env.match(/^RUNPOD_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key || key === 'REPLACE_ME') {
  console.error('RUNPOD_API_KEY missing in standalone/.env.local');
  process.exit(2);
}

const BASE = 'https://rest.runpod.io/v1';

export async function rp(pathname, init = {}) {
  const r = await fetch(BASE + pathname, {
    ...init,
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  });
  const text = await r.text();
  const body = text ? JSON.parse(text) : {};
  if (!r.ok) throw new Error(`RunPod ${pathname} → ${r.status}: ${JSON.stringify(body)}`);
  return body;
}

// CLI mode: node scripts/runpod-api.mjs <subcommand>
if (process.argv[2]) {
  const cmd = process.argv[2];
  try {
    if (cmd === 'me') {
      // RunPod has /user in GraphQL but for REST we infer via gpuTypes etc.
      const pods = await rp('/pods');
      console.log(`API key OK. Current pods: ${pods?.length ?? 0}`);
      console.log(JSON.stringify(pods, null, 2).slice(0, 800));
    } else if (cmd === 'gpus') {
      const g = await rp('/gputypes');
      // Filter to just 4090 / A6000 and show price
      const filtered = g.filter(x => /4090|A6000|3090/i.test(x.displayName || x.id));
      console.log(JSON.stringify(filtered, null, 2));
    } else {
      console.log('usage: node runpod-api.mjs me | gpus');
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
