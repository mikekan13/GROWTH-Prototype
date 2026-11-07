/** DESCRIBER PROTOTYPE POD (Michael 2026-11-07, one-time waiver: one run, cap $5 / 1 h, TERMINATE after).
 *  Qwen3-Omni-30B-A3B-Captioner (Apache-2.0) on vLLM, OpenAI-compatible; audio only in, a caption out (no text prompt, clips ≤ 30 s).
 *  Usage (from app/): node ../tmp/describer-pod.mjs create | status | caption <wav>... | terminate
 *  State in ../tmp/describer-pod.json (untracked). */
import fs from 'node:fs';
import crypto from 'node:crypto';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const STATE = '../tmp/describer-pod.json';
const H = { Authorization: `Bearer ${env.RUNPOD_API_KEY}`, 'Content-Type': 'application/json' };
const gql = async (query, variables) => (await (await fetch('https://api.runpod.io/graphql', { method: 'POST', headers: H, body: JSON.stringify({ query, variables }) })).json());
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
const MODEL = 'Qwen/Qwen3-Omni-30B-A3B-Captioner';
const [cmd, ...args] = process.argv.slice(2);

async function create() {
  if (state.podId) { console.log('already created', state.podId); return; }
  const token = crypto.randomBytes(16).toString('hex');
  for (const gpuTypeId of ['NVIDIA A100 80GB PCIe', 'NVIDIA A100-SXM4-80GB', 'NVIDIA RTX PRO 6000 Blackwell Server Edition', 'NVIDIA H100 PCIe']) {
    const input = {
      cloudType: 'ALL', gpuCount: 1, gpuTypeId, name: 'growth-describer-proto', imageName: 'vllm/vllm-openai:latest',
      containerDiskInGb: 120, volumeInGb: 0, ports: '8000/http', minVcpuCount: 4, minMemoryInGb: 32,
      dockerArgs: `--model ${MODEL} --served-model-name captioner --max-model-len 8192 --gpu-memory-utilization 0.92 --api-key ${token} --trust-remote-code --port 8000`,
      env: [{ key: 'HF_HUB_ENABLE_HF_TRANSFER', value: '1' }],
    };
    const j = await gql(`mutation($input: PodFindAndDeployOnDemandInput) { podFindAndDeployOnDemand(input: $input) { id costPerHr machine { gpuDisplayName } } }`, { input });
    const p = j.data?.podFindAndDeployOnDemand;
    if (p?.id) {
      Object.assign(state, { podId: p.id, token, gpu: p.machine?.gpuDisplayName ?? gpuTypeId, costPerHr: p.costPerHr, createdAt: new Date().toISOString() });
      fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
      console.log('created', p.id, state.gpu, '$' + p.costPerHr + '/h');
      return;
    }
    console.log(gpuTypeId, '→', JSON.stringify(j.errors?.[0]?.message ?? j).slice(0, 160));
  }
  console.log('no GPU could be had');
}
async function status() {
  if (!state.podId) { console.log('no pod'); return; }
  const j = await gql(`query { pod(input:{podId:"${state.podId}"}) { desiredStatus costPerHr runtime { uptimeInSeconds } } }`);
  const p = j.data?.pod;
  const mins = (Date.now() - Date.parse(state.createdAt)) / 60000;
  console.log('pod', state.podId, p?.desiredStatus, 'up', p?.runtime?.uptimeInSeconds ?? 0, 's;', mins.toFixed(1), 'min since create ≈ $' + (mins / 60 * (state.costPerHr ?? 1.2)).toFixed(2));
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 8000);
    const r = await fetch(`https://${state.podId}-8000.proxy.runpod.net/v1/models`, { headers: { Authorization: `Bearer ${state.token}` }, signal: c.signal });
    console.log('vllm', r.status, (await r.text()).slice(0, 120));
  } catch (e) { console.log('vllm not answering yet:', e.name === 'AbortError' ? 'timeout' : e.message); }
}
async function caption(files) {
  for (const f of files) {
    const b64 = fs.readFileSync(f).toString('base64');
    const body = { model: 'captioner', max_tokens: 700, temperature: 0.2, messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: b64, format: 'wav' } }] }] };
    const t0 = Date.now();
    const r = await fetch(`https://${state.podId}-8000.proxy.runpod.net/v1/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const t = await r.text();
    let text = t; try { text = JSON.parse(t).choices?.[0]?.message?.content ?? t; } catch { /* raw */ }
    console.log(`\n=== ${f} (${r.status}, ${((Date.now() - t0) / 1000).toFixed(1)} s)\n${text}`);
    fs.writeFileSync(f.replace(/\.wav$/, '.caption.txt'), text);
  }
}
async function terminate() {
  if (!state.podId) { console.log('no pod'); return; }
  const j = await gql(`mutation { podTerminate(input:{podId:"${state.podId}"}) }`);
  const mins = (Date.now() - Date.parse(state.createdAt)) / 60000;
  console.log('terminated', state.podId, JSON.stringify(j.errors ?? 'ok'), `${mins.toFixed(1)} min ≈ $${(mins / 60 * (state.costPerHr ?? 1.2)).toFixed(2)}`);
  fs.writeFileSync(STATE, JSON.stringify({ ...state, terminatedAt: new Date().toISOString(), minutes: mins, podId: undefined, lastPodId: state.podId }, null, 1));
}
if (cmd === 'create') await create();
else if (cmd === 'status') await status();
else if (cmd === 'caption') await caption(args);
else if (cmd === 'terminate') await terminate();
else console.log('usage: create | status | caption <wav>... | terminate');
